import { setImportedData, clearImportedData, showToast, dataTypeSelect } from "./Data.js";

const state = {
    rows: [],
    columns: [],
    photos: new Map(),
    photoCount: 0,
    excelName: "",
    photoName: "",
    mapping: {
        idType: "",
        type: "",
        fields: {},
    },
    photoUrls: [],
};

const studentFields = [
    { key: "enroll", label: "Enrollment Number *" },
    { key: "adm", label: "Admission Number" },
    { key: "name", label: "Student Name *" },
    { key: "class", label: "Class *" },
    { key: "section", label: "Section *" },
    { key: "roll", label: "Roll Number *" },
    { key: "dob", label: "Date of Birth" },
    { key: "father", label: "Father's Name *" },
    { key: "mother", label: "Mother's Name *" },
    { key: "contact", label: "Contact Number" },
    { key: "address", label: "Address *" },
    { key: "transport", label: "Mode of Transport *" },
    { key: "house", label: "House Name" },
    { key: "blood", label: "Blood Group" },
    { key: "photo", label: "Photo Filename" },
    { key: "schoolName", label: "School Name" },
    { key: "schoolID", label: "School ID" },
];

const staffFields = [
    { key: "enroll", label: "Enrollment Number *" },
    { key: "empid", label: "Employee ID" },
    { key: "name", label: "Name *" },
    { key: "designation", label: "Designation *" },
    { key: "father", label: "Father / Spouse Name *" },
    { key: "dob", label: "Date of Birth" },
    { key: "contact", label: "Contact Number" },
    { key: "address", label: "Address *" },
    { key: "blood", label: "Blood Group" },
    { key: "photo", label: "Photo Filename" },
    { key: "schoolName", label: "School Name" },
    { key: "schoolID", label: "School ID" },
];

function getTargetFields() {
    if (state.mapping.idType === "staff") return staffFields;
    if (state.mapping.idType === "student") return studentFields;
    return [];
}

function getColumnMappingKeys() {
    const keys = getTargetFields().map(field => `fields.${field.key}`);
    return keys;
}

function getMappedValue(fieldKey) {
    if (fieldKey.startsWith("fields.")) {
        return state.mapping.fields[fieldKey.slice(7)] || "";
    }
    return state.mapping[fieldKey] || "";
}

function setMappedValue(fieldKey, value) {
    if (fieldKey.startsWith("fields.")) {
        state.mapping.fields[fieldKey.slice(7)] = value;
    } else {
        state.mapping[fieldKey] = value;
    }
}

function clearMappedValue(fieldKey) {
    setMappedValue(fieldKey, "");
}

function isColumnMappingField(fieldKey) {
    return getColumnMappingKeys().includes(fieldKey);
}

function showPage(pageId) {
    document.querySelectorAll(".app-section").forEach(section => {
        section.classList.toggle("active", section.id === pageId);
    });
}

function normalizeKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        .replace(/\.[^.]+$/, "")
        .replace(/[\s_./-]+/g, "");
}

function readCell(row, column) {
    if (!column) return "";
    const value = row[column];
    return value === undefined || value === null ? "" : String(value).trim();
}

function firstValue(row, columns) {
    for (const column of columns) {
        const value = readCell(row, column);
        if (value) return value;
    }
    return "";
}

function inferInitialMapping() {
    const selectedType = dataTypeSelect?.value?.trim()?.toLowerCase();
    state.mapping.idType = ["student", "staff"].includes(selectedType) ? selectedType : "";
    state.mapping.fields = {};
}

function sanitizeMapping(preferredKey = "") {
    const used = new Map();
    const columnMappingKeys = getColumnMappingKeys();
    const orderedKeys = preferredKey
        ? [preferredKey, ...columnMappingKeys.filter(key => key !== preferredKey)]
        : columnMappingKeys;

    orderedKeys.forEach(key => {
        const value = getMappedValue(key);
        if (!value) return;

        if (used.has(value)) {
            clearMappedValue(key);
            return;
        }

        used.set(value, key);
    });
}

