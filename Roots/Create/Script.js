import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
    getDatabase, ref as dbRef, get, child, set
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

import { firebaseConfig, cloudinaryConfig } from '../Database/Database.js';

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const { uploadUrl: CLOUDINARY_UPLOAD_URL, uploadPreset: CLOUDINARY_UPLOAD_PRESET } = cloudinaryConfig;

if (!CLOUDINARY_UPLOAD_URL || !CLOUDINARY_UPLOAD_PRESET) {
    console.error("⚠️ Cloudinary configuration missing! Please check Database.js.");

    document.addEventListener('DOMContentLoaded', () => {
        alert("⚠️ Cloudinary configuration missing! Please check Database.js.");
    });
}

let imageData = null;
let selectedSchool = null;

const el = id => document.getElementById(id);

function setUploadProgress(value, label = null) {
    const progressValue = Math.max(0, Math.min(100, Number(value) || 0));
    el('uploadProgressBar').style.width = `${progressValue}%`;

    const progressText = el('uploadProgressText');
    if (progressText) {
        progressText.textContent = label || (progressValue > 0 ? `${progressValue}%` : 'Ready');
    }
}

const studentFields = [
    ['enroll','Enrollment Number','text',true],
    ['adm','Admission Number','text'],
    ['name','Student Name','text',true],
    ['class','Class','select',['PG','NUR','LKG','UKG','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']],
    ['section','Section','select',['A','B','C','D','E','F','G','H','I','J','K']],
    ['roll','Roll Number','text'],
    ['dob','Date of Birth','date'],
    ['father',"Father's Name",'text',true],
    ['mother',"Mother's Name",'text'],
    ['contact','Contact Number','text'],
    ['address','Address','textarea',true],
    ['transport','Mode of Transport','select',['SELF','TRANSPORT']],
    ['house','House Name','text'],
    ['blood','Blood Group','select',['A+','A-','B+','B-','AB+','AB-','O+','O-','NA']]
];

const staffFields = [
    ['enroll','Enrollment Number','text',true],
    ['empid','Employee ID','text'],
    ['name','Name','text',true],
    ['designation','Designation','select',['DIRECTOR','PRINCIPAL','VICE PRINCIPAL','COORDINATOR','ADMIN','ACCOUNTANT','LIBRARIAN','TEACHER','CLERK','COMPUTER OPERATOR','RECEPTIONIST','DRIVER','ATTENDANT','GUARD','HELPER','PEON','MED','OTHER']],
    ['father',"Father / Spouse Name",'text',true],
    ['dob','Date of Birth','date'],
    ['contact','Contact Number','text'],
    ['address','Address','textarea',true],
    ['blood','Blood Group','select',['A+','A-','B+','B-','AB+','AB-','O+','O-','NA']]
];

function updateNextButtonState() {
    const schoolSelected = el('schoolSelect')?.value?.trim() !== "";
    const typeSelected = el('entryType')?.value?.trim() !== "";

    el('schoolSelectBlock')?.classList.toggle('active', schoolSelected);
    el('entryTypeBlock')?.classList.toggle('active', typeSelected);

    if(el('nextStepBtn')) {
        el('nextStepBtn').disabled = !(schoolSelected && typeSelected);
    }
}

function initializeSchoolSearch() {
    if (!window.jQuery || !window.jQuery.fn?.select2) return;

    const schoolSelect = window.jQuery('#schoolSelect');
    if (schoolSelect.hasClass('select2-hidden-accessible')) {
        schoolSelect.select2('destroy');
    }

    schoolSelect.select2({
        width: '100%',
        placeholder: 'Search school',
        allowClear: true
    });

    schoolSelect.off('change.createSchool').on('change.createSchool', handleSchoolChange);
    schoolSelect.off('select2:open.createSchool').on('select2:open.createSchool', () => {
        setTimeout(() => {
            document.querySelector('.select2-container--open .select2-search__field')?.focus();
        }, 0);
    });
}

function showStage(stage) {
    if (stage === 1) {
        el('selectionCard').style.display = 'block';
        el('dataCard').style.display = 'none';

        updateNextButtonState();
    } else {
        el('selectionCard').style.display = 'none';
        el('dataCard').style.display = 'block';
        el('currentSchoolName').textContent = selectedSchool?.data?.name?.toUpperCase() || 'N/A';
        el('currentEntryType').textContent = el('entryType').value.toUpperCase();
    }
}

