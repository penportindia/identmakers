import { firebaseConfig } from "../Database/Database.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getDatabase, ref as dbRef, get, set, remove } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

function initCustomSelect(selectId) {
    const inputElement = document.getElementById(selectId);
    const displayElement = document.getElementById(selectId + "Display");
    const dropdownElement = document.getElementById(selectId + "Dropdown");
    const searchElement = dropdownElement.querySelector(".custom-select-search");
    const optionsElement = dropdownElement.querySelector(".custom-select-options");
    const wrapper = displayElement.closest(".custom-select-wrapper");

    let allOptions = [];

    const toggleDropdown = (show) => {
        if (show === undefined) show = !wrapper.classList.contains("open");
        if (show) {
            wrapper.classList.add("open");
            searchElement.focus();
            searchElement.value = "";
            filterOptions("");
        } else {
            wrapper.classList.remove("open");
        }
    };

    const filterOptions = (query) => {
        const lowerQuery = query.toLowerCase();
        optionsElement.querySelectorAll("li").forEach(option => {
            const text = option.textContent.toLowerCase();
            const matches = text.includes(lowerQuery);
            option.classList.toggle("hidden", !matches);
        });
    };

    const selectOption = (value, text) => {
        inputElement.value = value;
        const textSpan = displayElement.querySelector(".custom-select-text");
        textSpan.textContent = text || "Select...";
        toggleDropdown(false);
        inputElement.dispatchEvent(new Event("change", { bubbles: true }));
    };

    displayElement.addEventListener("click", () => toggleDropdown());

    searchElement.addEventListener("input", (e) => {
        filterOptions(e.target.value);
    });

    optionsElement.addEventListener("click", (e) => {
        const option = e.target.closest("li");
        if (option && !option.classList.contains("hidden")) {
            selectOption(option.dataset.value, option.textContent);
        }
    });

    document.addEventListener("click", (e) => {
        if (!wrapper.contains(e.target)) {
            toggleDropdown(false);
        }
    });

    return { selectOption, updateOptions: (options) => { allOptions = options; } };
}

function populateCustomSelect(selectId, options, defaultText = "Select...") {
    const optionsElement = document.getElementById(selectId + "Dropdown").querySelector(".custom-select-options");
    optionsElement.innerHTML = options.map(opt => 
        `<li data-value="${opt.value}">${opt.label}</li>`
    ).join("");
}

const dataTypeSelect = document.getElementById("dataTypeSelect");
const schoolFilter = document.getElementById("schoolFilter");
const schoolIDSelect = document.getElementById("schoolIDSelect");
const resetBtn = document.getElementById("resetBtn");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");
const recordCount = document.getElementById("recordCount");
const columnSettingBtn = document.getElementById("columnSettingBtn");

initCustomSelect("dataTypeSelect");
initCustomSelect("schoolFilter");
initCustomSelect("schoolIDSelect");

let fullDataArray = [];
let dataSourceMode = "remote";
let dataSourceLabel = "Database";
const SETTINGS_KEY = "table_column_settings_v1"; 

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

function normalizeKey(k) {
    return String(k || "").trim();
}

function normalizeFieldKey(k) {
    return String(k || "").trim().toLowerCase().replace(/[_\s]+/g, "");
}

function isNullishDisplayValue(value) {
    if (value === null || value === undefined) return true;
    const normalized = String(value).trim();
    return normalized === "" || /^(n\/?a|na|null|undefined)$/i.test(normalized);
}

function getPreferredColumnKeys(allKeys, currentDataType) {
    const groups = new Map();

    allKeys.forEach(key => {
        const normalized = normalizeFieldKey(key);
        const base = normalized.replace(/^(student|staff)/, "");
        const groupKey = base.replace(/^_*/, "");
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push(key);
    });

    const preferredKeys = [];
    groups.forEach(groupKeys => {
        const findByPrefix = (prefix) => groupKeys.find(k => normalizeFieldKey(k).startsWith(prefix));
        const preferred = currentDataType === "student"
            ? findByPrefix("student") || findByPrefix("")
            : currentDataType === "staff"
                ? findByPrefix("staff") || findByPrefix("")
                : groupKeys[0];
        if (!preferredKeys.includes(preferred)) preferredKeys.push(preferred);
    });

    return preferredKeys;
}

