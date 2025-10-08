// ---------------- IMPORTS ----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { 
    getDatabase, ref as dbRef, get, child, set, runTransaction 
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
// सुनिश्चित करें कि आपकी Database.js फ़ाइल सही पाथ पर है।
import { firebaseConfig, cloudinaryConfig } from '../Database/Database.js'; 
// Note: imageCompression लाइब्रेरी को index.html में <script> से लोड किया गया है।

// ---------------- INITIALIZATION ----------------
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Cloudinary कॉन्फ़िगरेशन
const { uploadUrl: CLOUDINARY_UPLOAD_URL, uploadPreset: CLOUDINARY_UPLOAD_PRESET } = cloudinaryConfig; 

if (!CLOUDINARY_UPLOAD_URL || !CLOUDINARY_UPLOAD_PRESET) {
    console.error("⚠️ Cloudinary configuration missing! Please check Database.js.");
    // UI में चेतावनी देना
    document.addEventListener('DOMContentLoaded', () => {
        alert("⚠️ Cloudinary configuration missing! Please check Database.js.");
    });
}

let imageData = null;
let selectedSchool = null;

const el = id => document.getElementById(id);

// ---------------- FIELD DEFINITIONS (कोई बदलाव नहीं) ----------------
const studentFields = [
    ['enroll','Enrollment Number','text',true],
    ['adm','Admission Number','text'],
    ['name','Student Name','text',true],
    ['class','Class','select',['PG','NURSERY','LKG','UKG','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']],
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

// ---------------- BUTTON ENABLE LOGIC ----------------
function updateNextButtonState() {
    const schoolSelected = el('schoolSelect')?.value?.trim() !== "";
    const typeSelected = el('entryType')?.value?.trim() !== "";

    el('schoolSelectBlock')?.classList.toggle('active', schoolSelected);
    el('entryTypeBlock')?.classList.toggle('active', typeSelected);

    if(el('nextStepBtn')) {
        el('nextStepBtn').disabled = !(schoolSelected && typeSelected);
    }
}

// ---------------- STAGE DISPLAY ----------------
function showStage(stage) {
    if (stage === 1) {
        el('selectionCard').style.display = 'block';
        el('dataCard').style.display = 'none';
        // Stage 1 पर वापस आने पर बटन/स्टेटस अपडेट करें
        updateNextButtonState(); 
    } else {
        el('selectionCard').style.display = 'none';
        el('dataCard').style.display = 'block';
        el('currentSchoolName').textContent = selectedSchool?.data?.name?.toUpperCase() || 'N/A';
        el('currentEntryType').textContent = el('entryType').value.toUpperCase();
    }
}

// ---------------- LOAD SCHOOL LIST ----------------
async function loadSchools() {
    try {
        const snap = await get(child(dbRef(database), 'schools'));
        const select = el('schoolSelect');
        
        // 🎯 FIX 1: Stage 1 के Select Box पर क्लास जोड़ें
        select.classList.add('custom-select-control'); 
        
        const typeSelect = el('entryType');
        typeSelect.classList.add('custom-select-control'); // Entry Type पर भी क्लास जोड़ें

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

        // Event Listeners for Stage 1
        select.removeEventListener('change', handleSchoolChange);
        select.addEventListener('change', handleSchoolChange);
        
        typeSelect.removeEventListener('change', updateNextButtonState);
        typeSelect.addEventListener('change', updateNextButtonState);

    } catch (err) {
        console.error("Error loading schools:", err);
        alert('❌ Failed to load schools: ' + err.message);
        el('schoolSelect').innerHTML = '<option value="" selected disabled>❌ Loading Failed</option>';
    }
    updateNextButtonState();
}

// School Change Handler
function handleSchoolChange(e) {
    const key = e.target.value;
    const opt = e.target.options[e.target.selectedIndex];
    if (key) {
        // School Key और Name को selectedSchool ऑब्जेक्ट में सेव करें
        selectedSchool = { key, data: { name: opt.dataset.name } };
    } else {
        selectedSchool = null;
    }
    updateNextButtonState();
}


// ---------------- ENROLLMENT GENERATION (FIXED LOGIC) ----------------
async function generateUniqueEnrollmentForSchool(schoolId, type) {
    const now = new Date();
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const dd = String(now.getDate()).padStart(2, '0');
    const mmm = months[now.getMonth()];
    const yyyy = now.getFullYear();
    const schoolName = selectedSchool.data.name; // School Name को पाथ के लिए

    for (let i = 0; i < 20; i++) {
        const serial = String(Math.floor(1000 + Math.random() * 9000));
        const enroll = `${schoolId}${dd}${mmm}${yyyy}${serial}`; 
        
        // पाथ को enrollment ID के साथ सही ढंग से बनाया गया
        const path = `DATA-MASTER/${schoolName}/${schoolId}/${type.toUpperCase()}/${enroll}`; 
        
        const snap = await get(child(dbRef(database), path));
        if (!snap.exists()) return enroll;
    }

    throw new Error('⚠️ Enrollment generation failed after multiple attempts. Try again.');
}

// ---------------- FORM CREATION ----------------
async function generateForm(type) {
    const container = el('formFields');
    container.innerHTML = '';
    const fields = type === 'student' ? studentFields : staffFields;
    const schoolId = selectedSchool?.key || 'SCHOOL';

    let enroll;
    try {
        // unique Enrollment ID जनरेट करें
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
            // 🎯 FIX 2: Stage 2 के सभी Dynamic Select Box पर क्लास जोड़ें
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
                input.pattern = "\\d{10}"; // 10-digit number validation
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

    // UI Reset
    el('photo-preview').innerHTML = `<span class="placeholder-text"><i class="fas fa-camera-retro fa-4x"></i><br>CLICK TO UPLOAD IMAGE<br><small>(Optimized Max 30KB)</small></span>`;
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
    if (typeof imageCompression === 'undefined') {
        return alert("❌ Error: Image compression library is missing. Check index.html.");
    }
    const options = { maxSizeMB: 0.03, maxWidthOrHeight: 480, useWebP: false }; 
    try {
        const compressed = await imageCompression(file, options);
        const reader = new FileReader();
        reader.onload = e => {
            imageData = e.target.result; // Base64
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

// ---------------- CREDIT DEDUCTION LOGIC ----------------
async function deductCredit() {
    const vendorRef = dbRef(database, 'roles/vendor'); 

    try {
        await runTransaction(vendorRef, (currentData) => {
            if (currentData === null) {
                console.warn("Vendor data not found. Skipping credit deduction.");
                return currentData; 
            }

            let credits = Number(currentData.credits || 0);
            let deu = Number(currentData.deu || 0); 

            if (credits > 0) {
                credits -= 1;
                currentData.credits = credits;
                if (credits === 0) currentData.isActive = false; 
            } else {
                deu += 1;
                currentData.deu = deu;
                currentData.isActive = false; 
            }

            return currentData; 
        });
        console.log("Credit/Due successfully updated.");
    } catch (error) {
        console.error("Credit deduction transaction failed:", error);
        throw new Error("⚠️ Submit failed: Credit transaction error. Contact Admin."); 
    }
}

// ---------------- SUBMIT FUNCTION ----------------
async function submitSingle() {
    const btn = el('submitSingle');
    btn.disabled = true;
    el('uploadProgressBar').style.width = '0%';

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
        // 1. Payload तैयार करें
        fields.forEach(f => {
            let val = f.value.trim();
            if (f.type === 'text' || f.tagName === 'TEXTAREA') val = val.toUpperCase();
            if (f.id.endsWith('_dob')) val = formatDOBtoDDMMMYYYY(val);
            payload[f.name || f.id] = val; // f.name का उपयोग करें
        });

        // 2. Required validation 
        const form = el('dataCard').querySelector('form');
        if (form && !form.checkValidity()) {
            // HTML5 validation message दिखाएँ
            form.reportValidity();
            throw new Error("Please fill all required fields correctly.");
        }
        
        const enroll = payload[`${type.toLowerCase()}_enroll`];
        if (!enroll) throw new Error("Enrollment number is missing.");


        // 3. Cloudinary Upload
        const photoURL = await uploadImageToCloudinary(
            imageData, 
            enroll, 
            p => el('uploadProgressBar').style.width = `${p}%`
        );
        payload.photo = photoURL;

        const dbPath = `DATA-MASTER/${selectedSchool.data.name}/${selectedSchool.key}/${type}/${enroll}`;
        const recordRef = dbRef(database, dbPath);

        // Check if enrollment exists (for credit logic)
        const snapshot = await get(recordRef);
        const isNewEnrollment = !snapshot.exists();

        // 4. Save Data to Firebase
        await set(recordRef, payload);

        // 5. Credit Deduction 
        if (isNewEnrollment) {
            await deductCredit();
        }

        alert('✅ Record saved successfully!');
        // UI को अगले नए एंट्री फॉर्म के लिए रीसेट करें
        await generateForm(type.toLowerCase()); 

    } catch (e) {
        console.error("Submit Error:", e);
        alert('❌ Error: ' + (e.message || "An unknown error occurred."));
    } finally {
        btn.disabled = false;
    }
}

// ---------------- EVENT BINDINGS (INIT) ----------------

document.addEventListener('DOMContentLoaded', () => {
    // Stage 1 सेट करें और स्कूल लोड करें
    showStage(1);
    loadSchools(); // यह अब Stage 1 के Select Box पर भी क्लास लगाता है

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
