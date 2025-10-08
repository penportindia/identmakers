import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getDatabase, ref as dbRef, get, child, set, update, remove, onDisconnect, runTransaction, push
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { firebaseConfig, cloudinaryConfig } from '../Database/Database.js';

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const { uploadUrl: CLOUDINARY_UPLOAD_URL, uploadPreset: CLOUDINARY_UPLOAD_PRESET } = cloudinaryConfig;

export { app, database, dbRef, get, child, set, update, remove, onDisconnect, runTransaction, push, CLOUDINARY_UPLOAD_URL, CLOUDINARY_UPLOAD_PRESET };

// ============================
// ✅ Global Variables
// ============================
let imageData = "";
let lastType = "";
let stream = null;

let schoolCode = ""; // userid of school
let schoolName = ""; // actual school name
let entryData = {};

let userIP = ""; // original IP
let safeIP = ""; // firebase-safe key (dots -> dashes)

let sessionTimeout = null;
let hardTimeout = null;

const MAX_IDLE = 10 * 60 * 1000; // 10 minutes
const MAX_SESSION = 60 * 60 * 1000; // 1 hour

// ============================
// ✅ DOM Helpers
// ============================
const el = id => document.getElementById(id);
const exists = id => !!el(id);
const safeGet = id => (exists(id) ? el(id) : null);

function getButtonRefs() {
  return {
    newEntryBtn: safeGet("newEntryBtn"),
    cameraBtn: safeGet("cameraBtn")
  };
}

// ============================
// ✅ Custom Modal Functions (Replaces `alert()`)
// ============================
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

    // Automatically hide the modal after 3 seconds
    setTimeout(() => {
        hideModal();
    }, 3000);
}

function hideModal() {
    const modal = document.getElementById('messageModal');
    modal.classList.remove('visible');
}

// Add event listeners to the modal's close button and OK button
document.querySelector('.close-btn').addEventListener('click', hideModal);
document.getElementById('modalOkBtn').addEventListener('click', hideModal);


// ============================
// ✅ Get Public IP
// ============================
async function fetchUserIP() {
  try {
    const res = await fetch("https://api64.ipify.org?format=json");
    const data = await res.json();
    return data.ip || "unknown_ip";
  } catch {
    return "unknown_ip";
  }
}

// ============================
// ✅ Auto Logout / Inactivity (Updated)
// ============================
function resetSessionTimer() {
  if (sessionTimeout) clearTimeout(sessionTimeout);
  sessionTimeout = setTimeout(() => {
    // Page reload on inactivity
    location.reload();
  }, MAX_IDLE);
}

async function logoutUser(message = "You have been logged out.") {
  if (!schoolCode || !safeIP) {
    if (exists("loginPage")) el("loginPage").classList.remove("hidden");
    if (exists("homePage")) el("homePage").classList.add("hidden");
    showModal("Logout", message); // Changed from alert()
    return;
  }

  try {
    const ipRef = dbRef(database, `activeSchools/${schoolCode}/${safeIP}`);
    await remove(ipRef);

    // ✅ Clear all state and UI
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

    if (sessionTimeout) clearTimeout(sessionTimeout);
    if (hardTimeout) clearTimeout(hardTimeout);
    stopCamera();

    showModal("Logged Out", message); // Changed from alert()
  } catch (error) {
    console.error("Error during logout:", error);
    showModal("Error", "An error occurred during logout. Please refresh the page.", true); // Changed from alert()
  }
}

// ============================
// ✅ Activity listeners (idle)
// ============================
["click", "keydown", "input", "change", "mousemove", "touchstart"].forEach(evt => {
  document.addEventListener(evt, resetSessionTimer, {
    passive: true
  });
});

