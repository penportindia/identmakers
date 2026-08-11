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

            clearLocalStorage(); 
            syncTwoPageUI();
            loadTemplate(true);
        });
        syncTwoPageUI();
    }

    const dlTop = document.getElementById('downloadBtn');
    const dlBottom = document.getElementById('downloadBtn_bottom');
    if (dlTop && dlBottom) {
        dlBottom.addEventListener('click', () => dlTop.click());
    }
})();



let currentTemplate = null;
const selection = { front: new Set(), back: new Set() };
let itemIdCounter = 1;
let currentFilter = 'All';
let currentlyExpandedFieldId = null;
const collapseState = { front: {}, back: {} }; 
const editorState = {
    activeSide: 'front',
    snapToGrid: true,
    gridSize: 8,
};
const DEFAULT_COLOR_SWATCHES = ['#000000', '#FFFFFF', '#111827', '#6B7280', '#EF4444', '#F97316', '#FBBF24', '#22C55E', '#06B6D4', '#3B82F6', '#6366F1', '#A855F7', '#EC4899'];
const recentColors = [];
const LOCAL_STORAGE_KEY = 'idTemplateEditorState';


const idTypeSelect = document.getElementById('idType');
const templateTypeSelect = document.getElementById('templateType');
const snapToggle = document.getElementById('snapToggle');
const gridSizeInput = document.getElementById('gridSize');
const frontCard = document.getElementById('frontCard');
const backCard = document.getElementById('backCard');
const frontBgInput = document.getElementById('frontBg');
const backBgInput = document.getElementById('backBg');
const backBgGroup = document.getElementById('backBgGroup');
const backPreviewBox = document.getElementById('backPreviewBox');
const frontPreviewBox = document.getElementById('frontPreviewBox');
const fieldListEl = document.getElementById('fieldList');
const $ = (id) => document.getElementById(id);




const safeValue = (v, fallback) => (v === undefined || v === null ? fallback : v);
const humanizeToken = (value = '') => String(value)
    .replace(/[{}]/g, '')
    .replace(/^(student|staff)_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
const previewTextValue = (item) => {
    const raw = safeValue(item.text, '');
    const text = String(raw);
    const cleanedText = text.trim();

    if (cleanedText) {
        if (/\{\{[^}]+\}\}/.test(text)) {
            return text.replace(/\{\{([^}]+)\}\}/g, (_, token) => humanizeToken(token));
        }
        return text;
    }

    const group = inferItemGroup(item);
    if (group === 'value') {
        const token = getFirstTemplateToken(text) || String(item.bookmark || item.field || item.key || '');
        return token ? humanizeToken(token) : '';
    }

    return '';
};
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
        try { el.style[k] = styles[k]; } catch (e) {}
    });
};
const createEl = (tag = 'div', opts = {}) => {
    const el = document.createElement(tag);
    if (opts.className) el.className = opts.className;
    if (opts.html) el.innerHTML = opts.html;
    if (opts.text) el.textContent = opts.text;
    if (opts.attrs) Object.entries(opts.attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (opts.styles) applyStyles(el, opts.styles);
    return el;
};

function inferItemGroup(item = {}) {
    const explicitGroup = String(item.group || '').toLowerCase();
    if (explicitGroup === 'label' || explicitGroup === 'photo') return explicitGroup;
    if (item.type === 'image') return 'photo';

    const text = String(item.text || '').trim();
    const hasPlaceholder = /\{\{[^}]+\}\}/.test(text);
    if (hasPlaceholder) return 'value';

    const hasText = text.length > 0;
    const hasDataBinding = !!String(item.bookmark || item.field || item.key || '').trim();
    return hasDataBinding && !hasText ? 'value' : 'label';
}

function getFirstTemplateToken(text = '') {
    const match = String(text).match(/\{\{\s*([^}]+?)\s*\}\}/);
    return match ? match[1].trim() : '';
}

function sanitizeItemForExport(item = {}) {
    item.group = inferItemGroup(item);
    const text = String(item.text || '');
    const impliedToken = getFirstTemplateToken(text) || String(item.bookmark || item.field || item.key || '').trim();

    if (item.group === 'label') {
        delete item.bookmark;
        delete item.field;
        delete item.key;
        return item;
    }

    if (item.group === 'value') {
        if (!text && impliedToken) {
            item.text = `{{${impliedToken}}}`;
        }

        if (/\{\{[^}]+\}\}/.test(item.text)) {
            delete item.bookmark;
            delete item.field;
            delete item.key;
        } else if (impliedToken && !item.bookmark) {
            item.bookmark = impliedToken;
        }
    }

    return item;
}

function normalizePhotoBorders(tpl) {
    if (!tpl) return tpl;
    ['front', 'back'].forEach((side) => {
        const page = tpl[side];
        if (!page || !Array.isArray(page.items)) return;
        page.items.forEach((item) => {
            item.group = inferItemGroup(item);
            if (item.type === 'image' || item.group === 'photo') {
                item.borderStyle = 'solid';
            }
            if (item.type !== 'image' && item.group === 'value' && !('color' in item)) {
                item.color = '#FFFFFF';
            }
        });
    });
    return tpl;
}

