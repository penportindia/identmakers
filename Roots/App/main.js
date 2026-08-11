import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getDatabase, ref as dbRef, get, child, set, update, remove, onDisconnect, runTransaction, push,
  query, orderByChild, equalTo, limitToFirst
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { firebaseConfig, cloudinaryConfig } from '../Database/Database.js';

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const { uploadUrl: CLOUDINARY_UPLOAD_URL, uploadPreset: CLOUDINARY_UPLOAD_PRESET } = cloudinaryConfig;

export { app, database, dbRef, get, child, set, update, remove, onDisconnect, runTransaction, push, query, orderByChild, equalTo, limitToFirst, CLOUDINARY_UPLOAD_URL, CLOUDINARY_UPLOAD_PRESET };

let imageData = "";
let lastType = "";
let stream = null;

let schoolCode = "";
let schoolName = "";
let entryData = {};

let userIP = "";
let safeIP = "";

let sessionTimeout = null;
let hardTimeout = null;
let modalTimeout = null;
let isSubmitting = false;
let fallbackFieldIndex = 0;
let cropSourceImage = null;
let isEditingEntry = false;
let existingPhotoUrl = "";
let editingRecordPath = "";

const MAX_IDLE = 10 * 60 * 1000;
const MAX_SESSION = 60 * 60 * 1000;
const ENROLLMENT_NOT_FOUND_MESSAGE = "Your ID card is already printed or not found.";
const ENROLLMENT_GENERATION_FAILED_MESSAGE = "Enrollment number generate nahi hua. Please internet/login check karke dobara try karein.";


const el = id => document.getElementById(id);
const exists = id => !!el(id);
const safeGet = id => (exists(id) ? el(id) : null);

function getRandomSerial(length = 5) {
  const max = 10 ** length;
  if (globalThis.crypto?.getRandomValues) {
    return String(crypto.getRandomValues(new Uint32Array(1))[0] % max).padStart(length, "0");
  }
  const fallback = Math.floor((Date.now() + (globalThis.performance?.now?.() || 0) * 1000) % max);
  return String(fallback).padStart(length, "0");
}

function createFieldName() {
  fallbackFieldIndex += 1;
  if (globalThis.crypto?.randomUUID) return `field_${crypto.randomUUID()}`;
  return `field_${Date.now()}_${fallbackFieldIndex}`;
}

function digitsOnly(value, maxLength = 10) {
  return String(value || "").replace(/\D/g, "").slice(0, maxLength);
}

function enforceTenDigits(input) {
  if (!input) return;
  input.value = digitsOnly(input.value, 10);
}

function enforceDigits(input, maxLength = 10) {
  if (!input) return;
  input.value = digitsOnly(input.value, maxLength);
}

function getButtonRefs() {
  return {
    newEntryBtn: safeGet("newEntryBtn"),
    cameraBtn: safeGet("cameraBtn"),
    galleryBtn: safeGet("galleryBtn"),
    submitBtn: safeGet("submitBtn"),
    homeBtn: safeGet("homeBtn"),
    saveBtn: safeGet("saveBtn"),
    editBtn: safeGet("editBtn")
  };
}

