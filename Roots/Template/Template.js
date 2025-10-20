/* =====================================================================
    ID Template Editor — script.js (FINAL: Local Storage Persistence + Clean UI)
    ===================================================================== */

/* -----------------------------
    1) Minimal UI sync (Two-Page)
    ----------------------------- */
(function () {
    const templateType = document.getElementById('templateType');
    const backPreviewBox = document.getElementById('backPreviewBox');
    const backBgGroup = document.getElementById('backBgGroup');

    function syncTwoPageUI() {
        const isTwo = templateType && templateType.value === '2';
        const preview = backPreviewBox || document.getElementById('backPreviewBox');
        const bgGroup = backBgGroup || document.getElementById('backBgGroup');
        
        if (preview) preview.classList.toggle('hidden', !isTwo);
        if (bgGroup) bgGroup.classList.toggle('hidden', !isTwo);
    }

    if (templateType) {
        templateType.addEventListener('change', () => {
            // Clear current working state when template type or ID changes
            clearLocalStorage(); 
            syncTwoPageUI();
            loadTemplate(true); // Force load new default template
        });
        syncTwoPageUI();
    }

    const dlTop = document.getElementById('downloadBtn');
    const dlBottom = document.getElementById('downloadBtn_bottom');
    if (dlTop && dlBottom) {
        dlBottom.addEventListener('click', () => dlTop.click());
    }
})();

/* -----------------------------
    2) State + DOM references
    ----------------------------- */
let currentTemplate = null;
const selection = { front: new Set(), back: new Set() };
let itemIdCounter = 1;
let currentFilter = 'All';
let currentlyExpandedFieldId = null;
const collapseState = { front: {}, back: {} }; 
const LOCAL_STORAGE_KEY = 'idTemplateEditorState'; // Unique key for local storage

// Cache DOM references
const idTypeSelect = document.getElementById('idType');
const templateTypeSelect = document.getElementById('templateType');
const frontCard = document.getElementById('frontCard');
const backCard = document.getElementById('backCard');
const frontBgInput = document.getElementById('frontBg');
const backBgInput = document.getElementById('backBg');
const backBgGroup = document.getElementById('backBgGroup');
const backPreviewBox = document.getElementById('backPreviewBox');
const frontPreviewBox = document.getElementById('frontPreviewBox');
const fieldListEl = document.getElementById('fieldList');
const $ = (id) => document.getElementById(id);


/* -----------------------------
    5) Helpers (consolidated and strengthened)
    ----------------------------- */
