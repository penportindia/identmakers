// ----------------------------------------------------
// Active Schools Dashboard - script.js (FINAL & CORRECTED VERSION)
// ----------------------------------------------------

// 1) Firebase SDK Modules Import
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js"; 
import {
    getDatabase,
    ref,
    onChildAdded,
    onChildRemoved,
    onValue
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

// ✅ Import your specific Firebase Config
import { firebaseConfig } from "../Database/Database.js"; 

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 2) DOM Elements
const studentCountEl = document.getElementById("studentCount");
const staffCountEl = document.getElementById("staffCount");
const totalEnrollmentEl = document.getElementById("totalEnrollment");
const uniqueSchoolsEl = document.getElementById("uniqueSchools");
const schoolListEl = document.getElementById("schoolList");
const searchBox = document.getElementById("searchBox");
const sortType = document.getElementById("sortType");
const dateWiseListEl = document.getElementById("dateWiseList");
const resetFiltersBtn = document.getElementById("resetFilters"); 

// Active Schools Display
const onlineSchoolsCountEl = document.getElementById("onlineSchoolsCount")?.querySelector('span:first-child');
const onlineSchoolsListEl = document.getElementById("onlineSchoolsList");

// VENDOR/SUBSCRIPTION ELEMENTS
const vendorBalanceEl = document.getElementById("vendorBalance"); 
const vendorStatusIconEl = document.getElementById("vendorStatusIcon"); 
const vendorStatusTextEl = document.getElementById("vendorStatusText");


// 3) Global State
const schoolsData = new Map();
let activeSchools = Object.create(null); // Key: Normalized School Name, Value: true/false
let studentCount = 0;
let staffCount = 0;
let dateMap = new Map(); 


// 4) Helpers
function normalizeName(name) {
    // Trim, replace multiple spaces with single space, and lowercase
    return (name || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}
function parseEnrollmentDate(enrollmentId) {
    if (!enrollmentId || typeof enrollmentId !== "string" || enrollmentId.length < 18) return null;
    const dateStr = enrollmentId.slice(7, 16); 
    const day = parseInt(dateStr.slice(0, 2), 10);
    const monStr = dateStr.slice(2, 5).toUpperCase();
    const year = parseInt(dateStr.slice(5), 10);
    const months = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
    const month = months[monStr];
    if (!Number.isFinite(day) || !Number.isFinite(year) || month === undefined) return null;
    
    const d = new Date(Date.UTC(year, month, day));
    return d.toISOString().slice(0, 10); 
}
function setText(el, val) { 
    if (el) el.textContent = String(val ?? 0).toLocaleString('en-IN'); 
}
function debounce(fn, wait = 150) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), wait); };
}
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0
    }).format(amount);
}


// 5) Real-time Data Listeners and Update
function listenToEnrollmentChanges() {
    const masterRef = ref(db, "DATA-MASTER");
    onValue(masterRef, (snapshot) => {
        if (!snapshot.exists()) return;
        snapshot.forEach((schoolNameSnapshot) => {
            const schoolName = schoolNameSnapshot.key;
            const schoolIds = schoolNameSnapshot.val();
            for (const schoolId in schoolIds) {
                if (typeof schoolIds[schoolId] !== 'object' || schoolIds[schoolId] === null) continue;
                const studentsRef = ref(db, `DATA-MASTER/${schoolName}/${schoolId}/STUDENT`);
                const staffRef = ref(db, `DATA-MASTER/${schoolName}/${schoolId}/STAFF`);
                onChildAdded(studentsRef, (snapshot) => { updateCounts(schoolName, "student", 1, snapshot.key); });
                onChildRemoved(studentsRef, (snapshot) => { updateCounts(schoolName, "student", -1, snapshot.key); });
                onChildAdded(staffRef, (snapshot) => { updateCounts(schoolName, "staff", 1, snapshot.key); });
                onChildRemoved(staffRef, (snapshot) => { updateCounts(schoolName, "staff", -1, snapshot.key); });
            }
        });
    }, { onlyOnce: true });
}