function showModal(title, message, isError = false) {
    const modal = document.getElementById('messageModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalIcon = modal.querySelector('.modal-icon');
    
    modalTitle.textContent = title;
    modalMessage.textContent = message;

    if (isError) {
        modalIcon.innerHTML = '<i class="fas fa-times-circle"></i>';
        modalIcon.classList.add('error');
    } else {
        modalIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
        modalIcon.classList.remove('error');
    }

    modal.classList.add('visible');
    if (modalTimeout) clearTimeout(modalTimeout);
    modalTimeout = setTimeout(hideModal, 3000);
}

function hideModal() {
    const modal = document.getElementById('messageModal');
    modal.classList.remove('visible');
    if (modalTimeout) {
      clearTimeout(modalTimeout);
      modalTimeout = null;
    }
}

function setInlineStatus(id, message = "", isError = false) {
  const status = safeGet(id);
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("hidden", !message);
  status.classList.toggle("error", isError);
}

function clearInlineStatus() {
  setInlineStatus("formStatus");
  setInlineStatus("uploadStatus");
}

function setAppSplash(isLoading, title = "Please wait", message = "Working...") {
  const splash = safeGet("loginSplash");
  const splashTitle = safeGet("loginSplashTitle");
  const splashText = safeGet("loginSplashText");

  if (splashTitle) splashTitle.textContent = title;
  if (splashText) splashText.textContent = message;
  splash?.classList.toggle("hidden", !isLoading);
}

function setLoginLoading(isLoading, message = "Checking credentials...") {
  const loginButton = safeGet("loginSubmitBtn");
  const loginUser = safeGet("loginUser");
  const loginPass = safeGet("loginPass");

  setAppSplash(isLoading, "Signing in", message);

  [loginButton, loginUser, loginPass].forEach(control => {
    if (control) control.disabled = isLoading;
  });

  if (loginButton) {
    loginButton.innerHTML = isLoading
      ? '<i class="fas fa-spinner fa-spin"></i><span>Please wait</span>'
      : '<span>Login</span><i class="fas fa-arrow-right"></i>';
  }
}

function setSearchLoading(isLoading) {
  const searchButton = document.querySelector(".edit-search-btn");
  const searchDate = safeGet("searchDate");
  const searchUnique = safeGet("searchUnique");

  setAppSplash(isLoading, "Searching", "Checking enrollment details...");
  [searchButton, searchDate, searchUnique].forEach(control => {
    if (control) control.disabled = isLoading;
  });

  if (searchButton) {
    searchButton.innerHTML = isLoading
      ? '<i class="fas fa-spinner fa-spin"></i><span>Searching</span>'
      : '<span>Search</span><i class="fas fa-search"></i>';
  }
}

function showLoginPage() {
  safeGet("welcomePage")?.classList.add("hidden");
  safeGet("loginPage")?.classList.remove("hidden");
}

function showDashboardMenu(mode = "") {
  const createPanel = safeGet("createMenuPanel");
  const editPanel = safeGet("editMenuPanel");
  const createBtn = document.querySelector(".create-menu-btn");
  const editBtn = document.querySelector(".edit-menu-btn");
  const isCreate = mode === "create";
  const isEdit = mode === "edit";

  createPanel?.classList.toggle("hidden", !isCreate);
  editPanel?.classList.toggle("hidden", !isEdit);
  createBtn?.classList.toggle("active", isCreate);
  editBtn?.classList.toggle("active", isEdit);

  if (isCreate) {
    safeGet("idType")?.focus();
    setInlineStatus("searchStatus");
  }

  if (isEdit) {
    safeGet("searchDate")?.focus();
  }
}

function resetDashboardMenu() {
  showDashboardMenu("");
  if (safeGet("idType")) safeGet("idType").value = "";
  if (safeGet("searchDate")) safeGet("searchDate").value = "";
  if (safeGet("searchUnique")) safeGet("searchUnique").value = "";
  setInlineStatus("searchStatus");
}

function renderSchoolProfile(user = null, displayName = "") {
  const profile = safeGet("schoolProfile");
  if (!profile) return;

  if (!user) {
    profile.innerHTML = `
      <div class="school-profile-top">
        <div class="school-avatar"><i class="fas fa-school"></i></div>
        <div class="school-profile-main">
          <strong>Auto-filled after login</strong>
        </div>
      </div>
      <div class="school-profile-meta">
        <span><i class="fas fa-shield-halved"></i> Verified Login</span>
        <span><i class="fas fa-circle-check"></i> Ready</span>
      </div>
      <div class="dashboard-menu">
        <button type="button" onclick="showDashboardMenu('create')" class="dashboard-menu-btn create-menu-btn">
          <i class="fas fa-plus"></i>
          <span>Create New</span>
        </button>
        <button type="button" onclick="showDashboardMenu('edit')" class="dashboard-menu-btn edit-menu-btn">
          <i class="fas fa-pen-to-square"></i>
          <span>Edit</span>
        </button>
      </div>
    `;
    return;
  }

  const userId = user.userid || "SCHOOL";
  const phone = digitsOnly(user.phone || "", 10);
  const phoneLabel = phone ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : "Phone Linked";

  profile.innerHTML = `
    <div class="school-profile-top">
      <div class="school-avatar"><i class="fas fa-school"></i></div>
      <div class="school-profile-main">
        <strong>${escapeHTML(displayName || user.name || "School")}</strong>
        <span class="school-profile-id">User ID: ${escapeHTML(userId)}</span>
      </div>
    </div>
    <div class="school-profile-meta">
      <span><i class="fas fa-circle-check"></i> Active</span>
      <span><i class="fas fa-phone"></i> ${escapeHTML(phoneLabel)}</span>
    </div>
    <div class="dashboard-menu">
      <button type="button" onclick="showDashboardMenu('create')" class="dashboard-menu-btn create-menu-btn">
        <i class="fas fa-plus"></i>
        <span>Create New</span>
      </button>
      <button type="button" onclick="showDashboardMenu('edit')" class="dashboard-menu-btn edit-menu-btn">
        <i class="fas fa-pen-to-square"></i>
        <span>Edit</span>
      </button>
    </div>
  `;
}

document.querySelector('.close-btn').addEventListener('click', hideModal);
document.getElementById('modalOkBtn').addEventListener('click', hideModal);

async function fetchUserIP() {
  try {
    const res = await fetch("https://api64.ipify.org?format=json");
    const data = await res.json();
    return data.ip || "unknown_ip";
  } catch {
    return "unknown_ip";
  }
}

function resetSessionTimer() {
  if (sessionTimeout) clearTimeout(sessionTimeout);
  sessionTimeout = setTimeout(() => {
    location.reload();
  }, MAX_IDLE);
}

async function logoutUser(message = "You have been logged out.") {
  if (!schoolCode || !safeIP) {
    if (exists("loginPage")) el("loginPage").classList.remove("hidden");
    if (exists("homePage")) el("homePage").classList.add("hidden");
    showModal("Logout", message);
    return;
  }

  try {
    const ipRef = dbRef(database, `activeSchools/${schoolCode}/${safeIP}`);
    await remove(ipRef);

    if (exists("loginPage")) el("loginPage").classList.remove("hidden");
    if (exists("homePage")) el("homePage").classList.add("hidden");
    if (exists("idForm")) el("idForm").classList.add("hidden");
    if (exists("previewPage")) el("previewPage").classList.add("hidden");
    if (exists("formFields")) el("formFields").innerHTML = "";
    if (exists("preview")) el("preview").innerHTML = "";
    if (exists("canvas")) el("canvas").classList.add("hidden");
    if (exists("video")) el("video").classList.add("hidden");

    schoolCode = "";
    schoolName = "";
    entryData = {};
    userIP = "";
    safeIP = "";
    imageData = "";
    lastType = "";
    resetEditState();
    renderSchoolProfile();

    if (sessionTimeout) clearTimeout(sessionTimeout);
    if (hardTimeout) clearTimeout(hardTimeout);
    stopCamera();

    showModal("Logged Out", message);
  } catch (error) {
    console.error("Error during logout:", error);
    showModal("Error", "An error occurred during logout. Please refresh the page.", true);
  }
}

["click", "keydown", "input", "change", "mousemove", "touchstart"].forEach(evt => {
  document.addEventListener(evt, resetSessionTimer, {
    passive: true
  });
});

function isLoginMatch(data, uidOrPhone, pwd) {
  if (!data || data.password !== pwd) return false;
  const inputDigits = String(uidOrPhone || "").replace(/\D/g, "");
  const dbPhoneDigits = String(data.phone || "").replace(/\D/g, "");
  const inputUserId = uidOrPhone.startsWith("+") ? uidOrPhone : "+" + uidOrPhone;
  const uidMatch = data.userid === uidOrPhone || data.userid === inputUserId;
  const phoneMatch = dbPhoneDigits && dbPhoneDigits === inputDigits;
  return uidMatch || phoneMatch;
}

async function getFirstMatchingSchoolByQuery(field, value, uidOrPhone, pwd) {
  if (!value) return null;
  try {
    const schoolsRef = dbRef(database, "schools");
    const snapshot = await get(query(schoolsRef, orderByChild(field), equalTo(value), limitToFirst(5)));
    if (!snapshot.exists()) return null;

    const records = snapshot.val() || {};
    return Object.values(records).find(data => isLoginMatch(data, uidOrPhone, pwd)) || null;
  } catch (error) {
    console.warn(`Fast login query failed for ${field}:`, error);
    return null;
  }
}

async function findMatchedSchool(uidOrPhone, pwd) {
  const rootRef = dbRef(database);
  const directKeys = [
    uidOrPhone,
    `+${uidOrPhone}`,
    `91${uidOrPhone}`,
    `+91${uidOrPhone}`
  ];

  for (const key of directKeys) {
    try {
      const snapshot = await get(child(rootRef, `schools/${sanitizePathSegment(key)}`));
      if (snapshot.exists() && isLoginMatch(snapshot.val(), uidOrPhone, pwd)) {
        return snapshot.val();
      }
    } catch (_) {}
  }

  const queryCandidates = [
    ["phone", uidOrPhone],
    ["phone", Number(uidOrPhone)],
    ["phone", `+91${uidOrPhone}`],
    ["userid", uidOrPhone],
    ["userid", `+${uidOrPhone}`],
    ["userid", `+91${uidOrPhone}`]
  ];

  for (const [field, value] of queryCandidates) {
    const match = await getFirstMatchingSchoolByQuery(field, value, uidOrPhone, pwd);
    if (match) return match;
  }

  const snapshot = await get(child(rootRef, "schools"));
  if (!snapshot.exists()) return null;

  const schools = snapshot.val();
  for (let key in schools) {
    const data = schools[key];
    if (isLoginMatch(data, uidOrPhone, pwd)) return data;
  }

  return null;
}

window.verifyLogin = async function() {
  try {
    const loginInput = safeGet("loginUser");
    if (loginInput) enforceTenDigits(loginInput);
    const uidOrPhone = digitsOnly(loginInput?.value || "", 10);
    const pwd = (safeGet("loginPass")?.value || "").trim();

    if (!uidOrPhone || !pwd) {
      showModal("Login Failed", "Please enter 10 digit phone number and password.", true);
      return;
    }

    if (uidOrPhone.length !== 10) {
      showModal("Login Failed", "Phone number must be exactly 10 digits.", true);
      return;
    }

    setLoginLoading(true, "Checking school account...");

    const ipPromise = fetchUserIP();
    const matchedUser = await findMatchedSchool(uidOrPhone, pwd);

    if (!matchedUser) {
      showModal("Login Failed", "Invalid User ID / Phone or Password", true);
      return;
    }

    if (!matchedUser.status || matchedUser.status.toString().trim().toLowerCase() !== "active") {
      showModal("Login Failed", "You are an Inactive user. Please Contact Admin to Activate your account first.", true);
      return;
    }

    const rawSchoolName = matchedUser.name || '';
    const cleanSchoolName = rawSchoolName.replace(/[^a-zA-Z0-9 ,]/g, '').replace(/\s+/g, ' ').trim();

    if (!cleanSchoolName) {
      showModal("Login Failed", "School name is invalid in database!", true);
      return;
    }

    setLoginLoading(true, "Securing your session...");
    userIP = await ipPromise;
    safeIP = userIP.replace(/\./g, "-");

    if (exists("loginPage")) el("loginPage").classList.add("hidden");
    if (exists("homePage")) el("homePage").classList.remove("hidden");

    schoolCode = matchedUser.userid || 'SCHOOL';
    schoolName = cleanSchoolName;
    renderSchoolProfile(matchedUser, cleanSchoolName);
    resetDashboardMenu();

    const ipRef = dbRef(database, `activeSchools/${schoolCode}/${safeIP}`);

    setLoginLoading(true, "Opening dashboard...");
    await set(ipRef, {
      name: schoolName,
      ip: userIP,
      status: "online",
      loginAt: Date.now(),
      expiresAt: Date.now() + MAX_SESSION
    });

    try {
      onDisconnect(ipRef).remove();
    } catch (_) {}

    resetSessionTimer();
    if (hardTimeout) clearTimeout(hardTimeout);
    hardTimeout = setTimeout(async() => {
      await logoutUser("Session ended after 1 hour.");
    }, MAX_SESSION);

  } catch (error) {
    showModal("Error", "Firebase Error: " + (error.message || error), true);
    console.error(error);
  } finally {
    setLoginLoading(false);
  }
};

window.addEventListener("beforeunload", () => {
  if (schoolCode && safeIP) {
    try {
      remove(dbRef(database, `activeSchools/${schoolCode}/${safeIP}`));
    } catch (_) {}
  }
});

async function generateUniqueEnrollment(type) {
  if (!type || typeof type !== "string") {
    throw new Error("Invalid 'type' parameter");
  }

  if (!schoolCode || !schoolCode.trim()) {
    throw new Error("School UserID is empty! Cannot generate enrollment.");
  }

  if (!schoolName || !schoolName.trim()) {
    throw new Error("School name is empty! Cannot generate enrollment.");
  }

  const dbRoot = dbRef(database);
  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mmm = monthNames[now.getMonth()];
  const yyyy = now.getFullYear();

  let unique = false;
  let enrollNo = "";

  while (!unique) {
    const serial = getRandomSerial(5);
    enrollNo = `${schoolCode}${dd}${mmm}${yyyy}${serial}`;

    try {
      const schoolNode = sanitizePathSegment(schoolName || "UNKNOWN_SCHOOL");
      const schoolId = sanitizePathSegment(schoolCode || "UNKNOWN_ID");
      const typeNode = sanitizePathSegment(type.toUpperCase());
      const snapshot = await get(child(dbRoot, `DATA-MASTER/${schoolNode}/${schoolId}/${typeNode}/${enrollNo}`));
      if (!snapshot.exists()) unique = true;
      else await new Promise(res => setTimeout(res, 40));
    } catch (error) {
      console.error("Database error while generating enrollment:", error);
      throw new Error("Unable to generate enrollment number");
    }
  }

  return enrollNo;
}

function getEnrollmentDateCode(dateValue) {
  const match = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return "";
  return `${match[3]}${monthNames[monthIndex]}${match[1]}`;
}

function convertDisplayDateToInput(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const match = text.match(/^(\d{2})-([A-Z]{3})-(\d{4})$/i);
  if (!match) return "";

  const monthIndex = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    .indexOf(match[2].toUpperCase());
  if (monthIndex < 0) return "";
  return `${match[3]}-${String(monthIndex + 1).padStart(2, "0")}-${match[1]}`;
}

function setFormHeading(mode = "create") {
  const heading = safeGet("formHeading");
  if (!heading) return;
  heading.innerHTML = mode === "edit"
    ? '<i class="fas fa-pen-to-square me-2"></i> Edit ID Form'
    : '<i class="fas fa-clipboard me-2"></i> Fill ID Form';
}

function resetEditState() {
  isEditingEntry = false;
  existingPhotoUrl = "";
  editingRecordPath = "";
  setFormHeading("create");
}

function fillGeneratedForm(type, data = {}) {
  Object.entries(data).forEach(([key, value]) => {
    const field = safeGet(key);
    if (!field || ["photo", "schoolName", "schoolId"].includes(key)) return;
    field.value = key === `${type}_dob` ? convertDisplayDateToInput(value) : value;
  });
}

async function findExistingEnrollment(dateCode, uniqueDigits) {
  const schoolId = sanitizePathSegment(schoolCode || "UNKNOWN_ID");
  const schoolNode = sanitizePathSegment(schoolName || "UNKNOWN_SCHOOL");
  const enrollPrefix = `${schoolCode}${dateCode}`.toUpperCase();
  const rootPath = `DATA-MASTER/${schoolNode}/${schoolId}`;
  const typeCandidates = [
    ["student", "student"],
    ["student", "STUDENT"],
    ["staff", "staff"],
    ["staff", "STAFF"]
  ];

  for (const [type, node] of typeCandidates) {
    const path = `${rootPath}/${node}`;
    const snapshot = await get(child(dbRef(database), path));
    if (!snapshot.exists()) continue;

    const records = snapshot.val() || {};
    const match = Object.entries(records).find(([enroll]) => {
      const normalized = String(enroll || "").toUpperCase();
      return normalized.startsWith(enrollPrefix) && normalized.endsWith(uniqueDigits);
    });

    if (match) {
      const [enroll, data] = match;
      return { type, enroll, data: data || {}, path: `${path}/${enroll}` };
    }
  }

  return null;
}

async function openExistingEnrollment(match) {
  if (!match) return;

  lastType = match.type;
  if (safeGet("idType")) safeGet("idType").value = match.type;
  isEditingEntry = true;
  existingPhotoUrl = match.data?.photo || "";
  editingRecordPath = match.path;
  imageData = "";
  entryData = { ...match.data };

  safeGet("homePage")?.classList.add("hidden");
  safeGet("previewPage")?.classList.add("hidden");
  safeGet("idForm")?.classList.remove("hidden");
  setFormHeading("edit");
  clearInlineStatus();
  resetProgressBar();
  hideCropControls();
  stopCamera();
  resetPhotoButtons();

  await generateFormFields(match.type, match.enroll);
  fillGeneratedForm(match.type, match.data);

  if (existingPhotoUrl) {
    showExistingPhotoOnCanvas(existingPhotoUrl);
    setPhotoReadyState();
    setInlineStatus("formStatus", "Existing photo will be retained unless you capture or choose a new photo.");
  }
}

async function searchExistingEnrollment() {
  try {
    const searchDate = safeGet("searchDate")?.value || "";
    const uniqueDigits = digitsOnly(safeGet("searchUnique")?.value || "", 5);

    if (!schoolCode || !schoolName) {
      showModal("Login Required", "Please login again before searching.", true);
      return;
    }

    if (!searchDate || uniqueDigits.length !== 5) {
      showModal("Search Required", "Enter enrollment date and last 5 digits.", true);
      return;
    }

    setInlineStatus("searchStatus");
    setSearchLoading(true);
    const dateCode = getEnrollmentDateCode(searchDate);
    const match = await findExistingEnrollment(dateCode, uniqueDigits);

    if (!match) {
      showModal("Not Found", ENROLLMENT_NOT_FOUND_MESSAGE, true);
      return;
    }

    await openExistingEnrollment(match);
  } catch (error) {
    console.error("Enrollment search failed:", error);
    showModal("Not Found", ENROLLMENT_NOT_FOUND_MESSAGE, true);
  } finally {
    setSearchLoading(false);
  }
}

window.navigateToForm = async function() {
  const type = (safeGet("idType")?.value || "").trim().toLowerCase();
  if (!["student", "staff"].includes(type)) {
    safeGet("idType")?.focus();
    return;
  }
  resetEditState();
  lastType = type;
  if (exists("homePage")) el("homePage").classList.add("hidden");
  if (exists("idForm")) el("idForm").classList.remove("hidden");
  await generateFormFields(type);
};

async function generateFormFields(type, existingEnroll = "") {
  if (!["student", "staff"].includes(type)) {
    return;
  }

  const numberFields = ['roll', 'contact'];
  const codeFields = ['adm', 'empid'];

  const studentFields = [
    ['enroll', 'Enrollment Number *', 'text', true],
    ['adm', 'Admission Number', 'text'],
    ['name', 'Student Name *', 'text'],
    ['class', 'Class *', 'select', ['PG', 'NUR', 'LKG', 'UKG', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']],
    ['section', 'Section *', 'select', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']],
    ['roll', 'Roll Number *', 'text'],
    ['dob', 'Date of Birth', 'date'],
    ['father', "Father's Name *", 'text'],
    ['mother', "Mother's Name *", 'text'],
    ['contact', 'Contact Number', 'text'],
    ['address', 'Address *', 'textarea'],
    ['transport', 'Mode of Transport *', 'select', ['SELF', 'TRANSPORT']],
    ['house', 'House Name', 'text'],
    ['blood', 'Blood Group', 'select', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'NA']]
  ];

  const staffFields = [
    ['enroll', 'Enrollment Number *', 'text', true],
    ['empid', 'Employee ID', 'text'],
    ['name', 'Name *', 'text'],
    ['designation', 'Designation *', 'select', ['DIRECTOR', 'PRINCIPAL', 'VICE PRINCIPAL', 'COORDINATOR', 'ADMIN', 'ACCOUNTANT', 'LIBRARIAN', 'TEACHER', 'CLERK', 'COMPUTER OPERATOR', 'RECEPTIONIST', 'DRIVER', 'ATTENDANT', 'GUARD', 'CARETAKER', 'HELPER', 'PEON', 'MED', 'OTHER']],
    ['father', "Father / Spouse Name *", 'text'],
    ['dob', 'Date of Birth', 'date'],
    ['contact', 'Contact Number', 'text'],
    ['address', 'Address *', 'textarea'],
    ['blood', 'Blood Group', 'select', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'NA']]
  ];

  const fields = type === 'student' ? studentFields : staffFields;
  const container = safeGet("formFields");
  if (!container) {
    console.warn("formFields container not found in DOM");
    return;
  }
  container.innerHTML = '';

  let enrollNo = "";
  if (existingEnroll) {
    enrollNo = existingEnroll;
  } else {
    try {
      enrollNo = await generateUniqueEnrollment(type);
    } catch (e) {
      console.error("Enrollment generation failed:", e);
      setInlineStatus("formStatus", ENROLLMENT_GENERATION_FAILED_MESSAGE, true);
      showModal("Error", ENROLLMENT_GENERATION_FAILED_MESSAGE, true);
      safeGet("idForm")?.classList.add("hidden");
      safeGet("homePage")?.classList.remove("hidden");
      resetDashboardMenu();
      return;
    }
  }

  fields.forEach(fieldDef => {
    const [id, label, controlType, optOrReadonly] = fieldDef;
    const fullId = `${type}_${id}`;
    let inputHTML = '';

    const isRequired = (label.includes('*') && !['dob', 'contact'].includes(id)) ? 'required' : '';

    if (controlType === 'select') {
      const options = Array.isArray(optOrReadonly) ? optOrReadonly : [];

      if ((id === 'designation' && type === 'staff') || (id === 'section' && type === 'student')) {
        const datalistId = `${fullId}_list`;
        inputHTML = `
          <input list="${datalistId}" id="${fullId}" name="${fullId}" placeholder="Select or type ${label.replace('*', '').trim()}" ${isRequired} />
          <datalist id="${datalistId}">
            ${options.map(opt => `<option value="${opt}">`).join('')}
          </datalist>
        `;
      } else {
        inputHTML = `<select id="${fullId}" name="${fullId}" ${isRequired}>
          <option value="" disabled selected>Select ${label.replace('*', '').trim()}</option>`;
        options.forEach(opt => inputHTML += `<option value="${opt}">${opt}</option>`);
        inputHTML += `</select>`;
      }

    } else if (controlType === 'textarea') {
      const maxLength = 120;
      inputHTML = `<textarea id="${fullId}" name="${fullId}" rows="2" maxlength="${maxLength}" ${isRequired}></textarea>`;
    } else {
      const value = id === 'enroll' ? enrollNo : '';
      const ro = id === 'enroll' ? 'readonly' : '';
      const inputType = id === 'dob' ? 'date' : (numberFields.includes(id) ? 'tel' : 'text');
      const inputAttributes = numberFields.includes(id)
        ? (id === 'contact' ? 'pattern="\\d{10}" inputmode="numeric" maxlength="10" oninput="enforceTenDigits(this)"' : 'pattern="\\d*" inputmode="numeric" maxlength="15"')
        : (codeFields.includes(id) ? 'pattern="[A-Za-z0-9\\/-]*" maxlength="30"' : '');
      inputHTML = `<input type="${inputType}" id="${fullId}" name="${fullId}" value="${value}" ${ro} ${inputAttributes} ${isRequired} />`;
    }

    const displayLabel = label.replace('*', '').trim();
    const requiredStar = label.includes('*') ? ' <span class="required-star">*</span>' : '';
    const wrapper = document.createElement('div');
    wrapper.className = "form-group";
    wrapper.innerHTML = `<label for="${fullId}">${displayLabel}${requiredStar}</label>${inputHTML}`;
    container.appendChild(wrapper);
  });
}

function compressImage(sourceCanvasOrImage, maxWidth = 480, quality = 0.6, targetRatio = 120 / 155) {
  const tempCanvas = document.createElement("canvas");
  const ctx = tempCanvas.getContext("2d");
  const srcWidth = sourceCanvasOrImage.width || sourceCanvasOrImage.videoWidth || 0;
  const srcHeight = sourceCanvasOrImage.height || sourceCanvasOrImage.videoHeight || 0;
  if (!srcWidth || !srcHeight) return "";
  const newWidth = Math.min(srcWidth, maxWidth);
  const newHeight = Math.round(newWidth / targetRatio);
  const srcRatio = srcWidth / srcHeight;
  let cropWidth = srcWidth;
  let cropHeight = srcHeight;
  let cropX = 0;
  let cropY = 0;

  if (srcRatio > targetRatio) {
    cropWidth = Math.round(srcHeight * targetRatio);
    cropX = Math.round((srcWidth - cropWidth) / 2);
  } else if (srcRatio < targetRatio) {
    cropHeight = Math.round(srcWidth / targetRatio);
    cropY = Math.round((srcHeight - cropHeight) / 2);
  }

  tempCanvas.width = newWidth;
  tempCanvas.height = newHeight;
  ctx.drawImage(sourceCanvasOrImage, cropX, cropY, cropWidth, cropHeight, 0, 0, newWidth, newHeight);
  return tempCanvas.toDataURL("image/jpeg", quality);
}

function compressImageNoCrop(sourceCanvasOrImage, maxWidth = 900, quality = 0.78) {
  const tempCanvas = document.createElement("canvas");
  const ctx = tempCanvas.getContext("2d");
  const srcWidth = sourceCanvasOrImage.width || sourceCanvasOrImage.videoWidth || 0;
  const srcHeight = sourceCanvasOrImage.height || sourceCanvasOrImage.videoHeight || 0;
  if (!srcWidth || !srcHeight) return "";

  const scale = Math.min(1, maxWidth / srcWidth);
  tempCanvas.width = Math.round(srcWidth * scale);
  tempCanvas.height = Math.round(srcHeight * scale);
  ctx.drawImage(sourceCanvasOrImage, 0, 0, tempCanvas.width, tempCanvas.height);
  return tempCanvas.toDataURL("image/jpeg", quality);
}

function showCompressedPhotoOnCanvas(dataUrl) {
  const canvas = safeGet("canvas");
  if (!canvas || !dataUrl) return;
  const img = new Image();
  img.onload = () => {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.classList.remove("hidden");
  };
  img.src = dataUrl;
}

function showExistingPhotoOnCanvas(photoUrl) {
  const canvas = safeGet("canvas");
  if (!canvas || !photoUrl) return;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    canvas.width = img.naturalWidth || 480;
    canvas.height = img.naturalHeight || Math.round(canvas.width / (120 / 155));
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.classList.remove("hidden");
  };
  img.onerror = () => {
    setInlineStatus("formStatus", "Existing photo is saved. Choose a new photo only if you want to change it.");
  };
  img.src = photoUrl;
}

function hideCropControls() {
  safeGet("cropControls")?.classList.add("hidden");
  safeGet("canvas")?.parentElement?.classList.remove("crop-mode");
  cropSourceImage = null;
}

function showCropControls() {
  safeGet("cropControls")?.classList.remove("hidden");
  safeGet("canvas")?.parentElement?.classList.add("crop-mode");
  if (safeGet("cropZoom")) safeGet("cropZoom").value = "100";
  if (safeGet("cropX")) safeGet("cropX").value = "0";
  if (safeGet("cropY")) safeGet("cropY").value = "0";
}

function renderCropFromControls() {
  const canvas = safeGet("canvas");
  if (!canvas || !cropSourceImage) return;

  const targetRatio = 120 / 155;
  const outputWidth = 480;
  const outputHeight = Math.round(outputWidth / targetRatio);
  const zoom = Number(safeGet("cropZoom")?.value || 100) / 100;
  const moveX = Number(safeGet("cropX")?.value || 0) / 100;
  const moveY = Number(safeGet("cropY")?.value || 0) / 100;
  const sourceWidth = cropSourceImage.naturalWidth || cropSourceImage.width;
  const sourceHeight = cropSourceImage.naturalHeight || cropSourceImage.height;
  const baseScale = Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight);
  const scale = baseScale * zoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const maxX = Math.max(0, (drawWidth - outputWidth) / 2);
  const maxY = Math.max(0, (drawHeight - outputHeight) / 2);
  const drawX = (outputWidth - drawWidth) / 2 + moveX * maxX;
  const drawY = (outputHeight - drawHeight) / 2 + moveY * maxY;
  const ctx = canvas.getContext("2d");

  canvas.width = outputWidth;
  canvas.height = outputHeight;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outputWidth, outputHeight);
  ctx.drawImage(cropSourceImage, drawX, drawY, drawWidth, drawHeight);
  imageData = canvas.toDataURL("image/jpeg", 0.6);
  canvas.classList.remove("hidden");
}