async function loadSchools() {
    try {
        const snap = await get(child(dbRef(database), 'schools'));
        const select = el('schoolSelect');

        select.classList.add('custom-select-control');

        const typeSelect = el('entryType');
        typeSelect.classList.add('custom-select-control');

        select.innerHTML = '<option value="" selected disabled>-- Select School --</option>';

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
            console.warn("⚠️ No schools found in database.");
            select.innerHTML = '<option value="" selected disabled>❌ No Schools Found</option>';
        }

        select.removeEventListener('change', handleSchoolChange);
        select.addEventListener('change', handleSchoolChange);

        typeSelect.removeEventListener('change', updateNextButtonState);
        typeSelect.addEventListener('change', updateNextButtonState);
        initializeSchoolSearch();

    } catch (err) {
        console.error("Error loading schools:", err);
        alert('❌ Failed to load schools: ' + err.message);
        el('schoolSelect').innerHTML = '<option value="" selected disabled>❌ Loading Failed</option>';
    }
    updateNextButtonState();
}

function handleSchoolChange(e) {
    const key = e.target.value;
    const opt = e.target.options[e.target.selectedIndex];
    if (key) {

        selectedSchool = { key, data: { name: opt.dataset.name } };
    } else {
        selectedSchool = null;
    }
    updateNextButtonState();
}

async function generateUniqueEnrollmentForSchool(schoolId, type) {
    const now = new Date();
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const dd = String(now.getDate()).padStart(2, '0');
    const mmm = months[now.getMonth()];
    const yyyy = now.getFullYear();
    const schoolName = selectedSchool.data.name;

    for (let i = 0; i < 20; i++) {
        const serial = String(Math.floor(1000 + Math.random() * 9000));
        const enroll = `${schoolId}${dd}${mmm}${yyyy}${serial}`;

        const path = `DATA-MASTER/${schoolName}/${schoolId}/${type.toUpperCase()}/${enroll}`;

        const snap = await get(child(dbRef(database), path));
        if (!snap.exists()) return enroll;
    }

    throw new Error('⚠️ Enrollment generation failed after multiple attempts. Try again.');
}

async function generateForm(type) {
    const container = el('formFields');
    container.innerHTML = '';
    const fields = type === 'student' ? studentFields : staffFields;
    const schoolId = selectedSchool?.key || 'SCHOOL';

    let enroll;
    try {

        enroll = await generateUniqueEnrollmentForSchool(schoolId, type);
    } catch(e) {
        alert(e.message);
        return showStage(1);
    }

    fields.forEach(([id, label, control, req]) => {
        const fullId = `${type}_${id}`;
        const div = document.createElement('div');
        div.className = 'form-group';
        let input;

        if (control === 'select') {
            input = document.createElement('select');

            input.classList.add('custom-select-control');

            const def = document.createElement('option');
            def.value = ''; def.disabled = true; def.selected = true;
            def.textContent = `Select ${label}`;
            input.appendChild(def);
            if (req) input.required = true;

            const fieldDef = (type === 'student' ? studentFields : staffFields).find(f => f[0] === id);
            const opts = fieldDef ? fieldDef[3] : [];

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
            if (req) input.required = true;
            input.addEventListener('input', e => e.target.value = e.target.value.toUpperCase());
        } else {
            input = document.createElement('input');
            input.type = id === 'dob' ? 'date' : (['contact'].includes(id) ? 'tel' : 'text');
            if (req) input.required = true;

            if (id === 'enroll') {
                input.value = enroll;
                input.readOnly = true;
            } else if (input.type === 'text') {
                input.addEventListener('input', e => e.target.value = e.target.value.toUpperCase());
            } else if (input.type === 'tel') {
                input.pattern = "\\d{10}";
                input.inputMode = "numeric";
                input.maxLength = 10;
            }
        }

        input.id = fullId;
        input.name = fullId;
        const labelEl = document.createElement('label');
        labelEl.htmlFor = fullId;
        labelEl.textContent = label + (req ? ' *' : '');
        div.append(labelEl, input);
        container.appendChild(div);
    });

    el('photo-preview').innerHTML = `<span class="placeholder-text"><i class="fas fa-camera-retro fa-4x"></i><br>CLICK TO UPLOAD IMAGE<br><small>(Optimized Max 30KB)</small></span>`;
    setUploadProgress(0, 'Ready');
    imageData = null;
    el('photoFile').value = '';
}

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
    if (typeof imageCompression === 'undefined') {
        return alert("❌ Error: Image compression library is missing. Check index.html.");
    }
    const options = { maxSizeMB: 0.03, maxWidthOrHeight: 480, useWebP: false };
    try {
        const compressed = await imageCompression(file, options);
        const reader = new FileReader();
        reader.onload = e => {
            imageData = e.target.result;
            el('photo-preview').innerHTML = `<img src="${imageData}" style="width:100%; height:100%; object-fit:cover;" />`;
            el('photoFile').value = '';
        };
        reader.readAsDataURL(compressed);
    } catch(e) {
        alert("❌ Image compression failed: " + e.message);
        console.error(e);
    }
}

