// ----------------------------------------------------
// Active Schools Dashboard -
// ----------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onChildAdded,
  onChildRemoved,
  onValue
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";
import { firebaseConfig } from "../Database/Database.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 4) DOM Elements
const studentCountEl = document.getElementById("studentCount");
const staffCountEl = document.getElementById("staffCount");
const totalEnrollmentEl = document.getElementById("totalEnrollment");
const uniqueSchoolsEl = document.getElementById("uniqueSchools");
const schoolListEl = document.getElementById("schoolList");
const searchBox = document.getElementById("searchBox");
const sortType = document.getElementById("sortType");
const dateWiseListEl = document.getElementById("dateWiseList");
const totalOnlineEl = document.getElementById("totalOnlineUsers");

// 5) Global State (New: Using Map for efficient data management)
const schoolsData = new Map();
let activeSchools = Object.create(null);
let studentCount = 0;
let staffCount = 0;
let dateMap = new Map();

// 6) Helpers
function normalizeName(name) {
  return (name || "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}
function parseEnrollmentDate(enrollmentId) {
  if (!enrollmentId || typeof enrollmentId !== "string" || enrollmentId.length < 18) return null;
  const dateStr = enrollmentId.slice(7, 16); // DDMMMYYYY
  const day = parseInt(dateStr.slice(0, 2), 10);
  const monStr = dateStr.slice(2, 5).toUpperCase();
  const year = parseInt(dateStr.slice(5), 10);
  const months = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  const month = months[monStr];
  if (!Number.isFinite(day) || !Number.isFinite(year) || month === undefined) return null;
  return new Date(year, month, day);
}
function setText(el, val) { if (el) el.textContent = String(val ?? 0); }
function debounce(fn, wait = 150) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), wait); };
}

// 7) Live Update and Bandwidth Optimized Logic
// ✅ This function will only listen to changes in enrollment numbers.
function listenToEnrollmentChanges() {
  const masterRef = ref(db, "DATA-MASTER");

  // 🔥 Listen for changes to each school's name/ID
  onChildAdded(masterRef, (schoolNameSnapshot) => {
    const schoolName = schoolNameSnapshot.key;
    const schoolIds = schoolNameSnapshot.val();

    for (const schoolId in schoolIds) {
      if (typeof schoolIds[schoolId] !== 'object' || schoolIds[schoolId] === null) continue;

      const studentsRef = ref(db, `DATA-MASTER/${schoolName}/${schoolId}/STUDENT`);
      const staffRef = ref(db, `DATA-MASTER/${schoolName}/${schoolId}/STAFF`);

      // ✅ Child Listener for Students
      onChildAdded(studentsRef, (snapshot) => {
        updateCounts(schoolName, "student", 1, snapshot.key);
      });
      onChildRemoved(studentsRef, (snapshot) => {
        updateCounts(schoolName, "student", -1, snapshot.key);
      });

      // ✅ Child Listener for Staff
      onChildAdded(staffRef, (snapshot) => {
        updateCounts(schoolName, "staff", 1, snapshot.key);
      });
      onChildRemoved(staffRef, (snapshot) => {
        updateCounts(schoolName, "staff", -1, snapshot.key);
      });
    }
  });
}

function updateCounts(schoolName, type, change, enrollmentId) {
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

  // DateWise counts
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

  // ✅ Trigger UI update
  renderAll();
}

// ✅ New function to render all UI elements
function renderAll() {
  setText(studentCountEl, studentCount);
  setText(staffCountEl, staffCount);
  setText(totalEnrollmentEl, studentCount + staffCount);
  setText(uniqueSchoolsEl, schoolsData.size);

  renderSchools();
  renderDateWise(Object.fromEntries(dateMap));
}