function adjustCrop() {
  renderCropFromControls();
}

function resetCrop() {
  if (safeGet("cropZoom")) safeGet("cropZoom").value = "100";
  if (safeGet("cropX")) safeGet("cropX").value = "0";
  if (safeGet("cropY")) safeGet("cropY").value = "0";
  renderCropFromControls();
}

function finishCrop() {
  safeGet("cropControls")?.classList.add("hidden");
  safeGet("canvas")?.parentElement?.classList.remove("crop-mode");
  setInlineStatus("formStatus");
}

async function getCameraStream() {
  const attempts = [
    { video: { facingMode: { exact: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 }, aspectRatio: { ideal: 0.75 } }, audio: false },
    { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 }, aspectRatio: { ideal: 0.75 } }, audio: false },
    { video: { width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false },
    { video: true, audio: false }
  ];

  let lastError = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
      if (error.name === "NotAllowedError" || error.name === "SecurityError") throw error;
    }
  }
  throw lastError || new Error("Camera unavailable");
}

function resetPhotoButtons() {
  const { cameraBtn } = getButtonRefs();
  if (cameraBtn) {
    cameraBtn.innerHTML = `<i class="fas fa-video"></i><span>Camera</span>`;
    cameraBtn.onclick = startCamera;
  }
}

function setPhotoReadyState() {
  const { cameraBtn } = getButtonRefs();
  if (cameraBtn) {
    cameraBtn.innerHTML = `<i class="fas fa-redo"></i><span>Retake</span>`;
    cameraBtn.onclick = retakePicture;
  }
}

