# Compratelosv · Escáner

PWA (app web instalable) para leer **códigos QR y de barras** con la cámara del teléfono y administrar el inventario de piezas únicas de Compratelosv.

Funciona **sin Play Store** y **sin conexión** una vez abierta. Se instala desde Chrome: menú ⋮ → *Instalar aplicación*.

## Qué hace

| Módulo | Estado | Descripción |
|---|---|---|
| Escanear | Funcional | Lee QR, EAN-13/8, UPC-A/E, Code 128/39/93, ITF, Data Matrix, PDF417 y Aztec con la cámara. Linterna, cambio de cámara y lectura desde una foto. |
| Resultado | Funcional | Muestra el código, su formato y, si existe, la ficha del producto (nombre, precio, estado). Permite crearlo o editarlo al instante. |
| Productos | Funcional | Alta, edición, eliminación, búsqueda y filtro por estado (disponible / reservado / vendido). El stock se ajusta desde la ficha. |
| Historial | Funcional | Últimos 300 escaneos guardados en el teléfono, con acceso directo a la ficha. |
| Etiquetas | Funcional | Genera QR y/o Code 128 con nombre y precio; descarga PNG o imprime. El QR contiene solo el código de la pieza. |
| Supabase | **Pendiente** | El proyecto `hnpjkaiylibjnrqgfiku` está pausado (`INACTIVE`). La capa de datos está aislada en `js/store.js` para conectarla cuando se restaure y se autorice. |

## Requisitos de la cámara

El navegador solo concede cámara en **contexto seguro**: `https://` o `localhost`. Por eso la app debe servirse por HTTPS (GitHub Pages, por ejemplo). Abrirla desde un `file://` o por IP en HTTP hace que el botón de cámara informe el bloqueo en vez de fallar en silencio.

## Ejecutar en local

```bash
npm install          # solo para re-vendorizar librerías si hace falta
node serve.mjs 5173  # http://localhost:5173
```

Las librerías de escaneo y de generación de códigos están **vendorizadas** en `vendor/`, así que la app no depende de ningún CDN y funciona sin red.

## Estructura

```
index.html            shell de la app (4 vistas + diálogo de producto)
css/app.css           estilos mobile-first, tema oscuro
js/app.js             orquestación de la interfaz
js/scanner.js         motor de lectura: BarcodeDetector nativo + ZXing de respaldo
js/labels.js          generación de QR (qrcode-generator) y Code 128 (JsBarcode)
js/store.js           capa de datos — único punto a cambiar para conectar Supabase
sw.js                 service worker (stale-while-revalidate)
manifest.webmanifest  metadatos de instalación
icons/                iconos generados (192, 512, maskable)
tools/make_icons.py   regenera los iconos
serve.mjs             servidor estático para pruebas locales
```

## Datos

Hoy todo se guarda en `localStorage` del teléfono, bajo claves `ctl.products.v1`, `ctl.history.v1` y `ctl.settings.v1`. Un producto tiene la forma:

```json
{ "code": "CTL-0001", "name": "Blusa negra M", "price": 12.5, "stock": 1,
  "status": "disponible", "notes": "", "photo_url": null,
  "created_at": "...", "updated_at": "..." }
```

`js/store.js` expone una API asíncrona (`listProducts`, `getProduct`, `upsertProduct`, `deleteProduct`, `addHistory`, …). Para pasar a Supabase se reemplazan los cuerpos de esas funciones; la interfaz no cambia.

## Verificación ejecutada

Pruebas corridas en Chrome sobre `http://localhost:5173` (2026-11-24):

- Generación de QR y Code 128 y **relectura de ambos** con el motor propio: ambos devolvieron `CTL-0001`. ✅
- Flujo etiqueta → guardar producto → escanear la etiqueta → coincidencia con la ficha (`Vestido floral S · $18.00 · disponible`). ✅
- Alta, edición (estado `vendido`, stock `0`) y listado con filtros por estado. ✅
- Historial registrando cada lectura con su formato. ✅
- Persistencia comprobada leyendo `localStorage` directamente. ✅

**No verificado todavía:** lectura con cámara real en un teléfono físico, linterna, y despliegue HTTPS. Requiere un dispositivo y un hosting HTTPS.

## Pendientes conocidos

- Conectar Supabase (bloqueado: proyecto pausado).
- Decidir si las etiquetas deben codificar solo el código o también una URL a la ficha pública.
- Fotos de producto (`photo_url` existe en el modelo, la interfaz aún no las captura).
- Autenticación antes de permitir escrituras cuando haya backend: las escrituras hechas hoy son locales al teléfono, sin control de acceso.
