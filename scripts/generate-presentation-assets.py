"""Build non-pet presentation assets from the canonical character lock image.

The source is character design art, not a runtime pet clip. Outputs belong to
their consuming surfaces so UI code never needs to read the desk-pet package.
"""

from pathlib import Path

from PIL import Image, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/characters/xingli-source/character/character_lock.png"
AVATAR_DIR = ROOT / "public/assets/avatars/xingli"
SCENARIO_DIR = ROOT / "public/assets/scenario/characters/xingli"
VN_DIR = ROOT / "public/assets/vn/rainbound/portraits"


def fit_crop(source, box, size, padding=0):
    crop = source.crop(box)
    available = (size[0] - padding * 2, size[1] - padding * 2)
    scale = min(available[0] / crop.width, available[1] / crop.height)
    resized = crop.resize(
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (size[0] - resized.width) // 2
    y = (size[1] - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def tint_subject(image, color, amount):
    alpha = image.getchannel("A")
    tint = Image.new("RGBA", image.size, (*color, 255))
    mixed = Image.blend(image.convert("RGBA"), tint, amount)
    mixed.putalpha(alpha)
    return mixed


def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def main():
    source = Image.open(SOURCE).convert("RGBA")

    profile = fit_crop(source, (500, 55, 1036, 685), (512, 512), padding=16)
    save(profile, AVATAR_DIR / "profile.png")

    dialogue = fit_crop(source, (470, 45, 1066, 760), (640, 640), padding=18)
    save(dialogue, SCENARIO_DIR / "dialogue.png")

    base = fit_crop(source, (430, 40, 1106, 1120), (768, 1152), padding=32)
    variants = {
        "xingli-neutral.png": base,
        "xingli-shy.png": tint_subject(ImageEnhance.Color(base).enhance(1.04), (255, 205, 215), 0.035),
        "xingli-smile.png": ImageEnhance.Brightness(ImageEnhance.Color(base).enhance(1.05)).enhance(1.025),
        "xingli-thinking.png": tint_subject(ImageEnhance.Color(base).enhance(0.92), (190, 205, 225), 0.025),
        "xingli-open.png": ImageEnhance.Contrast(ImageEnhance.Brightness(base).enhance(1.035)).enhance(1.025),
    }
    for filename, image in variants.items():
        save(image, VN_DIR / filename)

    print(f"Generated avatar: {AVATAR_DIR / 'profile.png'}")
    print(f"Generated scenario portrait: {SCENARIO_DIR / 'dialogue.png'}")
    print(f"Generated VN portraits: {len(variants)}")


if __name__ == "__main__":
    main()