async function startCamera() {
  try {
    clearInlineStatus();
    stopCamera();
    hideCropControls();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setInlineStatus("formStatus", "Camera is not available on this device. Choose photo from Gallery.", true);
      return;
    }

    stream = await getCameraStream();
    const video = safeGet("video");
    if (!video) {
      setInlineStatus("formStatus", "Camera preview is not available. Choose photo from Gallery.", true);
      return;
    }

    const canvas = safeGet("canvas");
    if (canvas) canvas.classList.add("hidden");
    imageData = "";
    video.srcObject = stream;
    await video.play();
    video.classList.remove("hidden");
    video.parentElement?.classList.add("camera-mode");

    const {
      cameraBtn
    } = getButtonRefs();
    if (cameraBtn) {
      cameraBtn.innerHTML = `<i class="fas fa-camera"></i><span>Capture</span>`;
      cameraBtn.onclick = takePicture;
    }
  } catch (err) {
    console.error("Camera error:", err);
    stopCamera();
    if (err.name === "NotAllowedError" || err.name === "SecurityError") {
      setInlineStatus("formStatus", "Camera permission blocked. Allow camera permission or choose photo from Gallery.", true);
    } else if (err.name === "NotFoundError") {
      setInlineStatus("formStatus", "No camera found. Choose photo from Gallery.", true);
    } else {
      setInlineStatus("formStatus", "Camera could not open. Choose photo from Gallery.", true);
    }
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  const video = safeGet("video");
  if (video) {
    video.srcObject = null;
    video.classList.add("hidden");
    video.parentElement?.classList.remove("camera-mode");
  }
}