function updateCounts(schoolName, type, change, enrollmentId) {
    const norm = normalizeName(schoolName);
    if (!schoolsData.has(norm)) { schoolsData.set(norm, { name: schoolName, normalized: norm, students: 0, staff: 0, total: 0 }); }
    const school = schoolsData.get(norm);
    if (type === "student") { studentCount += change; school.students += change; } 
    else if (type === "staff") { staffCount += change; school.staff += change; }
    school.total = school.students + school.staff;
    if (school.total <= 0) { schoolsData.delete(norm); }

    const dateKey = parseEnrollmentDate(enrollmentId); 
    if (dateKey) {
        if (!dateMap.has(dateKey)) { dateMap.set(dateKey, { students: 0, staff: 0, schools: new Map() }); }
        const dateCounts = dateMap.get(dateKey);
        if (type === "student") dateCounts.students += change;
        else if (type === "staff") dateCounts.staff += change;

        const schoolMap = dateCounts.schools;
        if (!schoolMap.has(schoolName)) { schoolMap.set(schoolName, { students: 0, staff: 0 }); }
        const schoolDailyCounts = schoolMap.get(schoolName);
        if (type === "student") schoolDailyCounts.students += change;
        else if (type === "staff") schoolDailyCounts.staff += change;

        if ((schoolDailyCounts.students + schoolDailyCounts.staff) <= 0) { schoolMap.delete(schoolName); }
        if (dateCounts.schools.size === 0) { dateMap.delete(dateKey); }
    }
    renderAll();
}


// 6) Render Functions
function renderAll() {
    setText(studentCountEl, studentCount);
    setText(staffCountEl, staffCount);
    setText(totalEnrollmentEl, studentCount + staffCount);
    setText(uniqueSchoolsEl, schoolsData.size);

    renderSchools();
    renderDateWise(dateMap); 
}

function renderSchools() {
    let schoolsDataArray = Array.from(schoolsData.values());
    let filtered = [...schoolsDataArray];

    const searchVal = (searchBox?.value || "").toLowerCase();
    if (searchVal) {
      filtered = filtered.filter(s => (s.name || "").toLowerCase().includes(searchVal));
    }
    if (sortType) {
      const v = sortType.value;
      if (v === "az") filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      else if (v === "za") filtered.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
      else if (v === "high") filtered.sort((a, b) => b.total - a.total);
      else if (v === "low") filtered.sort((a, b) => a.total - b.total);
    }

    // Filter to count only those schools in the current view that are active
    const totalOnlineSchools = filtered.filter(s => activeSchools[s.normalized]).length;
    if (onlineSchoolsCountEl) { onlineSchoolsCountEl.textContent = totalOnlineSchools; }
    if (onlineSchoolsListEl) {
        onlineSchoolsListEl.innerHTML = filtered
            .filter(s => activeSchools[s.normalized])
            .map(s => `<span class="bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-1 rounded-full">${s.name}</span>`)
            .join('');
    }

    schoolListEl.innerHTML = "";
    if (!filtered.length) {
      schoolListEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;background:#f9fafb;border-radius:16px;border:2px dashed #d1d5db;color:#6b7280;font-size:15px;"><i class="ri-search-eye-line" style="font-size:32px;color:#9ca3af;margin-bottom:10px;display:block;"></i>No schools found.<br>Try adjusting your search or filters.</div>`;
      return;
    }

    filtered.forEach(s => {
      const card = document.createElement("div");
      card.className = "school-card card-hover";
      const displayName = s.name || "School";
      const isOnline = !!activeSchools[s.normalized];
      const onlineDot = isOnline ? `<span class="w-2 h-2 rounded-full bg-green-500 blink absolute top-3 right-3" title="Online"></span>` : ""; 
      const headerBg = isOnline ? "linear-gradient(135deg,#16a34a,#22c55e)" : "linear-gradient(135deg,#2563eb,#3b82f6)";

      card.style.cssText = `background:#fff;border-radius:14px;box-shadow:0 3px 8px rgba(0,0,0,0.08);overflow:hidden;transition:all 0.25s ease;display:flex;flex-direction:column;position:relative;`;
      
      card.innerHTML = `
        <div style="background:${headerBg};padding:12px;color:white;font-weight:600;font-size:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:8px;"><i class="ri-building-4-line"></i><div>${displayName}</div></div>
        </div>
        ${onlineDot}
        <div style="flex:1;padding:14px 16px;display:grid;gap:10px;font-size:14px;color:#374151;">
          <div><i class="ri-user-3-line" style="color:#2563eb;"></i> Students: <b>${s.students}</b></div>
          <div><i class="ri-team-line" style="color:#16a34a;"></i> Staff: <b>${s.staff}</b></div>
          <div><i class="ri-bar-chart-2-line" style="color:#f59e0b;"></i> Total: <b>${s.total}</b></div>
        </div>`;
      schoolListEl.appendChild(card);
    });
}
if (searchBox) searchBox.addEventListener("input", debounce(renderSchools, 150));
if (sortType) sortType.addEventListener("change", renderSchools);
if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
        if (searchBox) searchBox.value = '';
        if (sortType) sortType.value = 'az';
        renderSchools();
    });
}