async function fetchSchoolNames() {
    if (!schoolFilter || dataSourceMode === "local") return;

    try {
        const snapshot = await get(dbRef(db, "DATA-MASTER"));
        const schools = snapshot.exists() ? Object.keys(snapshot.val()).sort() : [];
        const options = schools.map(name => ({ value: name, label: name }));
        populateCustomSelect("schoolFilter", options);
    } catch (err) {
        console.error("Error fetching school names:", err);
        showToast("Failed to load school list", "error");
    }
}

async function fetchSchoolIDs(schoolName) {
    if (!schoolName || !schoolIDSelect || dataSourceMode === "local") return;

    schoolIDSelect.innerHTML = "";
    fullDataArray = [];
    renderTable([]);

    try {
        const snapshot = await get(dbRef(db, `DATA-MASTER/${schoolName}`));
        const ids = snapshot.exists() ? Object.keys(snapshot.val()).sort() : [];

        if (ids.length > 0) {
            const options = ids.map(id => ({ value: id, label: id }));
            populateCustomSelect("schoolIDSelect", options);
            
            schoolIDSelect.value = ids[0];
            const schoolIDDisplay = document.getElementById("schoolIDSelectDisplay");
            if (schoolIDDisplay) {
                schoolIDDisplay.querySelector(".custom-select-text").textContent = ids[0];
            }
            await fetchDataForSchool();
        } else {
            populateCustomSelect("schoolIDSelect", []);
            showToast("No IDs found for this school", "warning");
        }
    } catch (err) {
        console.error("Error fetching school IDs:", err);
        showToast("Failed to load school IDs", "error");
    }
}

async function fetchDataForSchool() {
    if (dataSourceMode === "local") return;
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
        console.error("âŒ Error fetching data:", err);
        showToast("Failed to load school data", "error");
    }
}

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
    
    const keysSet = new Set();
    dataArray.forEach(row => Object.keys(row).forEach(k => { if (!k.startsWith("__")) keysSet.add(k); }));
    const allKeys = Array.from(keysSet);

    const settings = loadColumnSettings(currentDataType);

    
    let finalOrder = Array.isArray(settings.order) ? settings.order.slice() : [];
    finalOrder = finalOrder.filter(k => allKeys.includes(k));

    const preferredKeys = getPreferredColumnKeys(allKeys, currentDataType);
    preferredKeys.forEach(k => {
        if (!finalOrder.includes(k)) finalOrder.push(k);
    });

    allKeys.forEach(k => { if (!finalOrder.includes(k)) finalOrder.push(k); });

    const hiddenColumns = new Set(settings.hidden || []);
    const keysToDisplay = finalOrder.filter(key => !hiddenColumns.has(key));

    
    const headerRow = document.createElement("tr");

    
    const selectAllTh = document.createElement("th");
    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.addEventListener("change", function () {
        tableBody.querySelectorAll("input[type='checkbox']").forEach(cb => cb.checked = this.checked);
    });
    selectAllTh.appendChild(selectAllCheckbox);
    headerRow.appendChild(selectAllTh);

    
    keysToDisplay.forEach(key => {
        const th = document.createElement("th");
        th.textContent = key;
        headerRow.appendChild(th);
    });

    
    const editTh = document.createElement("th");
    editTh.textContent = "Action";
    headerRow.appendChild(editTh);

    tableHead.appendChild(headerRow);

    
    dataArray.forEach(item => {
        const tr = document.createElement("tr");
        tr.dataset.key = item.__key;

        
        const cbTd = document.createElement("td");
        const cbInput = document.createElement("input");
        cbInput.type = "checkbox";
        cbTd.appendChild(cbInput);
        tr.appendChild(cbTd);

        
        keysToDisplay.forEach(key => {
            const td = document.createElement("td");
            td.classList.add("border", "p-2");
            td.dataset.field = key;

            const rawValue = item[key];
            const val = isNullishDisplayValue(rawValue) ? "" : String(rawValue).trim();

            if (key.toLowerCase() === "photo" && val) {
                const img = document.createElement("img");
                img.src = val;
                img.alt = "Photo";
                img.loading = "lazy";
                img.style.cssText = "width:50px;height:50px;object-fit:cover;border-radius:4px;cursor:pointer;";
                img.addEventListener("click", () => showImagePreview(val));
                td.appendChild(img);
            } else {
                td.textContent = val;
            }

            tr.appendChild(td);
        });

        
        const editTd = document.createElement("td");
        const editBtn = document.createElement("button");
        const isLocalRecord = Boolean(item.__local);
        editBtn.innerHTML = isLocalRecord
            ? `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
                <rect x="3" y="11" width="18" height="10" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Imported
        `
            : `
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
            background: linear-gradient(45deg, #10b981, #059669);
            color: white;
            border: none;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease;
        `;
        if (isLocalRecord) {
            editBtn.disabled = true;
            editBtn.title = "Imported data edit disabled";
            editBtn.style.opacity = "0.6";
            editBtn.style.cursor = "not-allowed";
        } else {
            editBtn.onmouseover = function() {
                this.style.transform = "translateY(-1px)";
                this.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.15)";
            };
            editBtn.onmouseout = function() {
                this.style.transform = "none";
                this.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
            };
            editBtn.addEventListener("click", () => openEditModule(item, finalOrder));
        }

        editTd.appendChild(editBtn);
        tr.appendChild(editTd);

        tableBody.appendChild(tr);
    });
}

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

