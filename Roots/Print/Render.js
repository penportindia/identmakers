import {
    fetchDataForSchool,
    resetFilters,
    getSelectedData,
    dataTypeSelect,
    schoolFilter,
    resetBtn,
    schoolIDSelect
} from './Data.js';

let templateData = null;
let templateFileName = "Custom Template";
let renderedData = [];
let cropper = null;
let renderJobId = 0;

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

const BATCH_DB_NAME = "proIdBatchStorage";
const BATCH_DB_VERSION = 1;
const BATCH_STORE_NAME = "batches";
const BATCH_STORAGE_KEY = "all";

function openBatchDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error("IndexedDB is not supported in this browser"));
            return;
        }

        const request = indexedDB.open(BATCH_DB_NAME, BATCH_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(BATCH_STORE_NAME)) {
                db.createObjectStore(BATCH_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function readBatchStore() {
    const db = await openBatchDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(BATCH_STORE_NAME, "readonly");
        const store = tx.objectStore(BATCH_STORE_NAME);
        const request = store.get(BATCH_STORAGE_KEY);
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : null);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

async function writeBatchStore(batches) {
    const db = await openBatchDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(BATCH_STORE_NAME, "readwrite");
        const store = tx.objectStore(BATCH_STORE_NAME);
        store.put(batches, BATCH_STORAGE_KEY);
        tx.oncomplete = () => {
            db.close();
            localStorage.removeItem("cardBatches");
            resolve();
        };
        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

async function getBatches() {
    try {
        const storedBatches = await readBatchStore();
        if (storedBatches) return storedBatches;

        const legacyBatches = JSON.parse(localStorage.getItem("cardBatches") || "[]");
        if (legacyBatches.length) {
            await writeBatchStore(legacyBatches);
        }
        return legacyBatches;
    } catch (err) {
        console.error("Failed to read saved batches:", err);
        showToast("Unable to load saved batches", "error");
        return [];
    }
}

async function setBatches(batches) {
    try {
        await writeBatchStore(batches);
    } catch (err) {
        console.error("Failed to save batches:", err);
        showToast("Unable to save batch. Browser storage may be full or blocked.", "error", 5000);
        throw err;
    }
}

async function clearBatches() {
    await setBatches([]);
    localStorage.removeItem("cardBatches");
}

function capitalize(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getRecordValue(record, key) {
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (!normalizedKey) return "";

    for (const [origKey, value] of Object.entries(record || {})) {
        const candidate = String(origKey).trim().toLowerCase();
        if (candidate === normalizedKey) return value;
        if (candidate.replace(/[_\s]/g, '') === normalizedKey.replace(/[_\s]/g, '')) return value;
    }
    return "";
}

document.addEventListener("DOMContentLoaded", () => {
    dataTypeSelect?.addEventListener("change", fetchDataForSchool);
    schoolFilter?.addEventListener("change", fetchDataForSchool);
    resetBtn?.addEventListener("click", resetFilters);

    
    document.getElementById("generateBtn")?.addEventListener("click", handleGenerateClick);

    
    document.getElementById("goToDataBtn")?.addEventListener("click", handleBackToData);
    document.getElementById("templateUpload")?.addEventListener("change", handleTemplateUpload);
    document.getElementById("renderBtn")?.addEventListener("click", handleRenderClick);
    document.getElementById("printBtn")?.addEventListener("click", handleA4Print);


    
    document.getElementById("goToBatchBtn")?.addEventListener("click", () => togglePages("page-2", "page-3"));
    document.getElementById("backToRendererBtn")?.addEventListener("click", () => togglePages("page-3", "page-2"));

    
    attachBatchListenersAndRender();
});

function updateProgress(step) {
    document.querySelectorAll(".progress-step").forEach((el, i) => {
        if (i + 1 < step) {
            el.classList.remove("active");
            el.classList.add("completed");
        } else if (i + 1 === step) {
            el.classList.add("active");
            el.classList.remove("completed");
        } else {
            el.classList.remove("active", "completed");
        }
    });
}

function attachBatchListenersAndRender() {
    const controls = document.getElementById("page-3-controls");
    if (!controls) return;

    controls.innerHTML = '';

    const toolbar = document.createElement("div");
    toolbar.classList.add("batch-toolbar");

    
    const saveBtn = document.createElement("button");
    saveBtn.id = "saveCurrentRenderBtn";
    saveBtn.innerHTML = '<i data-lucide="save" class="icon-sm"></i> Save Current Render';
    saveBtn.classList.add("action-btn", "primary-style");
    saveBtn.addEventListener("click", saveCurrentBatch);
    toolbar.appendChild(saveBtn);

    
    const actionContainer = document.createElement("div");
    actionContainer.id = "printClearActions";
    actionContainer.classList.add("batch-actions-stack");

    
    const printAllBtn = document.createElement("button");
    printAllBtn.id = "printAllBatchesBtn";
    printAllBtn.innerHTML = '<i data-lucide="printer" class="icon-sm"></i> Print All Batches';
    printAllBtn.classList.add("action-btn", "print-style");
    printAllBtn.addEventListener("click", handlePrintAllBatches);
    actionContainer.appendChild(printAllBtn);

    
    const clearBtn = document.createElement("button");
    clearBtn.id = "clearBatchesBtn";
    clearBtn.innerHTML = '<i data-lucide="trash-2" class="icon-sm"></i> Clear All Batches';
    clearBtn.classList.add("action-btn", "delete-style");
    clearBtn.addEventListener("click", async () => {
        if (confirm("Clear all saved batches? This cannot be undone.")) {
            await clearBatches();
            await renderBatchList();
            showToast("All batches cleared", "success");
        }
    });
    actionContainer.appendChild(clearBtn);

    toolbar.appendChild(actionContainer);
    controls.appendChild(toolbar);

    
    const listContainer = document.createElement("div");
    listContainer.classList.add("batch-list-wrapper");
    listContainer.innerHTML = `
        <div class="batch-list-heading">
            <h3 class="data-title">Saved Batches</h3>
            <span id="batchCountBadge" class="stat-badge">0 batches</span>
        </div>
    `;
    const list = document.createElement("div");
    list.id = "batchList";
    list.classList.add("batch-list-container");
    listContainer.appendChild(list);
    controls.appendChild(listContainer);

    
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    renderBatchList();
}

function togglePages(hideId, showId) {
    document.getElementById(hideId)?.classList.remove("active");
    document.getElementById(showId)?.classList.add("active");
    if (showId === 'page-3') {
        renderBatchList();
    }
}

function handleGenerateClick() {
    const selected = getSelectedData();
    if (!selected?.length) {
        showToast("Please select at least one record", "warning");
        return;
    }

    const type = dataTypeSelect?.value?.toLowerCase() || "unknown";
    const selectedWithType = selected.map(r => ({
        ...r,
        type: String(r.type || type || "unknown").toLowerCase(),
        __key: r.__key || crypto.randomUUID()
    }));

    try {
        localStorage.setItem("selectedRecords", JSON.stringify(selectedWithType));
    } catch (err) {
        console.error("Selected records save failed:", err);
        showToast("Selected records bahut zyada large hain. Extra columns kam karke dobara try karein.", "error", 5000);
        return;
    }
    templateData = null;
    document.getElementById("slidesWrapper").innerHTML = "";

    updateProgress(2);
    togglePages("page-1", "page-2");
    showToast(`${selectedWithType.length} record(s) selected`, "success");
}

function handleBackToData() {
    const wrapper = document.getElementById("slidesWrapper");
    if (wrapper) wrapper.innerHTML = "";

    
    templateData = null;
    templateFileName = "Custom Template";
    renderedData = [];
    const tplInput = document.getElementById("templateUpload");
    if (tplInput) tplInput.value = "";

    document.querySelectorAll(".uploaded-template, .rendered-card").forEach(el => el.remove());

    togglePages("page-2", "page-1");
}

function handleTemplateUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        showToast("No file selected", "warning");
        return;
    }

    templateFileName = file.name || templateFileName;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            templateData = JSON.parse(e.target.result);
            templateData._fileName = templateFileName;
            document.getElementById("slidesWrapper").innerHTML = "";
            showToast("Template uploaded successfully", "success");
        } catch (err) {
            showToast("Invalid JSON format", "error");
            console.error("Template JSON Parse Error:", err);
            templateData = null;
        }
    };
    reader.readAsText(file);
}

function waitForFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

async function handleRenderClick() {
    const currentJobId = ++renderJobId;
    if (!templateData?.front) {
        showToast("Please upload a valid template with 'front' page", "warning");
        return;
    }
    const selectedData = JSON.parse(localStorage.getItem("selectedRecords") || "[]");
    if (!selectedData.length) {
        showToast("No records selected", "warning");
        return;
    }

    const wrapper = document.getElementById("slidesWrapper");
    if (!wrapper) {
        showToast("Error: Container not found", "error");
        return;
    }

    wrapper.innerHTML = "";
    renderedData = selectedData;

    const slide = document.createElement("div");
    slide.classList.add("slide");
    wrapper.appendChild(slide);

    const renderBtn = document.getElementById("renderBtn");
    const cardCountEl = document.getElementById("cardCount");
    if (renderBtn) renderBtn.disabled = true;
    if (cardCountEl) cardCountEl.textContent = `Rendering 0/${selectedData.length}`;

    const chunkSize = selectedData.length > 500 ? 40 : 80;
    let completed = false;

    try {
        for (let i = 0; i < selectedData.length; i += chunkSize) {
            if (currentJobId !== renderJobId) return;
            const fragment = document.createDocumentFragment();
            const chunk = selectedData.slice(i, i + chunkSize);

            chunk.forEach(record => {
                const front = createCardElement(templateData.front, record);
                front.classList.add("card-front");
                fragment.appendChild(front);
                if (templateData.back) {
                    const back = createCardElement(templateData.back, record);
                    back.classList.add("card-back");
                    fragment.appendChild(back);
                }
            });

            slide.appendChild(fragment);
            if (cardCountEl) cardCountEl.textContent = `Rendering ${Math.min(i + chunk.length, selectedData.length)}/${selectedData.length}`;
            await waitForFrame();
        }
        completed = true;
    } finally {
        if (renderBtn && currentJobId === renderJobId) renderBtn.disabled = false;
    }

    if (!completed || currentJobId !== renderJobId) return;

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    if (cardCountEl) cardCountEl.textContent = `${selectedData.length} cards`;
    updateProgress(3);
    showToast(`${selectedData.length} card(s) rendered`, "success");
}

