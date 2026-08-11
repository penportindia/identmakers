import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js"; 
import {
    getDatabase,
    ref,
    onChildAdded,
    onChildRemoved,
    onValue
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

import { firebaseConfig } from "../Database/Database.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const DOM = {
    studentCount: document.getElementById("studentCount"),
    staffCount: document.getElementById("staffCount"),
    totalEnrollment: document.getElementById("totalEnrollment"),
    uniqueSchools: document.getElementById("uniqueSchools"),
    vendorStatusText: document.getElementById("vendorStatusText"), 
    vendorCardContainer: document.getElementById("vendorCardContainer"),
    schoolList: document.getElementById("schoolList"),
    searchBox: document.getElementById("searchBox"),
    sortType: document.getElementById("sortType"),
    dateWiseList: document.getElementById("dateWiseList"),
    onlineSchoolsCount: document.getElementById("onlineSchoolsCount"),
    onlineSchoolsCountPlaceholder: document.getElementById("onlineSchoolsCountPlaceholder"),
    onlineSchoolsList: document.getElementById("onlineSchoolsList")
};

const schoolsData = new Map();
let activeSchools = Object.create(null);
let studentCount = 0;
let staffCount = 0;
const dateMap = new Map();
const schoolDateCounts = new Map();
const dateToSchools = new Map();
let selectedDateFilter = null;
let vendorData = null; 

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const DEBOUNCE_WAIT = 150;
function normalizeName(name) {
    return (name || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}

function parseEnrollmentDate(enrollmentId) {
    if (typeof enrollmentId !== "string") return null;
    
    const dateMatch = enrollmentId.match(/(\d{1,2})([A-Z]{3})(\d{4})/i);
    if (!dateMatch) return null;
    
    const day = parseInt(dateMatch[1], 10);
    const monStr = dateMatch[2].toUpperCase();
    const year = parseInt(dateMatch[3], 10);
    const month = MONTHS[monStr];
    
    if (!Number.isFinite(day) || !Number.isFinite(year) || month === undefined || day < 1 || day > 31) return null;
    return new Date(year, month, day);
}

function getLocalDateKey(date) {
    if (!(date instanceof Date)) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function setText(el, val) { 
    if (el) el.textContent = String(val ?? 0); 
}

function debounce(fn, wait = DEBOUNCE_WAIT) {
    let t; 
    return (...args) => { 
        clearTimeout(t); 
        t = setTimeout(() => fn.apply(null, args), wait); 
    };
}

function formatDate(date) {
    if (!date) return 'N/A';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function listenToEnrollmentChanges() {
    const masterRef = ref(db, "DATA-MASTER");

    onChildAdded(masterRef, (schoolNameSnapshot) => {
        const schoolName = schoolNameSnapshot.key;
        const schoolIds = schoolNameSnapshot.val();

        for (const schoolId in schoolIds) {
            if (typeof schoolIds[schoolId] !== 'object' || schoolIds[schoolId] === null) continue;

            const studentsRef = ref(db, `DATA-MASTER/${schoolName}/${schoolId}/STUDENT`);
            const staffRef = ref(db, `DATA-MASTER/${schoolName}/${schoolId}/STAFF`);

            onChildAdded(studentsRef, (snapshot) => {
                updateCounts(schoolName, "student", 1, snapshot.key);
            });
            onChildRemoved(studentsRef, (snapshot) => {
                updateCounts(schoolName, "student", -1, snapshot.key);
            });

            onChildAdded(staffRef, (snapshot) => {
                updateCounts(schoolName, "staff", 1, snapshot.key);
            });
            onChildRemoved(staffRef, (snapshot) => {
                updateCounts(schoolName, "staff", -1, snapshot.key);
            });
        }
    });
}

function listenActiveSchools() {
    try {
        const baseRef = ref(db, "activeSchools");
        onValue(baseRef, (snapshot) => {
            processActiveSchools(snapshot.exists() ? snapshot.val() : {});
        });
    } catch (err) {
        console.error("listenActiveSchools error:", err);
    }
}

function listenVendorData() {
    try {
        const vendorRef = ref(db, "roles/vendor");
        onValue(vendorRef, (snapshot) => {
            vendorData = snapshot.val();

            renderAll(); 
        });
    } catch (err) {
        console.error("listenVendorData error:", err);
    }
}

function updateCounts(schoolName, type, change, enrollmentId) {
    const norm = normalizeName(schoolName);

    if (!schoolsData.has(norm)) {
        schoolsData.set(norm, {
            name: schoolName,
            normalized: norm,
            students: 0,
            staff: 0,
            total: 0,
            lastEnrollmentDate: null,
            lastEnrollmentCount: 0
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
        const key = getLocalDateKey(d);
        
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

        updateSchoolDateIndex(norm, key, type, change);

        const dateKey = getLocalDateKey(d);
        const currentLastKey = school.lastEnrollmentDate ? getLocalDateKey(school.lastEnrollmentDate) : null;
        if (!school.lastEnrollmentDate || d > school.lastEnrollmentDate) {
            school.lastEnrollmentDate = d;
            school.lastEnrollmentCount = change;
        } else if (dateKey === currentLastKey) {
            school.lastEnrollmentCount += change;
        }
    }
    debouncedRenderAll(); 
}

function updateSchoolDateIndex(normalized, dateKey, type, change) {
    if (!dateKey) return;

    let schoolDates = schoolDateCounts.get(normalized);
    if (!schoolDates) {
        schoolDates = new Map();
        schoolDateCounts.set(normalized, schoolDates);
    }

    let counts = schoolDates.get(dateKey);
    if (!counts) counts = { students: 0, staff: 0 };

    if (type === 'student') counts.students += change;
    else if (type === 'staff') counts.staff += change;

    if ((counts.students + counts.staff) > 0) {
        schoolDates.set(dateKey, counts);
    } else {
        schoolDates.delete(dateKey);
    }

    if (!schoolDates.size) {
        schoolDateCounts.delete(normalized);
    }

    let dateSet = dateToSchools.get(dateKey);
    if (!dateSet) {
        dateSet = new Set();
        dateToSchools.set(dateKey, dateSet);
    }

    const hasData = counts && (counts.students + counts.staff) > 0;
    if (hasData) dateSet.add(normalized);
    else dateSet.delete(normalized);

    if (!dateSet.size) dateToSchools.delete(dateKey);
}

function processActiveSchools(val) {
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

const debouncedRenderAll = debounce(renderAll);

function renderAll() {
    setText(DOM.studentCount, studentCount.toLocaleString('en-IN'));
    setText(DOM.staffCount, staffCount.toLocaleString('en-IN'));
    setText(DOM.totalEnrollment, (studentCount + staffCount).toLocaleString('en-IN'));
    setText(DOM.uniqueSchools, schoolsData.size.toLocaleString('en-IN'));
    renderSchools();
    const dateEntries = Array.from(dateMap.entries())
        .map(([key, counts]) => ({ dateKey: key, counts }));
        
    renderDateWise(dateEntries);
    renderVendorCard(); 
    if (window.showLoadedData) {
        window.showLoadedData();
    }
}

function renderSchools() {
    if (!DOM.schoolList) return;

    let schoolsDataArray = Array.from(schoolsData.values());
    let filtered = [...schoolsDataArray];

    const searchVal = (DOM.searchBox?.value || "").toLowerCase();
    if (searchVal) {
        filtered = filtered.filter(s =>
            (s.name || "").toLowerCase().includes(searchVal)
        );
    }

    if (selectedDateFilter) {
        const validSchools = dateToSchools.get(selectedDateFilter) || new Set();
        filtered = filtered.filter(s => validSchools.has(s.normalized));
    }

    if (DOM.sortType) {
        const v = DOM.sortType.value;
        if (v === "az") filtered.sort((a, b) => a.name.localeCompare(b.name));
        else if (v === "za") filtered.sort((a, b) => b.name.localeCompare(a.name));
        else if (v === "high") filtered.sort((a, b) => b.total - a.total);
        else if (v === "low") filtered.sort((a, b) => a.total - b.total);
        else if (v === "recent") {
            filtered.sort((a, b) => {
                const aTime = a.lastEnrollmentDate ? a.lastEnrollmentDate.getTime() : 0;
                const bTime = b.lastEnrollmentDate ? b.lastEnrollmentDate.getTime() : 0;
                return bTime - aTime || a.name.localeCompare(b.name);
            });
        }
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

function renderDateWise(dateEntries) {
    if (!DOM.dateWiseList) return;

    const sortedEntries = dateEntries.sort(
        (a, b) => parseDateString(b.dateKey) - parseDateString(a.dateKey)
    );

    if (!sortedEntries.length) {
        DOM.dateWiseList.innerHTML = `<div style="text-align:center;padding:20px;color:#6b7280;grid-column:1/-1;">No date-wise data</div>`;
        DOM.dateWiseList.style.display = "block";
        return;
    }

    DOM.dateWiseList.style.display = "grid"; 
    DOM.dateWiseList.style.gridTemplateColumns = "repeat(7, 1fr)";
    DOM.dateWiseList.style.gap = "14px";
    
    const last7 = sortedEntries.slice(0, 7);

    DOM.dateWiseList.innerHTML = last7.map((entry, index) => {
        const schoolCount = dateToSchools.get(entry.dateKey)?.size || 0;
        return generateDateCardHTML(entry.dateKey, entry.counts, schoolCount, index);
    }).join('');
    
    attachDateCardEventListeners();
    injectDateCardCSS(DOM.dateWiseList.id);
}

function renderOnlineStatus(onlineNames) {
    if (DOM.onlineSchoolsCount) {
        if (DOM.onlineSchoolsCountPlaceholder) {
            DOM.onlineSchoolsCountPlaceholder.classList.add('hidden-by-js');
        }
        DOM.onlineSchoolsCount.classList.remove('hidden-by-js');
        
        DOM.onlineSchoolsCount.textContent = onlineNames.length;
    }
    if (DOM.onlineSchoolsList) {
        DOM.onlineSchoolsList.innerHTML = "";
        onlineNames.sort((a, b) => a.localeCompare(b)).forEach(name => {
            const card = document.createElement("div");
            card.className = "online-school-card flex items-center gap-1.5 px-3 py-1 bg-green-50 rounded-full text-xs font-medium text-green-700 border border-green-200";
            card.innerHTML = `<span class="w-2 h-2 rounded-full bg-green-500 animate-ping-once"></span>${name}`;
            DOM.onlineSchoolsList.appendChild(card);
        });
    }
}

function renderVendorCard() {
    if (!DOM.vendorCardContainer || !DOM.vendorStatusText) return;
    if (!vendorData) {
        return; 
    }
    const { name, credits, deu, isActive } = vendorData;
    const statusText = isActive ? "Active" : "Inactive";
    const statusColor = isActive ? "#10b981" : "#ef4444";
    const statusTextColor = 'white'; 
    let mainLabel, mainValue, mainIcon, mainColor, mainPrefix;
    const dueAmount = deu ?? 0;
    const creditAmount = credits ?? 0;
    if (dueAmount > 0) {
        mainLabel = "Amount Due";
        mainValue = dueAmount.toLocaleString('en-IN');
        mainIcon = "ri-alert-line";
        mainColor = "rgb(239, 68, 68)";
        mainPrefix = '₹';
    }
    else if (creditAmount > 0) {
        mainLabel = "Credits Available";
        mainValue = creditAmount.toLocaleString('en-IN');
        mainIcon = "ri-wallet-3-line";
        mainColor = "rgb(20, 184, 166)";
        mainPrefix = '₹';
    }
    else {
        mainLabel = "Account Balance";
        mainValue = 0;
        mainIcon = "ri-check-circle-line";
        mainColor = "rgb(75, 85, 99)";
        mainPrefix = '₹';
    }
    DOM.vendorStatusText.textContent = statusText;

    DOM.vendorCardContainer.innerHTML = generateVendorCardHTML({
        name, statusText, statusColor, statusTextColor,
        mainLabel, mainValue, mainIcon, mainColor, mainPrefix
    });

    if (dueAmount > 0) {
        DOM.vendorCardContainer.style.borderColor = 'rgb(239, 68, 68)';
    } else if (creditAmount > 0) {
        DOM.vendorCardContainer.style.borderColor = 'rgb(20, 184, 166)';
    } else {
        DOM.vendorCardContainer.style.borderColor = 'rgb(109, 40, 217)';
    }
}

function parseDateString(dateStr) {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day); 
}

const DATE_CARD_HEADER_COLORS = [
    "linear-gradient(135deg,#9333ea,#a855f7)",
    "linear-gradient(135deg,#2563eb,#3b82f6)",
    "linear-gradient(135deg,#16a34a,#22c55e)",
    "linear-gradient(135deg,#f59e0b,#fbbf24)",
    "linear-gradient(135deg,#dc2626,#ef4444)",
    "linear-gradient(135deg,#0d9488,#14b8a6)",
    "linear-gradient(135deg,#be185d,#ec4899)"
];

const SCHOOL_LIST_NO_RESULTS_HTML = `
    <div style="grid-column:1/-1;text-align:center;padding:40px;background:#f9fafb;
    border-radius:16px;border:2px dashed #d1d5db;color:#6b7280;font-size:15px;">
        <i class="ri-search-eye-line" style="font-size:32px;color:#9ca3af;
        margin-bottom:10px;display:block;"></i>
        No schools found.<br>Try adjusting your search or filters.
    </div>`;



function generateSchoolCardHTML(s) {
    const displayName = s.name || "School";
    const isOnline = !!activeSchools[s.normalized];
    const onlineDot = isOnline ? `<span class="inline-block w-2.5 h-2.5 rounded-full bg-green-400 animate-ping-once"></span>` : "";
    const headerBg = isOnline
        ? "linear-gradient(135deg,#16a34a,#22c55e)" 
        : "linear-gradient(135deg,#2563eb,#3b82f6)"; 
    const todayKey = getLocalDateKey(new Date());
    const schoolDates = schoolDateCounts.get(s.normalized);
    const todayCounts = schoolDates ? schoolDates.get(todayKey) : null;
    const studentAddedToday = !!(todayCounts && (todayCounts.students || 0) > 0);
    const staffAddedToday = !!(todayCounts && (todayCounts.staff || 0) > 0);
    const studentBadge = studentAddedToday ? `<span style="color:#10b981;font-weight:700;margin-left:6px">+</span>` : '';
    const staffBadge = staffAddedToday ? `<span style="color:#10b981;font-weight:700;margin-left:6px">+</span>` : '';
        
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
                <div><i class="ri-user-3-line" style="color:#2563eb;"></i> Students: <b>${s.students.toLocaleString('en-IN')}</b>${studentBadge}</div>
                <div><i class="ri-team-line" style="color:#16a34a;"></i> Staff: <b>${s.staff.toLocaleString('en-IN')}</b>${staffBadge}</div>
                <div><i class="ri-bar-chart-2-line" style="color:#f59e0b;"></i> Total: <b>${s.total.toLocaleString('en-IN')}</b></div>
                <div><i class="ri-calendar-line" style="color:#7c3aed;"></i> <b>${formatDate(s.lastEnrollmentDate)} | <span style="color:#10b981;">${s.lastEnrollmentCount.toLocaleString('en-IN')}</span></b></div>
            </div>
        </div>
    `;
}

function generateVendorCardHTML({ name, statusText, statusColor, statusTextColor, mainLabel, mainValue, mainIcon, mainColor, mainPrefix }) {
    const goldGradient = 'linear-gradient(135deg, #FFD700 0%, #B8860B 100%)'; 
    const goldShadow = '0 5px 15px rgba(255, 215, 0, 0.4)';
    const headerTextColor = '#4b5563'; 
    const itemStyle = `padding: 12px 15px; display: flex; flex-direction: column; justify-content: center; align-items: flex-start;`;
    const labelStyle = `font-size: 11px; color: #9ca3af; margin-bottom: 2px; text-transform: uppercase; font-weight: 500; letter-spacing: 0.5px;`;
    const valueStyle = `font-size: 18px; font-weight: 700; display:flex; align-items:center; gap:5px; line-height: 1;`;

    return `
        <div style="
            width: 100%; 
            background: #ffffff;
            border-radius: 8px;
            box-shadow: ${goldShadow};
            overflow: hidden;
            border: 1px solid #fde047; 
            display: flex;
            flex-direction: column; 
        ">
            <div style="
                background: ${goldGradient};
                padding: 5px 15px; 
                color: ${headerTextColor};
                font-weight: 700;
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
                        color: ${statusTextColor}; /* ⭐ THIS IS NOW WHITE ⭐ */
                        padding: 2px 8px; 
                        border-radius: 4px;
                        background: ${statusColor}; /* Background is still Green/Red */
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

function attachDateCardEventListeners() {
    DOM.dateWiseList.querySelectorAll(".date-card").forEach(card => {
        card.onclick = (event) => {
            event.stopPropagation();
            const clickedDate = card.getAttribute("data-date");
            if (!clickedDate) return;

            selectedDateFilter = selectedDateFilter === clickedDate ? null : clickedDate;
            renderAll();
        };
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

function attachOutsideDateClickReset() {
    document.addEventListener('click', () => {
        if (selectedDateFilter !== null) {
            selectedDateFilter = null;
            renderAll();
        }
    });
}

function generateDateCardHTML(dateKey, counts, schoolCount, index) {
    const dateObj = parseDateString(dateKey);

    const uiDate = dateObj.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short"
    });

    const headerBg = DATE_CARD_HEADER_COLORS[index % DATE_CARD_HEADER_COLORS.length];
    const total = (counts.students || 0) + (counts.staff || 0);

    const isSelected = selectedDateFilter === dateKey;
    const borderStyle = isSelected ? '2px solid #4f46e5' : '1px solid rgba(15,23,42,0.08)';

    return `
        <div class="date-card" data-date="${dateKey}" style="
            background:#fff;
            border-radius:14px;
            box-shadow:0 3px 8px rgba(0,0,0,0.08);
            overflow:hidden;
            transition:all 0.25s ease;
            cursor:pointer;
            border: ${borderStyle};
        ">
            <div style="background:${headerBg};
                padding:12px;color:white;font-weight:600;font-size:15px;
                display:flex;align-items:center;justify-content:space-between;gap:6px;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <i class="ri-calendar-event-line"></i> ${uiDate}
                </div>
                <span style="background:rgba(255,255,255,0.22);padding:3px 8px;border-radius:999px;font-size:12px;font-weight:700;min-width:28px;text-align:center;">
                    ${schoolCount}
                </span>
            </div>
            <div style="padding:14px 16px;display:grid;gap:10px;font-size:14px;color:#374151;">
                <div style="display:flex;align-items:center;gap:6px;">
                    <i class="ri-user-3-line" style="color:#2563eb;" title="Students"></i>
                    <span class="label" style="display:inline;">Students:</span>
                    <b>${(counts.students || 0).toLocaleString('en-IN')}</b>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <i class="ri-team-line" style="color:#16a34a;" title="Staff"></i>
                    <span class="label" style="display:inline;">Staff:</span>
                    <b>${(counts.staff || 0).toLocaleString('en-IN')}</b>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <i class="ri-bar-chart-2-line" style="color:#f59e0b;" title="Total"></i>
                    <span class="label" style="display:inline;">Total:</span>
                    <b>${total.toLocaleString('en-IN')}</b>
                </div>
            </div>
        </div>
    `;
}

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

if (DOM.searchBox) DOM.searchBox.addEventListener("input", debounce(renderSchools));
if (DOM.sortType) DOM.sortType.addEventListener("change", renderSchools);

attachOutsideDateClickReset();
listenToEnrollmentChanges();
listenActiveSchools();
listenVendorData();