// 7) Render Date-Wise (Height Adjusted, Icons Added)
function renderDateWise(dateMap) {
    if (!dateWiseListEl) return;

    dateWiseListEl.innerHTML = "";
    
    function parseDateString(dateStr) {
        if (!dateStr) return new Date(0);
        const [year, month, day] = dateStr.split("-").map(Number);
        return new Date(year, month - 1, day); 
    }

    const headerColors = [
        "linear-gradient(135deg,#9333ea,#a855f7)", "linear-gradient(135deg,#2563eb,#3b82f6)",
        "linear-gradient(135deg,#16a34a,#22c55e)", "linear-gradient(135deg,#f59e0b,#fbbf24)",
        "linear-gradient(135deg,#dc2626,#ef4444)", "linear-gradient(135deg,#0d9488,#14b8a6)",
        "linear-gradient(135deg,#be185d,#ec4899)"
    ];

    const entries = Array.from(dateMap.entries()).sort((a, b) => parseDateString(b[0]) - parseDateString(a[0]));

    if (entries.length === 0) {
        dateWiseListEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px;color:#6b7280;">No recent enrollment activity.</div>`;
        return;
    }

    const last7 = entries.slice(0, 7);

    // FIX: Use a fixed grid template for 7 items to ensure compactness
    dateWiseListEl.style.display = "grid";
    dateWiseListEl.style.gridTemplateColumns = `repeat(7, 1fr)`; 
    dateWiseListEl.style.gap = "12px";
    
    if (window.innerWidth < 768) {
        dateWiseListEl.style.gridTemplateColumns = "repeat(auto-fit, minmax(100px, 1fr))"; 
    }
    
    last7.forEach(([dateKey, counts], index) => {
        const dateObj = parseDateString(dateKey);
        const uiDateShort = dateObj.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
        
        const card = document.createElement("div");
        card.className = "date-card card-hover";
        
        // COMPACT CARD STYLES + Height Increased to 140px for better fit
        card.style.cssText = `background:#fff;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,0.05);overflow:hidden;transition:all 0.2s ease;cursor:pointer;text-align:center;border:1px solid #f3f4f6;min-height:140px;`;
        const headerBg = headerColors[index % headerColors.length];

        // COMPACT INNER HTML (with Student/Staff Icons)
        card.innerHTML = `
            <div style="background:${headerBg};padding:8px 0;color:white;font-weight:600;font-size:13px;display:flex;align-items:center;justify-content:center;gap:4px;min-height:36px;">
                <i class="ri-calendar-event-line !text-sm"></i> 
                ${uiDateShort}
            </div>
            <div style="padding:8px 10px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:#374151;text-align:left;">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <span style="color:#2563eb;display:flex;align-items:center;gap:4px;"><i class="ri-user-3-line"></i> Students:</span><b>${counts.students || 0}</b>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <span style="color:#16a34a;display:flex;align-items:center;gap:4px;"><i class="ri-team-line"></i> Staff:</span><b>${counts.staff || 0}</b>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px dashed #e5e7eb;padding-top:6px;margin-top:2px;font-weight:600;font-size:14px;">
                    <span style="color:#f59e0b;">Total:</span><b>${(counts.students||0)+(counts.staff||0)}</b>
                </div>
            </div>`;
        
        dateWiseListEl.appendChild(card);
    });
}


