// ---------------- IMPORTS ----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getDatabase, ref as dbRef, get, child, set } 
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { firebaseConfig, imagebbConfig } from '../Database/Database.js';

// ---------------- INITIALIZATION ----------------
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const IMGBB_API_KEY = imagebbConfig?.apiKey || null;

if (!IMGBB_API_KEY) alert("⚠️ ImgBB API key missing! Please check Database.js.");

let imageData = null;
let selectedSchool = null;

const el = id => document.getElementById(id);

// ---------------- FIELD DEFINITIONS ----------------
const studentFields = [
  ['enroll','Enrollment Number','text',true],
  ['adm','Admission Number','text'],
  ['name','Student Name','text',true],
  ['class','Class','select',['PG','NURSERY','LKG','UKG','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']],
  ['section','Section','select',['A','B','C','D','E','F','G','H','I','J','K']],
  ['roll','Roll Number','text'],
  ['dob','Date of Birth','date'],
  ['father',"Father's Name",'text'],
  ['mother',"Mother's Name",'text'],
  ['contact','Contact Number','text'],
  ['address','Address','textarea'],
  ['transport','Mode of Transport','select',['SELF','TRANSPORT']],
  ['house','House Name','text'],
  ['blood','Blood Group','select',['A+','A-','B+','B-','AB+','AB-','O+','O-','NA']]
];

const staffFields = [
  ['enroll','Enrollment Number','text',true],
  ['empid','Employee ID','text'],
  ['name','Name','text',true],
  ['designation','Designation','select',['DIRECTOR','PRINCIPAL','VICE PRINCIPAL','COORDINATOR','ADMIN','ACCOUNTANT','LIBRARIAN','TEACHER','CLERK','COMPUTER OPERATOR','RECEPTIONIST','DRIVER','ATTENDANT','GUARD','HELPER','PEON','MED','OTHER']],
  ['father',"Father / Spouse Name",'text'],
  ['dob','Date of Birth','date'],
  ['contact','Contact Number','text'],
  ['address','Address','textarea'],
  ['blood','Blood Group','select',['A+','A-','B+','B-','AB+','AB-','O+','O-','NA']]
];

// ---------------- BUTTON ENABLE LOGIC ----------------
function updateNextButtonState() {
  const schoolSelected = el('schoolSelect')?.value?.trim() !== "";
  const typeSelected = el('entryType')?.value?.trim() !== "";
  el('nextStepBtn').disabled = !(schoolSelected && typeSelected);
}

// ---------------- STAGE DISPLAY ----------------
function showStage(stage) {
  if (stage === 1) {
    el('selectionCard').style.display = 'block';
    el('dataCard').style.display = 'none';
  } else {
    el('selectionCard').style.display = 'none';
    el('dataCard').style.display = 'block';
    el('currentSchoolName').textContent = selectedSchool.data.name.toUpperCase();
    el('currentEntryType').textContent = el('entryType').value.toUpperCase();
  }
}

// ---------------- LOAD SCHOOL LIST ----------------
async function loadSchools() {
  try {
    const snap = await get(child(dbRef(database), 'schools'));
    const select = el('schoolSelect');
    select.innerHTML = '<option value="">-- Select School --</option>';

    if (snap.exists()) {
      const schools = Object.entries(snap.val());
      schools.forEach(([key, val]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = val.name || val.schoolname || key;
        opt.dataset.name = val.name || val.schoolname || key;
        select.appendChild(opt);
      });
    } else {
      alert("⚠️ No schools found in database.");
    }

    // ✅ Plain dropdowns with proper change listeners
    select.addEventListener('change', e => {
      const key = e.target.value;
      const opt = e.target.options[e.target.selectedIndex];
      if (key) {
        selectedSchool = { key, data: { name: opt.dataset.name } };
      } else {
        selectedSchool = null;
      }
      updateNextButtonState();
    });

    el('entryType').addEventListener('change', updateNextButtonState);

  } catch (err) {
    console.error(err);
    alert('❌ Failed to load schools: ' + err.message);
  }
}

// ---------------- ENROLLMENT GENERATION ----------------
async function generateUniqueEnrollmentForSchool(schoolId, type) {
  const now = new Date();
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const dd = String(now.getDate()).padStart(2, '0');
  const mmm = months[now.getMonth()];
  const yyyy = now.getFullYear();

  for (let i = 0; i < 20; i++) {
    const serial = String(Math.floor(1000 + Math.random() * 9000));
    const enroll = `${schoolId}${dd}${mmm}${yyyy}${serial}`;
    const path = `DATA-MASTER/${selectedSchool.data.name}/${schoolId}/${type.toUpperCase()}/${enroll}`;
    const snap = await get(child(dbRef(database), path));
    if (!snap.exists()) return enroll;
  }

  throw new Error('⚠️ Enrollment generation failed after multiple attempts.');
}

