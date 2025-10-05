/* =====================================================================
   ID Template Editor — script.js (fresh, robust, nothing removed, improved)
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
    if (backPreviewBox) backPreviewBox.classList.toggle('hidden', !isTwo);
    if (backBgGroup) backBgGroup.classList.toggle('hidden', !isTwo);
  }

  if (templateType) {
    templateType.addEventListener('change', syncTwoPageUI);
    // initial state
    syncTwoPageUI();
  }

  // Mirror top & bottom Export buttons
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

/* -----------------------------
   3) Event bindings
   ----------------------------- */
const $ = (id) => document.getElementById(id);

$('selectAll').addEventListener('click', () => setAllSelection(true));
$('clearAll').addEventListener('click', () => setAllSelection(false));
$('resetBtn').addEventListener('click', () => loadTemplate());
$('downloadBtn').addEventListener('click', downloadTemplate);

idTypeSelect.addEventListener('change', loadTemplate);
templateTypeSelect.addEventListener('change', loadTemplate);
frontBgInput.addEventListener('change', (e) => uploadBackground(e, 'front'));
backBgInput.addEventListener('change', (e) => uploadBackground(e, 'back'));

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
        zoom = Math.max(0.5, Math.min(2, zoom * (v / 100)));
        applyZoom();
      }
    });
  });

  // initialize text
  applyZoom();
})();


/* -----------------------------
   4) Template load (updated for Own templates)
   ----------------------------- */
function loadTemplate() {
  const idType = idTypeSelect.value.toLowerCase();
  const pageType = templateTypeSelect.value.toLowerCase();
  let fileURL = '';

  if (pageType === 'own') {
    if (idType === 'student') fileURL = 'https://penportindia.github.io/lak/Pages/Template/templates/Studentown.json';
    else if (idType === 'staff') fileURL = 'https://penportindia.github.io/lak/Pages/Template/templates/Staffown.json';
    else return alert('⚠️ Invalid ID Type for Own template.');
  } else {
    const baseURL = 'https://raw.githubusercontent.com/penportindia/lak/main/Pages/Template/templates';
    const fileName = `${idType.charAt(0).toUpperCase() + idType.slice(1)}-${pageType}.json`;
    fileURL = `${baseURL}/${fileName}`;
  }

  fetch(fileURL)
    .then((res) => {
      if (!res.ok) throw new Error('Template not found.');
      return res.json();
    })
    .then((data) => {
      currentTemplate = addIdsToTemplate(data);

      const isTwoPage = pageType === '2';
      if (backBgGroup) backBgGroup.style.display = isTwoPage ? 'block' : 'none';
      if (backPreviewBox) backPreviewBox.style.display = isTwoPage ? 'flex' : 'none';
      if (frontPreviewBox) frontPreviewBox.style.display = 'flex';

      // Reset file inputs so same file can be re-uploaded
      if (frontBgInput) frontBgInput.value = '';
      if (backBgInput) backBgInput.value = '';

      // Ensure default selection = all visible items
      selection.front = new Set((currentTemplate.front?.items || []).map((it) => it._id));
      selection.back = isTwoPage
        ? new Set((currentTemplate.back?.items || []).map((it) => it._id))
        : new Set();

      renderAll();
    })
    .catch((err) => alert('⚠️ Error loading template: ' + err.message));
}

/* -----------------------------
   9) Background upload
   ----------------------------- */
function uploadBackground(event, side) {
  const fileInput = event.target;
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    currentTemplate[side].pageStyle = currentTemplate[side].pageStyle || {};
    currentTemplate[side].pageStyle.backgroundImage = `url(${e.target.result})`;
    currentTemplate[side].pageStyle.backgroundSize = 'cover';
    currentTemplate[side].pageStyle.backgroundRepeat = 'no-repeat';
    currentTemplate[side].pageStyle.backgroundPosition = 'center';
    renderCard(side);

    // Reset file input so same file can be re-uploaded if needed
    fileInput.value = '';
  };
  reader.readAsDataURL(file);
}


/* -----------------------------
   5) Helpers
   ----------------------------- */
