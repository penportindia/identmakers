// ==================== 1. Imports & Global State ====================
// NOTE: Assuming Data.js and external libraries (Cropper.js, QRCode.js, Lucide) are correctly linked.
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
let cropper = null; // single cropper instance


// ==================== 2. Batch & Local Storage Helpers ====================
function getBatches() {
    return JSON.parse(localStorage.getItem("cardBatches") || "[]");
}

function setBatches(batches) {
    localStorage.setItem("cardBatches", JSON.stringify(batches));
}

function capitalize(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}


// ==================== 3. UI Setup & Event Listeners ====================
document.addEventListener("DOMContentLoaded", () => {
    // Filters and Data
    dataTypeSelect?.addEventListener("change", fetchDataForSchool);
    schoolFilter?.addEventListener("change", fetchDataForSchool);
    resetBtn?.addEventListener("click", resetFilters);

    // Page 1 Buttons
    document.getElementById("generateBtn")?.addEventListener("click", handleGenerateClick);

    // Page 2 Buttons
    document.getElementById("goToDataBtn")?.addEventListener("click", handleBackToData);
    document.getElementById("templateUpload")?.addEventListener("change", handleTemplateUpload);
    document.getElementById("renderBtn")?.addEventListener("click", handleRenderClick);
    document.getElementById("printBtn")?.addEventListener("click", handleA4Print);

    // Navigation Buttons
    document.getElementById("goToBatchBtn")?.addEventListener("click", () => togglePages("page-2", "page-3"));
    document.getElementById("backToRendererBtn")?.addEventListener("click", () => togglePages("page-3", "page-2"));

    // Ensure Batch UI exists and attach listeners
    attachBatchListenersAndRender();
});

/**
 * Renders the Batch Hub UI elements dynamically and attaches listeners.
 */
function attachBatchListenersAndRender() {
    const controls = document.getElementById("page-3-controls");
    if (!controls) return;

    controls.innerHTML = '';

    // Save Button
    const saveBtn = document.createElement("button");
    saveBtn.id = "saveBatchBtn";
    saveBtn.innerHTML = '<i data-lucide="save" class="icon-sm"></i> Save Current Render';
    saveBtn.classList.add("action-btn", "primary-style");
    saveBtn.addEventListener("click", saveCurrentBatch);
    controls.appendChild(saveBtn);

    // Print/Clear Actions Container
    const actionContainer = document.createElement("div");
    actionContainer.id = "printClearActions";
    actionContainer.classList.add("batch-actions-stack");

    // Print All Batches button
    const printAllBtn = document.createElement("button");
    printAllBtn.id = "printAllBatchesBtn";
    printAllBtn.innerHTML = '<i data-lucide="printer" class="icon-sm"></i> Print All Batches';
    printAllBtn.classList.add("action-btn", "print-style");
    printAllBtn.addEventListener("click", handlePrintAllBatches);
    actionContainer.appendChild(printAllBtn);

    // Clear All Batches button
    const clearBtn = document.createElement("button");
    clearBtn.id = "clearBatchesBtn";
    clearBtn.innerHTML = '<i data-lucide="trash-2" class="icon-sm"></i> Clear All Batches';
    clearBtn.classList.add("action-btn", "delete-style");
    clearBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear all saved batches? This action cannot be undone.")) {
            localStorage.removeItem("cardBatches");
            renderBatchList();
            alert("All batches cleared.");
        }
    });
    actionContainer.appendChild(clearBtn);

    controls.appendChild(actionContainer);

    // Batch List container
    const listContainer = document.createElement("div");
    listContainer.classList.add("batch-list-wrapper");
    listContainer.innerHTML = '<h3 class="data-title" style="margin-top: 20px;">Saved Batches</h3>';
    const list = document.createElement("div");
    list.id = "batchList";
    list.classList.add("batch-list-container");
    listContainer.appendChild(list);
    controls.appendChild(listContainer);

    // Create Lucide icons
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    renderBatchList();
}