async function loadExcelFile(file) {
    if (typeof XLSX === "undefined") {
        throw new Error("XLSX library missing");
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) return [];

    const sheet = workbook.Sheets[firstSheet];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

async function loadPhotoFiles(files) {
    state.photoUrls.forEach(url => URL.revokeObjectURL(url));
    state.photoUrls = [];

    const nextPhotos = new Map();
    const imageFiles = files.filter(file => file && file.type && file.type.startsWith("image/"));
    state.photoCount = imageFiles.length;

    imageFiles.forEach(file => {
        const objectUrl = URL.createObjectURL(file);
        state.photoUrls.push(objectUrl);
        nextPhotos.set(normalizeKey(file.name), objectUrl);
        nextPhotos.set(normalizeKey(file.name.replace(/\.[^.]+$/, "")), objectUrl);
    });

    state.photos = nextPhotos;
}

function resolveType(row) {
    if (state.mapping.idType === "student" || state.mapping.idType === "staff") {
        return state.mapping.idType;
    }

    return "";
}

function resolvePhoto(row) {
    const mappedPhoto = readCell(row, state.mapping.fields.photo);
    const fallbackPhoto = firstValue(row, state.columns.filter(column => {
        const key = normalizeKey(column);
        return ["photo", "image", "picture", "filename", "photoname", "pic"].some(token => key.includes(token));
    }));
    const candidate = mappedPhoto || fallbackPhoto || "";
    const matchedPhoto = state.photos.get(normalizeKey(candidate));

    if (matchedPhoto) return matchedPhoto;
    if (candidate.startsWith("data:image") || candidate.startsWith("http")) return candidate;
    return "";
}

function mergeImportedRows() {
    return state.rows.map((row, index) => {
        const type = resolveType(row);
        const clone = {};

        getTargetFields().forEach(field => {
            const column = state.mapping.fields[field.key];
            const value = readCell(row, column);
            if (!value) return;

            clone[field.key] = value;
            if (type === "student") {
                clone[`student_${field.key}`] = value;
            } else if (type === "staff") {
                clone[`staff_${field.key}`] = value;
            }

            if (field.key === "enroll") {
                if (type === "student") clone.student_enroll = value;
                if (type === "staff") clone.staff_enroll = value;
            }
            if (field.key === "empid" && type === "staff") {
                clone.staff_empid = value;
            }
            if (field.key === "adm" && type === "student") {
                clone.student_adm = value;
            }
        });

        const recordId = type === "staff"
            ? (clone.staff_empid || clone.empid || clone.enroll || `local-${index + 1}`)
            : (clone.student_adm || clone.adm || clone.enroll || `local-${index + 1}`);
        const name = clone.name || (type === "staff" ? clone.staff_name : clone.student_name);
        const schoolName = clone.schoolName || clone.school_name || state.excelName.replace(/\.[^.]+$/, "") || "Imported Data";
        const schoolId = clone.schoolID || clone.schoolid || "";
        const photo = resolvePhoto(row);

        clone.type = type;
        clone.id = clone.id || recordId;
        clone.name = clone.name || name;
        clone.photo = photo;
        clone.schoolName = schoolName;
        clone.school_name = schoolName;
        clone.schoolID = schoolId;
        clone.schoolid = schoolId;

        if (type === "staff") {
            clone.staff_empid = clone.staff_empid || clone.empid || recordId;
            clone.staff_name = clone.staff_name || clone.name || name;
            clone.staffEnrollment = clone.staffEnrollment || clone.enroll || recordId;
        } else {
            clone.student_adm = clone.student_adm || clone.adm || clone.enroll || recordId;
            clone.student_name = clone.student_name || clone.name || name;
            clone.studentEnrollment = clone.studentEnrollment || clone.enroll || recordId;
        }

        clone.__key = String(recordId || `local-${index + 1}`);
        clone.__local = true;
        clone.__sourceLabel = state.excelName || "Imported Data";
        return clone;
    });
}

function updateStatus(extraText = "") {
    const status = document.getElementById("localImportStatus");
    if (!status) return;

    if (!state.excelName && !state.photoName) {
        status.textContent = "No file";
        return;
    }

    const rowsText = state.rows.length ? `${state.rows.length} rows` : "0 rows";
    const photosText = `${state.photoCount} photos`;
    status.textContent = extraText || `${rowsText} | ${photosText}`;
}

function option(label, value, selectedValue) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    opt.selected = value === selectedValue;
    return opt;
}