function createCardElement(template, record = {}) {
    const container = document.createElement("div");
    container.classList.add("editor", "rendered-card");

    if (!template?.items?.length) {
        container.innerText = "Invalid template data.";
        container.classList.add("error-card-content");
        return container;
    }

    const recordClone = { ...record };
    renderCard(template, container, recordClone);

    return container;
}

function renderCard(template, container, record = {}) {
    container.innerHTML = "";
    container.templateData = template;

    
    const cardHeight = template.pageStyle?.height || "220px";
    const cardWidth = template.pageStyle?.width || "350px";

    
    Object.assign(container.style, {
        position: "relative",
        width: cardWidth,
        height: cardHeight,
        border: "1px solid #ccc",
        margin: "10px",
        background: template.pageStyle?.background || "",
        backgroundImage: template.pageStyle?.backgroundImage || "",
        backgroundSize: template.pageStyle?.backgroundSize || "cover",
        backgroundPosition: template.pageStyle?.backgroundPosition || "center",
        boxSizing: "border-box",
        borderRadius: template.pageStyle?.borderRadius || "0",
        boxShadow: template.pageStyle?.boxShadow || "none",
        fontFamily: template.pageStyle?.fontFamily || "sans-serif"
    });

    template.items.forEach(item => {
        const el = document.createElement("div");
        el.classList.add("card-item");
        const key = item.bookmark?.toLowerCase()?.trim();

        
        const savedLeft = key && record[key + "_left"] ? record[key + "_left"] : item.left || "0px";
        const savedTop = key && record[key + "_top"] ? record[key + "_top"] : item.top || "0px";

        
        Object.assign(el.style, {
            position: "absolute",
            left: savedLeft,
            top: savedTop,
            width: item.width || "auto",
            height: item.height || "auto",
            fontSize: item.fontSize || "14px",
            color: item.color || "#000",
            fontWeight: item.fontWeight || "normal",
            lineHeight: item.lineHeight || "normal",
            border: item.borderWidth ? `${item.borderWidth}px ${item.borderStyle || "solid"} ${item.borderColor || "#000"}` : "none",
            borderRadius: item.borderRadius || "0",
            boxShadow: item.boxShadow || "none",
            boxSizing: "border-box",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: item.textAlign === "center" ? "center" : item.textAlign === "right" ? "flex-end" : "flex-start",
            textAlign: item.textAlign || "left",
            padding: "2px",
            cursor: "pointer",
            userSelect: "none",
            transform: item.transform || "none",
            transformOrigin: item.transformOrigin || "center"
        });

        let rawText = item.text || "";
        
        rawText = rawText.replace(/{{(.*?)}}/g, (_, k) => {
            return getRecordValue(record, k) ?? "";
        });

        const value = key ? getRecordValue(record, key) : rawText;

        if (item.type === "image") {
            const img = document.createElement("img");
            img.crossOrigin = "anonymous";
            img.loading = "lazy";
            img.decoding = "async";
            img.src = value && (value.startsWith("http") || value.startsWith("data:image") || value.startsWith("blob:")) ? value : "";

            Object.assign(img.style, {
                width: "100%",
                height: "100%",
                objectFit: item.objectFit || "cover",
                borderRadius: item.borderRadius || "0",
                border: item.border || "none"
            });

            img.dataset.recordKey = key;
            img.dataset.recordUuid = record.__key;

            img.addEventListener("mousedown", (e) => {
                e.stopPropagation();
            });

            img.addEventListener("click", (e) => {
                e.stopPropagation();
                openCropModal(img);
            });
            el.appendChild(img);
        } else {
            el.innerText = value;
        }

        makeElementDraggable(el, record, key);
        container.appendChild(el);
    });

    
    if (template.isFront || (templateData?.front && templateData?.back)) {
        appendQRCode(container, record);
    }
}