// ==================== 4. Page Navigation & Data Flow ====================
function togglePages(hideId, showId) {
    document.getElementById(hideId)?.classList.remove("active");
    document.getElementById(showId)?.classList.add("active");
    if (showId === 'page-3') {
        renderBatchList();
    }
}

function handleGenerateClick() {
    const selected = getSelectedData();
    if (!selected?.length) return alert("⚠️ Please select at least one record.");

    const type = dataTypeSelect?.value?.toLowerCase() || "unknown";
    const selectedWithType = selected.map(r => ({
        ...r,
        type,
        __key: r.__key || crypto.randomUUID()
    }));

    localStorage.setItem("selectedRecords", JSON.stringify(selectedWithType));
    alert(`✅ ${selectedWithType.length} record(s) saved. Ready for rendering.`);

    templateData = null;
    document.getElementById("slidesWrapper").innerHTML = "";

    togglePages("page-1", "page-2");
}

function handleBackToData() {
    const wrapper = document.getElementById("slidesWrapper");
    if (wrapper) wrapper.innerHTML = "";

    // Reset rendering state
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
    if (!file) return alert("No JSON file selected.");

    templateFileName = file.name || templateFileName;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            templateData = JSON.parse(e.target.result);
            templateData._fileName = templateFileName;
            alert("Template uploaded successfully. Click Render to continue.");
            document.getElementById("slidesWrapper").innerHTML = "";
        } catch (err) {
            alert("Invalid JSON format. Check console for details.");
            console.error("Template JSON Parse Error:", err);
            templateData = null;
        }
    };
    reader.readAsText(file);
}


// ==================== 5. Card Rendering & Templating ====================
function handleRenderClick() {
    if (!templateData?.front) return alert("Please upload a valid template JSON with a 'front' page.");
    const selectedData = JSON.parse(localStorage.getItem("selectedRecords") || "[]");
    if (!selectedData.length) return alert("No selected record found. Please select records on Page-1.");

    const wrapper = document.getElementById("slidesWrapper");
    if (!wrapper) return alert("Target container not found (slidesWrapper).");

    wrapper.innerHTML = "";
    renderedData = selectedData;

    const slide = document.createElement("div");
    slide.classList.add("slide");

    selectedData.forEach(record => {
        const front = createCardElement(templateData.front, record);
        front.classList.add("card-front");
        slide.appendChild(front);
        if (templateData.back) {
            const back = createCardElement(templateData.back, record);
            back.classList.add("card-back");
            slide.appendChild(back);
        }
    });

    wrapper.appendChild(slide);

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    alert(`${selectedData.length} card(s) rendered successfully.`);
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

    // Use template dimensions
    const cardHeight = template.pageStyle?.height || "220px";
    const cardWidth = template.pageStyle?.width || "350px";

    // Card Container Styles
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

        // Position retrieval (Saved position overrides template default)
        const savedLeft = key && record[key + "_left"] ? record[key + "_left"] : item.left || "0px";
        const savedTop = key && record[key + "_top"] ? record[key + "_top"] : item.top || "0px";

        // Item Styles
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
        // Data substitution
        rawText = rawText.replace(/{{(.*?)}}/g, (_, k) => {
            const cleanKey = k.trim().toLowerCase();
            return record[cleanKey] !== undefined ? record[cleanKey] : "";
        });

        const value = key && record[key] !== undefined ? record[key] : rawText;

        if (item.type === "image") {
            const img = document.createElement("img");
            img.src = value && (value.startsWith("http") || value.startsWith("data:image")) ? value : "";

            Object.assign(img.style, {
                width: "100%",
                height: "100%",
                objectFit: item.objectFit || "cover",
                borderRadius: item.borderRadius || "0",
                border: item.border || "none"
            });

            img.dataset.recordKey = key;
            img.dataset.recordUuid = record.__key;

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

    // Append QR code only once per card pair
    if (template.isFront || (templateData?.front && templateData?.back)) {
        appendQRCode(container, record);
    }
}

function appendQRCode(container, record) {
    if (!record || typeof record !== 'object') return;
    if(container.querySelector('.qr-code-placeholder')) return;

    const qrDiv = document.createElement("div");
    qrDiv.classList.add("qr-code-placeholder");

    // QR Code Position and Size
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
        // QR Code Generation (Requires QRCode.js library)
        new QRCode(qrDiv, { text: readableText, width: 50, height: 50, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.H });
        qrDiv.title = readableText;
    } catch (err) {
        console.error("QR Code Error:", err);
        qrDiv.innerText = "QR Error";
    }
}


