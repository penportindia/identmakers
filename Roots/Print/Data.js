// =====================================================
// 🔥 Firebase School Data Management Module (CLEANED & FULL-PROOF)
// =====================================================

// -----------------------------------------------------
// ✅ Imports
// -----------------------------------------------------
import { firebaseConfig } from "../Database/Database.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getDatabase, ref as dbRef, get, set } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

// -----------------------------------------------------
// ✅ Firebase Initialization
// -----------------------------------------------------
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// -----------------------------------------------------
// ✅ DOM Elements
// -----------------------------------------------------
const dataTypeSelect = document.getElementById("dataTypeSelect");
const schoolFilter = document.getElementById("schoolFilter");
const schoolIDSelect = document.getElementById("schoolIDSelect");
const resetBtn = document.getElementById("resetBtn");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");
const recordCount = document.getElementById("recordCount");
const columnSettingBtn = document.getElementById("columnSettingBtn");

let fullDataArray = [];
const SETTINGS_KEY = "table_column_settings_v1"; // single key storing settings per type

// =====================================================
// ✅ Helper Functions for Column Settings
// =====================================================
function loadColumnSettings(dataType) {
    try {
        const stored = localStorage.getItem(SETTINGS_KEY);
        const allSettings = stored ? JSON.parse(stored) : {};
        return allSettings[dataType] || { order: null, hidden: [] };
    } catch (e) {
        console.error("Error loading settings:", e);
        return { order: null, hidden: [] };
    }
}

function saveColumnSettings(dataType, settings) {
    try {
        const stored = localStorage.getItem(SETTINGS_KEY);
        const allSettings = stored ? JSON.parse(stored) : {};
        allSettings[dataType] = settings;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(allSettings));
    } catch (e) {
        console.error("Error saving settings:", e);
    }
}

// Normalize key name utility (keeps original key but helps comparisons)
function normalizeKey(k) {
    return String(k || "").trim();
}

// =====================================================
// ✅ 1. Fetch All School Names
// =====================================================
async function fetchSchoolNames() {
    if (!schoolFilter) return;

    try {
        const snapshot = await get(dbRef(db, "DATA-MASTER"));
        const schools = snapshot.exists() ? Object.keys(snapshot.val()).sort() : [];
        schoolFilter.innerHTML = `<option value="">Select School</option>`;
        schools.forEach(name => {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            schoolFilter.appendChild(option);
        });
    } catch (err) {
        console.error("❌ Error fetching school names:", err);
        alert("⚠️ Failed to load school list.");
    }
}

// =====================================================
// ✅ 2. Fetch School IDs for Selected School
// =====================================================
async function fetchSchoolIDs(schoolName) {
    if (!schoolName || !schoolIDSelect) return;

    schoolIDSelect.innerHTML = "";
    fullDataArray = [];
    renderTable([]);

    try {
        const snapshot = await get(dbRef(db, `DATA-MASTER/${schoolName}`));
        const ids = snapshot.exists() ? Object.keys(snapshot.val()).sort() : [];

        if (ids.length > 0) {
            schoolIDSelect.innerHTML = "";
            ids.forEach(id => {
                const option = document.createElement("option");
                option.value = id;
                option.textContent = id;
                schoolIDSelect.appendChild(option);
            });

            // Select first by default but enable selection if multiple
            schoolIDSelect.value = ids[0];
            schoolIDSelect.disabled = ids.length === 1; // disabled only if single
            await fetchDataForSchool();
        } else {
            schoolIDSelect.innerHTML = `<option value="">No ID Found</option>`;
            schoolIDSelect.disabled = true;
        }
    } catch (err) {
        console.error("❌ Error fetching school IDs:", err);
        alert("⚠️ Failed to load school IDs.");
    }
}

