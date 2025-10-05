// Main JS file
import { firebaseConfig, imagebbConfig } from '../Database/Database.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getDatabase, ref as dbRef, get, update, remove } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// ImgBB API key
const IMGBB_API_KEY = imagebbConfig.apiKey;

// ===== Current record info =====
let currentSchoolName = "";
let currentSchoolId = "";
let currentType = "";
let currentEnroll = "";

// ===== Search Record =====
window.searchRecord = async function () {
  const enroll = document.getElementById("enrollNo").value.trim().toUpperCase();
  if (!enroll) return alert("⚠️ Please enter Enrollment Number.");
  if (!navigator.onLine) return alert("🚫 You're offline.");

  showSpinner();
  clearForm(false);

  try {
    const masterRef = dbRef(database, "DATA-MASTER");
    const masterSnap = await get(masterRef);

    if (!masterSnap.exists()) {
      hideSpinner();
      return alert("❌ No data available.");
    }

    const masterData = masterSnap.val();
    let found = false;

    outerLoop:
    for (const schoolName in masterData) {
      for (const schoolId in masterData[schoolName]) {
        const schoolNode = masterData[schoolName][schoolId];

        if (schoolNode.STAFF && schoolNode.STAFF[enroll]) {
          found = true;
          currentSchoolName = schoolName;
          currentSchoolId = schoolId;
          currentType = "STAFF";
          currentEnroll = enroll;
          renderForm("STAFF", schoolNode.STAFF[enroll]);
          break outerLoop;
        }

        if (schoolNode.STUDENT && schoolNode.STUDENT[enroll]) {
          found = true;
          currentSchoolName = schoolName;
          currentSchoolId = schoolId;
          currentType = "STUDENT";
          currentEnroll = enroll;
          renderForm("STUDENT", schoolNode.STUDENT[enroll]);
          break outerLoop;
        }
      }
    }

    hideSpinner();
    if (!found) alert("❌ Record not found.");

  } catch (err) {
    hideSpinner();
    alert("❌ " + err.message);
    logError(err.message, "searchRecord");
  }
};

// ===== Render Dynamic Form =====
function renderForm(type, data) {
  const form = document.getElementById("updateForm");
  const disabledFields = ["schoolName", "staff_enroll", "student_enroll"];

  let html = '<div class="row">';
  Object.keys(data).forEach((key) => {
    if (key === "photo") return;
    const label = key.replace(/_/g, " ").toUpperCase();
    const val = data[key] || "";
    const disabled = disabledFields.includes(key) ? "disabled" : "";

    html += `
      <div class="col-md-6 mb-3">
        <label class="form-label" for="${key}">${label}</label>
        <input type="text" class="form-control text-uppercase" id="${key}" value="${val}" ${disabled} />
      </div>`;
  });
  html += "</div>";

  html += `
    <div class="mb-3">
      <label class="form-label">📸 Photo Preview</label><br />
      <img id="photoPreview" src="${data.photo || ""}" class="img-thumbnail mb-2" style="max-height:150px" />
      ${data.photo ? `
        <button onclick="downloadPhoto('${data.photo}', '${currentEnroll}.jpg')" class="btn btn-success btn-sm me-2 mt-2">
          <i class="fas fa-download"></i> Download 
        </button>` : ""}
      <input type="file" id="newPhoto" class="form-control mt-2" accept="image/*" />
    </div>`;

  html += `
    <div class="d-flex justify-content-end gap-2 mt-3">
      <button class="btn btn-warning btn-icon" onclick="updateRecord()"><i class="fas fa-edit"></i> Update</button>
      <button class="btn btn-danger btn-icon" onclick="deleteRecord()"><i class="fas fa-trash"></i> Delete</button>
      <button class="btn btn-secondary btn-icon" onclick="clearForm(true)"><i class="fas fa-eraser"></i> Clear</button>
    </div>`;

  form.innerHTML = html;
  applyUppercase();
}

// ===== Download Photo =====
window.downloadPhoto = async function (url, filename) {
  try {
    const response = await fetch(url, { mode: 'cors' });
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    alert("❌ Unable to download image.");
    console.error("Download error:", err);
  }
};