// ==================== 6. Draggable & Cropper Logic ====================
function makeElementDraggable(el, record, key) {
    let isDragging = false, startX, startY, origX, origY;

    // Only allow dragging on Page 2 and if element has a key
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

        // Save new position
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
    if (!cropContainer || !cropImage || !imgElement.src || imgElement.src.includes('data:image/gif;base64')) {
        return alert("No valid image source found to crop.");
    }

    cropContainer.style.display = "flex";
    cropImage.src = imgElement.src;

    const recordUuid = imgElement.dataset.recordUuid;
    const recordKey = imgElement.dataset.recordKey;
    let selectedData = JSON.parse(localStorage.getItem("selectedRecords") || "[]");
    let recordToUpdate = selectedData.find(r => r.__key === recordUuid);

    cropper?.destroy();
    cropper = null;

    cropImage.onload = () => {
        const cardItem = imgElement.closest('.card-item');
        let aspectRatio = 1;
        if (cardItem && cardItem.style.width && cardItem.style.height) {
            const w = parseInt(cardItem.style.width) || 100;
            const h = parseInt(cardItem.style.height) || 100;
            aspectRatio = w / h;
        }

        // Cropper Initialization (Requires Cropper.js library)
        cropper = new Cropper(cropImage, {
            aspectRatio: aspectRatio,
            viewMode: 1,
            autoCropArea: 1,
            responsive: true,
            background: false
        });
    };

    const cropConfirm = document.getElementById("cropConfirm").cloneNode(true);
    const cropCancel = document.getElementById("cropCancel").cloneNode(true);
    document.getElementById("cropConfirm").replaceWith(cropConfirm);
    document.getElementById("cropCancel").replaceWith(cropCancel);

    const closeCropper = () => {
        cropContainer.style.display = "none";
        cropper?.destroy();
        cropper = null;
    };

    cropConfirm.addEventListener("click", () => {
        const canvas = cropper?.getCroppedCanvas();
        if (canvas) {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            imgElement.src = dataUrl;

            // Save the new data URL
            if (recordToUpdate && recordKey) {
                recordToUpdate[recordKey] = dataUrl;
                const updatedData = selectedData.map(r => r.__key === recordToUpdate.__key ? recordToUpdate : r);
                localStorage.setItem("selectedRecords", JSON.stringify(updatedData));
            }
        }
        closeCropper();
        handleRenderClick(); // Re-render to update all instances
    });

    cropCancel.addEventListener("click", closeCropper);
}