// ----------------------------------------------------
// 8) Render Schools (remains the same)
// ----------------------------------------------------
function renderSchools() {
  if (!schoolListEl) return;

  // Convert Map to Array for filtering/sorting
  let schoolsDataArray = Array.from(schoolsData.values());
  let filtered = [...schoolsDataArray];

  const searchVal = (searchBox?.value || "").toLowerCase();
  if (searchVal) {
    filtered = filtered.filter(s =>
      (s.name || "").toLowerCase().includes(searchVal)
    );
  }

  if (sortType) {
    const v = sortType.value;
    if (v === "az") filtered.sort((a, b) => a.name.localeCompare(b.name));
    else if (v === "za") filtered.sort((a, b) => b.name.localeCompare(a.name));
    else if (v === "high") filtered.sort((a, b) => b.total - a.total);
    else if (v === "low") filtered.sort((a, b) => a.total - b.total);
  }

  const totalOnlineSchools = filtered.filter(s => activeSchools[s.normalized]).length;
  if (totalOnlineEl) {
    totalOnlineEl.textContent = `Online Schools: ${totalOnlineSchools}`;
  }

  schoolListEl.innerHTML = "";
  if (!filtered.length) {
    schoolListEl.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;background:#f9fafb;
      border-radius:16px;border:2px dashed #d1d5db;color:#6b7280;font-size:15px;">
        <i class="ri-search-eye-line" style="font-size:32px;color:#9ca3af;
        margin-bottom:10px;display:block;"></i>
        No schools found.<br>Try adjusting your search or filters.
      </div>`;
    return;
  }

  filtered.forEach(s => {
    const card = document.createElement("div");
    card.className = "school-card";
    card.style = `
      background:#fff;border-radius:14px;box-shadow:0 3px 8px rgba(0,0,0,0.08);
      overflow:hidden;transition:all 0.25s ease;display:flex;flex-direction:column;position:relative;`;

    card.onmouseenter = () => {
      card.style.transform = "translateY(-4px)";
      card.style.boxShadow = "0 6px 16px rgba(0,0,0,0.12)";
    };
    card.onmouseleave = () => {
      card.style.transform = "translateY(0)";
      card.style.boxShadow = "0 3px 8px rgba(0,0,0,0.08)";
    };

    const displayName = s.name || "School";
    const isOnline = !!activeSchools[s.normalized];
    const onlineDot = isOnline ? `<span class="online-dot-pulse"></span>` : "";
    const headerBg = isOnline
      ? "linear-gradient(135deg,#16a34a,#22c55e)"
      : "linear-gradient(135deg,#2563eb,#3b82f6)";

    card.innerHTML = `
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
      </div>`;
    schoolListEl.appendChild(card);
  });
}

if (searchBox) searchBox.addEventListener("input", debounce(renderSchools, 150));
if (sortType) sortType.addEventListener("change", renderSchools);

// ----------------------------------------------------
// 9) Render Date-Wise (remains the same)
// ----------------------------------------------------
function renderDateWise(dateMap) {
  if (!dateWiseListEl) return;
  dateWiseListEl.innerHTML = "";

  function parseDateString(dateStr) {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + 1);
    return d;
  }

  const headerColors = [
    "linear-gradient(135deg,#9333ea,#a855f7)",
    "linear-gradient(135deg,#2563eb,#3b82f6)",
    "linear-gradient(135deg,#16a34a,#22c55e)",
    "linear-gradient(135deg,#f59e0b,#fbbf24)",
    "linear-gradient(135deg,#dc2626,#ef4444)",
    "linear-gradient(135deg,#0d9488,#14b8a6)",
    "linear-gradient(135deg,#be185d,#ec4899)"
  ];

  const entries = Object.entries(dateMap || {}).sort(
    (a, b) => parseDateString(b[0]) - parseDateString(a[0])
  );

  if (!entries.length) {
    dateWiseListEl.innerHTML =
      `<div style="text-align:center;padding:20px;color:#6b7280;">No date-wise data</div>`;
    return;
  }

  const last7 = entries.slice(0, 7);

  dateWiseListEl.style.display = "grid";
  dateWiseListEl.style.gridTemplateColumns = "repeat(7, 1fr)";
  dateWiseListEl.style.gap = "14px";

  last7.forEach(([dateKey, counts], index) => {
    const dateObj = parseDateString(dateKey);

    const uiDate = dateObj.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short"
    });

    const card = document.createElement("div");
    card.className = "date-card";
    card.style = `
      background:#fff;
      border-radius:14px;
      box-shadow:0 3px 8px rgba(0,0,0,0.08);
      overflow:hidden;
      transition:all 0.25s ease;
      cursor:pointer;
    `;

    const headerBg = headerColors[index % headerColors.length];

    card.innerHTML = `
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
          <b>${(counts.students||0)+(counts.staff||0)}</b>
        </div>
      </div>`;

    dateWiseListEl.appendChild(card);
  });

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .date-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 6px 14px rgba(0,0,0,0.12);
    }
    @media (max-width: 1024px) {
      #${dateWiseListEl.id} {
        grid-template-columns: repeat(3, 1fr) !important;
      }
    }
    @media (max-width: 640px) {
      #${dateWiseListEl.id} {
        grid-template-columns: repeat(2, 1fr) !important;
      }
      .date-card .label { display: none !important; }
      .date-card div[style*="font-weight:600"] { font-size:14px !important; }
    }
  `;
  document.head.appendChild(styleEl);
}

// ----------------------------------------------------
// 10) Listen for Active Schools (remains the same)
// ----------------------------------------------------
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
  renderSchools();

  const onlineContainer = document.getElementById("onlineSchoolsCount");
  if (onlineContainer) {
    onlineContainer.innerHTML = `
      <i class="ri-user-line"></i> ${onlineNames.length}
      <span style="width:10px;height:10px;background:green;border-radius:50%;display:inline-block;margin-left:6px;"></span>`;
  }

  const onlineListContainer = document.getElementById("onlineSchoolsList");
  if (onlineListContainer) {
    onlineListContainer.innerHTML = "";
    onlineNames.sort((a, b) => a.localeCompare(b)).forEach(name => {
      const card = document.createElement("div");
      card.className = "online-school-card";
      card.innerHTML = `<span class="online-school-dot"></span>${name}`;
      onlineListContainer.appendChild(card);
    });
  }
}

// ----------------------------------------------------
// 11) Start Listeners
// ----------------------------------------------------
listenToEnrollmentChanges();
listenActiveSchools();