function appendQRCode(container, record) {
    if (!record || typeof record !== 'object') return;
    if(container.querySelector('.qr-code-placeholder')) return;

    const qrDiv = document.createElement("div");
    qrDiv.classList.add("qr-code-placeholder");

    
    Object.assign(qrDiv.style, {
        position: "absolute",
        right: "10px",
        bottom: "10px",
        width: "50px",
        height: "50px",
        zIndex: "10"
    });
    container.appendChild(qrDiv);

    let fieldsToInclude = [];
    if (record.type === "student") fieldsToInclude = ["student_name", "student_adm"];
    else if (record.type === "staff") fieldsToInclude = ["staff_empid", "staff_name"];
    else {
        Object.assign(qrDiv.style, { fontSize: "10px", color: "gray", textAlign: "center", lineHeight: "50px" });
        qrDiv.innerText = "QR: Unknown Type";
        return;
    }

    const readableText = fieldsToInclude.map(key => `${capitalize(key)}: ${record[key] ?? "N/A"}`).join("\n");

    try {
        
        new QRCode(qrDiv, { text: readableText, width: 50, height: 50, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
        qrDiv.title = readableText;
    } catch (err) {
        console.error("QR Code Error:", err);
        qrDiv.innerText = "QR Error";
    }
}

function makeElementDraggable(el, record, key) {
    let isDragging = false, startX, startY, origX, origY;

    
    if (!key || document.getElementById("page-2")?.classList.contains("active") === false) return;

    const mouseMoveHandler = (e) => {
        if (!isDragging) return;
        el.style.left = origX + (e.clientX - startX) + "px";
        el.style.top = origY + (e.clientY - startY) + "px";
    };

    const mouseUpHandler = () => {
        if (!isDragging) return;
        isDragging = false;
        el.style.cursor = "pointer";

        
        const selectedData = JSON.parse(localStorage.getItem("selectedRecords") || "[]");
        const updatedData = selectedData.map(r => r.__key === record.__key ? { ...r, [key + "_left"]: el.style.left, [key + "_top"]: el.style.top } : r);
        localStorage.setItem("selectedRecords", JSON.stringify(updatedData));

        document.removeEventListener("mousemove", mouseMoveHandler);
        document.removeEventListener("mouseup", mouseUpHandler);
    };

    el.addEventListener("mousedown", (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        origX = parseInt(el.style.left) || 0;
        origY = parseInt(el.style.top) || 0;
        el.style.cursor = "grabbing";
        e.preventDefault();
        e.stopPropagation();

        document.addEventListener("mousemove", mouseMoveHandler);
        document.addEventListener("mouseup", mouseUpHandler);
    });
}

function openCropModal(imgElement) {
    const cropContainer = document.getElementById("cropContainer");
    const cropImage = document.getElementById("cropImage");
    const cropConfirmBtn = document.getElementById("cropConfirm");
    const cropCancelBtn = document.getElementById("cropCancel");
    const cropCloseBtn = document.getElementById("cropCloseBtn");
    if (!cropContainer || !cropImage || !imgElement.src || imgElement.src.includes('data:image/gif;base64')) {
        showToast("Invalid image source", "error");
        return;
    }

    const recordUuid = imgElement.dataset.recordUuid;
    const recordKey = imgElement.dataset.recordKey;
    let selectedData = JSON.parse(localStorage.getItem("selectedRecords") || "[]");
    let recordToUpdate = selectedData.find(r => r.__key === recordUuid);
    const cardItem = imgElement.closest('.card-item');
    const targetRect = cardItem?.getBoundingClientRect();
    const targetWidth = Math.max(120, Math.round(targetRect?.width || imgElement.clientWidth || 240));
    const targetHeight = Math.max(120, Math.round(targetRect?.height || imgElement.clientHeight || 240));
    const aspectRatio = targetWidth / targetHeight;

    cropper?.destroy();
    cropper = null;
    cropImage.onload = null;
    cropImage.removeAttribute("src");

    const freshConfirm = cropConfirmBtn?.cloneNode(true);
    const freshCancel = cropCancelBtn?.cloneNode(true);
    const freshClose = cropCloseBtn?.cloneNode(true);
    if (freshConfirm && cropConfirmBtn) cropConfirmBtn.replaceWith(freshConfirm);
    if (freshCancel && cropCancelBtn) cropCancelBtn.replaceWith(freshCancel);
    if (freshClose && cropCloseBtn) cropCloseBtn.replaceWith(freshClose);

    cropContainer.classList.add("active");
    document.body.classList.add("crop-modal-open");
    if (freshConfirm) freshConfirm.disabled = true;

    const closeCropper = () => {
        cropContainer.classList.remove("active");
        document.body.classList.remove("crop-modal-open");
        cropContainer.onclick = null;
        cropper?.destroy();
        cropper = null;
        cropImage.onload = null;
        cropImage.onerror = null;
        cropImage.removeAttribute("src");
    };

    const initCropper = () => {
        cropper?.destroy();
        cropper = new Cropper(cropImage, {
            aspectRatio: aspectRatio,
            viewMode: 1,
            dragMode: "move",
            autoCropArea: 1,
            responsive: true,
            background: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxResizable: true,
            cropBoxMovable: true,
            ready() {
                if (freshConfirm) freshConfirm.disabled = false;
            }
        });
    };

    cropImage.onload = initCropper;
    cropImage.onerror = () => {
        closeCropper();
        showToast("Unable to load image", "error");
    };
    cropImage.src = imgElement.src;

    const confirmHandler = () => {
        try {
            const canvas = cropper?.getCroppedCanvas({
                width: targetWidth * 2,
                height: targetHeight * 2,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: "high"
            });
            if (!canvas) {
                showToast("Please select a valid crop area", "warning");
                return;
            }

            const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
            imgElement.src = dataUrl;

            
            if (recordToUpdate && recordKey) {
                recordToUpdate[recordKey] = dataUrl;
                const updatedData = selectedData.map(r => r.__key === recordToUpdate.__key ? recordToUpdate : r);
                localStorage.setItem("selectedRecords", JSON.stringify(updatedData));
            }
            closeCropper();
            handleRenderClick();
            showToast("Image cropped", "success");
        } catch (err) {
            console.error("Crop failed:", err);
            showToast("Failed to save cropped image. This may be due to image security restrictions or storage issues.", "error", 5000);
        }
    };

    freshConfirm?.addEventListener("click", confirmHandler);
    freshCancel?.addEventListener("click", closeCropper);
    freshClose?.addEventListener("click", closeCropper);
    cropContainer.onclick = (e) => {
        if (e.target === cropContainer) closeCropper();
    };
}

async function saveCurrentBatch() {
    const renderedCards = document.getElementById("slidesWrapper")?.querySelectorAll(".editor");
    if (!renderedCards || !renderedCards.length) {
        showToast("No rendered cards to save", "warning");
        return;
    }

    const batchId = crypto.randomUUID();
    const firstRecord = renderedData?.[0] || JSON.parse(localStorage.getItem("selectedRecords") || "[]")?.[0] || {};
    const schoolNameDisplay = firstRecord.schoolName || firstRecord.school_name || document.getElementById("schoolFilterDisplay")?.querySelector(".custom-select-text")?.textContent || "Unknown School";
    const schoolIDDisplay = firstRecord.schoolID || firstRecord.schoolid || document.getElementById("schoolIDSelectDisplay")?.querySelector(".custom-select-text")?.textContent || "";
    const typeList = renderedData.map(r => String(r.type || "").toLowerCase()).filter(Boolean);
    const type = typeList.length && typeList.every(t => t === typeList[0]) ? typeList[0] : (typeList[0] || (dataTypeSelect?.value ? dataTypeSelect.value.toLowerCase() : "unknown"));

    const cardsHTML = Array.from(renderedCards).map(card => card.outerHTML);

    const newBatch = {
        batchId,
        schoolName: schoolIDDisplay ? `${schoolNameDisplay} (${schoolIDDisplay})` : schoolNameDisplay,
        type,
        templateUsed: templateData?._fileName || templateFileName || "Custom Template",
        cardsHTML,
        createdAt: new Date().toISOString()
    };

    try {
        const batches = await getBatches();
        batches.push(newBatch);
        await setBatches(batches);
    } catch (err) {
        console.error("Batch save failed:", err);
        return;
    }

    updateProgress(4);
    await renderBatchList();
    togglePages("page-2", "page-3");
    showToast(`Batch saved: ${cardsHTML.length} cards`, "success");
}

async function renderBatchList() {
    const batchListDiv = document.getElementById("batchList");
    if (!batchListDiv) return;

    const batches = (await getBatches()).slice().reverse();
    const batchCountBadge = document.getElementById("batchCountBadge");
    if (batchCountBadge) {
        batchCountBadge.textContent = `${batches.length} batch${batches.length === 1 ? "" : "es"}`;
    }

    const printClearActions = document.getElementById("printClearActions");
    if (printClearActions) {
        printClearActions.style.display = batches.length > 0 ? 'flex' : 'none';
    }

    if (!batches.length) {
        batchListDiv.innerHTML = "<p class='no-batches-message'>No saved batches yet. Render some cards on the Card Preview page and click 'Save Current Render'.</p>";
        return;
    }

    batchListDiv.innerHTML = batches.map(batch => {
        const date = new Date(batch.createdAt).toLocaleDateString();
        const time = new Date(batch.createdAt).toLocaleTimeString();
        
        const schoolNameEscaped = batch.schoolName; 
        const typeEscaped = batch.type.toUpperCase();
        const templateEscaped = batch.templateUsed;

        return `<div class="batch-item" data-id="${batch.batchId}">
            <div class="batch-item-header">
                <div class="batch-details">
                    <strong>${schoolNameEscaped}</strong>
                    <span class="batch-type-pill">${typeEscaped}</span>
                    <div class="batch-info">
                        <i data-lucide="scan" class="icon-xs"></i> ${batch.cardsHTML.length} card(s)
                        <span class="separator">|</span>
                        <i data-lucide="clock" class="icon-xs"></i> ${date} ${time}
                    </div>
                    <div class="batch-template">Template: ${templateEscaped}</div>
                </div>
                <div class="batch-actions-right">
                    <button class="previewBatchBtn action-btn tertiary-style" data-id="${batch.batchId}">
                        <i data-lucide="eye" class="icon-sm"></i> Preview
                    </button>
                    <button class="deleteBatchBtn action-btn delete-style" data-id="${batch.batchId}">
                        <i data-lucide="trash-2" class="icon-sm"></i> Delete
                    </button>
                </div>
            </div>
        </div>`;
    }).join("");

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    batchListDiv.querySelectorAll(".deleteBatchBtn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm("Are you sure you want to delete this batch?")) {
                await deleteBatch(id);
            }
        });
    });

    batchListDiv.querySelectorAll(".previewBatchBtn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const id = e.currentTarget.dataset.id;
            await previewBatch(id);
        });
    });
}

