/* app.js — orquestación de la interfaz. */

import * as store from './store.js';
import { Scanner, engineInfo, formatLabel } from './scanner.js';
import { renderQR, renderCode128, composeLabelPNG } from './labels.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------------- estado en memoria ---------------- */
const state = {
  view: 'scan',
  scanResult: null,      // { value, format, at, product }
  productFilter: 'all',
  productQuery: '',
  editingCode: null,     // código del producto en edición (null = alta)
  label: { code: '', name: '', price: '' },
  installEvent: null,
};

/* ---------------- utilidades ---------------- */
function setStatus(msg, kind = '') {
  const el = $('#status');
  el.textContent = msg;
  el.className = `status ${kind}`.trim();
}

function money(value) {
  if (value === null || value === undefined || value === '') return '';
  return `$${Number(value).toFixed(2)}`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString('es-SV', { day: '2-digit', month: 'short' });
}

function beep(kind = 'ok') {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = kind === 'ok' ? 880 : 320;
    gain.gain.value = 0.06;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
    setTimeout(() => ctx.close(), 400);
  } catch { /* audio no disponible */ }
}

function feedback(kind = 'ok') {
  if (kind === 'ok' && navigator.vibrate) navigator.vibrate(40);
  if (kind === 'ok') beep('ok');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Código copiado.', 'ok');
  } catch {
    setStatus('No se pudo copiar automáticamente.', 'err');
  }
}