const getPage = (side) => {
    if (!currentTemplate) return null;
    if (!currentTemplate[side]) currentTemplate[side] = { items: [], pageStyle: {} };
    if (!Array.isArray(currentTemplate[side].items)) currentTemplate[side].items = [];
    if (!currentTemplate[side].pageStyle) currentTemplate[side].pageStyle = {};
    return currentTemplate[side];
};

const getSelectedItems = (side) => {
    if (!currentTemplate) return [];
    const sides = side ? [side] : ['front', 'back'];
    return sides.flatMap((s) => (getPage(s)?.items || []).filter((item) => selection[s] && selection[s].has(item._id)));
};

const getActiveSide = () => {
    return editorState.activeSide || 'front';
};

const isTwoPageTemplate = () => templateTypeSelect && templateTypeSelect.value === '2';

const setActiveSide = (side) => {
    editorState.activeSide = side === 'back' && isTwoPageTemplate() ? 'back' : 'front';
};

const snapNumber = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (!editorState.snapToGrid) return Math.round(n);
    const grid = Math.max(1, clampInt(editorState.gridSize, 8));
    return Math.round(n / grid) * grid;
};

const snapPoint = (left, top) => ({
    left: snapNumber(left),
    top: snapNumber(top),
});

const updateSelectionStatus = () => {
    const el = document.getElementById('selectionStatus');
    if (!el) return;
    const count = selection.front.size + (isTwoPageTemplate() ? selection.back.size : 0);
    const side = getActiveSide();
    el.textContent = `${count} selected - ${side}`;
};

const updateGridState = () => {
    ['front', 'back'].forEach((side) => {
        const container = side === 'front' ? frontCard : backCard;
        if (container) container.classList.toggle('grid-on', !!editorState.snapToGrid);
    });
};

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


function findItemSide(id) {
    if (!id || !currentTemplate) return null;
    if (currentTemplate.front && currentTemplate.front.items.some(it => it._id === id)) return 'front';
    if (currentTemplate.back && currentTemplate.back.items.some(it => it._id === id)) return 'back';
    return null;
}



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
            it.group = inferItemGroup(it);
            if (it.type !== 'image' && it.group === 'value' && !('color' in it)) it.color = '#FFFFFF';
            if (it.type === 'image' || it.group === 'photo') it.borderStyle = 'solid';
            it.isLinked = true;
            

            if (collapseState[side] && collapseState[side][it._id] === undefined) {

                collapseState[side][it._id] = (itemIdCounter === 2) ? false : true; 
                if (itemIdCounter === 2) currentlyExpandedFieldId = it._id;
            }
        });
    });
    return normalizePhotoBorders(clone);
}





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
            editorState: {
                activeSide: editorState.activeSide,
                snapToGrid: editorState.snapToGrid,
                gridSize: editorState.gridSize,
            },
            idType: idTypeSelect.value,
            templateType: templateTypeSelect.value,
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
        console.warn("Could not save state to local storage:", e);
    }
}


function loadSavedTemplate() {
    try {
        const savedStateStr = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!savedStateStr) return false;

        const savedState = JSON.parse(savedStateStr);
        

        if (savedState.idType !== idTypeSelect.value || savedState.templateType !== templateTypeSelect.value) {
            console.log("Saved state found, but selectors do not match. Loading default.");
            return false;
        }

        currentTemplate = normalizePhotoBorders(savedState.template);
        selection.front = new Set(savedState.selection.front);
        selection.back = new Set(savedState.selection.back);
        currentFilter = savedState.currentFilter;
        currentlyExpandedFieldId = savedState.currentlyExpandedFieldId;
        if (savedState.editorState) {
            editorState.activeSide = savedState.editorState.activeSide || 'front';
            editorState.snapToGrid = savedState.editorState.snapToGrid !== false;
            editorState.gridSize = clampInt(savedState.editorState.gridSize, 8);
        }
        

        collapseState.front = savedState.collapseState.front || {};
        collapseState.back = savedState.collapseState.back || {};


        itemIdCounter = 1; 
        
        console.log("Successfully loaded state from local storage.");
        return true;

    } catch (e) {
        console.error("Error loading state from local storage:", e);
        clearLocalStorage();
        return false;
    }
}


function clearLocalStorage() {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    console.log("Local storage state cleared.");
}




function renderAll() {
    renderFieldList();
    renderCard('front');
    if (currentTemplate && currentTemplate.back && isTwoPageTemplate()) renderCard('back');
    refreshEditorControls();
    

    saveTemplateToLocalStorage(); 
}