async function deleteBatch(id) {
    let batches = await getBatches();
    batches = batches.filter(b => b.batchId !== id);
    await setBatches(batches);
    await renderBatchList();
    showToast("Batch deleted", "success");
}

async function previewBatch(id) {
    const batch = (await getBatches()).find(b => b.batchId === id);
    if (!batch) {
        showToast("Batch not found", "error");
        return;
    }

    const wrapper = document.getElementById("slidesWrapper");
    if (!wrapper) {
        showToast("Error: Container not found", "error");
        return;
    }

    wrapper.innerHTML = "";

    const slide = document.createElement("div");
    slide.classList.add("slide");
    wrapper.appendChild(slide);

    batch.cardsHTML.forEach(htmlStr => {
        try {
            const temp = document.createElement("div");
            temp.innerHTML = htmlStr;
            const cardElement = temp.firstElementChild;
            if (cardElement) {
                slide.appendChild(cardElement);
            }
        } catch (err) {
            console.error("Error injecting batch card HTML:", err);
        }
    });

    togglePages("page-3", "page-2");
    showToast(`Previewing ${batch.schoolName}`, "success");
}

function handleA4Print() {
    const renderedCards = document.querySelectorAll("#slidesWrapper .editor");
    if (!renderedCards.length) {
        showToast("No cards to print", "warning");
        return;
    }

    const cardsHTML = Array.from(renderedCards).map(c => c.outerHTML);
    const html = buildPrintHTML(cardsHTML, "Print ID Cards (Current Render)");
    openPrintWindow(html);
    showToast("Opening print window", "info");
}