// ============================
// ✅ Login Function (Full-proof)
// ============================
window.verifyLogin = async function() {
  try {
    const uidOrPhone = (safeGet("loginUser")?.value || "").trim();
    const pwd = (safeGet("loginPass")?.value || "").trim();

    if (!uidOrPhone || !pwd) {
      showModal("Login Failed", "Please enter both User ID or Phone Number and Password.", true);
      return;
    }

    const rootRef = dbRef(database);
    const snapshot = await get(child(rootRef, `schools`));

    if (!snapshot.exists()) {
      showModal("Login Failed", "No school records found", true);
      return;
    }

    const schools = snapshot.val();
    let matchedUser = null;

    // Find user by userid+password OR phone+password
    for (let key in schools) {
      const data = schools[key];
      if (!data) continue;

      const inputDigits = uidOrPhone.replace(/\D/g, "");
      const dbPhoneDigits = String(data.phone || "").replace(/\D/g, "");
      const inputUserId = uidOrPhone.startsWith("+") ? uidOrPhone : "+" + uidOrPhone;

      const uidMatch = (data.userid === uidOrPhone || data.userid === inputUserId) && data.password === pwd;
      const phoneMatch = dbPhoneDigits && dbPhoneDigits === inputDigits && data.password === pwd;

      if (uidMatch || phoneMatch) {
        matchedUser = data;
        break;
      }
    }

    if (!matchedUser) {
      showModal("Login Failed", "Invalid User ID / Phone or Password", true);
      return;
    }

    // ✅ Status check (case-insensitive)
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

    userIP = await fetchUserIP();
    safeIP = userIP.replace(/\./g, "-");

    if (exists("loginPage")) el("loginPage").classList.add("hidden");
    if (exists("homePage")) el("homePage").classList.remove("hidden");
    if (exists("schoolName")) {
      el("schoolName").innerHTML = `<option selected>${cleanSchoolName} (${matchedUser.userid})</option>`;
    }

    schoolCode = matchedUser.userid || 'SCHOOL';
    schoolName = cleanSchoolName;

    const ipRef = dbRef(database, `activeSchools/${schoolCode}/${safeIP}`);

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

    showModal("Login Successful!", "Welcome!");

  } catch (error) {
    showModal("Error", "Firebase Error: " + (error.message || error), true);
    console.error(error);
  }
};

// ============================
// ✅ Auto Logout on Page Close / Refresh
// ============================
window.addEventListener("beforeunload", () => {
  if (schoolCode && safeIP) {
    try {
      remove(dbRef(database, `activeSchools/${schoolCode}/${safeIP}`));
    } catch (_) {}
  }
});


// ============================
// ✅ Generate Unique Enrollment (using USERID prefix)
// ============================
async function generateUniqueEnrollment(type) {
  if (!type || typeof type !== "string") {
    throw new Error("Invalid 'type' parameter");
  }

  if (!schoolCode || !schoolCode.trim()) {
    throw new Error("School UserID is empty! Cannot generate enrollment.");
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
    const serial = String(Math.floor(1000 + Math.random() * 9000)); // 4-digit random
    enrollNo = `${schoolCode}${dd}${mmm}${yyyy}${serial}`;

    try {
      const snapshot = await get(child(dbRoot, `${type}/${enrollNo}`));
      if (!snapshot.exists()) unique = true;
      else await new Promise(res => setTimeout(res, 40));
    } catch (error) {
      console.error("Database error while generating enrollment:", error);
      throw new Error("Unable to generate enrollment number");
    }
  }

  return enrollNo;
}

// -----------------------------
// ✅ Navigation to Form
// -----------------------------
window.navigateToForm = async function() {
  const type = (safeGet("idType")?.value || "").trim().toLowerCase();
  if (!type) return showModal("Error", "Please select ID type", true);
  lastType = type;
  if (exists("homePage")) el("homePage").classList.add("hidden");
  if (exists("idForm")) el("idForm").classList.remove("hidden");
  await generateFormFields(type);
};