const safeValue = (v, fallback) => (v === undefined || v === null ? fallback : v);
const px = (v, fallback = 0) => {
    if (v === undefined || v === null || v === '') return `${fallback}px`;
    if (typeof v === 'number') return `${v}px`;
    if (typeof v === 'string' && (v.endsWith('px') || v.endsWith('%') || v.endsWith('em') || v.endsWith('rem'))) return v;
    const n = parseInt(String(v).replace(/[^\d-.]/g, ''), 10);
    return Number.isFinite(n) ? `${n}px` : `${fallback}px`;
};
const clampInt = (v, fallback = 0) => {
    const n = parseInt(String(v || fallback).replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(n) ? n : fallback;
};
const applyStyles = (el, styles = {}) => {
    if (!el || !styles) return;
    Object.keys(styles).forEach(k => {
        try { el.style[k] = styles[k]; } catch (e) { /* robustly ignore invalid style */ }
    });
};
const createEl = (tag = 'div', opts = {}) => {
    const el = document.createElement(tag);
    if (opts.className) el.className = opts.className;
    if (opts.html) el.innerHTML = opts.innerHTML;
    if (opts.text) el.textContent = opts.text;
    if (opts.attrs) Object.entries(opts.attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (opts.styles) applyStyles(el, opts.styles);
    return el;
};

// Find item across sides
function findItemById(id) {
    if (!id || !currentTemplate) return null;
    for (const s of ['front', 'back']) {
        const page = currentTemplate[s];
        if (!page || !page.items) continue;
        const found = page.items.find(it => it._id === id);
        if (found) return found;
    }
    return null;
}

// Find the side of an item
function findItemSide(id) {
    if (!id || !currentTemplate) return null;
    if (currentTemplate.front && currentTemplate.front.items.some(it => it._id === id)) return 'front';
    if (currentTemplate.back && currentTemplate.back.items.some(it => it._id === id)) return 'back';
    return null;
}

/* -----------------------------
    6) Normalize items (_id + defaults)
    ----------------------------- */
function addIdsToTemplate(tpl) {
    const clone = JSON.parse(JSON.stringify(tpl || {}));
    ['front', 'back'].forEach((side) => {
        if (!clone[side]) clone[side] = { items: [], pageStyle: {} };
        if (!Array.isArray(clone[side].items)) clone[side].items = [];

        clone[side].items.forEach((it) => {
            if (!it._id) it._id = 'itm_' + itemIdCounter++;
            if (!('borderWidth' in it)) it.borderWidth = 0;
            if (!('borderColor' in it)) it.borderColor = '#000000';
            if (!('borderRadius' in it)) it.borderRadius = 0;
            if (!('borderStyle' in it)) it.borderStyle = 'solid';
            if (!('left' in it)) it.left = '0px';
            if (!('top' in it)) it.top = '0px';
            it.group = it.group || (it.type === 'image' ? 'photo' : (it.text && it.text.trim().endsWith(':') ? 'label' : 'value'));
            if (!('isLinked' in it)) it.isLinked = true; // Default to linked
            
            // Initialize collapse state (default: collapsed/true)
            if (collapseState[side] && collapseState[side][it._id] === undefined) {
                // Keep the first item expanded initially
                collapseState[side][it._id] = (itemIdCounter === 2) ? false : true; 
                if (itemIdCounter === 2) currentlyExpandedFieldId = it._id;
            }
        });
    });
    return clone;
}

/* -----------------------------
    7) Local Storage Persistence
    ----------------------------- */

/** Saves the current state to Local Storage. */
function saveTemplateToLocalStorage() {
    if (!currentTemplate || !idTypeSelect || !templateTypeSelect) return;

    try {
        const stateToSave = {
            template: currentTemplate,
            selection: {
                front: Array.from(selection.front),
                back: Array.from(selection.back)
            },
            currentFilter: currentFilter,
            currentlyExpandedFieldId: currentlyExpandedFieldId,
            collapseState: collapseState,
            idType: idTypeSelect.value,
            templateType: templateTypeSelect.value,
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
        console.warn("Could not save state to local storage:", e);
    }
}

/** Loads state from Local Storage. Returns true if successful. */
function loadSavedTemplate() {
    try {
        const savedStateStr = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!savedStateStr) return false;

        const savedState = JSON.parse(savedStateStr);
        
        // Check if the saved state matches the current selector settings
        if (savedState.idType !== idTypeSelect.value || savedState.templateType !== templateTypeSelect.value) {
            console.log("Saved state found, but selectors do not match. Loading default.");
            return false;
        }

        currentTemplate = savedState.template;
        selection.front = new Set(savedState.selection.front);
        selection.back = new Set(savedState.selection.back);
        currentFilter = savedState.currentFilter;
        currentlyExpandedFieldId = savedState.currentlyExpandedFieldId;
        
        // Deep copy collapse state
        collapseState.front = savedState.collapseState.front || {};
        collapseState.back = savedState.collapseState.back || {};

        // Reset itemIdCounter to be safe (though not strictly necessary if we rely on stored IDs)
        itemIdCounter = 1; 
        
        console.log("Successfully loaded state from local storage.");
        return true;

    } catch (e) {
        console.error("Error loading state from local storage:", e);
        clearLocalStorage(); // Clear corrupted data
        return false;
    }
}

/** Clears the saved state from Local Storage. */
function clearLocalStorage() {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    console.log("Local storage state cleared.");
}


/* -----------------------------
    Card Editor — Logic
    ----------------------------- */
function renderAll() {
    renderFieldList();
    renderCard('front');
    if (currentTemplate && currentTemplate.back) renderCard('back');
    
    // Save state after every successful render
    saveTemplateToLocalStorage(); 
}

function renderCard(side) {
    const container = side === 'front' ? frontCard : backCard;
    if (!container || !currentTemplate) return;
    const page = currentTemplate[side];

    container.innerHTML = '';
    container.style.position = 'relative';
    
    if (!page) return;

    const ps = page.pageStyle || {};
    container.style.background = safeValue(ps.background, 'transparent');
    applyStyles(container, ps);

    const items = (page.items || []).filter(it => selection[side] && selection[side].has(it._id));

    items.forEach(item => {
        const isImg = item.type === 'image';
        const el = document.createElement(isImg ? 'img' : 'div');
        el.className = 'card-item';
        el.dataset.id = item._id;
        el.dataset.side = side;
        el.style.position = 'absolute';
        el.style.left = px(item.left, 0);
        el.style.top  = px(item.top, 0);
        el.style.cursor = 'grab';
        el.draggable = false;
        el.style.userSelect = 'none';

        if (isImg) {
            el.setAttribute('src', safeValue(item.src, ''));
            el.style.width = px(item.width, 100);
            el.style.height = px(item.height, 100);
            const bw = clampInt(item.borderWidth, 0);
            const bs = safeValue(item.borderStyle, 'solid');
            const bc = safeValue(item.borderColor, '#000000');
            el.style.border = `${bw}px ${bs} ${bc}`;
            el.style.borderRadius = px(item.borderRadius, 0);
        } else {
            el.textContent = safeValue(item.text, '');
            el.style.color = safeValue(item.color, '#111827');
            el.style.fontSize = px(item.fontSize, 12);
            el.style.fontWeight = safeValue(item.fontWeight, '500');
            el.style.fontFamily = safeValue(item.fontFamily, 'Inter, system-ui, sans-serif');
            el.style.whiteSpace = 'pre-wrap';
        }

        attachPointerDrag(el, (newLeft, newTop) => {
            el.style.left = `${newLeft}px`;
            el.style.top  = `${newTop}px`;

            const itm = findItemById(item._id);
            if (itm) {
                itm.left = `${newLeft}px`;
                itm.top  = `${newTop}px`;
            }

            // Also trigger auto-select/expand on drag
            setFieldFilter(item.group.charAt(0).toUpperCase() + item.group.slice(1));
            forceExpandField(item._id);

            if (fieldListEl) {
                const inputLeft = fieldListEl.querySelector(`input[data-id="${item._id}"][data-prop="left"]`);
                const inputTop  = fieldListEl.querySelector(`input[data-id="${item._id}"][data-prop="top"]`);
                if (inputLeft) inputLeft.value = newLeft;
                if (inputTop)  inputTop.value  = newTop;
            }
        });

        container.appendChild(el);
    });
}

function attachPointerDrag(el, onMove) {
    if (el.dataset.dragAttached) return;

    let dragging = false;
    let startX = 0, startY = 0;
    let origLeft = 0, origTop = 0;
    let rafId = null;

    function toNumberPx(v) {
        if (!v) return 0;
        if (typeof v === 'number') return v;
        return parseInt(String(v).replace(/[^\d-.]/g, ''), 10) || 0;
    }

    function onPointerDown(e) {
        e.preventDefault();
        
        try { el.setPointerCapture?.(e.pointerId); } catch (err) {} 
        
        dragging = true;
        el.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;
        origLeft = toNumberPx(el.style.left);
        origTop  = toNumberPx(el.style.top);

        const handleMove = (cx, cy) => {
            const deltaX = cx - startX;
            const deltaY = cy - startY;

            let newLeft = origLeft + deltaX;
            let newTop  = origTop  + deltaY;

            newLeft = Math.max(0, newLeft);
            newTop  = Math.max(0, newTop);

            onMove(Math.round(newLeft), Math.round(newTop));
        };

        function onPointerMove(eMove) {
            if (!dragging) return;
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => handleMove(eMove.clientX, eMove.clientY));
        }

        function onPointerUp(eUp) {
            dragging = false;
            el.style.cursor = 'grab';
            
            try { el.releasePointerCapture?.(eUp.pointerId); } catch (err) {}
            
            el.removeEventListener('pointermove', onPointerMove);
            el.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            cancelAnimationFrame(rafId);
            rafId = null;

            // Re-render list to update coordinates after drag finish
            renderFieldList();
        }

        el.addEventListener('pointermove', onPointerMove);
        el.addEventListener('pointerup', onPointerUp);
    }

    el.addEventListener('pointerdown', onPointerDown);
    el.dataset.dragAttached = 'true';
}

/**
 * Syncs a specific property for all linked items based on the given group.
 * @param {string} groupKey - The group key ('label', 'value', or 'photo').
 * @param {string} prop - The property to sync ('color' or 'borderColor').
 * @param {string} value - The new color value.
 */
function syncColor(groupKey, prop, value) {
    if (!currentTemplate) return;
    
    ['front', 'back'].forEach(s => {
        const p = currentTemplate[s];
        if (!p || !Array.isArray(p.items)) return;
        p.items.forEach(item => {
            const itemGroup = item.group || (item.type === 'image' ? 'photo' : 'value');
            
            let shouldSync = false;
            
            // Check if item belongs to the master group AND matches the property type
            if (groupKey === itemGroup) {
                if (prop === 'color' && item.type !== 'image') shouldSync = true;
                if (prop === 'borderColor' && item.type === 'image') shouldSync = true;
            }

            if (shouldSync && item.isLinked) {
                item[prop] = value;

                // Update computed border for images
                if (item.type === 'image' && prop === 'borderColor') {
                    const bw = clampInt(item.borderWidth, 0);
                    const bs = safeValue(item.borderStyle, 'solid');
                    item.border = `${bw}px ${bs} ${item.borderColor}`;
                }
            }
        });
        renderCard(s);
    });
    // Re-render list to ensure master controls reflect the change
    renderFieldList(); 
}


function moveFieldToOppositeSide(currentSide, fieldId) {
    if (!currentTemplate) return;
    const opposite = currentSide === 'front' ? 'back' : 'front';
    const src = currentTemplate[currentSide];
    if (!src || !Array.isArray(src.items)) return;
    const idx = src.items.findIndex(it => it._id === fieldId);
    if (idx === -1) return;

    const [moved] = src.items.splice(idx, 1);

    if (!currentTemplate[opposite]) currentTemplate[opposite] = { items: [] };
    if (!Array.isArray(currentTemplate[opposite].items)) currentTemplate[opposite].items = [];
    currentTemplate[opposite].items.push(moved);

    if (selection[currentSide] && selection[currentSide].has(fieldId)) {
        selection[currentSide].delete(fieldId);
        selection[opposite] = selection[opposite] || new Set();
        selection[opposite].add(fieldId);
    }

    // Move collapse state too
    collapseState[opposite][fieldId] = collapseState[currentSide][fieldId];
    delete collapseState[currentSide][fieldId];
    if (currentlyExpandedFieldId === fieldId) {
        currentlyExpandedFieldId = null; // Reset expand state
    }

    renderCard('front');
    renderCard('back');
    renderFieldList();
    
    if (templateTypeSelect && templateTypeSelect.value !== '2') {
        const syncTwoPageUI = (() => {
            const tt = document.getElementById('templateType');
            const bpb = document.getElementById('backPreviewBox');
            const bbg = document.getElementById('backBgGroup');
            const isTwo = tt && tt.value === '2';
            if (bpb) bpb.classList.toggle('hidden', !isTwo);
            if (bbg) bbg.classList.toggle('hidden', !isTwo);
        })();
    }
}

// --------------------------
// Properties panel rendering (GROUP MASTER COLOR)
// --------------------------
function setFieldFilter(filter) {
    currentFilter = filter;
    renderFieldList();
}

function forceExpandField(itemId) {
    const side = findItemSide(itemId);
    if (!side) return;

    // 1. Collapse all others
    if (currentlyExpandedFieldId && currentlyExpandedFieldId !== itemId) {
        const currentSide = findItemSide(currentlyExpandedFieldId);
        if (currentSide) {
            collapseState[currentSide][currentlyExpandedFieldId] = true;
        }
    }

    // 2. Expand the new one and set state
    collapseState[side][itemId] = false;
    currentlyExpandedFieldId = itemId;

    // 3. Re-render the list
    renderFieldList();

    // 4. Scroll to the new expanded item (requires re-render to complete)
    setTimeout(() => {
        const targetElement = fieldListEl.querySelector(`[data-field-id="${itemId}"]`);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
}


function renderFieldList() {
    if (!fieldListEl || !currentTemplate) return;
    fieldListEl.innerHTML = '';

    // Filter Controls
    const filters = ['All', 'Label', 'Value', 'Photo'];
    const filterContainer = createEl('div', { styles: { display: 'flex', gap: '4px', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #1f2a3d' } });

    filters.forEach(f => {
        const btn = createEl('button', { text: f, styles: { padding: '4px 8px', cursor: 'pointer', flexGrow: '1', borderRadius: '4px', fontSize: '12px', transition: 'background 0.2s' } });
        if (currentFilter === f) {
            applyStyles(btn, { background: '#3b82f6', color: '#fff', border: 'none' });
        } else {
            applyStyles(btn, { background: '#111827', color: '#9ca3af', border: '1px solid #374151' });
        }
        btn.addEventListener('click', () => setFieldFilter(f));
        filterContainer.appendChild(btn);
    });

    fieldListEl.appendChild(filterContainer);
    
    // Group Items for Master Controls (Across both front/back)
    const allGroupItems = { label: [], value: [], photo: [] };
    ['front', 'back'].forEach(s => {
        const p = currentTemplate[s];
        if (p && p.items) {
            p.items.forEach(item => {
                const groupKey = item.group || (item.type === 'image' ? 'photo' : 'value');
                if (allGroupItems[groupKey]) {
                    allGroupItems[groupKey].push(item);
                }
            });
        }
    });
    
    // 1. MASTER COLOR CONTROLS (Only for Label, Value, Photo filters - Clean UI)
    if (currentFilter !== 'All') {
        renderMasterColorControls(fieldListEl, allGroupItems);
    }

    // 2. INDIVIDUAL FIELD LISTS
    renderSideFieldList('front', 'Front', fieldListEl);
    if (currentTemplate.back) {
        const hr = createEl('div', { className: 'hr', styles: { height: '1px', background: '#1f2a3d', margin: '15px 0' } });
        fieldListEl.appendChild(hr);
        renderSideFieldList('back', 'Back', fieldListEl);
    }
}

/**
 * Renders master color controls based on the current filter.
 * This version is CLEAN and only shows the color input and swatches.
 */
function renderMasterColorControls(containerEl, allGroupItems) {
    
    const filterKey = currentFilter.toLowerCase();
    
    if (filterKey === 'all') return; // Do not render master controls for 'All'

    const masterContainer = createEl('div', { styles: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px', marginTop: '15px' } });
    
    let syncProp, groupName, defaultColors;
    const relevantItems = allGroupItems[filterKey] || [];

    if (filterKey === 'label' || filterKey === 'value') {
        syncProp = 'color';
        groupName = `${filterKey.charAt(0).toUpperCase() + filterKey.slice(1)} Color`;
        
        const repItem = relevantItems.find(item => item.isLinked);
        const currentColor = repItem ? (repItem.color || '#111827') : '#111827';
        defaultColors = ['#111827', '#059669', '#EF4444', '#3B82F6', '#FBBF24']; 

        if (relevantItems.length === 0) return;
        
        const masterColorWrap = createMasterColorWrap(groupName, currentColor, filterKey, syncProp, defaultColors);
        masterContainer.appendChild(masterColorWrap);

    } else if (filterKey === 'photo') {
        syncProp = 'borderColor';
        groupName = `Photo Border`;
        
        const repItem = relevantItems.find(item => item.isLinked);
        const currentColor = repItem ? (repItem.borderColor || '#000000') : '#000000';
        defaultColors = ['#000000', '#FFFFFF', '#FF0000', '#0000FF', '#008000']; 

        if (relevantItems.length === 0) return;

        const masterColorWrap = createMasterColorWrap(groupName, currentColor, filterKey, syncProp, defaultColors);
        masterContainer.appendChild(masterColorWrap);
    }
    
    // Only append container if any controls were created
    if (masterContainer.children.length > 0) {
        containerEl.appendChild(masterContainer);
    }
}

function createMasterColorWrap(groupName, currentColor, syncGroupKey, syncProp, defaultColors) {
    const masterColorWrap = createEl('div', { 
        styles: { 
            padding: '10px', 
            borderRadius: '6px', 
            background: '#2b3a4a', 
            border: '1px solid #374151',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        } 
    });

    // CLEAN UI: Minimal Header Text (only Group Name)
    const headerTitle = createEl('div', { 
        text: groupName, 
        styles: { 
            fontSize: '13px', 
            color: '#fff', 
            marginBottom: '8px',
            paddingBottom: '4px',
            borderBottom: '1px solid #374151',
            fontWeight: '500'
        } 
    });
    masterColorWrap.appendChild(headerTitle);

    const controlRow = createEl('div', { 
        styles: { 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            gap: '8px' 
        } 
    });
    
    // Master Color Input
    const masterColorInput = createEl('input', { 
        attrs: { 
            type: 'color', 
            value: currentColor,
            'data-group-key': syncGroupKey,
            'data-sync-prop': syncProp,
            title: groupName
        }, 
        styles: { 
            width: '40px', 
            height: '24px', 
            padding: '0', 
            border: 'none', 
            borderRadius: '4px', 
            overflow: 'hidden', 
            cursor: 'pointer',
            flexShrink: 0
        } 
    });
    
    masterColorInput.addEventListener('input', (e) => {
        const key = e.target.getAttribute('data-group-key');
        const prop = e.target.getAttribute('data-sync-prop');
        syncColor(key, prop, e.target.value); 
    });
    controlRow.appendChild(masterColorInput);
    
    // Color Swatches
    const swatchesContainer = createEl('div', {
        styles: {
            display: 'flex',
            gap: '6px',
            flexGrow: 1,
            justifyContent: 'flex-end'
        }
    });
    
    defaultColors.forEach(col => {
        const sw = createEl('span', { 
            attrs: { 'data-color': col, 'title': col }, 
            styles: { 
                background: col, 
                width: '28px', 
                height: '24px', 
                display: 'inline-block', 
                cursor: 'pointer', 
                border: '2px solid #374151', 
                borderRadius: '4px', 
                flexShrink: 0 
            } 
        });
        sw.addEventListener('click', () => {
            masterColorInput.value = col;
            syncColor(syncGroupKey, syncProp, col);
        });
        swatchesContainer.appendChild(sw);
    });

    controlRow.appendChild(swatchesContainer);
    masterColorWrap.appendChild(controlRow);
    
    return masterColorWrap;
}


function renderSideFieldList(side, title, containerEl) {
    const page = currentTemplate[side];
    if (!page || !Array.isArray(page.items)) return;

    const sideContainer = createEl('div', { styles: { marginBottom: '15px', marginTop: '15px' } });
    const h = createEl('h3', { text: `${title} Fields`, styles: { marginBottom: '8px', fontSize: '16px', color: '#e5e7eb' } });
    containerEl.appendChild(h);

    const groupItems = {};
    page.items.forEach(item => {
        item.group = item.group || (item.type === 'image' ? 'photo' : 'value');
        if (!groupItems[item.group]) groupItems[item.group] = [];
        groupItems[item.group].push(item);
    });

    const groupsToRender = ['label', 'value', 'photo'].filter(g => groupItems[g] && (currentFilter === 'All' || currentFilter.toLowerCase() === g));
    
    if (groupsToRender.length === 0 && currentFilter !== 'All') {
        const groupName = currentFilter;
        const noItems = createEl('div', { text: `No ${groupName} fields found on ${title}.`, styles: { fontSize: '14px', opacity: '0.7', padding: '10px 0', color: '#9ca3af' } });
        containerEl.appendChild(noItems);
        return;
    }

    groupsToRender.forEach(groupKey => {
        const itemsInGroup = groupItems[groupKey];
        
        // 2. INDIVIDUAL FIELD CARDS
        itemsInGroup.forEach((item) => {
            item.isLinked = item.isLinked === undefined ? true : !!item.isLinked;
            
            // Determine collapse state using the stored state
            const isCollapsed = collapseState[side][item._id] === undefined ? true : collapseState[side][item._id];
            
            const wrap = createEl('div', { 
                className: 'fieldcard', 
                attrs: { 'data-field-id': item._id }, // Add ID for scrolling/targeting
                styles: { 
                    padding: '0px 10px 0px 10px', 
                    marginBottom: '6px', 
                    border: '1px solid #374151', 
                    borderRadius: '6px', 
                    background: '#1f2937',
                    overflow: 'hidden', 
                    transition: 'height 0.2s ease-out',
                    boxShadow: selection[side].has(item._id) ? '0 0 0 2px #3b82f6' : 'none'
                } 
            });

            // Toggle function
            const toggleCollapse = () => {
                const content = wrap.querySelector('.field-content');
                if (!content) return; 

                const shouldCollapse = !collapseState[side][item._id]; // Read current state and flip
                
                // If expanding: collapse others first
                if (!shouldCollapse) {
                    if (currentlyExpandedFieldId && currentlyExpandedFieldId !== item._id) {
                        const prevExpanded = fieldListEl.querySelector(`[data-field-id="${currentlyExpandedFieldId}"]`);
                        if (prevExpanded) {
                            // Visually collapse the previous one
                            prevExpanded.style.height = '40px';
                            const icon = prevExpanded.querySelector('.collapse-icon');
                            if (icon) icon.textContent = '▶';
                            
                            // Update the previous state in the map
                            const prevSide = findItemSide(currentlyExpandedFieldId);
                            if (prevSide) collapseState[prevSide][currentlyExpandedFieldId] = true;
                        }
                    }
                    currentlyExpandedFieldId = item._id;
                } else {
                    currentlyExpandedFieldId = null;
                }

                // Update state and visual
                collapseState[side][item._id] = shouldCollapse;
                wrap.style.height = shouldCollapse ? '40px' : `${content.scrollHeight + 40}px`; 
                
                const icon = wrap.querySelector('.collapse-icon');
                if (icon) icon.textContent = shouldCollapse ? '▶' : '▼';
                
                saveTemplateToLocalStorage(); // Save collapse state change
            };


            // COLLAPSIBLE HEADER
            const header = createEl('div', { 
                styles: { 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '8px 0', 
                    cursor: 'pointer' 
                } 
            });
            header.addEventListener('click', toggleCollapse);

            const icon = createEl('span', { className: 'collapse-icon', text: isCollapsed ? '▶' : '▼', styles: { fontSize: '10px', marginRight: '5px' } });
            
            // CLEANED HEADER TEXT
            const headerText = (item.text && item.text.trim()) || (item.type === 'image' ? 'Image' : 'Untitled');
            const titleSpan = createEl('span', { text: headerText, styles: { fontWeight: '600', fontSize: '14px', color: '#fff', flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } });
            
            header.appendChild(icon);
            header.appendChild(titleSpan);

            // Spacer and visibility checkbox
            const controlsGroup = createEl('div', { styles: { display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 } });
            
            // Show on Card Checkbox
            const cb = createEl('input', { attrs: { type: 'checkbox', 'data-side': side, 'data-id': item._id }, styles: { width: '14px', height: '14px' } });
            cb.checked = selection[side] && selection[side].has(item._id);
            const cbLabel = createEl('label', { title: 'Toggle visibility on the card preview', styles: { display: 'flex', gap: '4px', alignItems: 'center', cursor: 'pointer', fontSize: '12px', color: '#9ca3af' } });
            cbLabel.appendChild(cb);
            cbLabel.appendChild(createEl('span', { text: 'Show' }));
            controlsGroup.appendChild(cbLabel);

            header.appendChild(controlsGroup);
            wrap.appendChild(header);

            // CONTENT WRAPPER
            const contentWrap = createEl('div', { className: 'field-content', styles: { paddingBottom: '10px', borderTop: '1px solid #374151' } });

            // Content Row 1: Group and Link
            const primaryRow = createEl('div', { styles: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', alignItems: 'center', marginTop: '6px' } });
            
            // Group Selector
            const select = createEl('select', { attrs: { 'data-side': side, 'data-id': item._id, 'data-prop': 'group' }, styles: { padding: '4px', fontSize: '12px', background: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' } });
            [['label', 'Label'], ['value', 'Value'], ['photo', 'Photo']].forEach(([val, txt]) => {
                const opt = createEl('option', { text: txt, attrs: { value: val } });
                if (item.group === val) opt.selected = true;
                select.appendChild(opt);
            });
            primaryRow.appendChild(select);

            // Link Checkbox (Toggles sync with group master control)
            const linkLabel = createEl('label', { title: `Link to Master Color`, styles: { display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '12px', color: '#9ca3af', background: '#374151', padding: '4px 8px', borderRadius: '4px' } });
            const linkInput = createEl('input', { attrs: { type: 'checkbox', 'data-side': side, 'data-id': item._id, 'data-prop': 'isLinked' }, styles: { width: '14px', height: '14px' } });
            linkInput.checked = !!item.isLinked;
            linkLabel.appendChild(linkInput);
            linkLabel.appendChild(createEl('span', { text: 'Sync Master Color' }));
            primaryRow.appendChild(linkLabel);
            
            contentWrap.appendChild(primaryRow);


            // POSITION INPUTS (2x Grid)
            const posRow = createEl('div', { styles: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' } });
            
            const createPositionInput = (prop, value) => {
                const input = createEl('input', { attrs: { type: 'number', min: '0', value: clampInt(value, 0), 'data-side': side, 'data-id': item._id, 'data-prop': prop, placeholder: `${prop.charAt(0).toUpperCase() + prop.slice(1)} (px)` }, styles: { width: '100%', padding: '4px', fontSize: '12px', background: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' } });
                return input;
            };

            const inLeft = createPositionInput('left', item.left);
            const inTop = createPositionInput('top', item.top);
            
            posRow.appendChild(inLeft);
            posRow.appendChild(inTop);
            contentWrap.appendChild(posRow);

            // TYPE-SPECIFIC CONTROLS
            if (item.type === 'image') {
                const sizeRow = createEl('div', { styles: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' } });
                
                const createSizeInput = (prop, value) => {
                    return createEl('input', { attrs: { type: 'number', min: '1', value: clampInt(value, 100), 'data-side': side, 'data-id': item._id, 'data-prop': prop, placeholder: prop.charAt(0).toUpperCase() + prop.slice(1) + ' (px)' }, styles: { width: '100%', padding: '4px', fontSize: '12px', background: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' } });
                };

                sizeRow.appendChild(createSizeInput('width', item.width));
                sizeRow.appendChild(createSizeInput('height', item.height));
                contentWrap.appendChild(sizeRow);
                
                const borderRow = createEl('div', { styles: { display: 'grid', gridTemplateColumns: '4fr 2fr 1fr', gap: '8px', marginTop: '8px', alignItems: 'center' } });

                const borderStyle = createEl('select', { attrs: { 'data-side': side, 'data-id': item._id, 'data-prop': 'borderStyle' }, styles: { padding: '4px', fontSize: '12px', background: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' } });
                ['solid', 'dashed', 'dotted', 'double'].forEach(bs => {
                    const opt = createEl('option', { text: bs.charAt(0).toUpperCase() + bs.slice(1), attrs: { value: bs } });
                    if (item.borderStyle === bs) opt.selected = true;
                    borderStyle.appendChild(opt);
                });
                borderRow.appendChild(borderStyle);

                const borderWidth = createEl('input', { attrs: { type: 'number', min: '0', max: '20', value: clampInt(item.borderWidth, 0), 'data-side': side, 'data-id': item._id, 'data-prop': 'borderWidth', placeholder: 'BW' }, styles: { width: '100%', padding: '4px', fontSize: '12px', background: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px', textAlign: 'center' } });
                borderRow.appendChild(borderWidth);

                const borderColor = createEl('input', { attrs: { type: 'color', title: 'Border Color', value: item.borderColor || '#000000', 'data-side': side, 'data-id': item._id, 'data-prop': 'borderColor' }, styles: { width: '100%', height: '24px', padding: '0', border: 'none', borderRadius: '4px', overflow: 'hidden', cursor: 'pointer' } });
                borderRow.appendChild(borderColor);

                contentWrap.appendChild(borderRow);
                
                // Border Radius + Swatches for quick Border Color Selection (NOT Master)
                const footerRow = createEl('div', { styles: { display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' } });

                const borderRadius = createEl('input', { attrs: { type: 'number', min: '0', value: clampInt(item.borderRadius, 0), 'data-side': side, 'data-id': item._id, 'data-prop': 'borderRadius', placeholder: 'Radius (px)' }, styles: { flexGrow: '1', padding: '4px', fontSize: '12px', background: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' } });
                footerRow.appendChild(borderRadius);

                // Individual Swatches
                ['#08f738', '#f30a0a', '#1e40af', '#ffffff', '#000000'].forEach(col => {
                    const sw = createEl('span', { attrs: { 'data-color': col }, styles: { background: col, width: '18px', height: '18px', display: 'inline-block', cursor: 'pointer', border: '2px solid #22324b', borderRadius: '4px', flexShrink: 0 } });
                    sw.addEventListener('click', () => {
                        const itm = findItemById(item._id);
                        if (!itm) return;
                        itm.borderColor = col;
                        
                        const bw = clampInt(itm.borderWidth, 0);
                        const bs = safeValue(itm.borderStyle, 'solid');
                        itm.border = `${bw}px ${bs} ${itm.borderColor}`;
                        
                        const colorInput = wrap.querySelector('input[data-prop="borderColor"]');
                        if (colorInput) colorInput.value = col;
                        
                        // NOTE: This does NOT sync the master control
                        renderCard(side);
                        saveTemplateToLocalStorage();
                    });
                    footerRow.appendChild(sw);
                });

                contentWrap.appendChild(footerRow);

            } else {
                // Text Fields
                const textRow = createEl('div', { styles: { display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', marginTop: '8px', alignItems: 'center' } });
                
                const sizeColorGroup = createEl('div', { styles: { display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '8px' } });
                
                const fontSize = createEl('input', { attrs: { type: 'number', min: '8', max: '96', value: clampInt(item.fontSize, 12), 'data-side': side, 'data-id': item._id, 'data-prop': 'fontSize', placeholder: 'Size (px)' }, styles: { width: '100%', padding: '4px', fontSize: '12px', background: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' } });
                
                const colorIn = createEl('input', { attrs: { type: 'color', title: 'Text Color', value: item.color || '#111827', 'data-side': side, 'data-id': item._id, 'data-prop': 'color' }, styles: { width: '100%', height: '24px', padding: '0', border: 'none', borderRadius: '4px', overflow: 'hidden', cursor: 'pointer' } });
                
                sizeColorGroup.appendChild(fontSize);
                sizeColorGroup.appendChild(colorIn);
                textRow.appendChild(sizeColorGroup);
                
                const fontWeight = createEl('select', { attrs: { 'data-side': side, 'data-id': item._id, 'data-prop': 'fontWeight' }, styles: { width: '100%', padding: '4px', fontSize: '12px', background: '#374151', color: '#fff', border: '1px solid #4b5563', borderRadius: '4px' } });
                ['400', '500', '600', '700', 'bold'].forEach(fw => {
                    const opt = createEl('option', { text: fw, attrs: { value: fw } });
                    if (String(item.fontWeight) === fw) opt.selected = true;
                    fontWeight.appendChild(opt);
                });
                textRow.appendChild(fontWeight);
                
                contentWrap.appendChild(textRow);
            }

            if (templateTypeSelect && templateTypeSelect.value === '2') {
                const moveBtnRow = createEl('div', { styles: { marginTop: '8px' } });
                const moveBtn = createEl('button', { text: `Move to ${side === 'front' ? 'Back' : 'Front'}`, styles: { padding: '4px', cursor: 'pointer', width: '100%', borderRadius: '4px', background: '#4b5563', color: '#fff', border: 'none', fontSize: '12px' } });
                moveBtn.addEventListener('click', () => {
                    moveFieldToOppositeSide(side, item._id);
                    saveTemplateToLocalStorage();
                });
                moveBtnRow.appendChild(moveBtn);
                contentWrap.appendChild(moveBtnRow);
            }
            
            wrap.appendChild(contentWrap);

            // Apply initial collapse state
            if (isCollapsed) {
                 wrap.style.height = '40px'; 
            } else {
                // If it should be expanded, wait for the content to render, then set height
                requestAnimationFrame(() => {
                    const contentHeight = contentWrap.scrollHeight;
                    wrap.style.height = `${contentHeight + 40}px`;
                });
            }
            
            // --- Event Listeners for Individual Controls ---
            
            // 1. Show on Card Toggle
            cb.addEventListener('change', (ev) => {
                if (!selection[side]) selection[side] = new Set();
                if (ev.target.checked) selection[side].add(item._id);
                else selection[side].delete(item._id);
                renderCard(side);
                renderFieldList(); // Re-render to update box shadow on card
                saveTemplateToLocalStorage();
            });

            // 2. Property Inputs/Selects Listener
            contentWrap.querySelectorAll('input:not([type="checkbox"][data-prop="isLinked"]), select, input[data-prop]').forEach(input => {
                
                if (!input.dataset.prop) return; 

                const isColorProp = ['color', 'borderColor'].includes(input.dataset.prop);
                const isLinkedProp = input.dataset.prop === 'isLinked';
                const isGroupProp = input.dataset.prop === 'group';
                const isNumberInput = input.type === 'number';
                
                const eventType = (isNumberInput || isColorProp || isGroupProp) ? 'change' : 'input';

                input.addEventListener(eventType, (e) => {
                    const id = e.target.dataset.id;
                    const s = e.target.dataset.side;
                    const prop = e.target.dataset.prop;
                    const itm = findItemById(id);
                    if (!itm) return;

                    let val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                    
                    // --- APPLY VALUE TO INDIVIDUAL ITEM ---
                    if (['left', 'top', 'width', 'height', 'borderRadius', 'fontSize', 'borderWidth'].includes(prop)) {
                        val = isNumberInput ? e.target.value : val;
                        itm[prop] = px(val, 0);
                        if (prop === 'left' || prop === 'top') renderCard(s); 
                    } else {
                        itm[prop] = val;
                    }
                    // --------------------------------------

                    // Update computed border for images
                    if (itm.type === 'image' && ['borderWidth', 'borderStyle', 'borderColor'].includes(prop)) {
                        const bw = clampInt(itm.borderWidth, 0);
                        const bs = safeValue(itm.borderStyle, 'solid');
                        const bc = safeValue(itm.borderColor, '#000000');
                        itm.border = `${bw}px ${bs} ${bc}`;
                    }
                    
                    // Sync color/borderColor to Master if linked and property changes (to keep Master picker in sync)
                    if (itm.isLinked && isColorProp) {
                       const groupToSync = itm.group; // 'label', 'value', or 'photo'
                       syncColor(groupToSync, prop, itm[prop]);
                    } 

                    if (eventType === 'change' || !['left', 'top'].includes(prop)) { 
                        renderCard(s);
                    }

                    // Re-render list if group or link state changed
                    if (isGroupProp || isLinkedProp) { 
                        renderFieldList();
                    }
                    
                    saveTemplateToLocalStorage();
                });
            });
            
            // 3. Link Checkbox Listener (Must be separate to handle `isLinked` correctly)
            if (linkInput) {
                linkInput.addEventListener('change', (e) => {
                    const id = e.target.dataset.id;
                    const prop = e.target.dataset.prop; // Should be 'isLinked'
                    const itm = findItemById(id);
                    if (!itm) return;
                    
                    itm[prop] = !!e.target.checked;
                    renderFieldList(); // Re-render to update UI and logic
                    renderCard(side);
                    saveTemplateToLocalStorage();
                });
            }


            sideContainer.appendChild(wrap);
        });
    });
    
    containerEl.appendChild(sideContainer);
}


/* -----------------------------
    4) Template load
    ----------------------------- */
/**
 * Loads the template, either from local storage or default JSON.
 * @param {boolean} forceDefault - If true, ignores local storage and loads default.
 */
function loadTemplate(forceDefault = false) {
    if (!idTypeSelect || !templateTypeSelect) {
        return console.error('Required select elements for ID and Template type are missing.');
    }
    
    // Attempt to load from local storage unless forcing default
    if (!forceDefault && loadSavedTemplate()) {
        const isTwoPage = templateTypeSelect.value === '2';
        // Re-sync UI based on loaded state
        if (backBgGroup) backBgGroup.style.display = isTwoPage ? 'block' : 'none';
        if (backPreviewBox) backPreviewBox.style.display = isTwoPage ? 'flex' : 'none';
        if (frontPreviewBox) frontPreviewBox.style.display = 'flex';
        renderAll();
        return;
    }

    const idType = idTypeSelect.value.toLowerCase();
    const pageType = templateTypeSelect.value.toLowerCase();
    let fileURL = '';

    if (pageType === 'own') {
        if (idType === 'student') fileURL = 'https://penportindia.github.io/lak/Pages/Template/templates/Studentown.json';
        else if (idType === 'staff') fileURL = 'https://penportindia.github.io/lak/Pages/Template/templates/Staffown.json';
        else return alert('⚠️ Invalid ID Type for Own template selected.');
    } else {
        const baseURL = 'https://raw.githubusercontent.com/penportindia/lak/main/Pages/Template/templates';
        const fileName = `${idType.charAt(0).toUpperCase() + idType.slice(1)}-${pageType.toUpperCase()}.json`;
        fileURL = `${baseURL}/${fileName}`;
    }

    currentTemplate = null;
    selection.front.clear();
    selection.back.clear();
    currentlyExpandedFieldId = null; // Reset expansion state

    fetch(fileURL)
        .then((res) => {
            if (!res.ok) throw new Error(`Template not found or network error: ${res.status}`);
            return res.json();
        })
        .then((data) => {
            if (!data.front) throw new Error('Template is missing the required "front" data.');

            currentTemplate = addIdsToTemplate(data);
            
            const isTwoPage = pageType === '2';
            if (backBgGroup) backBgGroup.style.display = isTwoPage ? 'block' : 'none';
            if (backPreviewBox) backPreviewBox.style.display = isTwoPage ? 'flex' : 'none';
            if (frontPreviewBox) frontPreviewBox.style.display = 'flex';
            
            if (frontBgInput) frontBgInput.value = '';
            if (backBgInput) backBgInput.value = '';

            selection.front = new Set((currentTemplate.front?.items || []).map((it) => it._id));
            selection.back = isTwoPage && currentTemplate.back
                ? new Set((currentTemplate.back?.items || []).map((it) => it._id))
                : new Set();
            
            if (!isTwoPage && backCard) {
                backCard.innerHTML = '';
            }

            renderAll();
        })
        .catch((err) => {
            currentTemplate = { front: { items: [], pageStyle: {} }, back: null };
            renderAll();
            console.error(err);
            alert('⚠️ Error loading template: ' + err.message);
        });
}

/* -----------------------------
    9) Background upload
    ----------------------------- */
function uploadBackground(event, side) {
    if (!currentTemplate || !currentTemplate[side]) return alert('Template not loaded or invalid side.');

    const fileInput = event.target;
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        alert('Invalid file type. Please select an image.');
        fileInput.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        currentTemplate[side].pageStyle = currentTemplate[side].pageStyle || {};
        currentTemplate[side].pageStyle.backgroundImage = `url(${e.target.result})`;
        currentTemplate[side].pageStyle.backgroundSize = 'cover';
        currentTemplate[side].pageStyle.backgroundRepeat = 'no-repeat';
        currentTemplate[side].pageStyle.backgroundPosition = 'center';
        renderCard(side);
        fileInput.value = '';
        saveTemplateToLocalStorage();
    };
    reader.onerror = function(err) {
        alert('Error reading file: ' + err.message);
        fileInput.value = '';
    };
    reader.readAsDataURL(file);
}


/* -----------------------------
    10) Selection utilities
    ----------------------------- */
function setAllSelection(checked) {
    if (!currentTemplate) return;
    ['front', 'back'].forEach((side) => {
        if (!currentTemplate[side]) return;
        const ids = (currentTemplate[side].items || []).map((it) => it._id);
        selection[side] = checked ? new Set(ids) : new Set();
    });
    renderAll();
}

/* -----------------------------
    11) Download template (JSON)
    ----------------------------- */

// Global variable to hold the filtered data temporarily
let tplToExport = null;

function downloadTemplate() {
    if (!currentTemplate || !idTypeSelect || !templateTypeSelect) {
        return alert('Error: Template or selectors missing.');
    }

    // --- 1. Filtering Logic (Same as before) ---
    const tplCopy = JSON.parse(JSON.stringify(currentTemplate));
    const pageType = templateTypeSelect.value;
    const sidesToInclude = pageType === '2' ? ['front', 'back'] : ['front'];
    let hasItemsToExport = false;

    sidesToInclude.forEach((side) => {
        if (!tplCopy[side]) return;
        tplCopy[side].items = (tplCopy[side].items || []).filter((it) =>
            selection[side].has(it._id)
        );
        tplCopy[side].items.forEach((it) => delete it._id);

        if (tplCopy[side].items.length > 0) {
            hasItemsToExport = true;
        }
    });

    ['front', 'back'].forEach((side) => {
        if (!sidesToInclude.includes(side) || (tplCopy[side] && tplCopy[side].items && tplCopy[side].items.length === 0)) {
            delete tplCopy[side];
        }
    });

    if (!hasItemsToExport) {
        return alert('Error: No items selected for export.');
    }

    tplToExport = tplCopy; 

    // --- 2. Dynamic Modal Creation and Setup (Attractive & Centered) ---
    const MODAL_ID = 'dynamicExportModal';
    let modal = document.getElementById(MODAL_ID);
    
    // अगर Modal पहले से मौजूद नहीं है, तो इसे dynamically बनाएँ
    if (!modal) {
        // --- 2.1. Dynamic CSS Injection ---
        if (!document.getElementById('modalStyles')) {
            const style = document.createElement('style');
            style.id = 'modalStyles';
            style.textContent = `
                /* Primary Color: Modern Purple-Blue */
                :root { --primary-color: #6c5ce7; } 

                /* Modal Overlay: Fully Centered */
                #${MODAL_ID} {
                    display: none; position: fixed; z-index: 1000; left: 0; top: 0;
                    width: 100%; height: 100%; background-color: rgba(0,0,0,0.7);
                    transition: opacity 0.3s; opacity: 0;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    
                    /* Center Content */
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                }
                
                /* Modal Card Style */
                #${MODAL_ID} .modal-content {
                    background-color: #fff; padding: 30px;
                    width: 90%; max-width: 380px;
                    border-radius: 12px; 
                    box-shadow: 0 15px 30px rgba(0,0,0,0.3); /* Attractive Shadow */
                    transform: translateY(-20px);
                    transition: all 0.3s ease-out;
                }
                
                /* Close Button */
                #${MODAL_ID} .close-button {
                    color: #999; float: right; font-size: 30px; font-weight: 300; cursor: pointer;
                    line-height: 1; /* Aligns better */
                }
                
                /* Header */
                #${MODAL_ID} h2 { 
                    margin: 0 0 25px 0; font-size: 20px; color: #333; font-weight: 700;
                    border-bottom: 2px solid var(--primary-color);
                    display: inline-block; padding-bottom: 5px;
                }
                
                /* Input Field */
                #templateFileName { 
                    display: block; width: 100%; box-sizing: border-box; 
                    padding: 12px 15px; margin: 15px 0 25px 0; border: 1px solid #ddd; 
                    border-radius: 6px; font-size: 15px; 
                    transition: border-color 0.3s, box-shadow 0.3s;
                }
                #templateFileName:focus {
                    border-color: var(--primary-color); 
                    box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.2);
                    outline: none;
                }
                
                /* Download Button */
                #downloadConfirmBtn {
                    background-color: var(--primary-color); 
                    color: white; padding: 14px 15px;
                    border: none; border-radius: 6px; cursor: pointer; font-size: 16px; 
                    width: 100%; font-weight: 600; letter-spacing: 0.5px;
                    transition: background-color 0.2s, transform 0.1s;
                }
                #downloadConfirmBtn:hover {
                    background-color: #5d48e0;
                }
                #downloadConfirmBtn:active {
                    transform: translateY(1px);
                }
            `;
            document.head.appendChild(style);
        }

        // --- 2.2. Dynamic HTML Structure Creation ---
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-button" id="modalCloseBtn">&times;</span>
                <h2>Download Template</h2>
                <input type="text" id="templateFileName" placeholder="Enter School Name & Template Type" />
                <button id="downloadConfirmBtn">Download</button>
            </div>
        `;
        document.body.appendChild(modal);

        // --- 2.3. Event Listeners Setup ---
        
        const content = modal.querySelector('.modal-content');

        const closeModal = () => {
            modal.style.opacity = '0';
            content.style.transform = 'translateY(-20px)'; // Reset transform
            setTimeout(() => { modal.style.display = 'none'; }, 300);
            window.onkeydown = null; 
            tplToExport = null; 
        };
        
        const confirmDownload = () => {
            const fileNameInput = document.getElementById('templateFileName');
            const fileName = fileNameInput.value.trim();

            if (!tplToExport) {
                closeModal();
                return alert('Export data not found.');
            }
            if (!fileName) {
                alert('Please enter a valid filename.');
                fileNameInput.focus();
                return;
            }
            
            // Download process
            const pretty = JSON.stringify(tplToExport, null, 2);
            const blob = new Blob([pretty], { type: 'application/json' });
            
            const finalName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
            
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = finalName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            
            closeModal();
        };

        // Attach listeners
        document.getElementById('modalCloseBtn').onclick = closeModal;
        document.getElementById('downloadConfirmBtn').onclick = confirmDownload;
        
        // Background click to close modal
        modal.addEventListener('click', (e) => {
            if (e.target.id === MODAL_ID) {
                closeModal();
            }
        });

        // Enter key press in input should trigger download
        document.getElementById('templateFileName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                confirmDownload();
            }
        });
    }

    // --- 3. Modal Show and Data Update ---
    
    const fileNameInput = document.getElementById('templateFileName');
    const content = modal.querySelector('.modal-content');
    
    fileNameInput.value = ''; // Empty by default
    
    // Modal को दिखाएँ और Fade-in Effect दें
    modal.style.display = 'flex'; // Use flex to ensure centering
    setTimeout(() => { 
        modal.style.opacity = '1'; 
        content.style.transform = 'translateY(0)'; // Animate content in
    }, 10); 
    fileNameInput.focus();

    // ESC key listener
    window.onkeydown = function(event) {
        if (event.key === 'Escape') {
            document.getElementById('modalCloseBtn').click();
        }
    };
}


/* -----------------------------
    3) Event bindings
    ----------------------------- */
if ($('selectAll')) $('selectAll').addEventListener('click', () => setAllSelection(true));
if ($('clearAll')) $('clearAll').addEventListener('click', () => setAllSelection(false));

if ($('resetBtn')) $('resetBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all changes and load the default template?')) {
        clearLocalStorage();
        loadTemplate(true); // Force load default
    }
});

if (idTypeSelect) idTypeSelect.addEventListener('change', () => loadTemplate(false)); // loadTemplate now handles clearing LS if type changes
// templateTypeSelect change is handled in the IIFE (Section 1)

if (frontBgInput) frontBgInput.addEventListener('change', (e) => uploadBackground(e, 'front'));
if (backBgInput) backBgInput.addEventListener('change', (e) => uploadBackground(e, 'back'));
if ($('downloadBtn')) $('downloadBtn').addEventListener('click', downloadTemplate);


/* (Optional nicety) Zoom chips, if present */
(() => {
    const chips = document.querySelectorAll('.zoomchip[data-zoom]');
    const display = document.querySelector('.canvas-zoom .zoomchip:not([data-zoom])');
    const stage = document.querySelector('.stage');
    let zoom = 1;

    function applyZoom() {
        if (!stage) return;
        stage.style.transformOrigin = 'top left';
        stage.style.transform = `scale(${zoom})`;
        if (display) display.textContent = `${Math.round(zoom * 100)}%`;
    }

    chips.forEach((chip) => {
        chip.addEventListener('click', () => {
            const v = parseInt(chip.getAttribute('data-zoom'), 10);
            if (!Number.isNaN(v)) {
                const newZoom = zoom * (v / 100);
                zoom = Math.max(0.25, Math.min(4, newZoom));
                applyZoom();
            }
        });
    });

    applyZoom();
})(); 

/* -----------------------------
    12) Boot
    ----------------------------- */
loadTemplate(); // Initial load (will check local storage first)
