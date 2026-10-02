#!/usr/bin/env python3
"""Extract the approved front view from a three-view sheet as a clean pet identity lock."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--front-ratio", type=float, default=0.345)
    parser.add_argument("--canvas", type=int, default=1536)
    parser.add_argument("--occupancy", type=float, default=0.94)
    return parser.parse_args()


def alpha_bounds(rgba: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(rgba[:, :, 3] > 16)
    if len(xs) == 0:
        raise RuntimeError("No foreground found after isnet-anime segmentation")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def despill_white_matte(rgba: np.ndarray) -> np.ndarray:
    out = rgba.astype(np.float32)
    alpha = out[:, :, 3:4] / 255.0
    partial = (alpha > (2 / 255.0)) & (alpha < (252 / 255.0))
    safe_alpha = np.maximum(alpha, 2 / 255.0)
    restored = (out[:, :, :3] - 255.0 * (1.0 - alpha)) / safe_alpha
    out[:, :, :3] = np.where(partial, np.clip(restored, 0, 255), out[:, :, :3])
    clear = alpha[:, :, 0] <= (2 / 255.0)
    out[clear, :3] = 0
    out[clear, 3] = 0
    return out.astype(np.uint8)


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGBA")
    front_width = max(1, min(source.width, round(source.width * args.front_ratio)))
    front = source.crop((0, 0, front_width, source.height))
    cutout = remove(
        front,
        session=new_session("isnet-anime"),
        alpha_matting=False,
        post_process_mask=True,
    ).convert("RGBA")
    rgba = despill_white_matte(np.array(cutout))
    left, top, right, bottom = alpha_bounds(rgba)
    subject = Image.fromarray(rgba, mode="RGBA").crop((left, top, right, bottom))

    canvas_size = int(args.canvas)
    max_size = max(1, round(canvas_size * float(args.occupancy)))
    scale = min(max_size / subject.width, max_size / subject.height)
    target = subject.resize(
        (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    x = round((canvas_size - target.width) / 2)
    y = canvas_size - target.height - round(canvas_size * 0.025)
    canvas.alpha_composite(target, (x, y))

    final = np.array(canvas)
    clear = final[:, :, 3] == 0
    final[clear, :3] = 0
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(final, mode="RGBA").save(output, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