// =====================================================
// ✅ 3. Fetch Data for Selected School + Type
// =====================================================
async function fetchDataForSchool() {
    const schoolName = schoolFilter?.value;
    const schoolID = schoolIDSelect?.value;
    const type = dataTypeSelect?.value;

    if (!schoolName || !schoolID || !type) {
        renderTable([]);
        return;
    }

    try {
        const snapshot = await get(dbRef(db, `DATA-MASTER/${schoolName}/${schoolID}/${type}`));
        const dataObj = snapshot.val();
        fullDataArray = [];

        if (dataObj && typeof dataObj === "object") {
            Object.entries(dataObj).forEach(([enrollID, record]) => {
                if (record && typeof record === "object") {
                    fullDataArray.push({
                        ...record,
                        __key: enrollID,
                        __schoolName: schoolName,
                        __schoolID: schoolID,
                        __type: type
                    });
                }
            });
        }

        renderTable(fullDataArray);
    } catch (err) {
        console.error("❌ Error fetching data:", err);
        alert("⚠️ Failed to load school data.");
    }
}

// =====================================================
// ✅ 4. Render Dynamic Table (UPDATED FOR COLUMN SETTINGS & EDIT BUTTON STYLE)
// =====================================================
function renderTable(dataArray) {
    if (!tableHead || !tableBody || !recordCount) return;

    tableHead.innerHTML = "";
    tableBody.innerHTML = "";
    recordCount.textContent = `${dataArray.length}`;

    if (!dataArray.length) {
        tableBody.innerHTML = `<tr><td colspan="100%" class="text-center p-4">No records found.</td></tr>`;
        return;
    }

    const currentDataType = dataTypeSelect?.value || "default";
    // Build keys from all records to be robust (in case some records have different fields)
    const keysSet = new Set();
    dataArray.forEach(row => Object.keys(row).forEach(k => { if (!k.startsWith("__")) keysSet.add(k); }));
    const allKeys = Array.from(keysSet);

    const settings = loadColumnSettings(currentDataType);

    // If settings.order exists, ensure it contains only known keys but preserve its order
    let finalOrder = Array.isArray(settings.order) ? settings.order.slice() : [];
    finalOrder = finalOrder.filter(k => allKeys.includes(k));
    // Append any keys not present in saved order
    allKeys.forEach(k => { if (!finalOrder.includes(k)) finalOrder.push(k); });

    const hiddenColumns = new Set(settings.hidden || []);
    const keysToDisplay = finalOrder.filter(key => !hiddenColumns.has(key));

    // HEADER ROW
    const headerRow = document.createElement("tr");

    // Select All Checkbox
    const selectAllTh = document.createElement("th");
    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.addEventListener("change", function () {
        tableBody.querySelectorAll("input[type='checkbox']").forEach(cb => cb.checked = this.checked);
    });
    selectAllTh.appendChild(selectAllCheckbox);
    headerRow.appendChild(selectAllTh);

    // Column Headers
    keysToDisplay.forEach(key => {
        const th = document.createElement("th");
        th.textContent = key;
        headerRow.appendChild(th);
    });

    // Edit Column
    const editTh = document.createElement("th");
    editTh.textContent = "Action";
    headerRow.appendChild(editTh);

    tableHead.appendChild(headerRow);

    // Table Rows
    dataArray.forEach(item => {
        const tr = document.createElement("tr");
        tr.dataset.key = item.__key;

        // Checkbox
        const cbTd = document.createElement("td");
        const cbInput = document.createElement("input");
        cbInput.type = "checkbox";
        cbTd.appendChild(cbInput);
        tr.appendChild(cbTd);

        // Data cells (using the filtered and ordered keys)
        keysToDisplay.forEach(key => {
            const td = document.createElement("td");
            td.classList.add("border", "p-2");
            td.dataset.field = key;

            const val = item[key];

            if (key.toLowerCase() === "photo" && val) {
                const img = document.createElement("img");
                img.src = String(val).trim();
                img.alt = "Photo";
                img.loading = "lazy";
                img.style.cssText = "width:50px;height:50px;object-fit:cover;border-radius:4px;cursor:pointer;";
                img.addEventListener("click", () => showImagePreview(String(val).trim()));
                td.appendChild(img);
            } else {
                td.textContent = val ?? "";
            }

            tr.appendChild(td);
        });

        // Edit Button (Styled with Icon)
        const editTd = document.createElement("td");
        const editBtn = document.createElement("button");
        editBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
            Edit
        `;
        editBtn.className = "edit-button";
        editBtn.style.cssText = `
            display: inline-flex;
            align-items: center;
            padding: 6px 12px;
            background: linear-gradient(45deg, #10b981, #059669); /* Tailwind Green 500/600 */
            color: white;
            border: none;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
        `;
        editBtn.onmouseover = function() {
            this.style.transform = "translateY(-1px)";
            this.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.15)";
        };
        editBtn.onmouseout = function() {
            this.style.transform = "none";
            this.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
        };

        // Pass the full ordered keys (including hidden) so edit module can render all fields
        editBtn.addEventListener("click", () => openEditModule(item, finalOrder));
        editTd.appendChild(editBtn);
        tr.appendChild(editTd);

        tableBody.appendChild(tr);
    });
}

// =====================================================
// ✅ 5. Image Preview Popup
// =====================================================
function showImagePreview(url) {
    if (!url) return;
    const preview = document.createElement("div");
    preview.style.cssText = `
        position:fixed;top:0;left:0;width:100vw;height:100vh;
        background:rgba(0,0,0,0.8);display:flex;
        align-items:center;justify-content:center;z-index:9999;
    `;
    preview.addEventListener("click", () => preview.remove());

    const imgLarge = document.createElement("img");
    imgLarge.src = url;
    imgLarge.style.cssText = "max-width:90%;max-height:90%;border-radius:8px;";
    preview.appendChild(imgLarge);
    document.body.appendChild(preview);
}

// =====================================================
// ✅ 6. Modern Stylish Inline Edit Module
// =====================================================
function openEditModule(item, keys) {
    document.getElementById("editModule")?.remove();

    // --- Create Main Module ---
    const module = document.createElement("div");
    module.id = "editModule";
    module.style.cssText = `
        position: fixed;
        top: 5%;
        left: 50%;
        transform: translateX(-50%);
        background: #ffffff;
        padding: 0;
        border-radius: 16px;
        box-shadow: 0 12px 35px rgba(0, 0, 0, 0.25);
        z-index: 10000;
        max-height: 95vh;
        overflow-y: auto;
        min-width: 850px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        display: flex;
        flex-direction: column;
        animation: fadeIn 0.3s ease-in-out;
    `;

    // --- CSS Animation + Responsive ---
    const styleTag = document.createElement("style");
    styleTag.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-20px) translateX(-50%); }
            to { opacity: 1; transform: translateY(0) translateX(-50%); }
        }

        @media (max-width: 900px) {
            #editModule { min-width: 95%; flex-direction: column; }
            #editModule .edit-body { flex-direction: column; }
            #editModule .photo-section { width: 100%; }
        }

        /* Add a spinning effect for the settings icon */
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        #editModule .settings-icon:hover {
            animation: spin 1s linear infinite;
        }
    `;
    document.head.appendChild(styleTag);

    // --- Header (with Stylish Icon) ---
    const header = document.createElement("div");
    header.style.cssText = `
        background: linear-gradient(135deg, #43a047, #2e7d32);
        color: white;
        padding: 18px 24px;
        border-radius: 16px 16px 0 0;
        font-size: 1.3rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        letter-spacing: 0.5px;
    `;

    // Settings Icon
    const settingsIcon = document.createElement("span");
    settingsIcon.className = "settings-icon";
    settingsIcon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" 
            width="24" height="24" fill="none" stroke="white" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" 
            class="feather feather-settings">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06
            a2 2 0 0 1-2.83 2.83l-.06-.06
            a1.65 1.65 0 0 0-1.82-.33
            1.65 1.65 0 0 0-1 1.51V21
            a2 2 0 0 1-4 0v-.09
            a1.65 1.65 0 0 0-1-1.51
            1.65 1.65 0 0 0-1.82.33l-.06.06
            a2 2 0 0 1-2.83-2.83l.06-.06
            a1.65 1.65 0 0 0 .33-1.82
            1.65 1.65 0 0 0-1.51-1H3
            a2 2 0 0 1 0-4h.09
            a1.65 1.65 0 0 0 1.51-1
            1.65 1.65 0 0 0-.33-1.82l-.06-.06
            a2 2 0 1 1 2.83-2.83l.06.06
            a1.65 1.65 0 0 0 1.82.33
            1.65 1.65 0 0 0 1-1.51V3
            a2 2 0 0 1 4 0v.09
            a1.65 1.65 0 0 0 1 1.51
            1.65 1.65 0 0 0 1.82-.33l.06-.06
            a2 2 0 1 1 2.83 2.83l-.06.06
            a1.65 1.65 0 0 0-.33 1.82
            1.65 1.65 0 0 0 1.51 1H21
            a2 2 0 0 1 0 4h-.09
            a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
    `;

    const headerText = document.createElement("span");
    headerText.textContent = `Edit Record: ${item.__key}`;

    header.appendChild(settingsIcon);
    header.appendChild(headerText);
    module.appendChild(header);

    // --- Body Layout ---
    const body = document.createElement("div");
    body.className = "edit-body";
    body.style.cssText = `
        display: flex;
        gap: 35px;
        padding: 25px;
    `;

    // --- Left (Form Fields) ---
    const leftSection = document.createElement("div");
    leftSection.style.cssText = `
        flex: 2.5;
        display: flex;
        flex-direction: column;
    `;

    const formFields = {};
    const formGrid = document.createElement("div");
    formGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
    `;

    keys.forEach(key => {
        if (key.toLowerCase() === "photo") return;
        const fieldDiv = document.createElement("div");
        fieldDiv.style.cssText = "display: flex; flex-direction: column;";

        const label = document.createElement("label");
        label.textContent = key;
        label.style.cssText = `
            font-weight: 600;
            margin-bottom: 6px;
            color: #333;
            font-size: 0.9rem;
        `;

        const input = document.createElement("input");
        input.type = "text";
        input.value = item[key] ? String(item[key]) : "";

        const isReadOnlyKey = ["schoolname", "schoolid", "studentenrollment", "staffenrollment"].includes(key.toLowerCase());

        input.style.cssText = `
            padding: 10px 12px;
            border: 1px solid ${isReadOnlyKey ? "#ddd" : "#ccc"};
            border-radius: 10px;
            font-size: 0.95rem;
            color: ${isReadOnlyKey ? "#888" : "#333"};
            background: ${isReadOnlyKey ? "#f5f5f5" : "white"};
            outline: none;
            transition: 0.2s;
            text-transform: uppercase;
        `;
        input.disabled = isReadOnlyKey;

        if (!isReadOnlyKey) {
            input.addEventListener("focus", () => {
                input.style.borderColor = "#4CAF50";
                input.style.boxShadow = "0 0 6px rgba(76,175,80,0.4)";
            });
            input.addEventListener("blur", () => {
                input.style.borderColor = "#ccc";
                input.style.boxShadow = "none";
            });
            input.addEventListener("input", () => {
                const cursor = input.selectionStart;
                input.value = input.value.toUpperCase();
                input.setSelectionRange(cursor, cursor);
            });
        }

        fieldDiv.append(label, input);
        formFields[key] = input;
        formGrid.appendChild(fieldDiv);
    });
    leftSection.appendChild(formGrid);

    // --- Right (Photo + Buttons) ---
    const rightSection = document.createElement("div");
    rightSection.className = "photo-section";
    rightSection.style.cssText = `
        flex: 1.2;
        display: flex;
        flex-direction: column;
        align-items: center;
    `;

    const imgCard = document.createElement("div");
    imgCard.style.cssText = `
        background: #fafafa;
        border: 1px solid #eee;
        padding: 18px;
        border-radius: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        margin-bottom: 25px;
        text-align: center;
        width: 100%;
    `;

    const imgPreview = document.createElement("img");
    imgPreview.src = item.photo ?? "";
    imgPreview.alt = "Photo Preview";
    imgPreview.style.cssText = `
        width: 200px;
        height: 200px;
        object-fit: cover;
        border-radius: 14px;
        border: 1px solid #ddd;
    `;
    imgCard.appendChild(imgPreview);
    rightSection.appendChild(imgCard);

    // --- Buttons ---
    const btnDiv = document.createElement("div");
    btnDiv.style.cssText = `
        display: flex;
        justify-content: center;
        gap: 16px;
        width: 100%;
    `;

    const makeButton = (text, color1, color2) => {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.style.cssText = `
            flex: 1;
            padding: 12px 20px;
            background: linear-gradient(135deg, ${color1}, ${color2});
            color: white;
            border: none;
            border-radius: 10px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        `;
        btn.addEventListener("mouseover", () => {
            btn.style.transform = "translateY(-2px)";
            btn.style.boxShadow = "0 4px 10px rgba(0,0,0,0.2)";
        });
        btn.addEventListener("mouseout", () => {
            btn.style.transform = "none";
            btn.style.boxShadow = "none";
        });
        return btn;
    };

    const updateBtn = makeButton("Update Record", "#4CAF50", "#2e7d32");
    const cancelBtn = makeButton("Cancel", "#9e9e9e", "#616161");

    updateBtn.addEventListener("click", async () => {
        try {
            const updatedData = {};
            Object.entries(formFields).forEach(([k, v]) => {
                if (!v.disabled) updatedData[k] = v.value.trim();
            });
            if (item.photo) updatedData.photo = item.photo;

            const recordRef = dbRef(db, `DATA-MASTER/${item.__schoolName}/${item.__schoolID}/${item.__type}/${item.__key}`);
            await set(recordRef, { ...item, ...updatedData });
            alert("✅ Record updated successfully!");
            module.remove();
            await fetchDataForSchool();
        } catch (err) {
            console.error(err);
            alert("⚠️ Failed to update record: " + (err.message || err));
        }
    });

    cancelBtn.addEventListener("click", () => module.remove());

    btnDiv.append(updateBtn, cancelBtn);
    rightSection.appendChild(btnDiv);

    // --- Append to DOM ---
    body.append(leftSection, rightSection);
    module.appendChild(body);
    document.body.appendChild(module);

    // Focus first editable field
    const firstEditable = keys.find(k => !["schoolname", "schoolid", "studentenrollment", "staffenrollment", "photo"].includes(k.toLowerCase()));
    if (firstEditable) formFields[firstEditable]?.focus();
}


// =====================================================
// 🔥 NEW: Column Management Settings Module (INVERTED CHECKBOX LOGIC)
// =====================================================
function openColumnSettingsModule() {
    const type = dataTypeSelect?.value;
    if (!type || fullDataArray.length === 0) {
        alert("⚠️ Please load data first to configure columns.");
        return;
    }

    const allKeysSet = new Set();
    fullDataArray.forEach(row => Object.keys(row).forEach(k => {
        if (!k.startsWith("__")) allKeysSet.add(k);
    }));
    const allKeys = Array.from(allKeysSet);

    const currentSettings = loadColumnSettings(type);
    let columnOrder = Array.isArray(currentSettings.order) ? currentSettings.order.slice() : allKeys.slice();
    const hiddenColumns = new Set(currentSettings.hidden || []);

    // Normalize columnOrder: keep only valid keys and append missing ones
    columnOrder = columnOrder.filter(k => allKeys.includes(k));
    allKeys.forEach(k => {
        if (!columnOrder.includes(k)) columnOrder.push(k);
    });
    
    // --- Split columns into two groups based on visibility settings ---
    const shownKeys = [];
    const hiddenKeys = [];
    columnOrder.forEach(key => {
        const isShown = !hiddenColumns.has(key);
        if (isShown) {
            shownKeys.push(key);
        } else {
            hiddenKeys.push(key);
        }
    });
    // --- End Split ---


    document.getElementById("columnSettingsModule")?.remove();
    const module = document.createElement("div");
    module.id = "columnSettingsModule";
    module.style.cssText = `
        position: fixed; top: 10%; left: 50%; transform: translateX(-50%);
        background: #ffffff; padding: 25px; border-radius: 16px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2); z-index: 10001;
        min-width: 450px; max-height: 80vh; overflow-y: auto;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    module.innerHTML = `
        <h3 style="margin-top:0; color:#333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
            ⚙️ Column Settings: ${type.toUpperCase()}
        </h3>
        <div id="columnList" style="list-style: none; padding: 0;">
            <div id="shownColumnList"></div>
            <p style="margin: 15px 0; font-size: 0.9em; color: #999; text-align: center; border-top: 1px dashed #ccc; padding-top: 15px;">
                --- Hidden Columns (Drag & Drop not applicable between sections) ---
            </p>
            <div id="hiddenColumnList" style="opacity: 0.7;"></div>
        </div>
        <div style="margin-top: 25px; display: flex; justify-content: space-between; gap:12px;">
            <button id="saveColsBtn" class="px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 font-semibold">Save & Apply</button>
            <button id="resetColsBtn" class="px-3 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 font-semibold">Reset to Default</button>
            <button id="closeColsBtn" class="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 font-semibold">Cancel</button>
        </div>
        <p style="margin-top:15px; font-size:0.8rem; color:#888;">Drag and Drop to reorder. Check to SHOW the column, uncheck to HIDE.</p>
    `;

    const columnListContainer = module.querySelector("#columnList");
    const shownListDiv = module.querySelector("#shownColumnList");
    const hiddenListDiv = module.querySelector("#hiddenColumnList");
    document.body.appendChild(module);
    
    
    // --- Function to create a column item with change listener ---
    const createColumnItem = (key, isShown) => {
        const item = document.createElement("div");
        item.dataset.key = key;
        item.draggable = true;
        item.className = "column-drag-item";
        item.style.cssText = `
            display: flex; justify-content: space-between; align-items: center;
            padding: 10px 15px; margin-bottom: 8px; border: 1px solid ${isShown ? '#4CAF50' : '#ddd'};
            border-radius: 8px; cursor: move; background: #f9f9f9;
            transition: background 0.1s; ${isShown ? '' : 'opacity: 0.7;'}
        `;

        item.innerHTML = `
            <span style="font-weight: 600;">${key.toUpperCase()}</span>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                Show
                <input type="checkbox" data-col-key="${key}" ${isShown ? 'checked' : ''}>
            </label>
        `;

        const checkbox = item.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            item.style.border = `1px solid ${isChecked ? '#4CAF50' : '#ddd'}`;

            if (isChecked) {
                // Move to the shown list
                shownListDiv.appendChild(item);
                item.style.opacity = '1';
            } else {
                // Move to the hidden list
                hiddenListDiv.appendChild(item);
                item.style.opacity = '0.7';
            }
        });

        return item;
    };
    // --- End createColumnItem ---


    // Populate Lists
    shownKeys.forEach(key => {
        shownListDiv.appendChild(createColumnItem(key, true));
    });

    hiddenKeys.forEach(key => {
        hiddenListDiv.appendChild(createColumnItem(key, false));
    });


    // --- Drag-and-Drop Implementation ---
    let dragItem = null;

    [shownListDiv, hiddenListDiv].forEach(container => {
        container.addEventListener('dragstart', (e) => {
            const target = e.target.closest('[data-key]');
            if (!target) return;
            dragItem = target;
            target.classList.add('dragging');
            setTimeout(() => {
                if (dragItem) dragItem.style.opacity = '0.4';
            }, 0);
        });

        container.addEventListener('dragend', () => {
            if (dragItem) {
                // Restore opacity based on current parent container
                dragItem.style.opacity = dragItem.parentElement === shownListDiv ? '1' : '0.7';
                dragItem.classList.remove('dragging');
                dragItem = null;
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const currentContainer = e.currentTarget;

            // Only allow dragging within the current container
            if (dragItem && dragItem.parentElement === currentContainer) {
                const afterElement = getDragAfterElement(currentContainer, e.clientY);
                const draggable = dragItem;
                if (!draggable) return;

                if (afterElement == null) {
                    currentContainer.appendChild(draggable);
                } else {
                    currentContainer.insertBefore(draggable, afterElement);
                }
            }
        });
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.column-drag-item:not(.dragging)')];
        let closest = {
            offset: Number.NEGATIVE_INFINITY,
            element: null
        };
        draggableElements.forEach(child => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                closest = {
                    offset: offset,
                    element: child
                };
            }
        });
        return closest.element;
    }
    // --- End Drag-and-Drop Implementation ---


    // Reset to default (clear settings for this type)
    module.querySelector('#resetColsBtn').addEventListener('click', () => {
        if (!confirm('Are you sure you want to reset this type to default column order and visibility?')) return;
        saveColumnSettings(type, {
            order: null,
            hidden: []
        });
        module.remove();
        renderTable(fullDataArray);
        alert('✅ Settings reset successfully.');
    });

    // Save & Close Listeners
    module.querySelector('#closeColsBtn').addEventListener('click', () => module.remove());

    module.querySelector('#saveColsBtn').addEventListener('click', () => {
        const newOrder = [];
        const newHidden = [];

        // 1. Get order from SHOWN list
        shownListDiv.querySelectorAll('[data-key]').forEach(item => {
            newOrder.push(item.dataset.key);
        });

        // 2. Get order and hidden keys from HIDDEN list
        hiddenListDiv.querySelectorAll('[data-key]').forEach(item => {
            const key = item.dataset.key;
            newOrder.push(key);
            newHidden.push(key); // Items in hiddenListDiv are the new hidden columns
        });

        // Ensure saved order contains exactly the set of keys (avoid losing columns)
        const finalOrder = newOrder.slice();
        // Append any potentially missing keys (safety check, though shouldn't happen here)
        allKeys.forEach(k => {
            if (!finalOrder.includes(k)) finalOrder.push(k);
        });

        saveColumnSettings(type, {
            order: finalOrder,
            hidden: newHidden
        });

        module.remove();
        renderTable(fullDataArray);
        alert("✅ Column settings updated successfully!");
    });
}

// =====================================================
// ✅ 7. Reset All Filters
// =====================================================
function resetFilters() {
    schoolFilter.value = "";
    schoolIDSelect.innerHTML = `<option value="">Select School ID</option>`;
    schoolIDSelect.disabled = false;
    dataTypeSelect.value = "";
    tableHead.innerHTML = "";
    tableBody.innerHTML = "";
    recordCount.textContent = "";
    fullDataArray = [];
}

// =====================================================
// ✅ 8. Get Selected Table Rows
// =====================================================
function getSelectedData() {
    const selected = [];
    const type = dataTypeSelect?.value?.trim()?.toLowerCase() || "unknown";

    tableBody.querySelectorAll("tr").forEach(row => {
        const checkbox = row.querySelector("input[type='checkbox']");
        if (!checkbox?.checked) return;

        const rowKey = row.dataset.key;
        const fullRecord = fullDataArray.find(item => item.__key === rowKey);

        if (fullRecord) {
            const cleanRecord = Object.fromEntries(
                Object.entries(fullRecord).filter(([key]) => !key.startsWith("__"))
            );
            cleanRecord.type = type;
            selected.push(cleanRecord);
            return;
        }

        // Fallback: Get data from DOM
        const record = {};
        row.querySelectorAll("td[data-field]").forEach(td => {
            const field = td.dataset.field?.trim();
            const img = td.querySelector("img");
            record[field] = img ? img.src.trim() : td.textContent.trim();
        });
        record.type = type;
        selected.push(record);
    });

    return selected;
}

// =====================================================
// ✅ 9. Event Listeners
// =====================================================
schoolFilter?.addEventListener("change", e => fetchSchoolIDs(e.target.value));
dataTypeSelect?.addEventListener("change", fetchDataForSchool);
resetBtn?.addEventListener("click", resetFilters);
columnSettingBtn?.addEventListener("click", openColumnSettingsModule);

// =====================================================
// ✅ 10. Init
// =====================================================
fetchSchoolNames();

// =====================================================
// ✅ 11. Exports
// =====================================================
export {
    fetchSchoolNames,
    fetchSchoolIDs,
    fetchDataForSchool,
    resetFilters,
    getSelectedData,
    dataTypeSelect,
    schoolFilter,
    schoolIDSelect,
    resetBtn
};
