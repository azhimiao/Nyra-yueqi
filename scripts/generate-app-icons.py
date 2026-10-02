"""Render every app icon surface from the single brand master.

Master: assets/brand/app-icon-1024.png

Outputs (all committed, so no build step needs an image library):
  public/assets/icon-192.png, icon-512.png   PWA manifest
  public/assets/favicon-48.png               browser tab
  public/assets/apple-touch-icon.png         iOS home screen
  assets/brand/icon-<size>.png               masters the web build copies from
  android/.../mipmap-*/ic_launcher.png       legacy square launcher icon
  android/.../mipmap-*/ic_launcher_round.png legacy round launcher icon
  android/.../mipmap-*/ic_launcher_foreground.png  adaptive foreground layer

Run: npm run generate:app-icons
"""

from __future__ import annotations

import statistics
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "assets" / "brand" / "app-icon-1024.png"
BRAND_DIR = ROOT / "assets" / "brand"
WEB_DIR = ROOT / "public" / "assets"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"

# Android ships one bitmap per density bucket.
LEGACY_SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND_SIZES = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

# An adaptive icon is a 108dp canvas whose outer 21dp can be cropped by any
# launcher mask, so artwork has to stay inside the centre 66dp. 64dp leaves a
# little slack for the roundest masks.
ADAPTIVE_CANVAS_DP = 108
ADAPTIVE_ART_DP = 64

# Web icons declared "maskable" only guarantee the centre 80%.
WEB_SIZES = {
    "icon-192.png": 192,
    "icon-512.png": 512,
    "favicon-48.png": 48,
    "apple-touch-icon.png": 180,
}

# Supersample before masking so circle edges come out smooth.
MASK_SCALE = 4


def sample_background(image: Image.Image) -> tuple[int, int, int]:
    """Average the outermost ring; the master is a full-bleed square."""
    width, height = image.size
    pixels = image.load()
    ring = []
    for x in range(0, width, 7):
        ring.append(pixels[x, 2])
        ring.append(pixels[x, height - 3])
    for y in range(0, height, 7):
        ring.append(pixels[2, y])
        ring.append(pixels[width - 3, y])
    return tuple(round(statistics.mean(c[i] for c in ring)) for i in range(3))


def art_bounds(image: Image.Image, background: tuple[int, int, int], tolerance: int = 10):
    """Bounding box of everything that reads as ink rather than backdrop."""
    width, height = image.size
    pixels = image.load()
    min_x, min_y, max_x, max_y = width, height, -1, -1
    for y in range(height):
        for x in range(width):
            pixel = pixels[x, y]
            if max(abs(pixel[i] - background[i]) for i in range(3)) > tolerance:
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
    if max_x < 0:
        raise SystemExit(f"{MASTER} looks like a flat colour — no artwork found")
    return min_x, min_y, max_x, max_y


def circle_mask(size: int) -> Image.Image:
    big = size * MASK_SCALE
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def resized(master: Image.Image, size: int) -> Image.Image:
    return master.resize((size, size), Image.LANCZOS)


def write(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)
    print(f"  {path.relative_to(ROOT)}  {image.width}x{image.height}")


def main() -> None:
    if not MASTER.exists():
        raise SystemExit(f"missing brand master: {MASTER}")

    master = Image.open(MASTER).convert("RGBA")
    if master.width != master.height:
        raise SystemExit(f"{MASTER} must be square, got {master.size}")

    flat = master.convert("RGB")
    background = sample_background(flat)
    min_x, min_y, max_x, max_y = art_bounds(flat, background)
    art_span = max(max_x - min_x + 1, max_y - min_y + 1)
    art_fraction = art_span / master.width
    hex_background = "#{:02X}{:02X}{:02X}".format(*background)
    print(f"master {master.width}px  backdrop {hex_background}  art {art_fraction:.1%} of frame")

    print("web:")
    for name, size in WEB_SIZES.items():
        icon = resized(master, size)
        write(icon, WEB_DIR / name)
        if name.startswith("icon-"):
            write(icon, BRAND_DIR / name)

    print("android legacy:")
    for bucket, size in LEGACY_SIZES.items():
        square = resized(master, size)
        write(square, ANDROID_RES / f"mipmap-{bucket}" / "ic_launcher.png")
        round_icon = square.copy()
        round_icon.putalpha(circle_mask(size))
        write(round_icon, ANDROID_RES / f"mipmap-{bucket}" / "ic_launcher_round.png")

    print("android adaptive foreground:")
    for bucket, canvas in FOREGROUND_SIZES.items():
        # Scale the master so its artwork — not its frame — lands on the safe zone.
        inner = round(canvas * (ADAPTIVE_ART_DP / ADAPTIVE_CANVAS_DP) / art_fraction)
        layer = resized(master, inner)
        layer.putalpha(circle_mask(inner))

        # Centre the ink rather than the frame; the crescent sits slightly off.
        scale = inner / master.width
        art_center_x = ((min_x + max_x + 1) / 2) * scale
        art_center_y = ((min_y + max_y + 1) / 2) * scale
        offset = (
            round(canvas / 2 - art_center_x),
            round(canvas / 2 - art_center_y),
        )

        foreground = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        foreground.alpha_composite(layer, offset)
        write(foreground, ANDROID_RES / f"mipmap-{bucket}" / "ic_launcher_foreground.png")

    colors = ANDROID_RES / "values" / "ic_launcher_background.xml"
    colors.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">{hex_background}</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    print(f"  {colors.relative_to(ROOT)}  {hex_background}")


if __name__ == "__main__":
    main()
