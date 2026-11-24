/* labels.js — generación de códigos para etiquetas.
 *
 * QR con qrcode-generator (sin dependencias de red) y Code 128 con JsBarcode.
 * El QR contiene SOLO el código de la pieza (p. ej. "CTL-0001"): así cualquier
 * lector -incluida la cámara de otro teléfono- devuelve un identificador corto
 * y estable, y la app lo resuelve contra el catálogo.
 */

const QUIET_MODULES = 4; // zona de silencio obligatoria alrededor del QR

/** Dibuja un QR en un <canvas>. Devuelve el lado en píxeles. */
export function renderQR(canvas, text, { targetPx = 260 } = {}) {
  const value = String(text ?? '').trim();
  if (!value) throw new Error('Escribe un código antes de generar el QR.');

  const qr = window.qrcode(0, 'M'); // 0 = tamaño automático, corrección M
  qr.addData(value);
  qr.make();

  const modules = qr.getModuleCount() + QUIET_MODULES * 2;
  const scale = Math.max(2, Math.floor(targetPx / modules));
  const size = modules * scale;

  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < qr.getModuleCount(); r++) {
    for (let c = 0; c < qr.getModuleCount(); c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect((c + QUIET_MODULES) * scale, (r + QUIET_MODULES) * scale, scale, scale);
      }
    }
  }
  return size;
}

/** Dibuja un Code 128 en un <svg> existente. */
export function renderCode128(svgEl, text, { width = 2, height = 64 } = {}) {
  const value = String(text ?? '').trim();
  if (!value) throw new Error('Escribe un código antes de generar el código de barras.');
  window.JsBarcode(svgEl, value, {
    format: 'CODE128',
    width,
    height,
    displayValue: true,
    fontSize: 14,
    textMargin: 2,
    margin: 6,
    lineColor: '#000000',
    background: '#ffffff',
  });
}

/** Convierte el SVG de barras en un <img> para poder pintarlo en canvas. */
async function svgToImage(svgEl) {
  const xml = new XMLSerializer().serializeToString(svgEl);
  const svg64 = btoa(unescape(encodeURIComponent(xml)));
  const img = new Image();
  img.src = `data:image/svg+xml;base64,${svg64}`;
  await img.decode();
  return img;
}

/**
 * Compone una etiqueta imprimible (nombre, precio, QR y/o barras) en PNG.
 * Devuelve un dataURL listo para descargar.
 */
export async function composeLabelPNG({ name, price, code, qrCanvas, barsSvg }) {
  const W = 640;
  const H = 900;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';

  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText(truncate(name || 'Artículo', 34, W - 60), W / 2, 70);

  if (price !== null && price !== undefined && price !== '') {
    ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.fillText(`$${Number(price).toFixed(2)}`, W / 2, 130);
  }

  let y = 170;
  if (qrCanvas && qrCanvas.width) {
    const side = Math.min(380, qrCanvas.width);
    ctx.drawImage(qrCanvas, (W - side) / 2, y, side, side);
    y += side + 30;
  }

  if (barsSvg && barsSvg.getBoundingClientRect().width) {
    const img = await svgToImage(barsSvg);
    const bw = Math.min(W - 80, img.width * 2);
    const bh = (img.height / img.width) * bw;
    ctx.drawImage(img, (W - bw) / 2, y, bw, bh);
  }

  return out.toDataURL('image/png');
}

function truncate(text, size, maxWidth) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `bold ${size}px system-ui, sans-serif`;
  let out = String(text);
  if (probe.measureText(out).width <= maxWidth) return out;
  while (out.length > 3 && probe.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}
