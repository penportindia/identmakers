// ====================================================
// Active Schools Dashboard - script.js (VENDOR FEATURE ADDED)
// ====================================================

// ----------------------------------------------------
// 1. IMPORTS & INITIALIZATION
// ----------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js"; 
import {
    getDatabase,
    ref,
    onChildAdded,
    onChildRemoved,
    onValue
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

// Import your specific Firebase Config
import { firebaseConfig } from "../Database/Database.js"; 

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ----------------------------------------------------
// 2. DOM ELEMENTS (Constants for clarity)
// ----------------------------------------------------

const DOM = {
    studentCount: document.getElementById("studentCount"),
    staffCount: document.getElementById("staffCount"),
    totalEnrollment: document.getElementById("totalEnrollment"),
    uniqueSchools: document.getElementById("uniqueSchools"),
    
    // ✅ NEW ELEMENT FOR VENDOR CARD
    vendorCardContainer: document.getElementById("vendorCardContainer"), 
    
    schoolList: document.getElementById("schoolList"),
    searchBox: document.getElementById("searchBox"),
    sortType: document.getElementById("sortType"),
    dateWiseList: document.getElementById("dateWiseList"),
    totalOnlineUsers: document.getElementById("totalOnlineUsers"),
    onlineSchoolsCount: document.getElementById("onlineSchoolsCount"),
    onlineSchoolsList: document.getElementById("onlineSchoolsList")
};

// ----------------------------------------------------
// 3. GLOBAL STATE
// ----------------------------------------------------

/** Map<string, {name: string, normalized: string, students: number, staff: number, total: number}> */
const schoolsData = new Map();

/** Object<string, true> - Stores normalized school names that are currently online. */
let activeSchools = Object.create(null);

let studentCount = 0;
let staffCount = 0;

/** Map<string, {students: number, staff: number}> - Date key: YYYY-MM-DD */
const dateMap = new Map();

// ✅ NEW GLOBAL STATE FOR VENDOR DATA
let vendorData = null; 

// ----------------------------------------------------
// 4. CONSTANTS & UTILITIES (Helpers)
// ----------------------------------------------------

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const DEBOUNCE_WAIT = 150;

/** Normalizes a school name for keying/comparison. */
function normalizeName(name) {
    return (name || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}

/** Parses the enrollment ID to extract the enrollment date. */
function parseEnrollmentDate(enrollmentId) {
    if (typeof enrollmentId !== "string" || enrollmentId.length < 18) return null;
    const dateStr = enrollmentId.slice(7, 16); 
    const day = parseInt(dateStr.slice(0, 2), 10);
    const monStr = dateStr.slice(2, 5).toUpperCase();
    const year = parseInt(dateStr.slice(5), 10);
    const month = MONTHS[monStr];
    
    if (!Number.isFinite(day) || !Number.isFinite(year) || month === undefined) return null;
    return new Date(year, month, day);
}

/** Sets the text content of a DOM element, safely handling nulls. */
function setText(el, val) { 
    if (el) el.textContent = String(val ?? 0); 
}

/** Debounces a function call. */
function debounce(fn, wait = DEBOUNCE_WAIT) {
    let t; 
    return (...args) => { 
        clearTimeout(t); 
        t = setTimeout(() => fn.apply(null, args), wait); 
    };
}

// ----------------------------------------------------
// 5. FIREBASE DATA LISTENERS (Vendor Listener Added)
// ----------------------------------------------------

/** Starts the Firebase listeners for student/staff changes across all schools. */
function listenToEnrollmentChanges() {
    // ... (Existing logic remains unchanged)
    const masterRef = ref(db, "DATA-MASTER");

    onChildAdded(masterRef, (schoolNameSnapshot) => {
        const schoolName = schoolNameSnapshot.key;
        const schoolIds = schoolNameSnapshot.val();

        for (const schoolId in schoolIds) {
            if (typeof schoolIds[schoolId] !== 'object' || schoolIds[schoolId] === null) continue;

            const studentsRef = ref(db, `DATA-MASTER/${schoolName}/${schoolId}/STUDENT`);
            const staffRef = ref(db, `DATA-MASTER/${schoolName}/${schoolId}/STAFF`);

            // --- Student Listeners ---
            onChildAdded(studentsRef, (snapshot) => {
                updateCounts(schoolName, "student", 1, snapshot.key);
            });
            onChildRemoved(studentsRef, (snapshot) => {
                updateCounts(schoolName, "student", -1, snapshot.key);
            });

            // --- Staff Listeners ---
            onChildAdded(staffRef, (snapshot) => {
                updateCounts(schoolName, "staff", 1, snapshot.key);
            });
            onChildRemoved(staffRef, (snapshot) => {
                updateCounts(schoolName, "staff", -1, snapshot.key);
            });
        }
    });
}

/** Listens for changes to the 'activeSchools' path for real-time online status. */
function listenActiveSchools() {
    // ... (Existing logic remains unchanged)
    try {
        const baseRef = ref(db, "activeSchools");
        onValue(baseRef, (snapshot) => {
            processActiveSchools(snapshot.exists() ? snapshot.val() : {});
        });
    } catch (err) {
        console.error("listenActiveSchools error:", err);
    }
}


// ✅ NEW: Listen for Vendor Data
function listenVendorData() {
    try {
        const vendorRef = ref(db, "roles/vendor");
        onValue(vendorRef, (snapshot) => {
            vendorData = snapshot.val();
            renderVendorCard(); // Render the new card
        });
    } catch (err) {
        console.error("listenVendorData error:", err);
    }
}


// ----------------------------------------------------
// 6. CORE LOGIC FUNCTIONS
// ----------------------------------------------------

/** Updates global and per-school counts for enrollment changes. */
function updateCounts(schoolName, type, change, enrollmentId) {
    // ... (Existing logic remains unchanged)
    const norm = normalizeName(schoolName);

    if (!schoolsData.has(norm)) {
        schoolsData.set(norm, {
            name: schoolName,
            normalized: norm,
            students: 0,
            staff: 0,
            total: 0
        });
    }

    const school = schoolsData.get(norm);
    if (type === "student") {
        studentCount += change;
        school.students += change;
    } else if (type === "staff") {
        staffCount += change;
        school.staff += change;
    }
    school.total = school.students + school.staff;

    if (school.total <= 0) {
        schoolsData.delete(norm);
    }

    const d = parseEnrollmentDate(enrollmentId);
    if (d) {
        const key = d.toISOString().slice(0, 10); 
        
        if (!dateMap.has(key)) {
            dateMap.set(key, { students: 0, staff: 0 });
        }
        const dateCounts = dateMap.get(key);
        
        if (type === "student") {
            dateCounts.students += change;
        } else if (type === "staff") {
            dateCounts.staff += change;
        }

        if ((dateCounts.students + dateCounts.staff) <= 0) {
            dateMap.delete(key);
        }
    }

    renderAll();
}

/** Processes the activeSchools data from Firebase and updates the state. */
function processActiveSchools(val) {
    // ... (Existing logic remains unchanged)
    const map = Object.create(null);
    const onlineNames = [];

    Object.values(val || {}).forEach(schoolSessions => {
        if (!schoolSessions) return;
        let chosenName = "";
        let maxExpiry = 0;

        Object.values(schoolSessions).forEach(session => {
            if (!session) return;
            const name = (session.name || session.schoolName || "").trim();
            const status = session.status;
            const expiry = Number(session.expiresAt) || 0;
            
            if (name && status === "online" && Date.now() < expiry) {
                if (expiry > maxExpiry) {
                    maxExpiry = expiry;
                    chosenName = name;
                }
            }
        });

        if (chosenName) {
            const norm = normalizeName(chosenName);
            map[norm] = true;
            onlineNames.push(chosenName);
        }
    });

    activeSchools = map;
    
    renderOnlineStatus(onlineNames);
    
    renderSchools();
}

// ----------------------------------------------------
// 7. UI RENDER FUNCTIONS (renderDateWise is UPDATED)
// ----------------------------------------------------

/** Renders all main dashboard elements (counts and lists). */
function renderAll() {
    setText(DOM.studentCount, studentCount);
    setText(DOM.staffCount, staffCount);
    setText(DOM.totalEnrollment, studentCount + staffCount);
    setText(DOM.uniqueSchools, schoolsData.size);

    renderSchools();
    const dateEntries = Array.from(dateMap.entries())
        .map(([key, counts]) => ({ dateKey: key, counts }));
        
    renderDateWise(dateEntries);
    
    // Vendor Card is now part of the master render (but also renders on its own data update)
    renderVendorCard(); 
}

/** Renders the list of schools, applying search and sort filters. */
function renderSchools() {
    // ... (Existing logic remains unchanged)
    if (!DOM.schoolList) return;

    let schoolsDataArray = Array.from(schoolsData.values());
    let filtered = [...schoolsDataArray];

    const searchVal = (DOM.searchBox?.value || "").toLowerCase();
    if (searchVal) {
        filtered = filtered.filter(s =>
            (s.name || "").toLowerCase().includes(searchVal)
        );
    }

    if (DOM.sortType) {
        const v = DOM.sortType.value;
        if (v === "az") filtered.sort((a, b) => a.name.localeCompare(b.name));
        else if (v === "za") filtered.sort((a, b) => b.name.localeCompare(a.name));
        else if (v === "high") filtered.sort((a, b) => b.total - a.total);
        else if (v === "low") filtered.sort((a, b) => a.total - b.total);
    }

    const totalOnlineSchools = filtered.filter(s => activeSchools[s.normalized]).length;
    if (DOM.totalOnlineUsers) {
        DOM.totalOnlineUsers.textContent = `Active Schools: ${totalOnlineSchools}`;
    }

    if (!filtered.length) {
        DOM.schoolList.innerHTML = SCHOOL_LIST_NO_RESULTS_HTML;
        return;
    }

    DOM.schoolList.innerHTML = filtered.map(school => 
        generateSchoolCardHTML(school)
    ).join('');
    
    attachSchoolCardEventListeners();
}

/** 🚀 UPDATED: Renders the date-wise enrollment counts, showing date + 1 day. */
function renderDateWise(dateEntries) {
    // ... (Existing logic remains unchanged)
    if (!DOM.dateWiseList) return;

    // Sort by dateKey in descending order (newest date first)
    const sortedEntries = dateEntries.sort(
        (a, b) => parseDateString(b.dateKey) - parseDateString(a.dateKey)
    );

    if (!sortedEntries.length) {
        DOM.dateWiseList.innerHTML = `<div style="text-align:center;padding:20px;color:#6b7280;">No date-wise data</div>`;
        return;
    }

    // Get the latest 7 entries
    const last7 = sortedEntries.slice(0, 7);

    // Set up grid layout
    DOM.dateWiseList.style.display = "grid";
    DOM.dateWiseList.style.gridTemplateColumns = "repeat(7, 1fr)";
    DOM.dateWiseList.style.gap = "14px";
    
    DOM.dateWiseList.innerHTML = last7.map((entry, index) => {
        // --- 🎯 मुख्य बदलाव: तारीख को एक दिन आगे बढ़ाना ---
        
        // 1. Original date string को Date ऑब्जेक्ट में बदलें
        const originalDate = parseDateString(entry.dateKey);
        
        // 2. तारीख में 1 दिन जोड़ें
        originalDate.setDate(originalDate.getDate() + 1);
        
        // 3. अपडेटेड Date ऑब्जेक्ट को YYYY-MM-DD स्ट्रिंग में वापस फॉर्मेट करें
        const nextDayDateKey = [
            originalDate.getFullYear(),
            String(originalDate.getMonth() + 1).padStart(2, '0'), 
            String(originalDate.getDate()).padStart(2, '0')
        ].join('-');
        
        // 4. बढ़ी हुई तारीख और original counts के साथ कार्ड जेनरेट करें
        return generateDateCardHTML(nextDayDateKey, entry.counts, index);
    }).join('');
    // ----------------------------------------------------
    
    injectDateCardCSS(DOM.dateWiseList.id);
}

/** Renders the online status counts and list. */
function renderOnlineStatus(onlineNames) {
    // ... (Existing logic remains unchanged)
    if (DOM.onlineSchoolsCount) {
        DOM.onlineSchoolsCount.innerHTML = `
            <i class="ri-user-line"></i> ${onlineNames.length}
            <span style="width:10px;height:10px;background:#22c55e;border-radius:50%;display:inline-block;margin-left:6px;"></span>`;
    }

    if (DOM.onlineSchoolsList) {
        DOM.onlineSchoolsList.innerHTML = "";
        onlineNames.sort((a, b) => a.localeCompare(b)).forEach(name => {
            const card = document.createElement("div");
            card.className = "online-school-card";
            card.innerHTML = `<span class="online-school-dot"></span>${name}`;
            DOM.onlineSchoolsList.appendChild(card);
        });
    }
}

// ✅ FINAL REVISED UPDATE: Applied Gold Card Styling
function renderVendorCard() {
    if (!DOM.vendorCardContainer) return;

    if (!vendorData) {
        DOM.vendorCardContainer.innerHTML = `<div style="text-align:center;color:#9ca3af;padding:10px;">Vendor data loading...</div>`;
        return;
    }

    const { name, credits, deu, isActive } = vendorData;
    
    // Status Logic
    const statusText = isActive ? "Active" : "Inactive";
    const statusColor = isActive ? "#10b981" : "#ef4444"; // Green or Red

    // --- Core Logic: Determine what to display (Credit or Due) ---
    let mainIcon, mainLabel, mainValue, mainColor, mainPrefix;
    
    // 1. Check for DUE first (Highest Priority for alert)
    if ((deu ?? 0) > 0) {
        mainLabel = "Amount Due";
        mainValue = deu;
        mainIcon = "ri-alert-line";
        mainColor = "#ef4444"; // Red
        mainPrefix = '₹';
    } 
    // 2. Check for CREDITS
    else if ((credits ?? 0) > 0) {
        mainLabel = "Credits Available";
        mainValue = credits;
        mainIcon = "ri-wallet-3-line";
        mainColor = "#1a535c"; // Dark Teal/Green to contrast Gold
        mainPrefix = '₹';
    }
    // 3. Default (Balance 0)
    else {
        mainLabel = "Account Balance";
        mainValue = 0;
        mainIcon = "ri-check-circle-line";
        mainColor = "#1f2937"; // Dark Gray
        mainPrefix = '₹';
    }
    // -----------------------------------------------------------------

    // Helper Styles
    const itemStyle = `padding: 12px 15px; display: flex; flex-direction: column; justify-content: center; align-items: flex-start;`;
    const labelStyle = `font-size: 11px; color: #9ca3af; margin-bottom: 2px; text-transform: uppercase; font-weight: 500; letter-spacing: 0.5px;`;
    const valueStyle = `font-size: 18px; font-weight: 700; display:flex; align-items:center; gap:5px; line-height: 1;`;

    // --- GOLD STYLING VARIABLES ---
    const goldGradient = 'linear-gradient(135deg, #FFD700 0%, #B8860B 100%)'; // Gold color gradient
    const goldShadow = '0 5px 15px rgba(255, 215, 0, 0.4)'; // Gold glow shadow
    const headerTextColor = '#4b5563'; // Dark text for better contrast on Gold
    // -----------------------------


    DOM.vendorCardContainer.innerHTML = `
        <div style="
            width: 100%; 
            background: #ffffff;
            border-radius: 8px;
            box-shadow: ${goldShadow}; /* Gold Glow Shadow */
            overflow: hidden;
            border: 1px solid #fde047; /* Lighter Gold Border */
            display: flex;
            flex-direction: column; 
        ">
            <div style="
                background: ${goldGradient}; /* Applied Gold Gradient */
                padding: 5px 15px; 
                color: ${headerTextColor}; /* Dark text on Gold */
                font-weight: 700; /* Bolder text */
                font-size: 13px; 
                display: flex;
                align-items: center;
                justify-content: space-between;
            ">
                <div style="display:flex;align-items:center;gap:6px;">
                    <i class="ri-medal-line" style="font-size: 14px; color: ${headerTextColor};"></i>
                    <div>${name || 'Vendor'} Wallet</div> 
                </div>
            </div>

            <div style="
                display: grid;
                grid-template-columns: 2fr 1.2fr;
            ">
                
                <div style="${itemStyle} border-right: 1px solid #f3f4f6;">
                    <div style="${labelStyle}">${mainLabel}</div>
                    <div style="${valueStyle} color: ${mainColor};">
                        <i class="${mainIcon}" style="font-size: 18px;"></i>
                        <span style="font-weight: 500;">${mainPrefix}</span> ${mainValue}
                    </div>
                </div>

                <div style="${itemStyle}">
                    <div style="${labelStyle} visibility: hidden; height: 11px;">&nbsp;</div>
                    <div style="
                        font-size: 16px; 
                        font-weight: 700; 
                        color: ${statusColor}; 
                        padding: 2px 8px; 
                        border-radius: 4px;
                        background: ${isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'};
                        border: 1px solid ${statusColor};
                        line-height: 1.2;
                    ">
                        ${statusText}
                    </div>
                </div>
            </div>

        </div>
    `;
}

// ----------------------------------------------------
// 8. TEMPLATING & RENDERING UTILITIES
// ----------------------------------------------------

function parseDateString(dateStr) {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
}

const DATE_CARD_HEADER_COLORS = [
    "linear-gradient(135deg,#9333ea,#a855f7)", // Purple
    "linear-gradient(135deg,#2563eb,#3b82f6)", // Blue
    "linear-gradient(135deg,#16a34a,#22c55e)", // Green
    "linear-gradient(135deg,#f59e0b,#fbbf24)", // Amber
    "linear-gradient(135deg,#dc2626,#ef4444)", // Red
    "linear-gradient(135deg,#0d9488,#14b8a6)", // Teal
    "linear-gradient(135deg,#be185d,#ec4899)"  // Pink
];

const SCHOOL_LIST_NO_RESULTS_HTML = `
    <div style="grid-column:1/-1;text-align:center;padding:40px;background:#f9fafb;
    border-radius:16px;border:2px dashed #d1d5db;color:#6b7280;font-size:15px;">
        <i class="ri-search-eye-line" style="font-size:32px;color:#9ca3af;
        margin-bottom:10px;display:block;"></i>
        No schools found.<br>Try adjusting your search or filters.
    </div>`;


/** Generates the HTML string for a single school card. */
function generateSchoolCardHTML(s) {
    const displayName = s.name || "School";
    const isOnline = !!activeSchools[s.normalized];
    const onlineDot = isOnline ? `<span class="online-dot-pulse"></span>` : "";
    const headerBg = isOnline
        ? "linear-gradient(135deg,#16a34a,#22c55e)" 
        : "linear-gradient(135deg,#2563eb,#3b82f6)"; 
        
    return `
        <div class="school-card" data-normalized="${s.normalized}" style="
            background:#fff;border-radius:14px;box-shadow:0 3px 8px rgba(0,0,0,0.08);
            overflow:hidden;transition:all 0.25s ease;display:flex;flex-direction:column;position:relative;">
            
            <div style="background:${headerBg};padding:12px;color:white;font-weight:600;
            font-size:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <i class="ri-building-4-line"></i>
                    <div>${displayName}</div>
                </div>
                ${onlineDot}
            </div>
            <div style="flex:1;padding:14px 16px;display:grid;gap:10px;font-size:14px;color:#374151;">
                <div><i class="ri-user-3-line" style="color:#2563eb;"></i> Students: <b>${s.students}</b></div>
                <div><i class="ri-team-line" style="color:#16a34a;"></i> Staff: <b>${s.staff}</b></div>
                <div><i class="ri-bar-chart-2-line" style="color:#f59e0b;"></i> Total: <b>${s.total}</b></div>
            </div>
        </div>
    `;
}

/** Attaches hover/unhover events to the newly rendered school cards. */
function attachSchoolCardEventListeners() {
    DOM.schoolList.querySelectorAll(".school-card").forEach(card => {
        card.onmouseenter = () => {
            card.style.transform = "translateY(-4px)";
            card.style.boxShadow = "0 6px 16px rgba(0,0,0,0.12)";
        };
        card.onmouseleave = () => {
            card.style.transform = "translateY(0)";
            card.style.boxShadow = "0 3px 8px rgba(0,0,0,0.08)";
        };
    });
}

/** Generates the HTML string for a single date card. */
function generateDateCardHTML(dateKey, counts, index) {
    const dateObj = parseDateString(dateKey);

    const uiDate = dateObj.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short"
    });

    const headerBg = DATE_CARD_HEADER_COLORS[index % DATE_CARD_HEADER_COLORS.length];
    const total = (counts.students || 0) + (counts.staff || 0);

    return `
        <div class="date-card" style="
            background:#fff;
            border-radius:14px;
            box-shadow:0 3px 8px rgba(0,0,0,0.08);
            overflow:hidden;
            transition:all 0.25s ease;
            cursor:pointer;
        ">
            <div style="background:${headerBg};
                padding:12px;color:white;font-weight:600;font-size:15px;
                display:flex;align-items:center;gap:6px;">
                <i class="ri-calendar-event-line"></i> ${uiDate}
            </div>
            <div style="padding:14px 16px;display:grid;gap:10px;font-size:14px;color:#374151;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <i class="ri-user-3-line" style="color:#2563eb;" title="Students"></i>
                    <span class="label" style="display:inline;">Students:</span>
                    <b>${counts.students || 0}</b>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <i class="ri-team-line" style="color:#16a34a;" title="Staff"></i>
                    <span class="label" style="display:inline;">Staff:</span>
                    <b>${counts.staff || 0}</b>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <i class="ri-bar-chart-2-line" style="color:#f59e0b;" title="Total"></i>
                    <span class="label" style="display:inline;">Total:</span>
                    <b>${total}</b>
                </div>
            </div>
        </div>
    `;
}

/** Injects the necessary CSS for date cards, including responsive styles. */
function injectDateCardCSS(id) {
    if (document.head.querySelector(`style[data-for="${id}"]`)) return;

    const styleEl = document.createElement("style");
    styleEl.setAttribute('data-for', id); 
    styleEl.textContent = `
        .date-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 6px 14px rgba(0,0,0,0.12);
        }
        @media (max-width: 1024px) {
            #${id} {
                grid-template-columns: repeat(3, 1fr) !important;
            }
        }
        @media (max-width: 640px) {
            #${id} {
                grid-template-columns: repeat(2, 1fr) !important;
            }
            .date-card .label { display: none !important; }
            .date-card div[style*="font-weight:600"] { font-size:14px !important; }
        }
    `;
    document.head.appendChild(styleEl);
}

// ----------------------------------------------------
// 9. EVENT LISTENERS & INITIAL START
// ----------------------------------------------------

if (DOM.searchBox) DOM.searchBox.addEventListener("input", debounce(renderSchools));
if (DOM.sortType) DOM.sortType.addEventListener("change", renderSchools);

// Start the real-time data flow
listenToEnrollmentChanges();
listenActiveSchools();
// ✅ NEW: Start Vendor Data Listener
listenVendorData();