function takePicture() {
  const video = safeGet("video");
  const canvas = safeGet("canvas");
  if (!video || !canvas || !video.videoWidth) {
    setInlineStatus("formStatus", "Camera is still loading. Try again.", true);
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  imageData = compressImageNoCrop(canvas, 900, 0.78);
  showCompressedPhotoOnCanvas(imageData);
  hideCropControls();
  stopCamera();
  setInlineStatus("formStatus", isEditingEntry ? "New photo selected. Submit to update this ID." : "");
  setPhotoReadyState();
}

function retakePicture() {
  imageData = '';
  const canvas = safeGet("canvas");
  if (canvas) canvas.classList.add("hidden");
  hideCropControls();
  startCamera();
}

function openGallery() {
  if (isSubmitting) return;
  stopCamera();
  const galleryInput = safeGet("galleryInput");
  if (!galleryInput) {
    setInlineStatus("formStatus", "Gallery option is not available on this device.", true);
    return;
  }
  galleryInput.value = "";
  galleryInput.click();
}

function handleGalleryChange(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setInlineStatus("formStatus", "Please choose a valid photo.", true);
    return;
  }

  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    cropSourceImage = img;
    showCropControls();
    renderCropFromControls();
    safeGet("video")?.classList.add("hidden");
    setInlineStatus("formStatus", isEditingEntry ? "New photo selected. Submit to update this ID." : "");
    setPhotoReadyState();
    URL.revokeObjectURL(objectUrl);
  };
  img.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    setInlineStatus("formStatus", "Could not load this photo. Please choose another image.", true);
  };
  img.src = objectUrl;
}

function setBusyState(isBusy) {
  const { submitBtn, cameraBtn, galleryBtn, homeBtn, newEntryBtn, saveBtn, editBtn } = getButtonRefs();
  [submitBtn, cameraBtn, galleryBtn, homeBtn, newEntryBtn, saveBtn, editBtn].forEach(button => {
    if (button) button.disabled = isBusy;
  });
  if (submitBtn) {
    submitBtn.innerHTML = isBusy
      ? `<i class="fas fa-spinner fa-spin"></i><span>Saving</span>`
      : `<i class="fas fa-paper-plane"></i><span>Submit</span>`;
  }
}

function normalizeFormValue(field) {
  const tag = (field.tagName || "").toUpperCase();
  let value = (field.value || "").trim();
  if (field.type === "text" || field.type === "tel" || tag === "TEXTAREA" || tag === "SELECT") {
    value = value.toUpperCase().replace(/\s+/g, " ");
  }
  return value;
}