/* ---------------- navegación ---------------- */
function showView(name) {
  state.view = name;
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${name}`).classList.remove('hidden');
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  if (name !== 'scan') stopCamera();
  if (name === 'products') renderProducts();
  if (name === 'history') renderHistory();
  if (name === 'labels' && !$('#lblCode').value) suggestLabelCode();
  window.scrollTo(0, 0);
}

/* ---------------- cámara ---------------- */
let scanner = null;

function initScanner() {
  scanner = new Scanner({
    video: $('#video'),
    onDetect: handleDetected,
    onStatus: (msg) => setStatus(msg),
  });
}

async function startCamera() {
  try {
    $('#btnCam').disabled = true;
    setStatus('Abriendo cámara…');
    await scanner.start();
    $('#camPlaceholder').classList.add('hidden');
    $('#reticle').classList.add('on');
    $('#btnCam').textContent = 'Detener';
    $('#btnTorch').classList.toggle('hidden', !scanner.torchSupported);
    setStatus('Apunta al código dentro del marco.');
  } catch (err) {
    setStatus(err.message || 'No se pudo abrir la cámara.', 'err');
    $('#camPlaceholder').classList.remove('hidden');
  } finally {
    $('#btnCam').disabled = false;
  }
}

function stopCamera() {
  scanner?.stop();
  $('#camPlaceholder')?.classList.remove('hidden');
  $('#reticle')?.classList.remove('on');
  $('#btnTorch')?.classList.add('hidden');
  const btn = $('#btnCam');
  if (btn) btn.textContent = 'Encender cámara';
}

function toggleCamera() {
  if (scanner?.running) {
    stopCamera();
    setStatus('Cámara detenida.');
  } else {
    startCamera();
  }
}

/* ---------------- resultado de escaneo ---------------- */
async function handleDetected({ value, format }) {
  const product = await store.getProduct(value);
  await store.addHistory({ value, format, productCode: product?.code ?? null });
  feedback('ok');
  await showResult({ value, format, product });
  if (state.view === 'history') renderHistory();
}

async function showResult({ value, format, product }) {
  state.scanResult = { value, format, at: new Date().toISOString(), product };
  $('#resFormat').textContent = formatLabel(format);
  $('#resTime').textContent = 'ahora';
  $('#resValue').textContent = value;

  const match = $('#resMatch');
  match.classList.remove('hidden', 'warn');
  if (product) {
    match.textContent = `${product.name}${product.price != null ? ` · ${money(product.price)}` : ''} · ${product.status}`;
    $('#btnOpenProduct').textContent = 'Ver producto';
    $('#btnOpenProduct').classList.add('primary');
    $('#btnNewProduct').classList.remove('primary');
  } else {
    match.textContent = 'No está en tu catálogo.';
    match.classList.add('warn');
    $('#btnOpenProduct').textContent = 'Ver producto';
    $('#btnOpenProduct').classList.remove('primary');
    $('#btnNewProduct').classList.add('primary');
  }
  $('#resultCard').classList.remove('hidden');
  setStatus('Código leído.', 'ok');
}

/* ---------------- productos ---------------- */
const STATUS_ICON = { disponible: '●', reservado: '◐', vendido: '○' };

async function renderProducts() {
  const items = await store.listProducts({
    query: state.productQuery,
    filter: state.productFilter,
  });
  const list = $('#productList');
  list.innerHTML = '';
  $('#productsEmpty').classList.toggle('hidden', items.length > 0);

  for (const p of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item';
    btn.innerHTML = `
      <div class="item-thumb">${STATUS_ICON[p.status] || '●'}</div>
      <div class="item-body">
        <div class="item-title"></div>
        <div class="item-sub"></div>
      </div>
      <div class="item-side">
        <div class="price"></div>
        <span class="badge ${p.status}"></span>
      </div>`;
    btn.querySelector('.item-title').textContent = p.name;
    btn.querySelector('.item-sub').textContent = `${p.code} · stock ${p.stock}`;
    btn.querySelector('.price').textContent = money(p.price) || '—';
    btn.querySelector('.badge').textContent = p.status;
    btn.addEventListener('click', () => openProductDialog(p));
    list.appendChild(btn);
  }
}

function openProductDialog(product, defaults = {}) {
  const dlg = $('#productDialog');
  state.editingCode = product?.code ?? null;
  $('#dlgTitle').textContent = product ? 'Editar producto' : 'Nuevo producto';
  $('#pCode').value = product?.code ?? defaults.code ?? '';
  $('#pCode').readOnly = Boolean(product);
  $('#pName').value = product?.name ?? defaults.name ?? '';
  $('#pPrice').value = product?.price ?? defaults.price ?? '';
  $('#pStock').value = product?.stock ?? 1;
  $('#pStatus').value = product?.status ?? 'disponible';
  $('#pNotes').value = product?.notes ?? '';
  $('#btnDeleteProduct').classList.toggle('hidden', !product);
  dlg.showModal();
}

async function saveProductFromDialog() {
  const wasEditing = state.editingCode;
  const payload = {
    code: $('#pCode').value,
    name: $('#pName').value,
    price: $('#pPrice').value,
    stock: $('#pStock').value,
    status: $('#pStatus').value,
    notes: $('#pNotes').value,
  };
  const saved = await store.upsertProduct(payload);
  await renderProducts();
  if (state.scanResult && state.scanResult.value === saved.code) {
    await showResult({ value: saved.code, format: state.scanResult.format, product: saved });
  }
  setStatus(wasEditing ? 'Producto actualizado.' : 'Producto creado.', 'ok');
  return saved;
}

/* ---------------- historial ---------------- */
async function renderHistory() {
  const items = await store.listHistory();
  const list = $('#historyList');
  list.innerHTML = '';
  $('#historyEmpty').classList.toggle('hidden', items.length > 0);

  for (const h of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item';
    btn.innerHTML = `
      <div class="item-thumb">⌗</div>
      <div class="item-body">
        <div class="item-title"></div>
        <div class="item-sub"></div>
      </div>
      <div class="item-side"><div class="muted"></div></div>`;
    btn.querySelector('.item-title').textContent = h.value;
    btn.querySelector('.item-sub').textContent = h.product_code ? `en catálogo` : 'sin producto';
    btn.querySelector('.muted').textContent = timeAgo(h.at);
    btn.addEventListener('click', async () => {
      const product = await store.getProduct(h.value);
      showView('scan');
      await showResult({ value: h.value, format: h.format, product });
    });
    list.appendChild(btn);
  }
}

/* ---------------- etiquetas ---------------- */
async function suggestLabelCode() {
  try {
    $('#lblCode').value = await store.nextLabelCode();
  } catch { /* sin almacenamiento: se escribe a mano */ }
}

function readLabelForm() {
  return {
    code: $('#lblCode').value.trim(),
    name: $('#lblName').value.trim(),
    price: $('#lblPrice').value.trim(),
    type: $('#lblType').value,
  };
}

async function renderLabel() {
  const f = readLabelForm();
  if (!f.code) { setStatus('Escribe un código para la etiqueta.', 'err'); return; }
  try {
    const canvasQR = $('#canvasQR');
    const svgBars = $('#svgBars');
    const showQR = f.type === 'qr' || f.type === 'both';
    const showBars = f.type === 'code128' || f.type === 'both';

    canvasQR.classList.toggle('hidden', !showQR);
    svgBars.classList.toggle('hidden', !showBars);

    if (showQR) renderQR(canvasQR, f.code, { targetPx: 260 });
    if (showBars) renderCode128(svgBars, f.code);

    $('#pvName').textContent = f.name || 'Artículo sin nombre';
    $('#pvPrice').textContent = f.price ? money(store.normalizePrice(f.price)) : '';
    // Cuando hay barras, JsBarcode ya imprime el valor bajo el código:
    // repetirlo aquí duplicaría el texto en la etiqueta.
    $('#pvCode').textContent = f.code;
    $('#pvCode').classList.toggle('hidden', showBars);
    $('#labelPreview').classList.remove('hidden');
    state.label = f;
    setStatus('Etiqueta generada.', 'ok');
  } catch (err) {
    setStatus(err.message || 'No se pudo generar la etiqueta.', 'err');
  }
}

async function downloadLabel() {
  const f = readLabelForm();
  if (!f.code) { setStatus('Genera la etiqueta primero.', 'err'); return; }
  const url = await composeLabelPNG({
    name: f.name,
    price: store.normalizePrice(f.price),
    code: f.code,
    qrCanvas: $('#canvasQR').classList.contains('hidden') ? null : $('#canvasQR'),
    barsSvg: $('#svgBars').classList.contains('hidden') ? null : $('#svgBars'),
  });
  const a = document.createElement('a');
  a.href = url;
  a.download = `etiqueta-${f.code}.png`;
  a.click();
  setStatus('PNG descargado.', 'ok');
}

/* ---------------- arranque ---------------- */
async function boot() {
  initScanner();
  const info = await engineInfo();
  setStatus(`Listo. Motor: ${info.engine}.`);

  $$('.tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));

  // escanear
  $('#btnCam').addEventListener('click', toggleCamera);
  $('#btnFlip').addEventListener('click', async () => {
    const wasRunning = scanner?.running;
    stopCamera();
    scanner._facing = scanner._facing === 'environment' ? 'user' : 'environment';
    if (wasRunning) await startCamera();
  });
  $('#btnTorch').addEventListener('click', async () => {
    const on = await scanner.toggleTorch();
    $('#btnTorch').classList.toggle('on', Boolean(on));
  });
  $('#btnFile').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatus('Leyendo imagen…');
    try {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await img.decode();
      const res = await scanner.decodeImageElement(img);
      URL.revokeObjectURL(img.src);
      await handleDetected(res);
    } catch {
      setStatus('No se encontró un código legible en esa imagen.', 'err');
    }
  });
  $('#btnCopy').addEventListener('click', () => state.scanResult && copyText(state.scanResult.value));
  $('#btnOpenProduct').addEventListener('click', async () => {
    const code = state.scanResult?.value;
    if (!code) return;
    const product = await store.getProduct(code);
    openProductDialog(product, { code });
  });
  $('#btnNewProduct').addEventListener('click', () => {
    openProductDialog(null, { code: state.scanResult?.value ?? '' });
  });

  // productos
  $('#btnAddProduct').addEventListener('click', () => openProductDialog(null));
  $('#searchProducts').addEventListener('input', (e) => {
    state.productQuery = e.target.value;
    renderProducts();
  });
  $('#filterChips').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-btn');
    if (!btn) return;
    state.productFilter = btn.dataset.filter;
    $$('#filterChips .chip-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderProducts();
  });

  // diálogo producto
  const dlg = $('#productDialog');
  $('#productForm').addEventListener('submit', async (e) => {
    const action = e.submitter?.value;
    if (action !== 'save') return; // cancelar: cierre nativo
    e.preventDefault();
    try {
      await saveProductFromDialog();
      dlg.close('saved');
    } catch (err) {
      setStatus(err.message || 'No se pudo guardar.', 'err');
    }
  });
  $('#btnDeleteProduct').addEventListener('click', async () => {
    const code = state.editingCode;
    if (!code) return;
    if (!confirm(`¿Eliminar "${code}" del catálogo? Esta acción no se puede deshacer.`)) return;
    await store.deleteProduct(code);
    dlg.close('deleted');
    await renderProducts();
    setStatus('Producto eliminado.', 'ok');
  });

  // historial
  $('#btnClearHistory').addEventListener('click', async () => {
    if (!confirm('¿Borrar todo el historial de este teléfono?')) return;
    await store.clearHistory();
    await renderHistory();
    setStatus('Historial borrado.', 'ok');
  });

  // etiquetas
  $('#btnGenCode').addEventListener('click', suggestLabelCode);
  $('#btnRender').addEventListener('click', renderLabel);
  $('#btnDownloadQR').addEventListener('click', downloadLabel);
  $('#btnPrint').addEventListener('click', () => window.print());
  $('#btnSaveProduct').addEventListener('click', async () => {
    const f = readLabelForm();
    if (!f.code) { setStatus('Falta el código.', 'err'); return; }
    try {
      await store.upsertProduct({
        code: f.code,
        name: f.name,
        price: f.price,
        stock: 1,
        status: 'disponible',
      });
      setStatus('Producto guardado en el catálogo.', 'ok');
      await suggestLabelCode();
    } catch (err) {
      setStatus(err.message || 'No se pudo guardar.', 'err');
    }
  });

  // instalación PWA
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installEvent = e;
    $('#btnInstall').classList.remove('hidden');
  });
  $('#btnInstall').addEventListener('click', async () => {
    if (!state.installEvent) return;
    state.installEvent.prompt();
    const { outcome } = await state.installEvent.userChoice;
    if (outcome === 'accepted') $('#btnInstall').classList.add('hidden');
    state.installEvent = null;
  });

  // pausar la cámara al salir de la app
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && scanner?.running) stopCamera();
  });

  await renderProducts();
  await renderHistory();

  // service worker: la app queda instalable y sirve sin conexión
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW no registrado:', err));
  }
}

boot();
