"""Render the native launch screens that sit under the web intro.

The wordmark itself is written by `src/splash/boot-splash.js` once the WebView
paints, so the native launch image only has to be the same night canvas as
`[data-boot-screen]` in index.html. Anything else (the stock Capacitor mark on
white) flashes before the intro starts.

Outputs (all committed, so no build step needs an image library):
  android/.../drawable*/splash.png             every density bucket
  ios/App/App/Assets.xcassets/Splash.imageset  universal 2732 canvases

Run: npm run generate:splash-assets
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
IOS_SPLASH = ROOT / "ios" / "App" / "App" / "Assets.xcassets" / "Splash.imageset"

# Mirrors the linear-gradient plus the two radial glows in index.html.
TOP = (3, 18, 43)
MID = (7, 27, 51)
BOTTOM = (4, 18, 32)
MID_STOP = 0.68
GLOW = (172, 198, 232)
GLOW_ALPHA = 0.10
GLOW_CENTRE = (0.50, 0.48)
GLOW_RADIUS = (760 / 390, 430 / 844)  # scene-relative, from the CSS radii


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(width: int, height: int) -> Image.Image:
    column = Image.new("RGB", (1, height))
    pixels = column.load()
    for y in range(height):
        t = y / max(1, height - 1)
        if t <= MID_STOP:
            pixels[0, y] = lerp(TOP, MID, t / MID_STOP)
        else:
            pixels[0, y] = lerp(MID, BOTTOM, (t - MID_STOP) / (1 - MID_STOP))
    return column.resize((width, height), Image.BILINEAR)


def add_glow(image: Image.Image) -> Image.Image:
    """One soft elliptical highlight behind where the wordmark lands."""
    width, height = image.size
    # Painting the falloff small and scaling up keeps this fast on 2732px art.
    small_w, small_h = 96, max(1, round(96 * height / width))
    mask = Image.new("L", (small_w, small_h))
    pixels = mask.load()
    cx = GLOW_CENTRE[0] * small_w
    cy = GLOW_CENTRE[1] * small_h
    rx = max(1.0, GLOW_RADIUS[0] * small_w / 2)
    ry = max(1.0, GLOW_RADIUS[1] * small_h / 2)
    for y in range(small_h):
        for x in range(small_w):
            d = (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) ** 0.5
            if d >= 1:
                continue
            # Matches the CSS transparent-at-64% falloff closely enough.
            pixels[x, y] = round(255 * GLOW_ALPHA * (1 - d) ** 1.6)
    glow = Image.new("RGB", image.size, GLOW)
    return Image.composite(glow, image, mask.resize(image.size, Image.BICUBIC))


def render(width: int, height: int) -> Image.Image:
    return add_glow(vertical_gradient(width, height))


def main() -> None:
    written = 0
    for path in sorted(ANDROID_RES.glob("drawable*/splash.png")):
        with Image.open(path) as existing:
            size = existing.size
        render(*size).save(path, "PNG", optimize=True)
        print(f"{path.relative_to(ROOT)}  {size[0]}x{size[1]}")
        written += 1

    for path in sorted(IOS_SPLASH.glob("*.png")):
        with Image.open(path) as existing:
            size = existing.size
        render(*size).save(path, "PNG", optimize=True)
        print(f"{path.relative_to(ROOT)}  {size[0]}x{size[1]}")
        written += 1

    if not written:
        raise SystemExit("no splash targets found")
    print(f"\n{written} launch image(s) rendered")


if __name__ == "__main__":
    main()