function openEditModule(item, keys) {
    document.getElementById("editModule")?.remove();

    
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

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        #editModule .settings-icon:hover {
            animation: spin 1s linear infinite;
        }
    `;
    document.head.appendChild(styleTag);

    
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

    
    const body = document.createElement("div");
    body.className = "edit-body";
    body.style.cssText = `
        display: flex;
        gap: 35px;
        padding: 25px;
    `;

    
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
    const deleteBtn = makeButton("Delete Record", "#ef4444", "#b91c1c");

    updateBtn.addEventListener("click", async () => {
        try {
            const updatedData = {};
            Object.entries(formFields).forEach(([k, v]) => {
                if (!v.disabled) updatedData[k] = v.value.trim();
            });
            if (item.photo) updatedData.photo = item.photo;

            const recordRef = dbRef(db, `DATA-MASTER/${item.__schoolName}/${item.__schoolID}/${item.__type}/${item.__key}`);
            await set(recordRef, { ...item, ...updatedData });
            showToast("Record updated", "success");
            module.remove();
            await fetchDataForSchool();
        } catch (err) {
            console.error(err);
            showToast("Failed to update record: " + (err.message || err), "error");
        }
    });

    deleteBtn.addEventListener("click", async () => {
        if (!confirm("Delete this record permanently? This cannot be undone.")) return;
        try {
            if (item.__local) {
                fullDataArray = fullDataArray.filter(row => row.__key !== item.__key);
                renderTable(fullDataArray);
                showToast("Record deleted from current dataset", "success");
                module.remove();
                return;
            }

            const recordRef = dbRef(db, `DATA-MASTER/${item.__schoolName}/${item.__schoolID}/${item.__type}/${item.__key}`);
            await remove(recordRef);
            showToast("Record deleted permanently", "success");
            module.remove();
            await fetchDataForSchool();
        } catch (err) {
            console.error(err);
            showToast("Failed to delete record: " + (err.message || err), "error");
        }
    });

    cancelBtn.addEventListener("click", () => module.remove());

    btnDiv.append(updateBtn, deleteBtn, cancelBtn);
    rightSection.appendChild(btnDiv);

    
    body.append(leftSection, rightSection);
    module.appendChild(body);
    document.body.appendChild(module);

    
    const firstEditable = keys.find(k => !["schoolname", "schoolid", "studentenrollment", "staffenrollment", "photo"].includes(k.toLowerCase()));
    if (firstEditable) formFields[firstEditable]?.focus();
}

function openColumnSettingsModule() {
    const type = dataTypeSelect?.value;
    if (!type || fullDataArray.length === 0) {
        showToast("Please load data first to configure columns", "warning");
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

    
    columnOrder = columnOrder.filter(k => allKeys.includes(k));
    allKeys.forEach(k => {
        if (!columnOrder.includes(k)) columnOrder.push(k);
    });
    
    
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
    

    document.getElementById("columnSettingsModule")?.remove();
    const module = document.createElement("div");
    module.id = "columnSettingsModule";
    module.innerHTML = `
        <div class="column-modal-header">
            <div>
                <div class="column-modal-kicker">Table setup</div>
                <h3>Column Settings</h3>
            </div>
            <span class="column-type-badge">${type.toUpperCase()}</span>
        </div>
        <div class="column-modal-body">
            <div class="column-help-row">
                <span>Drag visible columns to reorder.</span>
                <span>Turn off a column to hide it.</span>
            </div>
            <div id="columnList" class="column-list-layout">
                <section class="column-section">
                    <div class="column-section-header">
                        <span>Visible Columns</span>
                        <b id="shownColumnCount">${shownKeys.length}</b>
                    </div>
                    <div id="shownColumnList" class="column-list"></div>
                </section>
                <section class="column-section muted">
                    <div class="column-section-header">
                        <span>Hidden Columns</span>
                        <b id="hiddenColumnCount">${hiddenKeys.length}</b>
                    </div>
                    <div id="hiddenColumnList" class="column-list"></div>
                </section>
            </div>
        </div>
        <div class="column-modal-footer">
            <button id="resetColsBtn" class="action-btn secondary-style">Reset</button>
            <div class="column-footer-actions">
                <button id="closeColsBtn" class="action-btn tertiary-style">Cancel</button>
                <button id="saveColsBtn" class="action-btn primary-style">Save & Apply</button>
            </div>
        </div>
    `;

    document.body.appendChild(module);

    const shownListDiv = module.querySelector("#shownColumnList");
    const hiddenListDiv = module.querySelector("#hiddenColumnList");
    const shownCount = module.querySelector("#shownColumnCount");
    const hiddenCount = module.querySelector("#hiddenColumnCount");

    const updateColumnCounts = () => {
        if (shownCount) shownCount.textContent = shownListDiv.querySelectorAll("[data-key]").length;
        if (hiddenCount) hiddenCount.textContent = hiddenListDiv.querySelectorAll("[data-key]").length;
    };
    
    
    
    const createColumnItem = (key, isShown) => {
        const item = document.createElement("div");
        item.dataset.key = key;
        item.draggable = true;
        item.className = "column-drag-item";

        const handle = document.createElement("span");
        handle.className = "column-drag-handle";
        handle.textContent = "::";

        const span = document.createElement("span");
        span.className = "column-name";
        span.textContent = key.toUpperCase();

        const label = document.createElement("label");
        label.className = "column-toggle";

        const labelText = document.createElement("span");
        labelText.textContent = "Visible";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.colKey = key;
        checkbox.checked = isShown;

        label.appendChild(checkbox);
        label.appendChild(labelText);

        item.appendChild(handle);
        item.appendChild(span);
        item.appendChild(label);
        checkbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;

            if (isChecked) {
                shownListDiv.appendChild(item);
            } else {
                hiddenListDiv.appendChild(item);
            }
            updateColumnCounts();
        });

        return item;
    };
    

    
    shownKeys.forEach(key => {
        shownListDiv.appendChild(createColumnItem(key, true));
    });

    hiddenKeys.forEach(key => {
        hiddenListDiv.appendChild(createColumnItem(key, false));
    });
    updateColumnCounts();

    
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
                
                dragItem.style.opacity = dragItem.parentElement === shownListDiv ? '1' : '0.7';
                dragItem.classList.remove('dragging');
                dragItem = null;
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const currentContainer = e.currentTarget;

            
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
    

    
    module.querySelector('#resetColsBtn').addEventListener('click', () => {
        if (!confirm('Reset column settings to default?')) return;
        saveColumnSettings(type, {
            order: null,
            hidden: []
        });
        module.remove();
        renderTable(fullDataArray);
        showToast('Columns reset to default', "success");
    });

    
    module.querySelector('#closeColsBtn').addEventListener('click', () => module.remove());

    module.querySelector('#saveColsBtn').addEventListener('click', () => {
        const newOrder = [];
        const newHidden = [];

        
        shownListDiv.querySelectorAll('[data-key]').forEach(item => {
            newOrder.push(item.dataset.key);
        });

        
        hiddenListDiv.querySelectorAll('[data-key]').forEach(item => {
            const key = item.dataset.key;
            newOrder.push(key);
            newHidden.push(key); 
        });

        
        const finalOrder = newOrder.slice();
        
        allKeys.forEach(k => {
            if (!finalOrder.includes(k)) finalOrder.push(k);
        });

        saveColumnSettings(type, {
            order: finalOrder,
            hidden: newHidden
        });

        module.remove();
        renderTable(fullDataArray);
        showToast("Column settings updated", "success");
    });
}

function showToast(message, type = "info", duration = 3000) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 14px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 9999;
        animation: slideInUp 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;

    const bgColors = {
        success: "linear-gradient(135deg, #10b981, #059669)",
        error: "linear-gradient(135deg, #ef4444, #dc2626)",
        info: "linear-gradient(135deg, #3b82f6, #0284c7)",
        warning: "linear-gradient(135deg, #f59e0b, #d97706)"
    };

    toast.style.background = bgColors[type] || bgColors.info;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = "slideOutDown 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function resetFilters() {
    if (dataSourceMode === "local") {
        dataSourceMode = "remote";
        dataSourceLabel = "Database";
    }
    schoolFilter.value = "";
    const schoolFilterDisplay = document.getElementById("schoolFilterDisplay");
    if (schoolFilterDisplay) {
        schoolFilterDisplay.querySelector(".custom-select-text").textContent = "Select School";
    }
    
    schoolIDSelect.value = "";
    const schoolIDDisplay = document.getElementById("schoolIDSelectDisplay");
    if (schoolIDDisplay) {
        schoolIDDisplay.querySelector(".custom-select-text").textContent = "Select School ID";
    }
    
    dataTypeSelect.value = "";
    const dataTypeDisplay = document.getElementById("dataTypeSelectDisplay");
    if (dataTypeDisplay) {
        dataTypeDisplay.querySelector(".custom-select-text").textContent = "Select ID Type";
    }
    
    tableHead.innerHTML = "";
    tableBody.innerHTML = "";
    recordCount.textContent = "";
    fullDataArray = [];
}

function setImportedData(records, meta = {}) {
    dataSourceMode = "local";
    dataSourceLabel = meta.label || meta.fileName || "Imported Data";
    fullDataArray = Array.isArray(records) ? records.map((record, index) => ({
        ...record,
        __key: record.__key || `local-${index}-${crypto.randomUUID()}`,
        __local: true,
        __sourceLabel: dataSourceLabel
    })) : [];

    const schoolFilterDisplay = document.getElementById("schoolFilterDisplay");
    if (schoolFilterDisplay) {
        schoolFilterDisplay.querySelector(".custom-select-text").textContent = dataSourceLabel;
    }
    const schoolIDDisplay = document.getElementById("schoolIDSelectDisplay");
    if (schoolIDDisplay) {
        schoolIDDisplay.querySelector(".custom-select-text").textContent = meta.photoCount ? `${meta.photoCount} photos` : "Uploaded Files";
    }
    if (schoolFilter) schoolFilter.value = "__LOCAL__";
    if (schoolIDSelect) schoolIDSelect.value = "__LOCAL__";
    if (dataTypeSelect) dataTypeSelect.value = meta.type || "";

    localStorage.removeItem("selectedRecords");
    renderTable(fullDataArray);
}

function clearImportedData() {
    dataSourceMode = "remote";
    dataSourceLabel = "Database";
    resetFilters();
}

function getDataSourceInfo() {
    return { mode: dataSourceMode, label: dataSourceLabel };
}

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
            cleanRecord.type = String(cleanRecord.type || type || "unknown").toLowerCase();
            cleanRecord.school_name = fullRecord.__schoolName || cleanRecord.school_name || "";
            cleanRecord.schoolid = fullRecord.__schoolID || cleanRecord.schoolid || "";
            cleanRecord.schoolName = fullRecord.__schoolName || cleanRecord.schoolName || "";
            cleanRecord.schoolID = fullRecord.__schoolID || cleanRecord.schoolID || "";
            selected.push(cleanRecord);
            return;
        }

        
        const record = {};
        row.querySelectorAll("td[data-field]").forEach(td => {
            const field = td.dataset.field?.trim();
            const img = td.querySelector("img");
        record[field] = img ? img.src.trim() : td.textContent.trim();
    });
        record.type = String(record.type || type || "unknown").toLowerCase();
        selected.push(record);
    });

    return selected;
}

schoolFilter?.addEventListener("change", e => fetchSchoolIDs(e.target.value));
dataTypeSelect?.addEventListener("change", fetchDataForSchool);
resetBtn?.addEventListener("click", resetFilters);
columnSettingBtn?.addEventListener("click", openColumnSettingsModule);

fetchSchoolNames();

export {
    fetchSchoolNames,
    fetchSchoolIDs,
    fetchDataForSchool,
    resetFilters,
    setImportedData,
    clearImportedData,
    getDataSourceInfo,
    getSelectedData,
    showToast,
    dataTypeSelect,
    schoolFilter,
    schoolIDSelect,
    resetBtn
};