function refreshMappingSelectStates() {
    const selects = [...document.querySelectorAll(".local-map-select")];
    const usedBy = new Map();

    getColumnMappingKeys().forEach(key => {
        const value = getMappedValue(key);
        if (value) usedBy.set(value, key);
    });

    selects.forEach(select => {
        const fieldKey = select.dataset.mapField;
        select.value = fieldKey === "idType" ? state.mapping.idType : getMappedValue(fieldKey);
        select.closest(".local-map-row")?.classList.toggle("mapped", Boolean(select.value));

        if (!isColumnMappingField(fieldKey)) return;

        [...select.options].forEach(opt => {
            const owner = usedBy.get(opt.value);
            opt.disabled = Boolean(opt.value && owner && owner !== fieldKey);
            if (opt.disabled) {
                opt.textContent = `${opt.dataset.label || opt.textContent} (used)`;
            } else if (opt.dataset.label) {
                opt.textContent = opt.dataset.label;
            }
        });
    });
}

function buildColumnSelect(field) {
    const select = document.createElement("select");
    select.className = "local-map-select";
    select.dataset.mapField = field.mapKey || field.key;

    if (field.kind === "idType") {
        select.append(
            option("Select ID Type", "", state.mapping.idType),
            option("Student", "student", state.mapping.idType),
            option("Staff", "staff", state.mapping.idType)
        );
    } else {
        const selectedValue = getMappedValue(select.dataset.mapField);
        select.appendChild(option("Not mapped", "", selectedValue));
        state.columns.forEach(column => {
            const opt = option(column, column, selectedValue);
            opt.dataset.label = column;
            select.appendChild(opt);
        });
    }

    select.addEventListener("change", () => {
        const fieldKey = select.dataset.mapField;

        if (field.kind === "idType") {
            state.mapping.idType = select.value;
            state.mapping.fields = {};
            sanitizeMapping();
            renderMappingPanel();
            return;
        }

        setMappedValue(fieldKey, select.value);
        if (isColumnMappingField(fieldKey) && select.value) {
            getColumnMappingKeys().forEach(key => {
                if (key !== fieldKey && getMappedValue(key) === select.value) {
                    clearMappedValue(key);
                }
            });
        }
        sanitizeMapping(fieldKey);
        refreshMappingSelectStates();
    });

    return select;
}

function renderMappingPanel() {
    const panel = document.getElementById("localMappingPanel");
    const empty = document.getElementById("localMappingEmpty");
    if (!panel) return;

    if (!state.rows.length) {
        panel.hidden = true;
        panel.innerHTML = "";
        if (empty) empty.hidden = false;
        return;
    }

    panel.hidden = false;
    if (empty) empty.hidden = true;
    panel.innerHTML = "";

    const header = document.createElement("div");
    header.className = "local-mapping-header";
    header.innerHTML = `
        <div>
            <div class="local-mapping-kicker">Column mapping</div>
            <h4>Match Excel Columns</h4>
        </div>
        <span>${state.columns.length} columns</span>
    `;

    const typeGrid = document.createElement("div");
    typeGrid.className = "local-mapping-type-grid";

    [
        { key: "idType", label: "1. Select ID Type First", kind: "idType" },
    ].forEach(field => {
        const row = document.createElement("label");
        row.className = field.kind === "idType" ? "local-map-row local-map-row-primary" : "local-map-row";
        const text = document.createElement("span");
        text.textContent = field.label;
        row.append(text, buildColumnSelect(field));
        typeGrid.appendChild(row);
    });

    if (!state.mapping.idType) {
        const locked = document.createElement("div");
        locked.className = "local-mapping-step-locked";
        locked.textContent = "Select Student or Staff first to show column mapping fields.";
        panel.append(header, typeGrid, locked);
        refreshMappingSelectStates();
        return;
    }

    const sectionTitle = document.createElement("div");
    sectionTitle.className = "local-target-fields-title";
    sectionTitle.innerHTML = `<span>2. Map ${state.mapping.idType === "staff" ? "Staff" : "Student"} Fields</span>`;

    const grid = document.createElement("div");
    grid.className = "local-mapping-grid";

    getTargetFields().forEach(field => {
        const row = document.createElement("label");
        row.className = "local-map-row";
        const text = document.createElement("span");
        text.textContent = field.label;
        row.append(text, buildColumnSelect({
            ...field,
            mapKey: `fields.${field.key}`
        }));
        grid.appendChild(row);
    });

    const hint = document.createElement("div");
    hint.className = "local-mapping-hint";
    hint.textContent = "Only mapped fields will be loaded into the data table. Each Excel column can only be assigned to one target field.";

    const actions = document.createElement("div");
    actions.className = "local-mapping-actions";

    const applyBtn = document.createElement("button");
    applyBtn.id = "applyLocalMappingBtn";
    applyBtn.className = "action-btn primary-style";
    applyBtn.innerHTML = '<i data-lucide="check" class="icon-sm"></i> Apply Mapping';
    applyBtn.addEventListener("click", publishImportedData);

    actions.appendChild(applyBtn);
    panel.append(header, typeGrid, sectionTitle, grid, hint, actions);
    refreshMappingSelectStates();

    if (typeof lucide !== "undefined" && lucide.createIcons) {
        lucide.createIcons();
    }
}