// ===== Force Uppercase =====
function applyUppercase() {
  document.querySelectorAll("#updateForm input[type='text']").forEach((el) => {
    el.addEventListener("input", () => {
      el.value = el.value.toUpperCase();
    });
  });
}

// ===== Upload to ImgBB =====
async function uploadToImgBB(file) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const formData = new FormData();
  formData.append("key", IMGBB_API_KEY);
  formData.append("image", base64);
  if (currentEnroll) formData.append("name", currentEnroll);

  const res = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    body: formData
  });

  const json = await res.json();
  if (json.success) return json.data.url;
  throw new Error("Image upload failed.");
}

// ===== Update Record =====
window.updateRecord = async function () {
  if (!currentSchoolName || !currentSchoolId || !currentType || !currentEnroll)
    return alert("⚠️ Please search first.");

  const ref = dbRef(database, `DATA-MASTER/${currentSchoolName}/${currentSchoolId}/${currentType}/${currentEnroll}`);
  const snapshot = await get(ref);
  const existing = snapshot.exists() ? snapshot.val() : {};

  const inputs = document.querySelectorAll("#updateForm input[type='text']");
  const updated = {};
  let hasChanges = false;

  inputs.forEach((el) => {
    if (!el.disabled) {
      const val = el.value.trim().toUpperCase();
      const old = existing[el.id]?.toUpperCase() || "";
      updated[el.id] = val;
      if (val !== old) hasChanges = true;
    }
  });

  const fileInput = document.getElementById("newPhoto");
  const file = fileInput?.files?.[0];

  try {
    showSpinner();
    if (file) {
      const photoURL = await uploadToImgBB(file);
      updated["photo"] = photoURL;
      hasChanges = true;
      document.getElementById("photoPreview").src = photoURL;
    } else {
      updated["photo"] = document.getElementById("photoPreview")?.src || "";
    }

    if (!hasChanges) {
      hideSpinner();
      return alert("ℹ️ No changes to update.");
    }

    await update(ref, updated);
    alert("✅ Record updated successfully.");
    clearForm();
  } catch (err) {
    alert("❌ Update failed: " + err.message);
    logError(err.message, "updateRecord");
  } finally {
    hideSpinner();
  }
};

// ===== Delete Record =====
window.deleteRecord = async function () {
  if (!currentSchoolName || !currentSchoolId || !currentType || !currentEnroll)
    return alert("⚠️ Please search first.");

  const confirmDelete = confirm("⚠️ Are you sure you want to delete this record?");
  if (!confirmDelete) return;

  try {
    showSpinner();
    const recordRef = dbRef(database, `DATA-MASTER/${currentSchoolName}/${currentSchoolId}/${currentType}/${currentEnroll}`);
    const snapshot = await get(recordRef);

    if (!snapshot.exists()) {
      alert("❌ Record not found. Already deleted or moved.");
      clearForm();
      return;
    }

    await remove(recordRef);
    alert("🗑️ Record deleted successfully.");
    clearForm();
  } catch (err) {
    alert("❌ Delete failed: " + err.message);
    logError(err.message, "deleteRecord");
  } finally {
    hideSpinner();
  }
};

// ===== Clear Form =====
window.clearForm = function (full = true) {
  const form = document.getElementById("updateForm");
  if (form) form.innerHTML = "";

  if (full) {
    document.getElementById("enrollNo").value = "";
    currentType = "";
    currentEnroll = "";
    currentSchoolName = "";
    currentSchoolId = "";
  }
};

// ===== Spinner =====
function showSpinner() {
  document.getElementById("loadingSpinner").style.display = "block";
}
function hideSpinner() {
  document.getElementById("loadingSpinner").style.display = "none";
}

// ===== Log Errors =====
async function logError(message, sourceFn) {
  const now = new Date().toISOString().replace(/:/g, "-");
  const ref = dbRef(database, `errors/${now}`);
  const log = {
    message,
    function: sourceFn,
    time: now,
    user: currentEnroll || "UNKNOWN"
  };
  try {
    await update(ref, log);
  } catch (e) {
    console.error("Logging failed:", e);
  }
};
