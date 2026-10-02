from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from PIL import Image


CANVAS_SIZE = 1536
SAFE_FRACTION = 0.90


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reprocess an approved ARK pet pose without another model call."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--scale", type=float, default=1.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not 0.4 <= args.scale <= 1.0:
        raise ValueError("--scale must be between 0.4 and 1.0")

    root = Path(__file__).resolve().parents[1]
    remover = root / "scripts" / "remove-anime-background.py"
    temporary = args.output.with_suffix(".matte.tmp.png")
    temporary.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [sys.executable, str(remover), str(args.input), str(temporary)],
        check=True,
    )

    try:
        image = Image.open(temporary).convert("RGBA")
        alpha = image.getchannel("A")
        bounds = alpha.getbbox()
        if bounds is None:
            raise ValueError("background removal produced an empty pose")
        subject = image.crop(bounds)
        fit = min(
            CANVAS_SIZE * SAFE_FRACTION / subject.width,
            CANVAS_SIZE * SAFE_FRACTION / subject.height,
        ) * args.scale
        size = (
            max(1, round(subject.width * fit)),
            max(1, round(subject.height * fit)),
        )
        subject = subject.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (248, 248, 248, 0))
        position = (
            (CANVAS_SIZE - subject.width) // 2,
            (CANVAS_SIZE - subject.height) // 2,
        )
        canvas.alpha_composite(subject, position)
        pixels = bytearray(canvas.tobytes())
        for offset in range(0, len(pixels), 4):
            if pixels[offset + 3] == 0:
                pixels[offset : offset + 3] = b"\x00\x00\x00"
        clean = Image.frombytes("RGBA", canvas.size, bytes(pixels))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        clean.save(args.output, format="PNG", optimize=True)
    finally:
        temporary.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