async function handlePrintAllBatches() {
    const batches = await getBatches();
    if (!batches.length) {
        showToast("No batches found", "warning");
        return;
    }

    const allCardsHTML = batches.flatMap(b => b.cardsHTML);
    if (!allCardsHTML.length) {
        showToast("No cards available", "warning");
        return;
    }

    const html = buildPrintHTML(allCardsHTML, "Print All Batches");
    openPrintWindow(html);
    showToast("Opening print window", "info");
}

function openPrintWindow(html) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        showToast("Pop-up blocked. Please allow pop-ups", "error");
        return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
}

function getMMValue(styleValue) {
    if (styleValue.endsWith('mm')) {
        return parseFloat(styleValue);
    }
    if (styleValue.endsWith('px')) {
        
        return parseFloat(styleValue) * 0.264583; 
    }
    
    return 86.36; 
}

function buildPrintHTML(cardsHTMLArray, title = "Print") {
    
    const a4WidthMM = 297.13; 
    const a4HeightMM = 210.01; 
    const a4Orientation = `${a4WidthMM}mm ${a4HeightMM}mm`; 
    const pagePaddingTopMM = 9.4;
    const pagePaddingRightMM = 0;
    const pagePaddingBottomMM = 0;
    const pagePaddingLeftMM = 4.57;
    const horizontalGapMM = 2.03;
    const verticalGapMM = 12.7;
    
    
    const cardsPerRow = 5; 
    const rowsPerPage = 2; 
    
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cardsHTMLArray[0];
    const firstCardEditor = tempDiv.querySelector('.editor');

    if (!firstCardEditor) {
        console.error("No editor element found. Using default vertical size.");
        var actualWidth = 55.88; 
        var actualHeight = 86.36; 
    } else {
        const tempWidthStyle = firstCardEditor.style.width || "350px";
        
        
        const tempHeightStyle = firstCardEditor.style.height || "220px"; 
        
        var actualWidth = getMMValue(tempWidthStyle); 
        var actualHeight = getMMValue(tempHeightStyle); 
    }
    
    
    const isPortrait = actualWidth < actualHeight;
    
    let gridCardWidthMM, gridCardHeightMM;
    
    if (isPortrait) {
        
        gridCardWidthMM = actualWidth;
        gridCardHeightMM = actualHeight;
    } else {
        
        gridCardWidthMM = actualHeight; 
        gridCardHeightMM = actualWidth;  
    }
    
    
    gridCardWidthMM = gridCardWidthMM.toFixed(2);
    gridCardHeightMM = gridCardHeightMM.toFixed(2);
    
    
    const finalCardStyleWidth = `${gridCardWidthMM}mm`;
    const finalCardStyleHeight = `${gridCardHeightMM}mm`;

    
    const style = `<style>
        @page { size: ${a4Orientation}; margin: 0; }
        html, body { 
            margin: 0; 
            padding: 0; 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
            font-family: Arial, sans-serif; 
            box-sizing: border-box; 
        }
        
        .page { 
            width: ${a4WidthMM}mm; 
            height: ${a4HeightMM}mm; 
            display: grid;
            
            grid-template-columns: repeat(${cardsPerRow}, ${finalCardStyleWidth}); 
            grid-template-rows: repeat(${rowsPerPage}, ${finalCardStyleHeight});
            
            column-gap: ${horizontalGapMM}mm; 
            row-gap: ${verticalGapMM}mm; 
            
            padding: ${pagePaddingTopMM}mm ${pagePaddingRightMM}mm ${pagePaddingBottomMM}mm ${pagePaddingLeftMM}mm; 
            box-sizing: border-box; 
            page-break-after: always;
            break-after: page;
            align-content: start;
            justify-content: start;
        }

        .page:last-child {
            page-break-after: auto;
            break-after: auto;
        }

        .card { 
            width: ${finalCardStyleWidth}; 
            height: ${finalCardStyleHeight}; 
            overflow: hidden; 
            position: relative; 
            background: #fff; 
            page-break-inside: avoid; 
            box-sizing: border-box; 
            border: none; 
            
            ${isPortrait ? '' : `
                
                transform: rotate(90deg);
                
                transform-origin: 0 0;
                transform: rotate(90deg) translate(0, -${gridCardHeightMM}mm);
            `}
        }

        .editor { 
            width: 100%; 
            height: 100%; 
            box-shadow: none !important; 
            border: none !important; 
            margin: 0 !important; 
            box-sizing: border-box; 
            transform: scale(1.0); 
            transform-origin: top left;
            display:block;
        }
        
        img { max-width: 100%; max-height: 100%; display: block; }
        .card-item { position: absolute; box-sizing: border-box; display: flex; align-items: center; }
    </style>`;
    
    
    let allPagesHTML = '';
    
    
    const frontCardsHTML = cardsHTMLArray.filter((_, i) => i % 2 === 0);
    const backCardsHTML = cardsHTMLArray.filter((_, i) => i % 2 !== 0);

    const cardsPerPage = cardsPerRow * rowsPerPage; 
    const pairsPerPage = cardsPerPage / 2; 
    const totalPairs = frontCardsHTML.length; 
    
    
    for (let i = 0; i < totalPairs; i += pairsPerPage) {
        let pageCardsHTML = '';
        
        
        for (let j = 0; j < pairsPerPage; j++) {
            const cardIndex = i + j;
            if (cardIndex < frontCardsHTML.length) {
                pageCardsHTML += `<div class="card">${frontCardsHTML[cardIndex]}</div>`;
            } else {
                pageCardsHTML += `<div class="card"></div>`; 
            }
        }
        
        
        for (let j = 0; j < pairsPerPage; j++) {
            const cardIndex = i + j;
            if (cardIndex < backCardsHTML.length) {
                pageCardsHTML += `<div class="card">${backCardsHTML[cardIndex]}</div>`;
            } else {
                pageCardsHTML += `<div class="card"></div>`; 
            }
        }
        
        allPagesHTML += `<div class="page">${pageCardsHTML}</div>`;
    }

    
    const html = `<html><head><title>${title}</title>${style}</head><body onload="setTimeout(()=>{window.print();},300);">${allPagesHTML}</body></html>`;
    return html;
}
