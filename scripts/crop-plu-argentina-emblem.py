"""Crop PLU Argentina emblem to a tight square display asset and favicon PNGs."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/assets/brand/plu-argentina-emblem.png"
OUT = ROOT / "src/assets/brand/plu-argentina-emblem-display.png"
PUBLIC_BRAND = ROOT / "public" / "brand"
OUT_SIZE = 1024
# Transparent corners (same as emblem-display) so the circle floats on the tab.
FAVICON_EXPORTS = (
    (PUBLIC_BRAND / "plu-argentina-favicon.png", 32),
    (PUBLIC_BRAND / "plu-argentina-favicon-48.png", 48),
    (PUBLIC_BRAND / "plu-argentina-apple-touch.png", 180),
)


def square_crop_opaque(img: Image.Image) -> Image.Image:
    arr = np.asarray(img)
    alpha = arr[..., 3]
    ys, xs = np.where(alpha > 16)
    if len(xs) == 0:
        raise SystemExit("no opaque pixels found")

    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    bw, bh = x1 - x0, y1 - y0
    print(f"opaque bounds=({x0},{y0})-({x1},{y1}) {bw}x{bh}")

    # Square crop centered on the opaque content, with a tiny pad.
    side = max(bw, bh)
    pad = max(8, int(side * 0.02))
    side += pad * 2
    cx = (x0 + x1) // 2
    cy = (y0 + y1) // 2
    left = max(0, cx - side // 2)
    top = max(0, cy - side // 2)
    right = min(arr.shape[1], left + side)
    bottom = min(arr.shape[0], top + side)
    if right - left < side:
        left = max(0, right - side)
    if bottom - top < side:
        top = max(0, bottom - side)

    print(f"square crop=({left},{top})-({right},{bottom}) side={right-left}")
    cropped = img.crop((left, top, right, bottom))

    # Ensure canvas is square (pad transparent if clamp shrank one axis).
    if cropped.size[0] != cropped.size[1]:
        side = max(cropped.size)
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        ox = (side - cropped.size[0]) // 2
        oy = (side - cropped.size[1]) // 2
        square.paste(cropped, (ox, oy))
        cropped = square

    return cropped


def resize_transparent(src: Image.Image, size: int) -> Image.Image:
    return src.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    img = Image.open(SRC).convert("RGBA")
    cropped = square_crop_opaque(img)

    out = resize_transparent(cropped, OUT_SIZE)
    out.save(OUT, optimize=True)
    sample = out.getpixel((OUT_SIZE // 2, OUT_SIZE // 2))
    corner = out.getpixel((8, 8))
    print("wrote", OUT, "size", out.size, "bytes", OUT.stat().st_size)
    print("center", sample, "corner", corner)

    PUBLIC_BRAND.mkdir(parents=True, exist_ok=True)
    for path, size in FAVICON_EXPORTS:
        fav = resize_transparent(cropped, size)
        fav.save(path, optimize=True)
        corner_a = fav.getpixel((0, 0))[3]
        print("wrote", path, "size", fav.size, "bytes", path.stat().st_size, "corner_alpha", corner_a)


if __name__ == "__main__":
    main()