// ==================== 7. Batch Management ====================
function saveCurrentBatch() {
    const renderedCards = document.getElementById("slidesWrapper")?.querySelectorAll(".editor");
    if (!renderedCards || !renderedCards.length) return alert("No rendered cards to save. Please render cards first.");

    // Assuming crypto.randomUUID(), schoolFilter, schoolIDSelect, dataTypeSelect, 
    // templateData, templateFileName, getBatches(), setBatches(), 
    // renderBatchList(), and togglePages() are defined elsewhere.
    const batchId = crypto.randomUUID();
    const schoolName = (schoolFilter?.value && schoolFilter.selectedIndex !== -1) ? schoolFilter.options[schoolFilter.selectedIndex].text : "Unknown School";
    const idValue = (schoolIDSelect?.value) ? schoolIDSelect.value : "N/A ID";
    const type = (dataTypeSelect?.value) ? dataTypeSelect.value.toLowerCase() : "unknown";

    const cardsHTML = Array.from(renderedCards).map(card => card.outerHTML);

    const newBatch = {
        batchId,
        schoolName: `${schoolName} (${idValue})`,
        type,
        templateUsed: templateData?._fileName || templateFileName || "Custom Template",
        cardsHTML,
        createdAt: new Date().toISOString()
    };

    const batches = getBatches();
    batches.push(newBatch);
    setBatches(batches);

    alert(`✅ Saved ${cardsHTML.length} card(s) as batch for ${newBatch.schoolName}.`);
    renderBatchList();
    togglePages("page-2", "page-3");
}