function validateFormData(rawData) {
  const type = lastType || "default";
  const enroll = rawData[`${type}_enroll`];
  const contact = rawData[`${type}_contact`];
  const roll = rawData[`${type}_roll`];
  const adm = rawData[`${type}_adm`];
  const empid = rawData[`${type}_empid`];

  if (!enroll) return "Enrollment number is required.";
  if (!isSafeEnrollmentNumber(enroll)) return ENROLLMENT_GENERATION_FAILED_MESSAGE;
  if (contact && !/^\d{10}$/.test(contact)) return "Contact number must be exactly 10 digits.";
  if (roll && !/^\d+$/.test(roll)) return "Roll number must contain digits only.";
  if (adm && !/^[A-Z0-9/-]+$/.test(adm)) return "Admission number can contain letters, numbers, / and - only.";
  if (empid && !/^[A-Z0-9/-]+$/.test(empid)) return "Employee ID can contain letters, numbers, / and - only.";
  return "";
}

function hasValidSchoolIdentity() {
  return !!String(schoolCode || "").trim() && !!String(schoolName || "").trim();
}

function isSafeEnrollmentNumber(enroll) {
  const value = String(enroll || "").trim().toUpperCase();
  if (!value) return false;
  if (value.includes("-TEMP-") || value.includes("UNKNOWN")) return false;
  if (!hasValidSchoolIdentity()) return false;
  return value.startsWith(String(schoolCode).trim().toUpperCase());
}

function sanitizePathSegment(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[.#$/[\]]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120) || "UNKNOWN";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatEnrollmentForReceipt(enrollmentNumber) {
  const raw = String(enrollmentNumber || "").trim();
  const schoolId = String(schoolCode || entryData?.schoolId || "").trim();
  const datePattern = /(\d{2}[A-Z]{3}\d{4})(\d+)$/i;

  if (schoolId && raw.toUpperCase().startsWith(schoolId.toUpperCase())) {
    const rest = raw.slice(schoolId.length);
    const match = rest.match(datePattern);
    if (match) {
      return {
        top: `${schoolId}-${match[1].toUpperCase()}`,
        unique: match[2]
      };
    }
  }

  const genericMatch = raw.match(/^(.+?)(\d{2}[A-Z]{3}\d{4})(\d+)$/i);
  if (genericMatch) {
    return {
      top: `${genericMatch[1]}-${genericMatch[2].toUpperCase()}`,
      unique: genericMatch[3]
    };
  }

  return { top: raw, unique: "" };
}

async function handleSubmit(e) {
  if (isSubmitting) return;

  try {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    isSubmitting = true;
    setBusyState(true);
    hideModal();
    clearInlineStatus();
    resetProgressBar();

    const dataForm = safeGet("dataForm");
    if (dataForm && !dataForm.checkValidity()) {
      dataForm.reportValidity();
      setInlineStatus("formStatus", "Please complete the required fields.", true);
      return;
    }

    if (!imageData && !existingPhotoUrl) {
      setInlineStatus("formStatus", "Please capture photo before submitting.", true);
      return;
    }

    const formFields = document.querySelectorAll("#formFields input, #formFields select, #formFields textarea");
    if (!formFields || formFields.length === 0) {
      setInlineStatus("formStatus", "Form fields not found.", true);
      return;
    }

    const rawData = {};
    formFields.forEach(field => {
      rawData[field.name || createFieldName()] = normalizeFormValue(field);
    });

    const enrollKey = `${lastType || 'default'}_enroll`;
    const nameKey = `${lastType || 'default'}_name`;
    const dobKey = `${lastType || 'default'}_dob`;
    const enroll = rawData[enrollKey];
    const validationError = validateFormData(rawData);

    if (validationError) {
      setInlineStatus("formStatus", validationError, true);
      return;
    }

    if (rawData[dobKey]) {
      const dobDate = new Date(rawData[dobKey]);
      if (!isNaN(dobDate)) {
        const day = String(dobDate.getDate()).padStart(2, '0');
        const month = dobDate.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        const year = dobDate.getFullYear();
        rawData[dobKey] = `${day}-${month}-${year}`;
      } else {
        setInlineStatus("formStatus", "Invalid Date of Birth.", true);
        return;
      }
    }

    const schoolId = sanitizePathSegment(schoolCode || "UNKNOWN_ID");
    const schoolNode = sanitizePathSegment(schoolName || "UNKNOWN_SCHOOL");
    const typeNode = sanitizePathSegment(lastType || "default");
    const dbPath = editingRecordPath || `DATA-MASTER/${schoolNode}/${schoolId}/${typeNode}/${enroll}`;
    const recordRef = dbRef(database, dbPath);

    const snapshot = await get(recordRef);
    const isNewEnrollment = !isEditingEntry && !snapshot.exists();

    const data = { [enrollKey]: enroll, [nameKey]: rawData[nameKey] || "", schoolName: schoolNode, schoolId: schoolId, photo: existingPhotoUrl || "" };
    Object.keys(rawData).forEach(key => { if (!["photo","schoolName","schoolId",nameKey,enrollKey].includes(key)) data[key] = rawData[key]; });
    entryData = data;

    showPreviewSafe(imageData || existingPhotoUrl, enroll);
    updateProgressBarSafe(0, "Preparing upload...");

    let photoURL = existingPhotoUrl;
    if (imageData) {
      photoURL = await uploadImageToCloudinarySafe(enroll, isEditingEntry);
      if (!photoURL) {
        showSubmitFailedAndGoHomeSafe();
        return;
      }
    }
    data.photo = photoURL;
    entryData = data;

    updateProgressBarSafe(100, "Saving data...");
    await setSafe(recordRef, data);

    if (isNewEnrollment) {
      const vendorRef = dbRef(database, 'roles/vendor');
      await runTransaction(vendorRef, current => {
        if (!current) return current;
        let credits = Number(current.credits || 0);
        let deu = Number(current.deu || 0);
        if (credits > 0) {
          credits -= 1;
          current.credits = credits;
          if (credits === 0) current.isActive = false;
        } else {
          deu += 1;
          current.deu = deu;
          current.isActive = false;
        }
        return current;
      });
    }

    showPreviewSafe(photoURL, enroll);
    updateProgressBarSafe(100, "Submitted successfully.");
    isEditingEntry = true;
    existingPhotoUrl = photoURL;
    imageData = "";
    editingRecordPath = dbPath;

  } catch (err) {
    console.error("Unexpected error:", err);
    showSubmitFailedAndGoHomeSafe(err?.message || "Submit failed.");
  } finally {
    isSubmitting = false;
    setBusyState(false);
  }
}

function uploadImageToCloudinarySafe(enroll, useUniquePublicId = false) {
  return new Promise((resolve, reject) => {
    try {
      if (!imageData) return reject("No image data");
      if (!CLOUDINARY_UPLOAD_URL) return reject("Cloudinary upload URL is missing.");
      const basePublicId = String(enroll || `photo_${Date.now()}`).replace(/[^\w-]/g, "_");
      const publicId = useUniquePublicId ? `${basePublicId}_${Date.now()}` : basePublicId;
      const formData = new FormData();
      formData.append("file", imageData);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      formData.append("public_id", publicId);
      updateProgressBarSafe(0, useUniquePublicId ? "Uploading updated photo..." : "Uploading photo...");
      const xhr = new XMLHttpRequest();
      xhr.open("POST", CLOUDINARY_UPLOAD_URL);
      xhr.upload.onloadstart = () => updateProgressBarSafe(0, useUniquePublicId ? "Uploading updated photo..." : "Uploading photo...");
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          updateProgressBarSafe(Math.round((e.loaded / e.total) * 100), useUniquePublicId ? "Uploading updated photo..." : "Uploading photo...");
        } else {
          updateProgressBarSafe(Number.NaN, useUniquePublicId ? "Uploading updated photo..." : "Uploading photo...");
        }
      };
      xhr.onload = () => {
        try {
          const result = JSON.parse(xhr.responseText || "{}");
          if (xhr.status === 200 && result.secure_url) {
            updateProgressBarSafe(100, "Photo uploaded. Saving data...");
            resolve(result.secure_url);
          } else {
            const cloudinaryMessage = result?.error?.message || result?.message || `HTTP status ${xhr.status}`;
            reject(new Error(`Cloudinary upload failed: ${cloudinaryMessage}`));
          }
        } catch (e) {
          reject(e);
        }
      };
      xhr.onerror = () => reject(new Error("Network error uploading image"));
      xhr.send(formData);
    } catch (e) { reject(e); }
  });
}