function renderCard(side) {
    const container = side === 'front' ? frontCard : backCard;
    if (!container || !currentTemplate) return;
    const page = currentTemplate[side];

    container.innerHTML = '';
    container.style.position = 'relative';
    container.classList.toggle('grid-on', !!editorState.snapToGrid);
    
    if (!page) return;

    const ps = page.pageStyle || {};
    container.style.background = safeValue(ps.background, 'transparent');
    applyStyles(container, ps);

    const items = (page.items || []).filter(it => selection[side] && selection[side].has(it._id));

    items.forEach(item => {
        const isImg = item.type === 'image';
        const hasImageSource = isImg && !!safeValue(item.src, '').trim();
        const el = document.createElement(isImg && hasImageSource ? 'img' : 'div');
        el.className = 'card-item';
        el.dataset.id = item._id;
        el.dataset.side = side;
        el.style.position = 'absolute';
        el.style.left = px(item.left, 0);
        el.style.top  = px(item.top, 0);
        el.style.cursor = 'grab';
        el.draggable = false;
        el.style.userSelect = 'none';

        if (isImg && hasImageSource) {
            el.setAttribute('src', safeValue(item.src, ''));
            el.style.width = px(item.width, 100);
            el.style.height = px(item.height, 100);
            const bw = clampInt(item.borderWidth, 0);
            const bs = 'solid';
            const bc = safeValue(item.borderColor, '#000000');
            el.style.border = `${bw}px ${bs} ${bc}`;
            el.style.borderRadius = px(item.borderRadius, 0);
            el.style.objectFit = 'cover';
        } else {
            if (isImg) {
                el.textContent = 'Image';
                el.style.width = px(item.width, 100);
                el.style.height = px(item.height, 100);
                el.style.display = 'flex';
                el.style.alignItems = 'center';
                el.style.justifyContent = 'center';
                const bw = clampInt(item.borderWidth, 1);
                el.style.border = `${bw}px solid ${safeValue(item.borderColor, '#94a3b8')}`;
                el.style.borderRadius = px(item.borderRadius, 0);
                el.style.background = 'rgba(148,163,184,.08)';
                el.style.color = '#cbd5e1';
                el.style.fontSize = '12px';
                el.style.fontWeight = '600';
                el.style.letterSpacing = '.08em';
                el.style.textTransform = 'uppercase';
            } else {
                const textValue = previewTextValue(item);
                const isEmptyText = !String(textValue).trim();
                el.textContent = isEmptyText ? (item.name || (item.group === 'label' ? 'Label' : 'Value')) : textValue;
                if (isEmptyText) el.classList.add('empty-field');
                if (!isEmptyText) {
                    el.style.color = Object.prototype.hasOwnProperty.call(item, 'color') ? safeValue(item.color, '#FFFFFF') : '#FFFFFF';
                    el.style.fontSize = px(item.fontSize, 12);
                    el.style.fontWeight = safeValue(item.fontWeight, '500');
                }
                el.style.fontFamily = safeValue(item.fontFamily, 'Inter, system-ui, sans-serif');
                el.style.textAlign = safeValue(item.textAlign, 'left');
                el.style.whiteSpace = 'nowrap';
                el.style.display = 'block';
                el.style.width = item.width ? px(item.width, 0) : 'auto';
                el.style.minWidth = item.width ? px(item.width, 0) : 'max-content';
                el.style.maxWidth = 'none';
                el.style.overflow = 'visible';
                el.style.lineHeight = '1.15';
            }
        }

        attachPointerDrag(el, (newLeft, newTop) => {
            const pos = editorState.snapToGrid ? snapPoint(newLeft, newTop) : { left: Math.round(newLeft), top: Math.round(newTop) };
            el.style.left = `${pos.left}px`;
            el.style.top  = `${pos.top}px`;

            const itm = findItemById(item._id);
            if (itm) {
                itm.left = `${pos.left}px`;
                itm.top  = `${pos.top}px`;
            }

            if (fieldListEl) {
                const inputLeft = fieldListEl.querySelector(`input[data-id="${item._id}"][data-prop="left"]`);
                const inputTop  = fieldListEl.querySelector(`input[data-id="${item._id}"][data-prop="top"]`);
                if (inputLeft) inputLeft.value = pos.left;
                if (inputTop)  inputTop.value  = pos.top;
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

            if (editorState.snapToGrid) {
                newLeft = snapNumber(newLeft);
                newTop = snapNumber(newTop);
            }

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


            renderFieldList();
        }

        el.addEventListener('pointermove', onPointerMove);
        el.addEventListener('pointerup', onPointerUp);
    }

    el.addEventListener('pointerdown', onPointerDown);
    el.dataset.dragAttached = 'true';
}



function syncColor(groupKey, prop, value) {
    if (!currentTemplate) return;
    
    ['front', 'back'].forEach(s => {
        const p = currentTemplate[s];
        if (!p || !Array.isArray(p.items)) return;
        p.items.forEach(item => {
            const itemGroup = inferItemGroup(item);
            
            let shouldSync = false;
            

            if (groupKey === itemGroup) {
                if (prop === 'color' && item.type !== 'image') shouldSync = true;
                if (prop === 'borderColor' && item.type === 'image') shouldSync = true;
            }

            if (shouldSync) {
                item[prop] = value;


                if (item.type === 'image' && prop === 'borderColor') {
                    const bw = clampInt(item.borderWidth, 0);
                    const bs = 'solid';
                    item.borderStyle = 'solid';
                    item.border = `${bw}px ${bs} ${item.borderColor}`;
                }
            }
        });
        renderCard(s);
    });

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


    collapseState[opposite][fieldId] = collapseState[currentSide][fieldId];
    delete collapseState[currentSide][fieldId];
    if (currentlyExpandedFieldId === fieldId) {
        currentlyExpandedFieldId = null;
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


function setFieldFilter(filter) {
    currentFilter = filter;
    renderFieldList();
}

function forceExpandField(itemId) {
    const side = findItemSide(itemId);
    if (!side) return;


    if (currentlyExpandedFieldId && currentlyExpandedFieldId !== itemId) {
        const currentSide = findItemSide(currentlyExpandedFieldId);
        if (currentSide) {
            collapseState[currentSide][currentlyExpandedFieldId] = true;
        }
    }


    collapseState[side][itemId] = false;
    currentlyExpandedFieldId = itemId;


    renderFieldList();


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
    

    const allGroupItems = { label: [], value: [], photo: [] };
    const sidesForList = isTwoPageTemplate() ? ['front', 'back'] : ['front'];
    sidesForList.forEach(s => {
        const p = currentTemplate[s];
        if (p && p.items) {
            p.items.forEach(item => {
                const groupKey = inferItemGroup(item);
                if (allGroupItems[groupKey]) {
                    allGroupItems[groupKey].push(item);
                }
            });
        }
    });
    

    if (currentFilter !== 'All') {
        renderMasterColorControls(fieldListEl, allGroupItems);
    }


    renderSideFieldList('front', 'Front', fieldListEl);
    if (currentTemplate.back && isTwoPageTemplate()) {
        const hr = createEl('div', { className: 'hr', styles: { height: '1px', background: '#1f2a3d', margin: '15px 0' } });
        fieldListEl.appendChild(hr);
        renderSideFieldList('back', 'Back', fieldListEl);
    }
}



function renderMasterColorControls(containerEl, allGroupItems) {
    
    const filterKey = currentFilter.toLowerCase();
    
    if (filterKey === 'all') return;

    const masterContainer = createEl('div', { styles: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px', marginTop: '15px' } });
    
    let syncProp, groupName, defaultColors;
    const relevantItems = allGroupItems[filterKey] || [];

    if (filterKey === 'label' || filterKey === 'value') {
        syncProp = 'color';
        groupName = `${filterKey.charAt(0).toUpperCase() + filterKey.slice(1)} Color`;
        
        const repItem = relevantItems[0];
        const currentColor = repItem ? (repItem.color || '#FFFFFF') : '#FFFFFF';
        defaultColors = ['#FFFFFF', '#111827', '#059669', '#EF4444', '#3B82F6', '#FBBF24']; 

        if (relevantItems.length === 0) return;
        
        const masterColorWrap = createMasterColorWrap(groupName, currentColor, filterKey, syncProp, defaultColors);
        masterContainer.appendChild(masterColorWrap);

    } else if (filterKey === 'photo') {
        syncProp = 'borderColor';
        groupName = `Photo Border`;
        
        const repItem = relevantItems[0];
        const currentColor = repItem ? (repItem.borderColor || '#000000') : '#000000';
        defaultColors = ['#000000', '#FFFFFF', '#FF0000', '#0000FF', '#008000']; 

        if (relevantItems.length === 0) return;

        const masterColorWrap = createMasterColorWrap(groupName, currentColor, filterKey, syncProp, defaultColors);
        masterContainer.appendChild(masterColorWrap);
    }
    

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

    const colorPicker = propColor(groupName, { value: currentColor }, { colors: defaultColors, showSwatches: true });
    const masterColorInput = colorPicker.input;
    const applyMasterColor = (value) => {
        const hex = normalizeHex(value, currentColor);
        rememberColor(hex);
        syncColorInputs(colorPicker.wrap, '', hex);
        masterColorInput.value = hex;
        colorPicker.hexInput.value = hex;
        syncColor(syncGroupKey, syncProp, hex);
    };

    masterColorInput.addEventListener('input', (e) => applyMasterColor(e.target.value));
    colorPicker.hexInput.addEventListener('input', (e) => {
        if (!/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(e.target.value).trim())) return;
        applyMasterColor(e.target.value);
    });
    colorPicker.wrap.querySelectorAll('.color-swatch').forEach((swatch) => {
        swatch.addEventListener('click', () => applyMasterColor(swatch.title));
    });
    masterColorWrap.appendChild(colorPicker.wrap);
    
    return masterColorWrap;
}

function controlWrap(label, child) {
    const wrap = createEl('label', { className: 'prop-control' });
    wrap.appendChild(createEl('span', { className: 'prop-label', text: label }));
    wrap.appendChild(child);
    return wrap;
}

function propInput(label, attrs = {}) {
    const input = createEl('input', { attrs, className: 'prop-input' });
    return { wrap: controlWrap(label, input), input };
}

function normalizeHex(value, fallback = '#000000') {
    if (!value) return fallback;
    let hex = String(value).trim();
    if (!hex.startsWith('#')) hex = `#${hex}`;
    if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : fallback;
}

function rememberColor(value) {
    const hex = normalizeHex(value);
    const existingIndex = recentColors.indexOf(hex);
    if (existingIndex !== -1) recentColors.splice(existingIndex, 1);
    recentColors.unshift(hex);
    if (recentColors.length > 8) recentColors.pop();
}

function applyColorFromPicker(colorInput, value) {
    const hex = normalizeHex(value, colorInput.value || '#000000');
    colorInput.value = hex;
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function syncColorInputs(container, prop, value) {
    const hex = normalizeHex(value);
    container.querySelectorAll(`[data-prop="${prop}"][data-color-control]`).forEach((input) => {
        input.value = hex;
    });
}

function propColor(label, attrs = {}, options = {}) {
    const colors = options.colors || DEFAULT_COLOR_SWATCHES;
    const showSwatches = options.showSwatches !== false;
    const prop = attrs['data-prop'];
    const currentColor = normalizeHex(attrs.value || '#000000');
    const wrap = createEl('div', { className: 'prop-control' });
    wrap.appendChild(createEl('span', { className: 'prop-label', text: label }));

    const editor = createEl('div', { className: 'color-editor' });
    const main = createEl('div', { className: 'color-main' });
    const inputAttrs = { ...attrs, type: 'color', value: currentColor, 'data-color-control': 'picker' };
    const hexAttrs = { ...attrs, type: 'text', value: currentColor, maxlength: '7', spellcheck: 'false', 'data-color-control': 'hex' };
    const colorInput = createEl('input', { className: 'prop-input color-preview', attrs: inputAttrs });
    const hexInput = createEl('input', { className: 'prop-input hex-input', attrs: hexAttrs });
    const eyedropper = createEl('button', { className: 'prop-button eyedropper-btn', text: 'Pick', attrs: { type: 'button', title: 'Pick color from screen' } });

    if ('EyeDropper' in window) {
        eyedropper.addEventListener('click', async () => {
            try {
                const result = await new EyeDropper().open();
                applyColorFromPicker(colorInput, result.sRGBHex);
            } catch (err) {}
        });
    } else {
        eyedropper.disabled = true;
        eyedropper.title = 'Eyedropper is not supported in this browser';
    }

    main.appendChild(colorInput);
    main.appendChild(hexInput);
    main.appendChild(eyedropper);
    editor.appendChild(main);

    if (showSwatches) {
        const swatchGrid = createEl('div', { className: 'color-swatches' });
        [...new Set([...recentColors, ...colors])].slice(0, 18).forEach((color) => {
            const hex = normalizeHex(color);
            const swatch = createEl('button', {
                className: 'color-swatch',
                attrs: { type: 'button', title: hex, 'aria-label': hex },
                styles: { background: hex }
            });
            swatch.addEventListener('click', () => applyColorFromPicker(colorInput, hex));
            swatchGrid.appendChild(swatch);
        });
        editor.appendChild(swatchGrid);
    }
    wrap.appendChild(editor);

    return { wrap, input: colorInput, hexInput, prop };
}

function propSelect(label, attrs = {}, options = []) {
    const select = createEl('select', { attrs, className: 'prop-select' });
    options.forEach(([value, text]) => {
        select.appendChild(createEl('option', { text, attrs: { value } }));
    });
    return { wrap: controlWrap(label, select), select };
}

function propButton(text, onClick) {
    const button = createEl('button', { text, className: 'prop-button', attrs: { type: 'button' } });
    button.addEventListener('click', onClick);
    return button;
}

function moveItemBy(itemId, side, dx, dy) {
    const item = findItemById(itemId);
    if (!item) return;
    const next = snapPoint(clampInt(item.left, 0) + dx, clampInt(item.top, 0) + dy);
    item.left = `${Math.max(0, next.left)}px`;
    item.top = `${Math.max(0, next.top)}px`;
    renderCard(side);
    renderFieldList();
    saveTemplateToLocalStorage();
}


function renderSideFieldList(side, title, containerEl) {
    const page = currentTemplate[side];
    if (!page || !Array.isArray(page.items)) return;

    const sideContainer = createEl('div', { styles: { marginBottom: '15px', marginTop: '15px' } });
    const h = createEl('h3', { text: `${title} Fields`, styles: { marginBottom: '8px', fontSize: '16px', color: '#e5e7eb' } });
    containerEl.appendChild(h);

    const groupItems = {};
    page.items.forEach(item => {
        item.group = inferItemGroup(item);
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
        

        itemsInGroup.forEach((item) => {
            const isCollapsed = collapseState[side][item._id] === undefined ? true : collapseState[side][item._id];
            
            const wrap = createEl('div', { 
                className: 'fieldcard', 
                attrs: { 'data-field-id': item._id },
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


            const toggleCollapse = () => {
                const content = wrap.querySelector('.field-content');
                if (!content) return; 

                const shouldCollapse = !collapseState[side][item._id];
                

                if (!shouldCollapse) {
                    if (currentlyExpandedFieldId && currentlyExpandedFieldId !== item._id) {
                        const prevExpanded = fieldListEl.querySelector(`[data-field-id="${currentlyExpandedFieldId}"]`);
                        if (prevExpanded) {

                            prevExpanded.style.height = '40px';
                            const icon = prevExpanded.querySelector('.collapse-icon');
                            if (icon) icon.textContent = '▶';
                            

                            const prevSide = findItemSide(currentlyExpandedFieldId);
                            if (prevSide) collapseState[prevSide][currentlyExpandedFieldId] = true;
                        }
                    }
                    currentlyExpandedFieldId = item._id;
                } else {
                    currentlyExpandedFieldId = null;
                }


                collapseState[side][item._id] = shouldCollapse;
                wrap.style.height = shouldCollapse ? '40px' : 'auto'; 
                
                const icon = wrap.querySelector('.collapse-icon');
                if (icon) icon.textContent = shouldCollapse ? '▶' : '▼';
                
                saveTemplateToLocalStorage();
            };



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
            

            const headerText = (item.text && item.text.trim()) || (item.type === 'image' ? 'Image' : 'Untitled');
            const titleSpan = createEl('span', { text: headerText, styles: { fontWeight: '600', fontSize: '14px', color: '#fff', flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } });
            
            header.appendChild(icon);
            header.appendChild(titleSpan);


            const controlsGroup = createEl('div', { styles: { display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 } });
            controlsGroup.appendChild(createEl('span', { className: 'field-badge', text: inferItemGroup(item) }));
            

            const cb = createEl('input', { attrs: { type: 'checkbox', 'data-side': side, 'data-id': item._id }, styles: { width: '14px', height: '14px' } });
            cb.checked = selection[side] && selection[side].has(item._id);
            const cbLabel = createEl('label', { title: 'Toggle visibility on the card preview', styles: { display: 'flex', gap: '4px', alignItems: 'center', cursor: 'pointer', fontSize: '12px', color: '#9ca3af' } });
            cbLabel.addEventListener('click', (ev) => ev.stopPropagation());
            cbLabel.appendChild(cb);
            cbLabel.appendChild(createEl('span', { text: 'Show' }));
            controlsGroup.appendChild(cbLabel);

            header.appendChild(controlsGroup);
            wrap.appendChild(header);


            const contentWrap = createEl('div', { className: 'field-content', styles: { paddingBottom: '10px', borderTop: '1px solid #374151', display: 'grid', gap: '8px' } });

            const posRow = createEl('div', { className: 'prop-grid' });
            
            const createPositionInput = (prop, value) => {
                return propInput(prop === 'left' ? 'X Position' : 'Y Position', { type: 'number', min: '0', value: clampInt(value, 0), 'data-side': side, 'data-id': item._id, 'data-prop': prop });
            };

            const inLeft = createPositionInput('left', item.left);
            const inTop = createPositionInput('top', item.top);
            
            posRow.appendChild(inLeft.wrap);
            posRow.appendChild(inTop.wrap);
            contentWrap.appendChild(posRow);

            const nudgeStep = () => Math.max(1, clampInt(editorState.gridSize, 8));
            const nudgeRow = createEl('div', { className: 'nudge-grid' });
            nudgeRow.appendChild(propButton('Left', () => moveItemBy(item._id, side, -nudgeStep(), 0)));
            nudgeRow.appendChild(propButton('Up', () => moveItemBy(item._id, side, 0, -nudgeStep())));
            nudgeRow.appendChild(propButton('Down', () => moveItemBy(item._id, side, 0, nudgeStep())));
            nudgeRow.appendChild(propButton('Right', () => moveItemBy(item._id, side, nudgeStep(), 0)));
            contentWrap.appendChild(nudgeRow);


            if (item.type === 'image') {
                const sizeRow = createEl('div', { className: 'prop-grid' });
                
                const createSizeInput = (prop, value) => {
                    return propInput(prop === 'width' ? 'Width' : 'Height', { type: 'number', min: '1', value: clampInt(value, 100), 'data-side': side, 'data-id': item._id, 'data-prop': prop });
                };

                sizeRow.appendChild(createSizeInput('width', item.width).wrap);
                sizeRow.appendChild(createSizeInput('height', item.height).wrap);
                contentWrap.appendChild(sizeRow);
                
                const borderRow = createEl('div', { className: 'prop-grid three', styles: { alignItems: 'end' } });

                const borderStyleControl = propSelect('Border', { 'data-side': side, 'data-id': item._id, 'data-prop': 'borderStyle' });
                const borderStyle = borderStyleControl.select;
                item.borderStyle = 'solid';
                ['solid'].forEach(bs => {
                    const opt = createEl('option', { text: bs.charAt(0).toUpperCase() + bs.slice(1), attrs: { value: bs } });
                    if (item.borderStyle === bs) opt.selected = true;
                    borderStyle.appendChild(opt);
                });
                borderRow.appendChild(borderStyleControl.wrap);

                borderRow.appendChild(propInput('Width', { type: 'number', min: '0', max: '20', value: clampInt(item.borderWidth, 0), 'data-side': side, 'data-id': item._id, 'data-prop': 'borderWidth' }).wrap);

                contentWrap.appendChild(borderRow);
                contentWrap.appendChild(propColor('Color', { title: 'Border Color', value: item.borderColor || '#000000', 'data-side': side, 'data-id': item._id, 'data-prop': 'borderColor' }, { showSwatches: false }).wrap);
                

                contentWrap.appendChild(propInput('Radius', { type: 'number', min: '0', value: clampInt(item.borderRadius, 0), 'data-side': side, 'data-id': item._id, 'data-prop': 'borderRadius' }).wrap);

                const imageRow = createEl('div', { className: 'prop-control' });
                const imageLabel = createEl('span', { className: 'prop-label', text: 'Replace Image' });
                const imageInput = createEl('input', { attrs: { type: 'file', accept: 'image/*', 'data-side': side, 'data-id': item._id, 'data-prop': 'src' }, className: 'prop-input' });
                imageInput.addEventListener('change', (e) => {
                    const file = e.target.files && e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                        const itm = findItemById(item._id);
                        if (!itm) return;
                        itm.src = reader.result;
                        renderCard(side);
                        renderFieldList();
                        saveTemplateToLocalStorage();
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                });
                imageRow.appendChild(imageLabel);
                imageRow.appendChild(imageInput);
                contentWrap.appendChild(imageRow);

            } else {

                const textContent = propInput('Text', { type: 'text', value: safeValue(item.text, ''), 'data-side': side, 'data-id': item._id, 'data-prop': 'text' });
                contentWrap.appendChild(textContent.wrap);

                const textRow = createEl('div', { className: 'prop-grid three', styles: { alignItems: 'end' } });
                
                textRow.appendChild(propInput('Size', { type: 'number', min: '8', max: '96', value: clampInt(item.fontSize, 12), 'data-side': side, 'data-id': item._id, 'data-prop': 'fontSize' }).wrap);
                
                const weightControl = propSelect('Weight', { 'data-side': side, 'data-id': item._id, 'data-prop': 'fontWeight' });
                const fontWeight = weightControl.select;
                ['400', '500', '600', '700', 'bold'].forEach(fw => {
                    const opt = createEl('option', { text: fw, attrs: { value: fw } });
                    if (String(item.fontWeight) === fw) opt.selected = true;
                    fontWeight.appendChild(opt);
                });
                textRow.appendChild(weightControl.wrap);
                
                contentWrap.appendChild(textRow);
                const alignControl = propSelect('Align', { 'data-side': side, 'data-id': item._id, 'data-prop': 'textAlign' });
                const textAlign = alignControl.select;
                [['left', 'Left'], ['center', 'Center'], ['right', 'Right']].forEach(([val, txt]) => {
                    const opt = createEl('option', { text: txt, attrs: { value: val } });
                    if (safeValue(item.textAlign, 'left') === val) opt.selected = true;
                    textAlign.appendChild(opt);
                });
                contentWrap.appendChild(alignControl.wrap);
                contentWrap.appendChild(propColor('Color', { title: 'Text Color', value: item.color || '#FFFFFF', 'data-side': side, 'data-id': item._id, 'data-prop': 'color' }, { showSwatches: false }).wrap);
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


            if (isCollapsed) {
                 wrap.style.height = '40px'; 
            } else {
                wrap.style.height = 'auto';
            }
            

            

            cb.addEventListener('change', (ev) => {
                ev.stopPropagation();
                if (!selection[side]) selection[side] = new Set();
                if (ev.target.checked) selection[side].add(item._id);
                else selection[side].delete(item._id);
                renderCard(side);
                renderFieldList();
                saveTemplateToLocalStorage();
            });


            contentWrap.querySelectorAll('input:not([type="file"]), select').forEach(input => {
                
                if (!input.dataset.prop) return; 

                const isColorProp = ['color', 'borderColor'].includes(input.dataset.prop);
                const isNumberInput = input.type === 'number';
                
                const eventType = isNumberInput ? 'change' : 'input';

                input.addEventListener(eventType, (e) => {
                    const id = e.target.dataset.id;
                    const s = e.target.dataset.side;
                    const prop = e.target.dataset.prop;
                    const itm = findItemById(id);
                    if (!itm) return;

                    let val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                    if (isColorProp) {
                        const normalized = normalizeHex(val, itm[prop] || '#000000');
                        if (e.target.dataset.colorControl === 'hex' && !/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(val).trim())) return;
                        val = normalized;
                        rememberColor(val);
                        syncColorInputs(contentWrap, prop, val);
                    }
                    

                    if (['left', 'top', 'width', 'height', 'borderRadius', 'fontSize', 'borderWidth'].includes(prop)) {
                        val = isNumberInput ? e.target.value : val;
                        itm[prop] = px(val, 0);
                        if (prop === 'left' || prop === 'top') renderCard(s); 
                    } else {
                        itm[prop] = val;
                    }



                    if (itm.type === 'image' && ['borderWidth', 'borderStyle', 'borderColor'].includes(prop)) {
                        const bw = clampInt(itm.borderWidth, 0);
                        const bs = 'solid';
                        const bc = safeValue(itm.borderColor, '#000000');
                        itm.borderStyle = 'solid';
                        itm.border = `${bw}px ${bs} ${bc}`;
                    }
                    

                    if (eventType === 'change' || !['left', 'top'].includes(prop)) { 
                        renderCard(s);
                    }


                    saveTemplateToLocalStorage();
                });
            });


            sideContainer.appendChild(wrap);
        });
    });
    
    containerEl.appendChild(sideContainer);
}

function refreshEditorControls() {
    if (!isTwoPageTemplate() && editorState.activeSide === 'back') {
        editorState.activeSide = 'front';
    }
    if (snapToggle) snapToggle.checked = editorState.snapToGrid;
    if (gridSizeInput) gridSizeInput.value = editorState.gridSize;
    updateSelectionStatus();
    updateGridState();
}

function loadTemplate(forceDefault = false) {
    if (!idTypeSelect || !templateTypeSelect) {
        return console.error('Required select elements for ID and Template type are missing.');
    }
    

    const idType = idTypeSelect.value.toLowerCase();
    const pageType = templateTypeSelect.value.toLowerCase();
    let fileURL = '';

    if (pageType === 'own') {
        if (idType === 'student') fileURL = './templates/Studentown.json';
        else if (idType === 'staff') fileURL = './templates/Staffown.json';
        else return alert('⚠️ Invalid ID Type for Own template selected.');
    } else {
        const baseURL = './templates';
        const fileName = `${idType.charAt(0).toUpperCase() + idType.slice(1)}-${pageType.toUpperCase()}.json`;
        fileURL = `${baseURL}/${fileName}`;
    }

    currentTemplate = null;
    selection.front.clear();
    selection.back.clear();
    currentlyExpandedFieldId = null;

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




function setAllSelection(checked) {
    if (!currentTemplate) return;
    ['front', 'back'].forEach((side) => {
        if (side === 'back' && !isTwoPageTemplate()) return;
        if (!currentTemplate[side]) return;
        const ids = (currentTemplate[side].items || []).map((it) => it._id);
        selection[side] = checked ? new Set(ids) : new Set();
    });
    renderAll();
}





let tplToExport = null;

function downloadTemplate() {
    if (!currentTemplate || !idTypeSelect || !templateTypeSelect) {
        return alert('Error: Template or selectors missing.');
    }


    const tplCopy = JSON.parse(JSON.stringify(currentTemplate));
    const pageType = templateTypeSelect.value;
    const sidesToInclude = pageType === '2' ? ['front', 'back'] : ['front'];
    let hasItemsToExport = false;

    sidesToInclude.forEach((side) => {
        if (!tplCopy[side]) return;
        tplCopy[side].items = (tplCopy[side].items || [])
            .map((it) => {
                it.group = inferItemGroup(it);
                return sanitizeItemForExport(it);
            })
            .filter((it) => selection[side].has(it._id) || (pageType === '2' && it.group === 'label'));
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


    const MODAL_ID = 'dynamicExportModal';
    let modal = document.getElementById(MODAL_ID);
    

    if (!modal) {

        if (!document.getElementById('modalStyles')) {
            const style = document.createElement('style');
            style.id = 'modalStyles';
            style.textContent = `
                :root { --primary-color: #6c5ce7; }
                #${MODAL_ID} {
                    display: none;
                    position: fixed;
                    inset: 0;
                    z-index: 1000;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,0.7);
                    transition: opacity 0.3s;
                    opacity: 0;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    align-items: center;
                    justify-content: center;
                }
                #${MODAL_ID} .modal-content {
                    background-color: #fff;
                    padding: 30px;
                    width: 90%;
                    max-width: 380px;
                    border-radius: 12px;
                    box-shadow: 0 15px 30px rgba(0,0,0,0.3);
                    transform: translateY(-20px);
                    transition: all 0.3s ease-out;
                }
                #${MODAL_ID} .close-button {
                    color: #999;
                    float: right;
                    font-size: 30px;
                    font-weight: 300;
                    cursor: pointer;
                    line-height: 1;
                }
                #${MODAL_ID} h2 {
                    margin: 0 0 25px 0;
                    font-size: 20px;
                    color: #333;
                    font-weight: 700;
                    border-bottom: 2px solid var(--primary-color);
                    display: inline-block;
                    padding-bottom: 5px;
                }
                #templateFileName {
                    display: block;
                    width: 100%;
                    box-sizing: border-box;
                    padding: 12px 15px;
                    margin: 15px 0 25px 0;
                    border: 1px solid #ddd;
                    border-radius: 6px;
                    font-size: 15px;
                    transition: border-color 0.3s, box-shadow 0.3s;
                }
                #templateFileName:focus {
                    border-color: var(--primary-color);
                    box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.2);
                    outline: none;
                }
                #downloadConfirmBtn {
                    background-color: var(--primary-color);
                    color: white;
                    padding: 14px 15px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    width: 100%;
                    font-weight: 600;
                    letter-spacing: 0.5px;
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


        
        const content = modal.querySelector('.modal-content');

        const closeModal = () => {
            modal.style.opacity = '0';
            content.style.transform = 'translateY(-20px)';
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


        document.getElementById('modalCloseBtn').onclick = closeModal;
        document.getElementById('downloadConfirmBtn').onclick = confirmDownload;
        

        modal.addEventListener('click', (e) => {
            if (e.target.id === MODAL_ID) {
                closeModal();
            }
        });


        document.getElementById('templateFileName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                confirmDownload();
            }
        });
    }


    
    const fileNameInput = document.getElementById('templateFileName');
    const content = modal.querySelector('.modal-content');
    
    fileNameInput.value = '';
    

    modal.style.display = 'flex';
    setTimeout(() => { 
        modal.style.opacity = '1'; 
        content.style.transform = 'translateY(0)';
    }, 10); 
    fileNameInput.focus();


    window.onkeydown = function(event) {
        if (event.key === 'Escape') {
            document.getElementById('modalCloseBtn').click();
        }
    };
}




if ($('selectAll')) $('selectAll').addEventListener('click', () => setAllSelection(true));
if ($('clearAll')) $('clearAll').addEventListener('click', () => setAllSelection(false));

if ($('resetBtn')) $('resetBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all changes and load the default template?')) {
        clearLocalStorage();
        loadTemplate(true);
    }
});

if (idTypeSelect) idTypeSelect.addEventListener('change', () => loadTemplate(false));


if (frontBgInput) frontBgInput.addEventListener('change', (e) => uploadBackground(e, 'front'));
if (backBgInput) backBgInput.addEventListener('change', (e) => uploadBackground(e, 'back'));
if ($('downloadBtn')) $('downloadBtn').addEventListener('click', downloadTemplate);

if (snapToggle) snapToggle.addEventListener('change', (e) => {
    editorState.snapToGrid = !!e.target.checked;
    updateGridState();
    renderAll();
});
if (gridSizeInput) gridSizeInput.addEventListener('change', (e) => {
    editorState.gridSize = Math.max(2, clampInt(e.target.value, 8));
    refreshEditorControls();
});



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



loadTemplate();
