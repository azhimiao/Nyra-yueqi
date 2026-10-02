"""
Production matting worker: gray-bg → rembg isnet-anime → cleanup.
Usage: python matte.py <in.png> <out.png>
"""
from __future__ import annotations
import json
import sys
import time
from pathlib import Path

def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: python matte.py <in.png> <out.png>", file=sys.stderr)
        return 2
    inp, outp = Path(sys.argv[1]), Path(sys.argv[2])
    t0 = time.time()
    try:
        from rembg import remove, new_session
        from PIL import Image
        import numpy as np
    except ImportError as e:
        print(json.dumps({"ok": False, "error": "DEPS_MISSING", "detail": str(e)}))
        return 1

    session = new_session("isnet-anime")
    im = Image.open(inp).convert("RGBA")
    out = remove(im, session=session)
    arr = np.array(out)
    # simple gray fringe kill on near-gray opaque pixels near edges — placeholder
    outp.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr).save(outp)
    alpha = arr[:, :, 3]
    coverage = float((alpha > 16).mean())
    print(
        json.dumps(
            {
                "ok": True,
                "model": "isnet-anime",
                "elapsedMs": int((time.time() - t0) * 1000),
                "alphaCoverage": coverage,
                "out": str(outp),
            }
        )
    )
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