function renderBatchList() {
    const batchListDiv = document.getElementById("batchList");
    if (!batchListDiv) return;

    // Assuming getBatches(), lucide.createIcons(), deleteBatch(), previewBatch(), and togglePages() are defined elsewhere.
    const batches = getBatches().reverse();

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
        // Assume escapeHtml is defined elsewhere or is a known function
        const schoolNameEscaped = batch.schoolName; // Simplified assumption
        const typeEscaped = batch.type.toUpperCase();
        const templateEscaped = batch.templateUsed;

        return `<div class="batch-item" data-id="${batch.batchId}">
            <div class="batch-header">
                <div class="batch-details">
                    <strong>${schoolNameEscaped}</strong> (${typeEscaped})
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
        btn.addEventListener("click", (e) => {
            const id = e.currentTarget.dataset.id;
            if (confirm("Are you sure you want to delete this batch?")) {
                deleteBatch(id);
            }
        });
    });

    batchListDiv.querySelectorAll(".previewBatchBtn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = e.currentTarget.dataset.id;
            previewBatch(id);
        });
    });
}

function deleteBatch(id) {
    let batches = getBatches();
    batches = batches.filter(b => b.batchId !== id);
    setBatches(batches);
    renderBatchList();
    alert("Batch deleted.");
}

function previewBatch(id) {
    const batch = getBatches().find(b => b.batchId === id);
    if (!batch) return alert("Batch not found.");

    const wrapper = document.getElementById("slidesWrapper");
    if (!wrapper) return alert("slidesWrapper not found to preview.");

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

    alert(`Previewing batch from ${batch.schoolName}. Go back to the 'Card Preview & Render' page to see them.`);
    togglePages("page-3", "page-2");
}


// ==================== 8. Printing & Layout Logic (Horizontal Card Fix Applied & Typo Fixed) ====================

/**
 * Handles printing of the currently rendered cards (from Page 2).
 */
function handleA4Print() {
    const renderedCards = document.querySelectorAll("#slidesWrapper .editor");
    if (!renderedCards.length) return alert("No rendered cards to print.");

    const cardsHTML = Array.from(renderedCards).map(c => c.outerHTML);
    const html = buildPrintHTML(cardsHTML, "Print ID Cards (Current Render)");
    openPrintWindow(html);
}

/**
 * Handles printing of all saved batches (from Page 3).
 */
function handlePrintAllBatches() {
    const batches = getBatches();
    if (!batches.length) return alert("No batches found.");

    const allCardsHTML = batches.flatMap(b => b.cardsHTML);
    if (!allCardsHTML.length) return alert("No cards to print across all batches.");

    const html = buildPrintHTML(allCardsHTML, "Print All Batches");
    openPrintWindow(html);
}

/**
 * Opens a temporary iframe in the current window for printing, 
 * and reloads the page after printing/canceling. (MODIFIED) 🔄
 */
function openPrintWindow(html) {
    const iframe = document.createElement('iframe');
    // iframe को छुपा दें, लेकिन प्रिंटिंग के लिए उपलब्ध रखें
    iframe.style.position = 'absolute';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    
    document.body.appendChild(iframe);

    // iframe के डॉक्यूमेंट में HTML लिखें
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(html); 
    iframe.contentWindow.document.close();
    
    // iframe लोड होने के बाद प्रिंट कमांड दें
    iframe.onload = function() {
        try {
            // iframe के अंदर प्रिंट कमांड चलाएं
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch(e) {
            console.error("Print failed:", e);
            alert("Printing could not be initiated. Check console for error.");
        }
        
        // प्रिंटिंग के बाद iframe को हटा दें (रीलोड लॉजिक HTML में है)
        document.body.removeChild(iframe);
    };
    
    // कुछ ब्राउज़रों के लिए जो onload इवेंट को तुरंत ट्रिगर करते हैं
    if (iframe.contentWindow.document.readyState === 'complete') {
        iframe.onload();
    }
}


/**
 * Helper to convert CSS size strings (e.g., '350px') to MM. 
 * This is an estimation based on a standard 96 DPI screen resolution, 
 * but ensures the aspect ratio is maintained in print CSS.
 */
function getMMValue(styleValue) {
    if (styleValue.endsWith('mm')) {
        return parseFloat(styleValue);
    }
    if (styleValue.endsWith('px')) {
        // Assuming 1px ≈ 0.264583mm (96 DPI)
        return parseFloat(styleValue) * 0.264583; 
    }
    // Fallback to a standard ID card dimension in mm (vertical height)
    return 86.36; 
}


/**
 * Builds the complete A4 Landscape HTML content with a fixed 5x2 grid.
 * It swaps card dimensions and applies correct rotation/translation if the card is horizontal.
 * @param {string[]} cardsHTMLArray - Array of card HTML strings (front, back, front, back, ...)
 * @param {string} title - Title for the print document.
 * @returns {string} The full HTML document ready for printing.
 */
function buildPrintHTML(cardsHTMLArray, title = "Print") {
    // --- Fixed A4 Landscape Settings ---
    const a4WidthMM = 297; 
    const a4HeightMM = 210; 
    const a4Orientation = `${a4WidthMM}mm ${a4HeightMM}mm`; 
    const pageMarginMM = 5; 
    const horizontalGapMM = 3;
    const verticalGapMM = 5;
    
    // --- FIXED LAYOUT: Always 5 columns and 2 rows for 10 cards ---
    const cardsPerRow = 5; 
    const rowsPerPage = 2; 
    
    // --- 1. Get Actual Card Dimensions for Sizing ---
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
    
    // Determine Card Orientation
    const isPortrait = actualWidth < actualHeight;
    
    let gridCardWidthMM, gridCardHeightMM;
    
    if (isPortrait) {
        // VERTICAL Card: Width (e.g., 55.88mm) is column size, Height (e.g., 86.36mm) is row size.
        gridCardWidthMM = actualWidth;
        gridCardHeightMM = actualHeight;
    } else {
        // HORIZONTAL Card: Dimensions swapped to fit 5x2 grid.
        gridCardWidthMM = actualHeight; // Use short side (card height) for column width
        gridCardHeightMM = actualWidth;  // Use long side (card width) for row height
    }
    
    // Round to 2 decimal places for clean CSS
    gridCardWidthMM = gridCardWidthMM.toFixed(2);
    gridCardHeightMM = gridCardHeightMM.toFixed(2);
    
    // The fixed size for the .card container on the print sheet
    const finalCardStyleWidth = `${gridCardWidthMM}mm`;
    const finalCardStyleHeight = `${gridCardHeightMM}mm`;

    // --- 2. Print Style Generation (Sharp Quality, NO Grid Lines, Horizontal Fix) ---
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
        
        /* The main grid container for each A4 sheet */
        .page { 
            width: ${a4WidthMM}mm; 
            height: ${a4HeightMM}mm; 
            display: grid;
            
            /* FIXED 5x2 grid */
            grid-template-columns: repeat(${cardsPerRow}, ${finalCardStyleWidth}); 
            grid-template-rows: repeat(${rowsPerPage}, ${finalCardStyleHeight});
            
            column-gap: ${horizontalGapMM}mm; 
            row-gap: ${verticalGapMM}mm; 
            
            padding: ${pageMarginMM}mm; 
            box-sizing: border-box; 
            page-break-after: always; 
        }

        /* Wrapper for each card on the print page */
        .card { 
            width: ${finalCardStyleWidth}; 
            height: ${finalCardStyleHeight}; 
            overflow: hidden; 
            position: relative; 
            background: #fff; 
            page-break-inside: avoid; 
            box-sizing: border-box; 
            border: none; /* Removed grid lines */
            
            /* Apply transformation for HORIZONTAL cards to rotate them 90 deg. */
            ${isPortrait ? '' : `
                /* Rotate 90deg clockwise */
                transform-origin: 0 0;
                /* Translate to move the rotated card back into the center of its grid cell. */
                transform: rotate(90deg) translate(0, -${gridCardHeightMM}mm);
            `}
        }

        /* The rendered content itself */
        .editor { 
            width: 100%; 
            height: 100%; 
            box-shadow: none !important; 
            border: none !important; 
            margin: 0 !important; 
            box-sizing: border-box; 
            transform: scale(1.0); /* Full scale for sharpness */
            transform-origin: top left;
            display:block;
        }
        
        img { max-width: 100%; max-height: 100%; display: block; }
        .card-item { position: absolute; box-sizing: border-box; display: flex; align-items: center; }
    </style>`;
    
    // --- 3. Page Reload Script (MODIFIED) 🔄
    const reloadScript = `<script>
        // Print खत्म होने (या Cancel होने) के बाद पेज को रीलोड करने के लिए
        window.addEventListener('afterprint', function() {
            window.location.reload(); 
        });
    </script>`;
    
    // --- 4. Arrange Cards in Zig-Zag (Front/Back) Order (Same as before) ---
    let allPagesHTML = '';
    
    // Separate cards into Fronts and Backs based on the assumption [Front1, Back1, Front2, Back2...]
    const frontCardsHTML = cardsHTMLArray.filter((_, i) => i % 2 === 0);
    const backCardsHTML = cardsHTMLArray.filter((_, i) => i % 2 !== 0);

    const cardsPerPage = cardsPerRow * rowsPerPage; // 10 cards
    const pairsPerPage = cardsPerPage / 2; // 5 pairs
    const totalPairs = frontCardsHTML.length; 
    
    // Process pairs page by page (5 pairs per page)
    for (let i = 0; i < totalPairs; i += pairsPerPage) {
        let pageCardsHTML = '';
        
        // --- Page Side 1 (Fronts) - Top Row (5 cards) ---
        for (let j = 0; j < pairsPerPage; j++) {
            const cardIndex = i + j;
            if (cardIndex < frontCardsHTML.length) {
                pageCardsHTML += `<div class="card">${frontCardsHTML[cardIndex]}</div>`;
            } else {
                pageCardsHTML += `<div class="card"></div>`; // Fill empty space
            }
        }
        
        // --- Page Side 2 (Backs) - Bottom Row (5 cards) ---
        for (let j = 0; j < pairsPerPage; j++) {
            const cardIndex = i + j;
            if (cardIndex < backCardsHTML.length) {
                pageCardsHTML += `<div class="card">${backCardsHTML[cardIndex]}</div>`;
            } else {
                pageCardsHTML += `<div class="card"></div>`; // Fill empty space
            }
        }
        
        allPagesHTML += `<div class="page">${pageCardsHTML}</div>`;
    }

    // Final HTML Document Structure - Note: 'onload' removed since printing is triggered externally.
    const html = `<html><head><title>${title}</title>${style}${reloadScript}</head><body>${allPagesHTML}</body></html>`;
    return html;
}