// 8) Listen for Active Schools (UPDATED LOGIC)
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

function processActiveSchools(val) {
    const map = Object.create(null);
    const onlineNames = [];
    let schoolsProcessed = new Set(); // To track unique normalized names

    // val is an object where keys are school IDs/keys and values are session objects
    Object.values(val || {}).forEach(schoolSessions => {
        if (!schoolSessions || typeof schoolSessions !== 'object') return;
        
        let chosenName = "";
        let maxExpiry = 0;

        // Iterate through all sessions of a single "school entry"
        Object.values(schoolSessions).forEach(session => {
            if (!session) return;
            
            const name = (session.name || session.schoolName || "").trim();
            const status = session.status;
            const expiry = Number(session.expiresAt) || 0;
            
            // Check if status is online and the session has not expired
            if (name && status === "online" && Date.now() < expiry) {
                // Find the session with the latest expiry time
                if (expiry > maxExpiry) {
                    maxExpiry = expiry;
                    chosenName = name;
                }
            }
        });

        // If at least one active session was found
        if (chosenName) {
            const norm = normalizeName(chosenName);
            
            // Add to the map and track unique names for display list
            if (!schoolsProcessed.has(norm)) {
                map[norm] = true;
                onlineNames.push(chosenName);
                schoolsProcessed.add(norm); // Mark as processed
            }
        }
    });

    // Update global state and re-render the list
    activeSchools = map;
    renderSchools();

    // UI Update for Online Count
    const onlineContainer = document.getElementById("onlineSchoolsCount")?.querySelector('span:first-child');
    if (onlineContainer) {
        onlineContainer.textContent = onlineNames.length; 
    }

    // UI Update for Online School List
    const onlineListContainer = document.getElementById("onlineSchoolsList");
    if (onlineListContainer) {
        onlineListContainer.innerHTML = "";
        onlineNames.sort((a, b) => a.localeCompare(b)).forEach(name => {
            // Using the professional style requested earlier
            const card = document.createElement("span");
            card.className = "bg-indigo-100 text-indigo-700 text-xs font-medium px-2 py-1 rounded-full";
            card.textContent = name;
            onlineListContainer.appendChild(card);
        });
        
        // Handle empty list case gracefully
        if(onlineNames.length === 0) {
             onlineListContainer.innerHTML = '<span class="text-sm text-gray-500">No schools currently online.</span>';
        }
    }
}