const px = (v, def = 0) => {
  if (v == null || v === '') return `${def}px`;
  return (typeof v === 'number' ? `${v}px` : `${parseInt(v, 10) || def}px`);
};
const safe = (v, def) => (v == null ? def : v);

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
      // keep borderStyle if present else default solid (only for images when needed)
      if (!('borderStyle' in it)) it.borderStyle = 'solid';
      // left/top defaults
      if (!('left' in it)) it.left = '0px';
      if (!('top' in it)) it.top = '0px';
    });
  });
  return clone;
}

/* -----------------------------
   7) Render pipeline
   ----------------------------- */
function renderAll() {
  renderFieldList();
  renderCard('front');
  if (currentTemplate.back) renderCard('back');
}

function renderCard(side) {
  const container = side === 'front' ? frontCard : backCard;
  const page = currentTemplate[side];
  if (!container) return;
  if (!page) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  // Page style background (safe)
  const ps = page.pageStyle || {};
  container.style.background = safe(ps.background, 'transparent');

  Object.keys(ps).forEach((k) => {
    try { container.style[k] = ps[k]; } catch {}
  });

  // Render only selected/checked items
  const items = (page.items || []).filter((it) => selection[side].has(it._id));

  items.forEach((item) => {
    const isImg = item.type === 'image';
    const el = document.createElement(isImg ? 'img' : 'div');
    el.className = 'card-item';

    if (isImg) {
      el.src = safe(item.src, '');
      el.style.width = item.width ? px(item.width, 100) : '100px';
      el.style.height = item.height ? px(item.height, 100) : '100px';
      const bw = parseInt(safe(item.borderWidth, 0), 10) || 0;
      const bStyle = safe(item.borderStyle, 'solid');
      const bColor = safe(item.borderColor, '#000000');
      el.style.border = `${bw}px ${bStyle} ${bColor}`;
      el.style.borderRadius = px(item.borderRadius, 0);
      el.draggable = false;
    } else {
      el.textContent = safe(item.text, '');
      el.style.color = safe(item.color, '#e5e7eb');
      el.style.fontSize = px(item.fontSize, 12);
      el.style.fontWeight = safe(item.fontWeight, '500');
      el.style.fontFamily = safe(item.fontFamily, 'Inter, system-ui, sans-serif');
      el.style.whiteSpace = 'pre-wrap';
    }

    el.style.position = 'absolute';
    el.style.left = px(item.left, 0);
    el.style.top = px(item.top, 0);
    el.style.cursor = 'move';

    // -------------------------------
    // Drag functionality with live sidebar update
    // -------------------------------
    let offsetX, offsetY;

    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      offsetX = e.clientX - el.offsetLeft;
      offsetY = e.clientY - el.offsetTop;

      function onMouseMove(eMove) {
        const newLeft = eMove.clientX - offsetX;
        const newTop = eMove.clientY - offsetY;

        el.style.left = newLeft + 'px';
        el.style.top = newTop + 'px';

        // Update currentTemplate
        const itm = currentTemplate[side].items.find(it => it._id === item._id);
        if (itm) {
          itm.left = newLeft + 'px';
          itm.top = newTop + 'px';
        }

        // Update sidebar inputs dynamically
        const inputLeft = fieldListEl.querySelector(`input[data-id="${item._id}"][data-prop="left"]`);
        const inputTop  = fieldListEl.querySelector(`input[data-id="${item._id}"][data-prop="top"]`);
        if (inputLeft) inputLeft.value = newLeft;
        if (inputTop)  inputTop.value  = newTop;
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    container.appendChild(el);
  });
}

/* -----------------------------
   8) Properties panel
   ----------------------------- */
function renderFieldList() {
  if (!fieldListEl) return;
  fieldListEl.innerHTML = '';
  renderSideFieldList('front', 'Front');
  if (currentTemplate.back) {
    const hr = document.createElement('div');
    hr.className = 'hr';
    hr.style.height = '1px';
    hr.style.background = '#1f2a3d';
    hr.style.margin = '10px 0';
    fieldListEl.appendChild(hr);
    renderSideFieldList('back', 'Back');
  }
}

function renderSideFieldList(side, title) {
  const page = currentTemplate[side];
  if (!page) return;

  const h = document.createElement('h3');
  h.textContent = `${title} Fields`;
  fieldListEl.appendChild(h);

  (page.items || []).forEach((item, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'fieldcard';

    const header = document.createElement('div');
    header.style.fontWeight = '600';
    const name = (item.text && item.text.trim()) || (item.src ? 'Image' : 'Untitled');
    header.textContent = name;
    wrap.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'row';
    meta.style.fontSize = '12px';
    meta.style.opacity = '0.8';
    meta.textContent = `#${idx + 1} • ${item.type}`;
    wrap.appendChild(meta);

    // Checkbox row
    const row1 = document.createElement('div');
    row1.className = 'row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selection[side].has(item._id);
    cb.dataset.side = side;
    cb.dataset.id = item._id;
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) selection[side].add(id);
      else selection[side].delete(id);
      renderCard(side);
    });

    const cbLabel = document.createElement('label');
    cbLabel.style.display = 'flex';
    cbLabel.style.alignItems = 'center';
    cbLabel.style.gap = '8px';
    cbLabel.appendChild(cb);
    cbLabel.appendChild(document.createTextNode('Show on card'));
    row1.appendChild(cbLabel);
    wrap.appendChild(row1);

    // Position inputs
    const row2 = document.createElement('div');
    row2.className = 'row';
    row2.innerHTML = `
      <div class="tiny"><input type="number" min="0" value="${parseInt(item.left || 0)}"  data-side="${side}" data-id="${item._id}" data-prop="left"  placeholder="X"></div>
      <div class="tiny"><input type="number" min="0" value="${parseInt(item.top  || 0)}"  data-side="${side}" data-id="${item._id}" data-prop="top"   placeholder="Y"></div>
    `;
    wrap.appendChild(row2);

    // Type-specific controls (image/text)
    if (item.type === 'image') {
      const rowImg = document.createElement('div');
      rowImg.className = 'row';
      rowImg.innerHTML = `
        <div class="tiny"><input type="number" min="0" value="${parseInt(item.width  || 100)}" data-side="${side}" data-id="${item._id}" data-prop="width"  placeholder="W"></div>
        <div class="tiny"><input type="number" min="0" value="${parseInt(item.height || 100)}" data-side="${side}" data-id="${item._id}" data-prop="height" placeholder="H"></div>
        <div class="tiny"><input type="number" min="0" value="${parseInt(item.borderRadius || 0)}" data-side="${side}" data-id="${item._id}" data-prop="borderRadius" placeholder="Radius"></div>
      `;
      wrap.appendChild(rowImg);

      const rowBorder = document.createElement('div');
      rowBorder.className = 'row';
      rowBorder.innerHTML = `
        <div class="tiny">
          <select data-side="${side}" data-id="${item._id}" data-prop="borderStyle">
            <option value="solid"  ${item.borderStyle === 'solid'  || item.border?.includes('solid')  ? 'selected':''}>Solid</option>
            <option value="dashed" ${item.borderStyle === 'dashed' || item.border?.includes('dashed') ? 'selected':''}>Dashed</option>
            <option value="dotted" ${item.borderStyle === 'dotted' || item.border?.includes('dotted') ? 'selected':''}>Dotted</option>
            <option value="double" ${item.borderStyle === 'double' || item.border?.includes('double') ? 'selected':''}>Double</option>
          </select>
        </div>
        <div class="tiny"><input type="number" min="0" value="${parseInt(item.borderWidth || 0)}" data-side="${side}" data-id="${item._id}" data-prop="borderWidth" placeholder="Border"></div>
        <div class="tiny"><input type="color" value="${item.borderColor || '#000000'}" data-side="${side}" data-id="${item._id}" data-prop="borderColor"></div>
      `;
      wrap.appendChild(rowBorder);

      const rowSwatch = document.createElement('div');
      rowSwatch.className = 'row';
      rowSwatch.innerHTML = `
        <div class="tiny" style="display:flex;gap:6px;align-items:center">
          <span class="swatch" data-color="#08f738" title="#08f738" style="background:#08f738;width:16px;height:16px;display:inline-block;cursor:pointer;border:1px solid #22324b;border-radius:4px;"></span>
          <span class="swatch" data-color="#f30a0a" title="#f30a0a" style="background:#f30a0a;width:16px;height:16px;display:inline-block;cursor:pointer;border:1px solid #22324b;border-radius:4px;"></span>
          <span class="swatch" data-color="#1e40af" title="#1e40af" style="background:#1e40af;width:16px;height:16px;display:inline-block;cursor:pointer;border:1px solid #22324b;border-radius:4px;"></span>
        </div>
      `;
      wrap.appendChild(rowSwatch);
    } else {
      const rowText = document.createElement('div');
      rowText.className = 'row';
      rowText.innerHTML = `
        <div class="tiny"><input type="number" min="8" max="96" value="${parseInt(item.fontSize || 12)}" data-side="${side}" data-id="${item._id}" data-prop="fontSize" placeholder="Size"></div>
        <div class="tiny"><input type="color" value="${item.color || '#111827'}" data-side="${side}" data-id="${item._id}" data-prop="color"></div>
      `;
      wrap.appendChild(rowText);
    }

    // Wire inputs
    wrap.querySelectorAll('input, select').forEach((input) => {
      input.addEventListener('input', (e) => {
        const id = e.target.dataset.id;
        const s = e.target.dataset.side;
        const prop = e.target.dataset.prop;
        const itm = currentTemplate[s].items.find((it) => it._id === id);
        if (!itm) return;

        let val = e.target.value;

        if (['left', 'top', 'width', 'height', 'borderRadius', 'fontSize', 'borderWidth'].includes(prop)) {
          itm[prop] = px(val, 0);
        } else if (prop === 'borderColor' || prop === 'color') {
          itm[prop] = val;
        } else if (prop === 'borderStyle') {
          itm[prop] = val;
        }

        if (itm.type === 'image') {
          const bw = parseInt(itm.borderWidth || 0, 10) || 0;
          const bs = itm.borderStyle || 'solid';
          const bc = itm.borderColor || '#000000';
          itm.border = `${bw}px ${bs} ${bc}`;
        }

        renderCard(s);
      });
    });

    // Swatches
    wrap.querySelectorAll('.swatch').forEach((swatch) => {
      swatch.addEventListener('click', (e) => {
        const color = e.target.dataset.color;
        const itm = currentTemplate[side].items.find((it) => it._id === item._id);
        if (!itm) return;
        itm.borderColor = color;
        const bw = parseInt(itm.borderWidth || 0, 10) || 0;
        const bs = itm.borderStyle || 'solid';
        itm.border = `${bw}px ${bs} ${itm.borderColor}`;
        const clrInput = wrap.querySelector(`input[data-prop="borderColor"]`);
        if (clrInput) clrInput.value = color;
        renderCard(side);
      });
    });

    fieldListEl.appendChild(wrap);
  });
}

