from __future__ import annotations

import sys
from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from rembg import new_session, remove


def refine_with_grabcut(source_bytes: bytes, cutout_bytes: bytes) -> bytes:
    """Recover pale costume/hair regions that anime matting may punch through.

    The semantic matte is used only as a trimap. GrabCut is allowed to recover
    pixels near that subject silhouette, while the image border stays definite
    background. RGB always comes from the generated source, avoiding coloured
    fringe introduced by repeated de-spill operations.
    """

    source = Image.open(BytesIO(source_bytes)).convert("RGB")
    cutout = Image.open(BytesIO(cutout_bytes)).convert("RGBA")
    if cutout.size != source.size:
        cutout = cutout.resize(source.size, Image.Resampling.LANCZOS)

    rgb = np.asarray(source)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    semantic_alpha = np.asarray(cutout.getchannel("A"))

    # A broad probable-foreground band lets GrabCut recover white sleeves,
    # highlights, loose hair and thin ornaments without opening the whole matte.
    visible = (semantic_alpha >= 12).astype(np.uint8)
    visible = cv2.morphologyEx(
        visible,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)),
        iterations=2,
    )
    probable = cv2.dilate(
        visible,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)),
        iterations=1,
    )
    certain = cv2.erode(
        (semantic_alpha >= 210).astype(np.uint8),
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
        iterations=1,
    )

    mask = np.full(semantic_alpha.shape, cv2.GC_PR_BGD, dtype=np.uint8)
    mask[probable > 0] = cv2.GC_PR_FGD
    mask[certain > 0] = cv2.GC_FGD
    # ARK sometimes returns the requested magenta matte as a red gradient.
    # Treat only strongly red-dominant pixels as definite background; costume
    # blues, skin and dark hair remain untouched.
    red = rgb[:, :, 0].astype(np.int16)
    green = rgb[:, :, 1].astype(np.int16)
    blue = rgb[:, :, 2].astype(np.int16)
    vivid_red_matte = (red >= 150) & (red - np.maximum(green, blue) >= 80)
    mask[vivid_red_matte] = cv2.GC_BGD
    border = max(3, round(min(source.size) * 0.004))
    mask[:border, :] = cv2.GC_BGD
    mask[-border:, :] = cv2.GC_BGD
    mask[:, :border] = cv2.GC_BGD
    mask[:, -border:] = cv2.GC_BGD

    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(
        bgr,
        mask,
        None,
        background_model,
        foreground_model,
        5,
        cv2.GC_INIT_WITH_MASK,
    )

    foreground = np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0
    ).astype(np.uint8)
    foreground = cv2.morphologyEx(
        foreground,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)),
        iterations=1,
    )
    # Keep anti-aliased semantic edges where they agree, while using the
    # recovered silhouette to fill semantic holes inside pale materials.
    softened = cv2.GaussianBlur(foreground, (0, 0), 0.65)
    alpha = np.maximum(np.minimum(semantic_alpha, softened), foreground)

    rgba = np.dstack((rgb, alpha))
    output = BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(output, format="PNG", optimize=True)
    return output.getvalue()


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: remove-anime-background.py INPUT OUTPUT", file=sys.stderr)
        return 2

    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    session = new_session("isnet-anime")
    source_bytes = source.read_bytes()
    result = remove(
        source_bytes,
        session=session,
        post_process_mask=True,
        force_return_bytes=True,
    )
    target.write_bytes(refine_with_grabcut(source_bytes, result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