function setSafe(ref, data) { try { return set(ref, data); } catch (e) { return Promise.reject(e); } }
function showPreviewSafe(img, enroll) { try { showPreview(img, enroll); } catch (e) { console.warn("Preview failed", e); } }
function updateProgressBarSafe(percent, message = "") {
  try {
    const progressContainer = safeGet("progressContainer");
    const progressEl = safeGet("uploadProgress");
    if (!progressContainer || !progressEl) return;

    const value = Number(percent);
    const isFiniteValue = Number.isFinite(value);

    progressContainer.classList.remove("hidden");
    progressContainer.classList.toggle("active", isFiniteValue && value > 0 && value < 100);
    progressContainer.classList.toggle("indeterminate", !isFiniteValue);

    if (isFiniteValue) {
      const safePercent = Math.max(0, Math.min(100, Math.round(value)));
      progressEl.style.width = `${safePercent}%`;
      progressEl.setAttribute("aria-valuenow", String(safePercent));
    } else {
      progressEl.style.width = "";
      progressEl.removeAttribute("aria-valuenow");
    }

    progressContainer.setAttribute("role", "progressbar");
    progressContainer.setAttribute("aria-valuemin", "0");
    progressContainer.setAttribute("aria-valuemax", "100");
    setInlineStatus("uploadStatus", message);
  } catch (e) {
    console.warn(e);
  }
}

function resetProgressBar() {
  const progressContainer = safeGet("progressContainer");
  const progressEl = safeGet("uploadProgress");
  if (progressEl) {
    progressEl.style.width = "0%";
    progressEl.removeAttribute("aria-valuenow");
  }
  if (progressContainer) {
    progressContainer.classList.add("hidden");
    progressContainer.classList.remove("active", "indeterminate");
  }
  setInlineStatus("uploadStatus");
}
function goHomeSafe() { try { goHome(); } catch (e) { console.warn("goHome failed", e); } }
function showSubmitFailedAndGoHomeSafe(message = "Submit failed.") {
  try {
    updateProgressBarSafe(0, message);
    setInlineStatus("uploadStatus", message, true);
  } catch (e) {
    console.warn("Submit failed status error:", e);
  }
}

function showPreview(photoUrl, enrollmentNumber) {
  try {
    if (!photoUrl || !enrollmentNumber) {
      showModal("Error", "Missing photo or enrollment number.", true);
      return;
    }

    const previewPage = safeGet("previewPage");
    const idForm = safeGet("idForm");
    const previewContainer = safeGet("preview");

    if (!previewPage || !idForm || !previewContainer) {
      showModal("Error", "Required preview elements not found.", true);
      return;
    }

    idForm.classList.add("hidden");
    previewPage.classList.remove("hidden");

    const data = entryData || {};
    const receiptEnrollmentNumber = formatEnrollmentForReceipt(enrollmentNumber);
    const formatLabel = (key) =>
      key.replace(/^(student|staff)_/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    const typeLabel = (lastType || "").toUpperCase() || "ID";
    const hiddenKeys = ["image", "type", "photo", "enrollment_number", "schoolName", "schoolId"];
    const detailRows = Object.entries(data)
      .filter(([key, value]) => value && !hiddenKeys.includes(key) && !key.endsWith("_enroll"))
      .map(([key, value], index) => `
        <tr style="background:${index % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="width:36%; padding:10px 8px 10px 10px; border-bottom:1px solid #e5e7eb; color:#475569; font-size:11px; font-weight:800; text-transform:uppercase; text-align:left; vertical-align:top; line-height:1.35; overflow-wrap:break-word;">
            ${escapeHTML(formatLabel(key))}
          </td>
          <td style="width:64%; padding:10px 10px 10px 12px; border-bottom:1px solid #e5e7eb; color:#111827; font-size:13px; font-weight:700; text-align:left; overflow-wrap:anywhere; vertical-align:top; line-height:1.35;">
            ${escapeHTML(value)}
          </td>
        </tr>
      `).join("");

    previewContainer.innerHTML = `
      <div id="idCardBox" style="
        max-width:420px; margin:22px auto; font-family:'Inter',Arial,sans-serif;
        border-radius:18px; overflow:hidden; background:#ffffff;
        border:1px solid #dbeafe;
        box-shadow:0 10px 28px rgba(15,23,42,0.18);
        transition:all .3s ease-in-out;">
        <div style="background:#0d47a1; color:#fff; padding:18px 16px; text-align:center;">
          <div style="font-size:11px; font-weight:900; letter-spacing:1px; text-transform:uppercase; opacity:0.9;">
            Enrollment Slip
          </div>
          <div style="margin-top:5px; font-size:22px; font-weight:900; letter-spacing:0.4px; font-family:'Exo 2',Arial,sans-serif; text-transform:uppercase; line-height:1.15;">
            ${escapeHTML(data.schoolName || "SCHOOL NAME")}
          </div>
          <div style="display:inline-flex; align-items:center; justify-content:center; margin-top:10px; padding:6px 12px; border-radius:999px; background:rgba(255,255,255,0.16); border:1px solid rgba(255,255,255,0.22); font-size:11px; font-weight:900; text-transform:uppercase;">
            ${escapeHTML(typeLabel)} ID Registration
          </div>
        </div>

        <div style="padding:16px; background:#ffffff;">
          <div style="display:flex; gap:14px; align-items:center; padding:12px; border-radius:16px; background:#f8fbff; border:1px solid #dbeafe;">
            <div style="width:102px; height:132px; flex:0 0 102px; overflow:hidden; border-radius:14px; border:3px solid #ffffff; box-shadow:0 8px 18px rgba(15,23,42,0.18); background:#e5e7eb;">
              <img src="${escapeHTML(photoUrl)}" crossorigin="anonymous" style="width:100%; height:100%; object-fit:cover;">
            </div>
            <div style="min-width:0; text-align:left;">
              <div style="color:#64748b; font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:0.7px;">Enrollment Number</div>
              <div style="margin-top:5px; color:#0d47a1; font-weight:900; line-height:1.2;">
                <div style="font-size:11px; overflow-wrap:anywhere;">
                  ${escapeHTML(receiptEnrollmentNumber.top)}
                </div>
                ${receiptEnrollmentNumber.unique ? `
                  <div style="margin-top:3px; display:inline-flex; padding:4px 8px; border-radius:10px; background:#eaf3ff; color:#0d47a1; font-size:16px; letter-spacing:1px;">
                    ${escapeHTML(receiptEnrollmentNumber.unique)}
                  </div>
                ` : ""}
              </div>
              <div style="margin-top:11px; color:#64748b; font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:0.7px;">Status</div>
              <div style="display:inline-flex; margin-top:5px; padding:6px 10px; border-radius:999px; color:#166534; background:#dcfce7; font-size:10px; font-weight:900; text-transform:uppercase;">
                Submitted Successfully
              </div>
            </div>
          </div>

          <div style="margin-top:14px; text-align:left;">
            <div style="margin-bottom:8px; color:#0f172a; font-family:'Exo 2',Arial,sans-serif; font-size:16px; font-weight:900; text-transform:uppercase;">
              Filled Details
            </div>
          </div>
          <table style="width:100%; table-layout:fixed; border-collapse:collapse; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
            ${detailRows || `
              <tr>
                <td style="padding:12px; color:#64748b; font-size:13px; font-weight:700; text-align:center;">
                  No filled details found.
                </td>
              </tr>
            `}
          </table>

          <div style="text-align:center; margin-top:15px; padding:12px; border-radius:14px; background:#f8fafc; border:1px dashed #cbd5e1;">
            <svg id="barcode" style="width:140px; height:40px;"></svg>
          </div>

          <div style="margin-top:14px; padding-top:12px; border-top:1px dashed #cbd5e1; font-size:11px; text-align:center; color:#475569; line-height:1.45;">
            Your enrollment was successful. ID card will be delivered within <strong>5-7 working days</strong>.<br>
            Printed by <strong>Lakshmi ID Maker</strong>
          </div>
        </div>
      </div>
    `;
    if (typeof JsBarcode === "undefined") {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js";
      script.onload = () => generateBarcodeImage(enrollmentNumber);
      document.body.appendChild(script);
    } else {
      generateBarcodeImage(enrollmentNumber);
    }

  } catch (err) {
    console.error("showPreview failed:", err);
    showModal("Error", "Preview generation failed.", true);
  }
}

function generateBarcodeImage(enroll) {
  if (!enroll) return;
  try {
    JsBarcode("#barcode", enroll, { format: "CODE128", width: 1.5, height: 40, displayValue: false });
  } catch (e) {
    console.warn("JsBarcode call failed:", e);
    return;
  }

  const checkAndConvert = () => {
    const svg = document.querySelector("#barcode");
    if (!svg || svg.children.length === 0) return setTimeout(checkAndConvert, 120);
    try {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const pngFile = canvas.toDataURL("image/png");
        svg.outerHTML = `<img src="${pngFile}" style="width:140px;height:40px;">`;
      };
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    } catch (e) {
      console.error("Failed to convert barcode SVG to PNG:", e);
    }
  };
  checkAndConvert();
}