// 9) Listen for Vendor/Subscription Status (ULTRA PRO LOOK LOGIC with 'Due' Label and Tier)
function listenVendorBalance() {
    // 🛠️ updateUI में सबस्क्रिप्शन लेबल के लिए नया पैरामीटर जोड़ा गया है
    const updateUI = (balanceHTML, balanceClass, status, iconClass, statusColor, subLabelHTML = '') => {
        if (vendorBalanceEl) {
            // 🛠️ Premium Label को बैलेंस के ऊपर डिस्प्ले करने के लिए HTML अपडेट
            vendorBalanceEl.innerHTML = subLabelHTML + balanceHTML; 
            vendorBalanceEl.className = 'text-4xl font-extrabold tracking-tight ' + balanceClass; 
        }
        if (vendorStatusTextEl) { 
            vendorStatusTextEl.textContent = status;
            vendorStatusTextEl.className = `text-xs font-semibold ${statusColor}`; 
        }
        if (vendorStatusIconEl) { 
             vendorStatusIconEl.className = 'w-3 h-3 rounded-full ' + (status === "Service Active" ? 'bg-green-600' : status === "Service Suspended" ? 'bg-red-600' : 'bg-gray-400') + ' blink';
        }
        const mainIconEl = document.querySelector('.vendor-card .stat-icon');
        if (mainIconEl) {
             mainIconEl.className = iconClass + ' stat-icon';
        }
    };

    try {
        const vendorRef = ref(db, "roles/vendor");
        
        onValue(vendorRef, (snapshot) => {
            if (snapshot.exists()) {
                const vendorData = snapshot.val();
                const credits = Number(vendorData.credits) || 0;
                const deu = Number(vendorData.deu) || 0; // Due Amount
                const isActive = vendorData.isActive ?? true; 
                
                let balanceHTML = ""; 
                let balanceClass = "text-gray-900"; 
                let statusText = "Subscription Info";
                let iconClass = "ri-currency-line text-yellow-800"; 
                let statusColor = "text-yellow-800";
                let subLabelHTML = ""; // 🛠️ नया: प्रीमियम लेबल HTML

                // --- LOGIC FOR BALANCE AND LABEL ---
                if (deu > 0) {
                    balanceHTML = `<span>${formatCurrency(deu)}</span><span class="text-base font-semibold ml-2">Due</span>`;
                    balanceClass = "text-red-600";
                    statusText = "Payment Pending";
                    iconClass = 'ri-alert-fill text-red-700';
                    statusColor = "text-red-700";
                    
                    // ड्यू होने पर, चेतावनी के रूप में छोटा 'PAYMENT DUE' लेबल
                    subLabelHTML = `<div class="text-sm font-bold text-red-100 mb-1">PAYMENT DUE</div>`; 
                } else if (credits > 0) {
                    balanceHTML = `${formatCurrency(credits)}`; 
                    iconClass = 'ri-wallet-line text-green-700'; 
                    statusText = "Credits Available";
                    statusColor = "text-green-700";
                    
                    // 🌟 प्रीमियम लुक: क्रेडिट्स होने पर 'PREMIUM TIER' लेबल
                    subLabelHTML = `<div class="text-sm font-bold text-yellow-100 mb-1 tracking-wider border-b border-yellow-200/50 pb-1">PREMIUM TIER</div>`; 
                } else {
                    balanceHTML = `Activate Subscription`;
                    balanceClass = "text-gray-700";
                    statusText = "Subscription Required";
                    iconClass = 'ri-lock-line text-gray-700';
                    statusColor = "text-gray-700";
                    
                    // एक्टिवेशन आवश्यक होने पर 'FREE TIER' लेबल
                    subLabelHTML = `<div class="text-sm font-bold text-gray-100 mb-1">FREE TIER</div>`;
                }
                
                // STATUS INDICATOR LOGIC (Service Active/Suspended)
                if (isActive) {
                    if (deu === 0) {
                        statusText = "Service Active"; 
                        statusColor = "text-green-700";
                    }
                } else {
                    statusText = "Service Suspended";
                    statusColor = "text-red-700";
                    iconClass = 'ri-forbid-line text-red-700'; 
                    balanceClass = "text-gray-500"; 
                    if (deu > 0) {
                         // Suspended + Due: Greyed out Due amount
                         balanceHTML = `<span>${formatCurrency(deu)}</span><span class="text-base font-semibold ml-2 text-gray-500">Due</span>`; 
                    }
                    // Suspended होने पर लेबल को भी डार्क ग्रे कर दें
                    subLabelHTML = `<div class="text-sm font-bold text-gray-400 mb-1">${deu > 0 ? 'SERVICE SUSPENDED' : 'EXPIRED TIER'}</div>`;
                }

                updateUI(balanceHTML, balanceClass, statusText, iconClass, statusColor, subLabelHTML);
                
            } else {
                updateUI("₹0", "text-gray-900", "Unknown", "ri-currency-line text-gray-700", "text-gray-700");
            }
        });
    } catch (err) {
        console.error("listenVendorBalance error:", err);
        updateUI("Error", "text-red-500", "Error", "ri-close-circle-line text-red-500", "text-red-500");
    }
}


// 10) Start Listeners and Initial Render
document.addEventListener('DOMContentLoaded', () => {
    listenToEnrollmentChanges();
    listenActiveSchools(); // This uses the complex session logic now
    listenVendorBalance();
    renderAll(); 
});
