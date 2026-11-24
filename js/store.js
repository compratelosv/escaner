/* store.js — capa de datos de la app.
 *
 * Todo el acceso a datos pasa por aquí. Hoy persiste en localStorage del
 * teléfono (funciona offline y sin backend). Cuando se autorice conectar
 * Supabase, solo se sustituyen los cuerpos de estas funciones: la interfaz
 * (firmas y formas de retorno) no cambia, así que la UI no se toca.
 *
 * Forma de un producto (compatible con una tabla `products` en Supabase):
 *   { code, name, price, stock, status, notes, photo_url, created_at, updated_at }
 */

const K_PRODUCTS = 'ctl.products.v1';
const K_HISTORY  = 'ctl.history.v1';
const K_SETTINGS = 'ctl.settings.v1';

export const STATUSES = ['disponible', 'reservado', 'vendido'];

/* ---------- helpers de lectura/escritura ---------- */
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn('store: lectura inválida de', key, err);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error('store: no se pudo escribir', key, err);
    throw new Error('Almacenamiento lleno o bloqueado en este navegador.');
  }
}

/* Normaliza el código: sin espacios extremos, mayúsculas. Un mismo producto no
 * debe poder registrarse dos veces por diferencias de formato. */
export function normalizeCode(code) {
  return String(code ?? '').trim().toUpperCase();
}

export function normalizePrice(price) {
  if (price === '' || price === null || price === undefined) return null;
  const n = Number(String(price).replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function sanitizeProduct(input) {
  const code = normalizeCode(input.code);
  if (!code) throw new Error('El código es obligatorio.');
  const status = STATUSES.includes(input.status) ? input.status : 'disponible';
  return {
    code,
    name: String(input.name ?? '').trim() || '(sin nombre)',
    price: normalizePrice(input.price),
    stock: Number.isFinite(Number(input.stock)) ? Math.max(0, Math.trunc(Number(input.stock))) : 1,
    status,
    notes: String(input.notes ?? '').trim(),
    photo_url: input.photo_url ?? null,
    created_at: input.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/* ---------- productos ---------- */
export async function listProducts({ query = '', filter = 'all' } = {}) {
  let items = read(K_PRODUCTS, []);
  const q = query.trim().toLowerCase();
  if (filter !== 'all') items = items.filter((p) => p.status === filter);
  if (q) {
    items = items.filter(
      (p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
  }
  return items.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

export async function allProducts() {
  return read(K_PRODUCTS, []);
}

export async function getProduct(code) {
  const key = normalizeCode(code);
  return read(K_PRODUCTS, []).find((p) => p.code === key) ?? null;
}

export async function upsertProduct(input) {
  const product = sanitizeProduct(input);
  const items = read(K_PRODUCTS, []);
  const idx = items.findIndex((p) => p.code === product.code);
  if (idx >= 0) {
    product.created_at = items[idx].created_at ?? product.created_at;
    items[idx] = product;
  } else {
    items.push(product);
  }
  write(K_PRODUCTS, items);
  return product;
}

export async function deleteProduct(code) {
  const key = normalizeCode(code);
  const items = read(K_PRODUCTS, []);
  const next = items.filter((p) => p.code !== key);
  write(K_PRODUCTS, next);
  return next.length !== items.length;
}

/* Ajuste rápido de inventario desde un escaneo: sin abrir el formulario. */
export async function adjustStock(code, delta) {
  const product = await getProduct(code);
  if (!product) return null;
  product.stock = Math.max(0, (product.stock ?? 0) + delta);
  if (product.stock === 0 && product.status === 'disponible') product.status = 'vendido';
  if (product.stock > 0 && product.status === 'vendido') product.status = 'disponible';
  return upsertProduct(product);
}

/* ---------- historial ---------- */
const HISTORY_MAX = 300;

export async function listHistory() {
  return read(K_HISTORY, []);
}

export async function addHistory({ value, format, productCode = null }) {
  const items = read(K_HISTORY, []);
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    value: String(value),
    format: format || 'desconocido',
    product_code: productCode ? normalizeCode(productCode) : null,
    at: new Date().toISOString(),
  };
  items.unshift(entry);
  write(K_HISTORY, items.slice(0, HISTORY_MAX));
  return entry;
}

export async function clearHistory() {
  write(K_HISTORY, []);
  return true;
}

/* ---------- ajustes ---------- */
export async function getSettings() {
  return read(K_SETTINGS, {
    beep: true,
    vibrate: true,
    cooldownMs: 1500,
    codePrefix: 'CTL',
    nextSeq: 1,
  });
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  write(K_SETTINGS, next);
  return next;
}

export async function nextLabelCode() {
  const s = await getSettings();
  const seq = Math.max(1, Number(s.nextSeq) || 1);
  const code = `${s.codePrefix}-${String(seq).padStart(4, '0')}`;
  await saveSettings({ nextSeq: seq + 1 });
  return code;
}

/* ---------- respaldo ---------- */
export async function exportBackup() {
  return {
    app: 'compratelosv-escaner',
    version: 1,
    exported_at: new Date().toISOString(),
    products: await allProducts(),
    history: await listHistory(),
  };
}

export async function importBackup(data) {
  if (!data || !Array.isArray(data.products)) throw new Error('Archivo de respaldo inválido.');
  const merged = read(K_PRODUCTS, []);
  let added = 0;
  for (const raw of data.products) {
    try {
      const p = sanitizeProduct(raw);
      const idx = merged.findIndex((x) => x.code === p.code);
      if (idx >= 0) merged[idx] = { ...merged[idx], ...p };
      else { merged.push(p); added += 1; }
    } catch { /* fila inválida, se ignora */ }
  }
  write(K_PRODUCTS, merged);
  return { added, total: merged.length };
}
