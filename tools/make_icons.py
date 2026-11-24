"""Genera los iconos PNG de la PWA (192, 512 y maskable 512).
Diseño: fondo oscuro + cuatro esquinas de marco de escaneo en naranja + barras.
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (13, 13, 15)
ACCENT = (255, 51, 0)
LIGHT = (242, 242, 244)


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)

    # En maskable el contenido debe caber en el 80% central (zona segura).
    pad = int(size * 0.28) if maskable else int(size * 0.18)
    box = (pad, pad, size - pad, size - pad)
    w = max(3, int(size * 0.055))     # grosor del marco
    arm = int((box[2] - box[0]) * 0.34)  # largo de cada brazo

    def corner(x, y, dx, dy):
        d.rounded_rectangle(
            [min(x, x + dx * arm), min(y, y + dy * arm),
             max(x, x + dx * arm), max(y, y + dy * arm)],
            radius=w // 2, fill=ACCENT,
        )

    corner(box[0], box[1], +1, +1)
    corner(box[2], box[1], -1, +1)
    corner(box[0], box[3], +1, -1)
    corner(box[2], box[3], -1, -1)

    # Barras de código en el centro.
    cx0, cx1 = box[0] + arm, box[2] - arm
    cy0, cy1 = int(size * 0.42), int(size * 0.58)
    span = cx1 - cx0
    widths = [0.10, 0.05, 0.13, 0.04, 0.09, 0.05, 0.12]
    total = sum(widths)
    x = cx0
    for i, wr in enumerate(widths):
        bw = max(2, int(span * wr / total))
        d.rectangle([x, cy0, x + bw, cy1], fill=LIGHT if i % 2 == 0 else ACCENT)
        x += bw + max(2, int(span * 0.02))
        if x > cx1:
            break

    return img


for s in (192, 512):
    draw_icon(s).save(OUT / f"icon-{s}.png")
draw_icon(512, maskable=True).save(OUT / "icon-maskable-512.png")

# favicon desde el icono de 192
draw_icon(64).save(OUT / "favicon.png")
print("iconos generados en", OUT)
for f in sorted(OUT.iterdir()):
    print(" ", f.name, f.stat().st_size, "bytes")