function saveIDAsImage() {
  if (isSubmitting) return;
  const previewEl = document.getElementById("idCardBox");
  if (!previewEl) return showModal("Error", "Preview not found!", true);

  const enrollmentNumber = entryData?.[`${lastType}_enroll`] || "id-card";
  const fileName = `${enrollmentNumber}.pdf`;

  const generatePDF = () => {
    html2canvas(previewEl, {
      scale: 3,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#fefefe',
      scrollY: -window.scrollY,
      scrollX: -window.scrollX
    }).then(canvas => {
      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const scaleX = (pageWidth - margin * 2) / canvasWidth;
      const scaleY = (pageHeight - margin * 2) / canvasHeight;
      const scale = Math.min(scaleX, scaleY);
      const imgWidth = canvasWidth * scale;
      const imgHeight = canvasHeight * scale;
      const x = (pageWidth - imgWidth) / 2;
      const y = (pageHeight - imgHeight) / 2;
      pdf.setDrawColor(200);
      pdf.setLineWidth(0.5);
      pdf.rect(x - 2, y - 2, imgWidth + 4, imgHeight + 4, 'S');
      pdf.addImage(imgData, "JPEG", x, y, imgWidth, imgHeight);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(120);
      pdf.text("Powered by Penport India", pageWidth / 2, pageHeight - 10, { align: "center" });

      if (window.Android && typeof window.Android.savePDFFromJS === "function") {
        const pdfBlob = pdf.output("blob");
        const reader = new FileReader();
        reader.onload = function() {
          const base64Data = reader.result.split(',')[1];
          window.Android.savePDFFromJS(base64Data, fileName);
        };
        reader.readAsDataURL(pdfBlob);
      } else {
        pdf.save(fileName);
      }
    }).catch(err => {
      showModal("Error", "Failed to generate PDF: " + (err?.message || err), true);
    });
  };

  const loadScript = (src, onLoad) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = onLoad;
    script.onerror = () => showModal("Error", "Failed to load script: " + src, true);
    document.body.appendChild(script);
  };

  if (typeof html2canvas === "undefined") {
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", () => {
      if (typeof window.jspdf === "undefined") {
        loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", generatePDF);
      } else {
        generatePDF();
      }
    });
  } else if (typeof window.jspdf === "undefined") {
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", generatePDF);
  } else {
    generatePDF();
  }
}

function editEntry() {
  if (isSubmitting) return;
  safeGet("previewPage")?.classList.add("hidden");
  safeGet("idForm")?.classList.remove("hidden");
}

function newEntry() {
  if (isSubmitting) return;
  const previousType = lastType;
  const previewPage = safeGet("previewPage");
  const formFields = safeGet("formFields");
  const idForm = safeGet("idForm");
  const canvas = safeGet("canvas");
  const video = safeGet("video");
  const idTypeSelect = safeGet("idType");
  const galleryInput = safeGet("galleryInput");

  if (previewPage) previewPage.classList.add("hidden");
  if (formFields) formFields.innerHTML = '';
  if (canvas) canvas.classList.add("hidden");
  if (video) video.classList.add("hidden");
  if (idForm) idForm.classList.remove("hidden");
  clearInlineStatus();
  resetProgressBar();
  hideCropControls();

  imageData = '';
  entryData = {};
  resetEditState();
  lastType = idTypeSelect?.value?.trim().toLowerCase() || previousType || '';
  if (galleryInput) galleryInput.value = "";
  stopCamera();
  resetPhotoButtons();
  if (lastType) generateFormFields(lastType);
}

function goHome() {
  if (isSubmitting) return;
  safeGet("previewPage")?.classList.add("hidden");
  safeGet("idForm")?.classList.add("hidden");
  if (safeGet("formFields")) safeGet("formFields").innerHTML = '';
  clearInlineStatus();
  resetProgressBar();
  hideCropControls();
  imageData = '';
  entryData = {};
  lastType = '';
  resetEditState();
  if (safeGet("galleryInput")) safeGet("galleryInput").value = "";
  stopCamera();
  safeGet("canvas")?.classList.add("hidden");
  safeGet("video")?.classList.add("hidden");
  if (safeGet("preview")) safeGet("preview").innerHTML = '';
  safeGet("homePage")?.classList.remove("hidden");
  resetDashboardMenu();
  resetPhotoButtons();
}

function togglePassword() {
  const passwordInput = document.getElementById('loginPass');
  const eyeIcon = document.getElementById('eyeIcon');

  if (!passwordInput || !eyeIcon) {
    console.error('Password input or eye icon not found');
    return;
  }

  if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      eyeIcon.classList.remove('fa-eye');
      eyeIcon.classList.add('fa-eye-slash');
  } else {
      passwordInput.type = 'password';
      eyeIcon.classList.remove('fa-eye-slash');
      eyeIcon.classList.add('fa-eye');
  }
}

window.handleSubmit = handleSubmit;
window.showLoginPage = showLoginPage;
window.logoutUser = logoutUser;
window.navigateToForm = navigateToForm;
window.startCamera = startCamera;
window.openGallery = openGallery;
window.handleGalleryChange = handleGalleryChange;
window.adjustCrop = adjustCrop;
window.resetCrop = resetCrop;
window.finishCrop = finishCrop;
window.takePicture = takePicture;
window.retakePicture = retakePicture;
window.newEntry = newEntry;
window.goHome = goHome;
window.editEntry = editEntry;
window.saveIDAsImage = saveIDAsImage;
window.togglePassword = togglePassword;
window.enforceTenDigits = enforceTenDigits;
window.enforceDigits = enforceDigits;
window.searchExistingEnrollment = searchExistingEnrollment;
window.showDashboardMenu = showDashboardMenu;