// -----------------------------
// ✅ Generate Form Fields
// -----------------------------
async function generateFormFields(type) {
  const numberFields = ['adm', 'roll', 'contact', 'empid'];

  const studentFields = [
    ['enroll', 'Enrollment Number *', 'text', true],
    ['adm', 'Admission Number', 'text'],
    ['name', 'Student Name *', 'text'],
    ['class', 'Class *', 'select', ['PG', 'NURSERY', 'LKG', 'UKG', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']],
    ['section', 'Section *', 'select', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']],
    ['roll', 'Roll Number *', 'text'],
    ['dob', 'Date of Birth', 'date'],
    ['father', "Father's Name *", 'text'],
    ['mother', "Mother's Name *", 'text'],
    ['contact', 'Contact Number', 'text'],
    ['address', 'Address *', 'textarea'],
    ['transport', 'Mode of Transport *', 'select', ['SELF', 'TRANSPORT']],
    ['house', 'House Name', 'text'],
    ['blood', 'Blood Group *', 'select', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'NA']]
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
    ['blood', 'Blood Group *', 'select', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'NA']]
  ];

  const fields = type === 'student' ? studentFields : staffFields;
  const container = safeGet("formFields");
  if (!container) {
    console.warn("formFields container not found in DOM");
    return;
  }
  container.innerHTML = '';

  let enrollNo = "";
  try {
    enrollNo = await generateUniqueEnrollment(type);
  } catch (e) {
    console.error("Enrollment generation failed:", e);
    enrollNo = `${type.toUpperCase()}-TEMP-${Date.now()}`;
    showModal("Warning", "Could not generate unique enrollment number.", false);
  }

  fields.forEach(fieldDef => {
    const [id, label, controlType, optOrReadonly] = fieldDef;
    const fullId = `${type}_${id}`;
    let inputHTML = '';

    const isRequired = (label.includes('*') && !['dob', 'contact'].includes(id)) ? 'required' : '';

    if (controlType === 'select') {
      const options = Array.isArray(optOrReadonly) ? optOrReadonly : [];

      // ✅ Special case: staff designation with input + datalist
      if (id === 'designation' && type === 'staff') {
        const datalistId = `${fullId}_list`;
        inputHTML = `
          <input list="${datalistId}" id="${fullId}" name="${fullId}" ${isRequired} />
          <datalist id="${datalistId}">
            ${options.map(opt => `<option value="${opt}">`).join('')}
          </datalist>
        `;
      } else {
        // Regular select dropdown
        inputHTML = `<select id="${fullId}" name="${fullId}" ${isRequired}>
          <option value="" disabled selected>Select ${label.replace('*', '').trim()}</option>`;
        options.forEach(opt => inputHTML += `<option value="${opt}">${opt}</option>`);
        inputHTML += `</select>`;
      }

    } else if (controlType === 'textarea') {
      // ✅ Limit address to 50 characters
      const maxLength = 50;
      inputHTML = `<textarea id="${fullId}" name="${fullId}" rows="2" maxlength="${maxLength}" ${isRequired}></textarea>`;
    } else {
      const value = id === 'enroll' ? enrollNo : '';
      const ro = id === 'enroll' ? 'readonly' : '';
      const inputType = id === 'dob' ? 'date' : (numberFields.includes(id) ? 'tel' : 'text');
      const inputAttributes = numberFields.includes(id) ? 'pattern="\\d*" inputmode="numeric"' : '';
      inputHTML = `<input type="${inputType}" id="${fullId}" name="${fullId}" value="${value}" ${ro} ${inputAttributes} ${isRequired} />`;
    }

    const wrapper = document.createElement('div');
    wrapper.className = "form-group";
    wrapper.innerHTML = `<label for="${fullId}">${label}</label>${inputHTML}`;
    container.appendChild(wrapper);
  });
}



// -----------------------------
// ✅ Image Compression Helper
// -----------------------------
function compressImage(sourceCanvasOrImage, maxWidth = 480, quality = 0.6) {
  const tempCanvas = document.createElement("canvas");
  const ctx = tempCanvas.getContext("2d");
  const srcWidth = sourceCanvasOrImage.width || sourceCanvasOrImage.videoWidth || 0;
  const srcHeight = sourceCanvasOrImage.height || sourceCanvasOrImage.videoHeight || 0;
  if (!srcWidth || !srcHeight) return "";
  const ratio = srcWidth / srcHeight;
  const newWidth = Math.min(srcWidth, maxWidth);
  const newHeight = Math.round(newWidth / ratio);
  tempCanvas.width = newWidth;
  tempCanvas.height = newHeight;
  ctx.drawImage(sourceCanvasOrImage, 0, 0, newWidth, newHeight);
  return tempCanvas.toDataURL("image/jpeg", quality);
}

async function startCamera() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showModal("Error", "Camera not supported on this device", true);
      return;
    }
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: {
          ideal: "environment"
        }
      }
    });
    const video = safeGet("video");
    if (!video) return showModal("Error", "Video element not found", true);
    video.srcObject = stream;
    await video.play().catch(() => {});
    video.classList.remove("hidden");

    // ✅ Set button state for Capture
    const {
      cameraBtn
    } = getButtonRefs();
    if (cameraBtn) {
      cameraBtn.innerHTML = `<i class="fas fa-camera"></i><span>Capture</span>`;
      cameraBtn.onclick = takePicture;
    }
  } catch (err) {
    console.error("Camera error:", err);
    if (err.name === "NotAllowedError") {
      showModal("Error", "Camera permission denied. Please enable it in settings.", true);
    } else if (err.name === "NotFoundError") {
      showModal("Error", "No camera found on this device.", true);
    } else {
      showModal("Error", "Unable to access camera: " + err.message, true);
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
  }
}