/* -----------------------------
   10) Selection utilities
   ----------------------------- */
function setAllSelection(checked) {
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
function downloadTemplate() {
  if (!currentTemplate) return alert('No template loaded.');

  const tplCopy = JSON.parse(JSON.stringify(currentTemplate));
  const pageType = templateTypeSelect.value;
  const sidesToInclude = pageType === '2' ? ['front', 'back'] : ['front'];

  sidesToInclude.forEach((side) => {
    if (!tplCopy[side]) return;
    tplCopy[side].items = (tplCopy[side].items || []).filter((it) =>
      selection[side].has(it._id)
    );
    tplCopy[side].items.forEach((it) => delete it._id);
  });

  ['front', 'back'].forEach((side) => {
    if (!sidesToInclude.includes(side)) delete tplCopy[side];
  });

  const pretty = JSON.stringify(tplCopy, null, 2);
  const blob = new Blob([pretty], { type: 'application/json' });

  const defaultName = `${idTypeSelect.value.toUpperCase()}_${pageType}PAGE_Template.json`;
  const fileName = prompt('Enter filename to save (with or without .json):', defaultName);

  if (fileName) {
    const finalName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = finalName;
    a.click();
  } else {
    alert('Download cancelled. No filename entered.');
  }
}

/* -----------------------------
   12) Boot
   ----------------------------- */
loadTemplate();