async function uploadImageToCloudinary(base64, enrollId, onProgress) {
    if (!CLOUDINARY_UPLOAD_URL || !CLOUDINARY_UPLOAD_PRESET) {
        throw new Error("Cloudinary configuration missing.");
    }
    if (!base64) {
        throw new Error("No image data found for upload.");
    }

    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", base64);
        formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        formData.append("public_id", enrollId);
        formData.append("folder", "school-erp-ids");

        const xhr = new XMLHttpRequest();
        xhr.open("POST", CLOUDINARY_UPLOAD_URL);

        xhr.upload.onprogress = e => {
            if (e.lengthComputable) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        };

        xhr.onload = () => {
            try {
                if (xhr.status === 200) {
                    const result = JSON.parse(xhr.responseText);
                    if (result.secure_url) {
                        onProgress(100);
                        resolve(result.secure_url);
                    } else {
                        reject(new Error("❌ Cloudinary upload failed: " + (result.error?.message || JSON.stringify(result))));
                    }
                } else {
                    reject(new Error(`❌ Cloudinary upload failed with HTTP status: ${xhr.status} - ${xhr.responseText}`));
                }
            } catch (e) {
                reject(new Error("❌ Invalid Cloudinary response: " + e.message));
            }
        };

        xhr.onerror = () => reject(new Error("❌ Network error while uploading image."));
        xhr.send(formData);
    });
}

async function submitSingle() {
    const btn = el('submitSingle');
    btn.disabled = true;
    setUploadProgress(0, 'Starting');

    try {
        if (!selectedSchool) throw new Error('Select school first.');
        if (!imageData) throw new Error('Upload profile photo first.');

        const type = el('entryType').value.toUpperCase();

        const payload = {
            photo: "",
            schoolName: selectedSchool.data.name,
            schoolId: selectedSchool.key,
            timestamp: Date.now()
        };

        const fields = Array.from(document.querySelectorAll('#formFields input,#formFields select,#formFields textarea'));

        fields.forEach(f => {
            let val = f.value.trim();
            if (f.type === 'text' || f.tagName === 'TEXTAREA') val = val.toUpperCase();
            if (f.id.endsWith('_dob')) val = formatDOBtoDDMMMYYYY(val);
            payload[f.name || f.id] = val;
        });

        const form = el('dataCard').querySelector('form');
        if (form && !form.checkValidity()) {

            form.reportValidity();
            throw new Error("Please fill all required fields correctly.");
        }

        const enroll = payload[`${type.toLowerCase()}_enroll`];
        if (!enroll) throw new Error("Enrollment number is missing.");

        const photoURL = await uploadImageToCloudinary(
            imageData,
            enroll,
            p => setUploadProgress(p)
        );
        payload.photo = photoURL;

        const dbPath = `DATA-MASTER/${selectedSchool.data.name}/${selectedSchool.key}/${type}/${enroll}`;
        const recordRef = dbRef(database, dbPath);

        await set(recordRef, payload);

        alert('✅ Record saved successfully!');

        await generateForm(type.toLowerCase());

    } catch (e) {
        console.error("Submit Error:", e);
        alert('❌ Error: ' + (e.message || "An unknown error occurred."));
    } finally {
        btn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {

    showStage(1);
    loadSchools();

    el('nextStepBtn').addEventListener('click', async () => {
        const typeVal = el('entryType').value;
        if (!typeVal || !selectedSchool) return alert("Please select both school and entry type.");
        await generateForm(typeVal);
        showStage(2);
    });

    el('backToSelectionBtn').addEventListener('click', () => showStage(1));

    el('photoFile').addEventListener('change', e => {
        if (e.target.files[0]) {
            compressAndPreviewImage(e.target.files[0]);
        }
    });

    el('submitSingle').addEventListener('click', submitSingle);
});