async function publishImportedData() {
    if (!state.rows.length) {
        updateStatus();
        return;
    }

    if (!state.mapping.idType) {
        showToast("Please select ID Type first", "warning");
        return;
    }

    sanitizeMapping();
    refreshMappingSelectStates();

    const mergedRows = mergeImportedRows();
    const types = [...new Set(mergedRows.map(row => String(row.type || "").trim().toLowerCase()).filter(Boolean))];
    const defaultType = types.length === 1 ? types[0] : "";

    setImportedData(mergedRows, {
        label: state.excelName.replace(/\.[^.]+$/, "") || "Imported Data",
        fileName: state.excelName,
        photoCount: state.photoCount,
        type: defaultType,
    });

    updateStatus();
    showToast(`Mapped ${mergedRows.length} record(s)`, "success");
    showPage("page-1");
}

async function handleExcelChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        state.excelName = file.name;
        state.rows = await loadExcelFile(file);
        state.columns = [...new Set(state.rows.flatMap(row => Object.keys(row)))];

        if (!state.rows.length) {
            showToast("Excel file has no rows", "warning");
            updateStatus("No rows found");
            renderMappingPanel();
            return;
        }

        inferInitialMapping();
        renderMappingPanel();
        updateStatus();
        showToast(`Loaded ${state.rows.length} row(s). Check mapping and apply.`, "success");
    } catch (err) {
        console.error("Excel import failed:", err);
        showToast("Unable to load Excel file", "error");
        updateStatus("Excel error");
    }
}

async function handlePhotoChange(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
        state.photoName = files[0]?.webkitRelativePath ? files[0].webkitRelativePath.split("/")[0] : "Photos";
        await loadPhotoFiles(files);
        updateStatus();
        showToast(`Loaded ${state.photoCount} photo(s)`, "success");
    } catch (err) {
        console.error("Photo import failed:", err);
        showToast("Unable to load photo folder", "error");
        updateStatus("Photo error");
    }
}

async function handleClearLocal() {
    state.rows = [];
    state.columns = [];
    state.photoUrls.forEach(url => URL.revokeObjectURL(url));
    state.photoUrls = [];
    state.photos = new Map();
    state.photoCount = 0;
    state.excelName = "";
    state.photoName = "";
    state.mapping = {
        idType: "",
        type: "",
        fields: {},
    };

    const excelInput = document.getElementById("localExcelUpload");
    const photoInput = document.getElementById("localPhotoFolderUpload");
    if (excelInput) excelInput.value = "";
    if (photoInput) photoInput.value = "";

    clearImportedData();
    renderMappingPanel();
    updateStatus();
    showToast("Import cleared", "success");
}

document.addEventListener("DOMContentLoaded", () => {
    const excelInput = document.getElementById("localExcelUpload");
    const photoInput = document.getElementById("localPhotoFolderUpload");
    const clearBtn = document.getElementById("clearLocalImportBtn");
    const openBtn = document.getElementById("openLocalImportBtn");
    const backBtn = document.getElementById("backFromLocalImportBtn");

    excelInput?.addEventListener("change", handleExcelChange);
    photoInput?.addEventListener("change", handlePhotoChange);
    clearBtn?.addEventListener("click", handleClearLocal);
    openBtn?.addEventListener("click", () => showPage("page-4"));
    backBtn?.addEventListener("click", () => showPage("page-1"));

    renderMappingPanel();
    updateStatus();
});