function takePicture() {
  const video = safeGet("video");
  const canvas = safeGet("canvas");
  if (!video || !canvas || !video.videoWidth) {
    return showModal("Error", "Camera not ready.", true);
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.classList.remove("hidden");

  imageData = compressImage(canvas, 480, 0.6);
  stopCamera();

  // ✅ Set button state for Retake
  const {
    cameraBtn
  } = getButtonRefs();
  if (cameraBtn) {
    cameraBtn.innerHTML = `<i class="fas fa-redo"></i><span>Retake</span>`;
    cameraBtn.onclick = retakePicture;
  }
}

function retakePicture() {
  imageData = '';
  const canvas = safeGet("canvas");
  if (canvas) canvas.classList.add("hidden");

  // ✅ Just restart camera, button will be handled in startCamera()
  startCamera();
}

async function handleSubmit(e) {
  try {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    const { newEntryBtn } = getButtonRefs();
    if (newEntryBtn) newEntryBtn.disabled = true;

    if (!imageData) { showModal("Error", "Please Capture Photo before submitting.", true); if (newEntryBtn) newEntryBtn.disabled = false; return; }

    const formFields = document.querySelectorAll("#formFields input, #formFields select, #formFields textarea");
    if (!formFields || formFields.length === 0) { showModal("Error", "Form fields not found!", true); if (newEntryBtn) newEntryBtn.disabled = false; return; }

    const rawData = {};
    formFields.forEach(field => {
      let value = (field.value || "").trim();
      const tag = (field.tagName || "").toUpperCase();
      if (field.type === "text" || tag === "TEXTAREA" || tag === "SELECT") value = value.toUpperCase();
      rawData[field.name || `field_${Math.random()}`] = value;
    });

    const enrollKey = `${lastType || 'default'}_enroll`;
    const nameKey = `${lastType || 'default'}_name`;
    const dobKey = `${lastType || 'default'}_dob`;
    const enroll = rawData[enrollKey];
    if (!enroll) { showModal("Error", "❌ Enrollment number is required.", true); if (newEntryBtn) newEntryBtn.disabled = false; return; }

    if (rawData[dobKey]) {
      const dobDate = new Date(rawData[dobKey]);
      if (!isNaN(dobDate)) {
        const day = String(dobDate.getDate()).padStart(2, '0');
        const month = dobDate.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        const year = dobDate.getFullYear();
        rawData[dobKey] = `${day}-${month}-${year}`;
      } else { showModal("Error", "❌ Invalid Date of Birth.", true); if (newEntryBtn) newEntryBtn.disabled = false; return; }
    }

    const schoolId = schoolCode || "UNKNOWN_ID";
    const schoolNode = (schoolName || "UNKNOWN_SCHOOL").toUpperCase();
    const typeNode = (lastType || "default").toUpperCase();
    const dbPath = `DATA-MASTER/${schoolNode}/${schoolId}/${typeNode}/${enroll}`;
    const recordRef = dbRef(database, dbPath);

    const snapshot = await get(recordRef);
    const isNewEnrollment = !snapshot.exists();

    const data = { [enrollKey]: enroll, [nameKey]: rawData[nameKey] || "", schoolName: schoolNode, schoolId: schoolId, photo: "" };
    Object.keys(rawData).forEach(key => { if (!["photo","schoolName","schoolId",nameKey,enrollKey].includes(key)) data[key] = rawData[key]; });
    entryData = data;

    showPreviewSafe(imageData, enroll);

    const photoURL = await uploadImageToCloudinarySafe(enroll);
    if (!photoURL) { showSubmitFailedAndGoHomeSafe(); if (newEntryBtn) newEntryBtn.disabled = false; return; }
    data.photo = photoURL;

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

    showModal("Success", "✅ Submitted Successfully!");

  } catch (err) {
    console.error("Unexpected error:", err);
    showSubmitFailedAndGoHomeSafe("❌ Submit failed!");
  } finally {
    const { newEntryBtn } = getButtonRefs();
    if (newEntryBtn) newEntryBtn.disabled = false;
  }
}

function uploadImageToCloudinarySafe(enroll) {
  return new Promise((resolve, reject) => {
    try {
      if (!imageData) return reject("No image data");
      if (!CLOUDINARY_UPLOAD_URL) return reject("Cloudinary upload URL is missing.");
      const formData = new FormData();
      formData.append("file", imageData);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      formData.append("public_id", enroll);
      updateProgressBarSafe(0);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", CLOUDINARY_UPLOAD_URL);
      xhr.upload.onprogress = e => { if (e.lengthComputable) { updateProgressBarSafe(Math.round((e.loaded / e.total) * 100)); } };
      xhr.onload = () => { try { if (xhr.status === 200) { const result = JSON.parse(xhr.responseText); if (result.secure_url) { updateProgressBarSafe(100); resolve(result.secure_url); } else reject(new Error("Cloudinary upload failed: " + JSON.stringify(result))); } else reject(new Error(`Cloudinary upload failed with HTTP status: ${xhr.status}`)); } catch (e) { reject(e); } };
      xhr.onerror = () => reject(new Error("Network error uploading image"));
      xhr.send(formData);
    } catch (e) { reject(e); }
  });
}

function setSafe(ref, data) { try { return set(ref, data); } catch (e) { return Promise.reject(e); } }
function showPreviewSafe(img, enroll) { try { showPreview(img, enroll); } catch (e) { console.warn("Preview failed", e); } }
function updateProgressBarSafe(percent) { try { const progressEl = safeGet("uploadProgress"); if (progressEl) { progressEl.style.width = percent + "%"; progressEl.textContent = percent + "%"; } } catch (e) { console.warn(e); } }
function goHomeSafe() { try { goHome(); } catch (e) { console.warn("goHome failed", e); } }
function showSubmitFailedAndGoHomeSafe(message = "❌ Submit failed!") { try { showModal("Error", message, true); setTimeout(goHomeSafe, 2000); } catch (e) { console.warn("Submit failed modal error:", e); } }


// ================= Show Preview (Foolproof Premium ID Card) =================
function showPreview(photoUrl, enrollmentNumber) {
  try {
    if (!photoUrl || !enrollmentNumber) {
      showModal("Error", "❌ Missing photo or enrollment number!", true);
      return;
    }

    const previewPage = safeGet("previewPage");
    const idForm = safeGet("idForm");
    const previewContainer = safeGet("preview");

    if (!previewPage || !idForm || !previewContainer) {
      showModal("Error", "❌ Required preview elements not found!", true);
      return;
    }

    idForm.classList.add("hidden");
    previewPage.classList.remove("hidden");

    const data = entryData || {};
    const frontKeys = ["name", "dob", "class", "section", "gender"];

    const formatLabel = (key) =>
      key.replace(/^(student|staff)_/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    const buildTableRows = (keysToInclude) =>
      Object.entries(data).reduce((rows, [key, value]) => {
        if (!value || ["image", "type", "photo", "enrollment_number"].includes(key)) return rows;
        const row = `
          <tr>
            <td style="font-weight:600; font-size:13px; padding:5px 8px; text-align:left; color:#000; white-space:nowrap;">
              ${formatLabel(key)} :
            </td>
            <td style="font-size:13px; padding:5px 8px; text-align:left; color:#111;">
              ${value}
            </td>
          </tr>`;
        if (keysToInclude.includes(key.toLowerCase())) rows.front += row;
        else rows.back += row;
        return rows;
      }, { front: "", back: "" });

    const { front, back } = buildTableRows(frontKeys);

    previewContainer.innerHTML = `
      <div id="idCardBox" style="
        max-width:420px; margin:30px auto; font-family:'Poppins',sans-serif;
        border-radius:18px; overflow:hidden; background:#ffffff;
        box-shadow:0 8px 24px rgba(0,0,0,0.22);
        transition:all .3s ease-in-out;">
        <div style="background:#000; color:#fff; padding:20px 18px; text-align:center;">
          <div style="font-size:22px; font-weight:700; letter-spacing:0.5px; font-family:'Oswald',sans-serif;">
            ${data.schoolName || "SCHOOL NAME"}
          </div>
          <div style="font-size:13px; font-weight:500; margin-top:4px; opacity:0.9;">
            ID Card Enrollment
          </div>
          <p style="font-size:11px; margin-top:8px; color:#f3f4f6; line-height:1.4;">
            ✅ Your enrollment was successful.<br>
            Your ID card will be delivered within <strong>5–7 working days</strong>.
          </p>

          <div style="margin:14px auto 12px; width:120px; height:155px; overflow:hidden; border-radius:12px; border:3px solid #fff; box-shadow:0 4px 12px rgba(0,0,0,0.25);">
            <img src="${photoUrl}" crossorigin="anonymous" style="width:100%; height:100%; object-fit:cover;">
          </div>

          <table style="width:100%; margin-top:8px; font-size:13px; border-spacing:0;">
            ${front}
          </table>
        </div>

        <div style="background:#f9fafb; padding:18px 16px;">
          <table style="width:100%; font-size:10px; border-spacing:0;">
            ${back}
          </table>

          <div style="text-align:center; margin-top:16px;">
            <div style="font-size:10px; font-weight:600; color:#000;">
              ${enrollmentNumber}
            </div>
            <svg id="barcode" style="margin-top:6px; width:140px; height:40px;"></svg>
          </div>

          <hr style="margin:18px 0; border:none; border-top:1px dashed #d1d5db;">

          <div style="font-size:11px; text-align:center; color:#374151;">
            Printed by <strong>IDENT MAKERS</strong><br>
            Query? Call: <a href="tel:7004848750" style="color:#000; text-decoration:none;">7004848750</a>
          </div>
        </div>
      </div>
    `;

    // Barcode
    if (typeof JsBarcode === "undefined") {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js";
      script.onload = () => generateBarcodeImage(enrollmentNumber);
      document.body.appendChild(script);
    } else {
      generateBarcodeImage(enrollmentNumber);
    }

  } catch (err) {
    console.error("❌ showPreview failed:", err);
    showModal("Error", "❌ Preview generation failed!", true);
  }
}

// ================= Generate Barcode as PNG =================
function generateBarcodeImage(enroll) {
  if (!enroll) return;
  try {
    JsBarcode("#barcode", enroll, { format: "CODE128", width: 1.5, height: 40, displayValue: false });
  } catch (e) {
    console.warn("⚠️ JsBarcode call failed:", e);
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
      console.error("⚠️ Failed to convert barcode SVG -> PNG:", e);
    }
  };
  checkAndConvert();
}

// ================= Save ID Card as Image =================
function saveIDAsImage() {
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
          showModal("Success", "PDF download initiated via WebView!");
        };
        reader.readAsDataURL(pdfBlob);
      } else {
        pdf.save(fileName);
        showModal("Success", "PDF downloaded successfully!");
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

// ✅ Form Navigation / UI Handling
function editEntry() {
  safeGet("previewPage")?.classList.add("hidden");
  safeGet("idForm")?.classList.remove("hidden");
}

function newEntry() {
  const previewPage = safeGet("previewPage");
  const formFields = safeGet("formFields");
  const idForm = safeGet("idForm");
  const canvas = safeGet("canvas");
  const video = safeGet("video");
  const {
    cameraBtn
  } = getButtonRefs();
  const idTypeSelect = safeGet("idType");

  if (previewPage) previewPage.classList.add("hidden");
  if (formFields) formFields.innerHTML = '';
  if (canvas) canvas.classList.add("hidden");
  if (video) video.classList.add("hidden");
  if (idForm) idForm.classList.remove("hidden");

  imageData = '';
  entryData = {};
  lastType = idTypeSelect?.value?.trim().toLowerCase() || '';
  stopCamera();

  if (cameraBtn) {
    cameraBtn.innerHTML = `<i class="fas fa-video"></i><span>Camera</span>`;
    cameraBtn.onclick = startCamera;
  }
  generateFormFields(lastType);
}

function goHome() {
  safeGet("previewPage")?.classList.add("hidden");
  safeGet("idForm")?.classList.add("hidden");
  if (safeGet("formFields")) safeGet("formFields").innerHTML = '';
  imageData = '';
  entryData = {};
  lastType = '';
  stopCamera();
  safeGet("canvas")?.classList.add("hidden");
  safeGet("video")?.classList.add("hidden");
  if (safeGet("preview")) safeGet("preview").innerHTML = '';
  safeGet("homePage")?.classList.remove("hidden");
  if (safeGet("idType")) safeGet("idType").value = "";
  const {
    cameraBtn
  } = getButtonRefs();
  if (cameraBtn) {
    cameraBtn.innerHTML = `<i class="fas fa-video"></i><span>Camera</span>`;
    cameraBtn.onclick = startCamera;
  }
}

// ============================
// ✅ Export to Global Scope
// ============================
window.handleSubmit = handleSubmit;
window.logoutUser = logoutUser;
window.navigateToForm = navigateToForm;
window.startCamera = startCamera;
window.takePicture = takePicture;
window.retakePicture = retakePicture;
window.newEntry = newEntry;
window.goHome = goHome;
window.editEntry = editEntry;
window.saveIDAsImage = saveIDAsImage;