// ---------------- FORM CREATION ----------------
async function generateForm(type) {
  const container = el('formFields');
  container.innerHTML = '';
  const fields = type === 'student' ? studentFields : staffFields;
  const schoolId = selectedSchool?.key || 'SCHOOL';
  const enroll = await generateUniqueEnrollmentForSchool(schoolId, type);

  fields.forEach(([id, label, control, req]) => {
    const fullId = `${type}_${id}`;
    const div = document.createElement('div');
    div.className = 'form-group';
    let input;

    if (control === 'select') {
      input = document.createElement('select');
      const def = document.createElement('option');
      def.value = ''; def.disabled = true; def.selected = true;
      def.textContent = `Select ${label}`;
      input.appendChild(def);

      const opts = (type === 'student' ? studentFields : staffFields).find(f => f[0] === id)[3];
      if (Array.isArray(opts)) {
        opts.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o;
          opt.textContent = o;
          input.appendChild(opt);
        });
      }
    } else if (control === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
      input.addEventListener('input', e => e.target.value = e.target.value.toUpperCase());
    } else {
      input = document.createElement('input');
      input.type = id === 'dob' ? 'date' : 'text';
      if (id === 'enroll') {
        input.value = enroll;
        input.readOnly = true;
      } else if (input.type === 'text') {
        input.addEventListener('input', e => e.target.value = e.target.value.toUpperCase());
      }
    }

    input.id = fullId;
    const labelEl = document.createElement('label');
    labelEl.htmlFor = fullId;
    labelEl.textContent = label + (req ? ' *' : '');
    div.append(labelEl, input);
    container.appendChild(div);
  });

  // Reset photo + progress
  el('photo-preview').innerHTML = `<span class="placeholder-text"><i class="fas fa-user-circle fa-4x"></i><br>UPLOAD IMAGE<br><small>(Optimized Max 30KB)</small></span>`;
  el('uploadProgressBar').style.width = '0%';
  imageData = null;
  el('photoFile').value = '';
}

// ---------------- IMAGE FUNCTIONS ----------------
function formatDOBtoDDMMMYYYY(dobStr) {
  if (!dobStr) return "";
  const date = new Date(dobStr);
  if (isNaN(date)) return "";
  const day = String(date.getDate()).padStart(2,'0');
  const monthNames = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

async function compressAndPreviewImage(file) {
  const options = { maxSizeMB: 0.03, maxWidthOrHeight: 480, useWebP: true };
  const compressed = await imageCompression(file, options);
  const reader = new FileReader();
  reader.onload = e => {
    imageData = e.target.result;
    el('photo-preview').innerHTML = `<img src="${imageData}" />`;
    el('photoFile').value = '';
  };
  reader.readAsDataURL(compressed);
}

async function uploadImageToImgBB(base64, name, onProgress) {
  if (!IMGBB_API_KEY) throw new Error("ImgBB API key not configured.");
  return new Promise((resolve, reject) => {
    const data = new FormData();
    data.append('key', IMGBB_API_KEY);
    data.append('image', base64.replace(/^data:image\/[a-z]+;base64,/, ''));
    data.append('name', name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.imgbb.com/1/upload');
    xhr.upload.onprogress = e => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        res.success ? resolve(res.data.display_url) : reject(new Error('❌ Image upload failed.'));
      } catch {
        reject(new Error('❌ Invalid ImgBB response.'));
      }
    };
    xhr.onerror = () => reject(new Error('❌ Network error while uploading image.'));
    xhr.send(data);
  });
}

// ---------------- SUBMIT FUNCTION ----------------
async function submitSingle() {
  const btn = el('submitSingle');
  btn.disabled = true;
  el('uploadProgressBar').style.width = '0%';

  try {
    if (!selectedSchool) return alert('Select school');
    if (!imageData) return alert('Upload photo');

    const type = el('entryType').value.toUpperCase();
    const payload = {
      photo: "",
      schoolName: selectedSchool.data.name,
      schoolId: selectedSchool.key
    };

    const fields = Array.from(document.querySelectorAll('#formFields input,#formFields select,#formFields textarea'));
    fields.forEach(f => {
      let val = f.value.trim();
      if (f.type === 'text' || f.tagName === 'TEXTAREA') val = val.toUpperCase();
      if (f.id.endsWith('_dob')) val = formatDOBtoDDMMMYYYY(val);
      payload[f.id] = val;
    });

    // Required validation
    const fieldList = type === 'STUDENT' ? studentFields : staffFields;
    for (const [id, label, , req] of fieldList) {
      if (req && !payload[`${type.toLowerCase()}_${id}`]) {
        alert(`Please fill required field: ${label}`);
        btn.disabled = false;
        return;
      }
    }

    const enroll = payload[`${type.toLowerCase()}_enroll`];
    const photoURL = await uploadImageToImgBB(imageData, enroll, p => el('uploadProgressBar').style.width = `${p}%`);
    payload.photo = photoURL;

    const dbPath = `DATA-MASTER/${selectedSchool.data.name}/${selectedSchool.key}/${type}/${enroll}`;
    await set(dbRef(database, dbPath), payload);

    alert('✅ Record saved successfully!');
    await generateForm(type.toLowerCase());
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
  }
}

// ---------------- EVENT BINDINGS ----------------
el('nextStepBtn').addEventListener('click', async () => {
  const typeVal = el('entryType').value;
  if (!typeVal || !selectedSchool) return alert("Please select both school and entry type.");
  await generateForm(typeVal);
  showStage(2);
});

el('backToSelectionBtn').addEventListener('click', () => showStage(1));

el('photoFile').addEventListener('change', e => e.target.files[0] && compressAndPreviewImage(e.target.files[0]));

el('submitSingle').addEventListener('click', submitSingle);

// ---------------- INIT ----------------
showStage(1);
loadSchools();
