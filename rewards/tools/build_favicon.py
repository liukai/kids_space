#!/usr/bin/env python3
"""Build Reward Overworld favicons from Milo plush photo + pixel art.

Usage:
  python3 -m venv .venv-favicon && .venv-favicon/bin/pip install pillow
  python3 rewards/tools/build_favicon.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Install Pillow first: pip install pillow") from exc

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "milo-plush-extracted.png"

PIXEL_ROWS = [
    "________GGGGGGGGGGGGGGGG________",
    "______GGGGGGGGGGGGGGGGGGGG______",
    "____GGGGGGGGGGGGGGGGGGGGGGGG____",
    "___GGGGGGGGGGGGGGGGGGGGGGGGGG___",
    "__GGGGGGGGGdddddddddGGGGGGGGGG__",
    "_GGGGGGGGGddBBBBBBBddGGGGGGGGGG_",
    "_GGGGGGGGdBBBBBBBBBBBdGGGGGGGGG_",
    "GGGGGGGGdBBBBBBBBBBBBBdGGGGGGGGG",
    "GGGGGGGGdBBBBBBBBBBBBBBdGGGGGGGG",
    "GGGGGGGGdBBBBWWWWWWBBBBdGGGGGGGG",
    "GGGGGGGGdBBBWWWWWWWWBBBdGGGGGGGG",
    "GGGGGGGGdBBWWWWWWWWWWBBdGGGGGGGG",
    "GGGGGGGGdBBWWYYYYYYWWBBdGGGGGGGG",
    "GGGGGGGGdBBWKwwwwwwKWBBdGGGGGGGG",
    "GGGGGGGGdBBWKwwHHwwKWBBdGGGGGGGG",
    "GGGGGGGGdBBWWYYYYYYWWBBdGGGGGGGG",
    "GGGGGGGGdBBBWWWWWWWWBBBdGGGGGGGG",
    "GGGGGGGGdBBBBWWWWWWBBBBdGGGGGGGG",
    "GGGGGGGGGdBBBBBBBBBBBBBdGGGGGGGG",
    "GGGGGGGGGGdBBBBBBBBBBBdGGGGGGGGG",
    "_GGGGGGGGGGdBBBBBBBBBdGGGGGGGGG_",
    "_GGGGGGGGGGGdBBBBBBBdGGGGGGGGGG_",
    "__GGGGGGGGGGddBBBBddGGGGGGGGGG__",
    "___GGGGGGGGGGGKKKKGGGGGGGGGGG___",
    "____GGGGGGGGGGGGGGGGGGGGGGGG____",
    "______GGGGGGGGGGGGGGGGGGGG______",
    "________GGGGGGGGGGGGGG__________",
]

PIXEL_COLORS = {
    "G": (124, 179, 66, 255),
    "D": (85, 139, 47, 255),
    "B": (79, 195, 247, 255),
    "d": (2, 136, 209, 255),
    "W": (255, 255, 255, 255),
    "Y": (255, 241, 118, 255),
    "K": (38, 50, 56, 255),
    "w": (255, 255, 255, 255),
    "H": (129, 212, 250, 255),
    "_": (104, 159, 56, 255),
}


def build_pixel_png(size: int) -> Image.Image:
    h = len(PIXEL_ROWS)
    w = len(PIXEL_ROWS[0])
    im = Image.new("RGBA", (w, h))
    px = im.load()
    for y, row in enumerate(PIXEL_ROWS):
        for x, ch in enumerate(row):
            px[x, y] = PIXEL_COLORS.get(ch, PIXEL_COLORS["_"])
    return im.resize((size, size), Image.Resampling.NEAREST)


def build_svg() -> str:
    rects: list[str] = []
    for y, row in enumerate(PIXEL_ROWS):
        for x, ch in enumerate(row):
            if ch == "_":
                continue
            hex_color = "#%02x%02x%02x" % PIXEL_COLORS[ch][:3]
            rects.append(
                f'  <rect x="{x}" y="{y}" width="1" height="1" fill="{hex_color}"/>'
            )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" '
        'shape-rendering="crispEdges" role="img" aria-label="Reward Overworld">\n'
        '  <rect width="32" height="32" rx="6" fill="#689f38"/>\n'
        + "\n".join(rects)
        + "\n</svg>\n"
    )


def extract_from_photo(src: Path) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    bird = im.crop((int(w * 0.05), int(h * 0.18), int(w * 0.68), int(h * 0.92)))
    px = bird.load()

    def is_bg(r: int, g: int, b: int) -> bool:
        if r > 145 and g > 115 and b < 130 and (r - b) > 40:
            return True
        if r > 195 and g > 175 and 70 < b < 150:
            return True
        return False

    for y in range(bird.height):
        for x in range(bird.width):
            r, g, b, a = px[x, y]
            if is_bg(r, g, b):
                px[x, y] = (0, 0, 0, 0)
    bbox = bird.getbbox()
    if bbox:
        bird = bird.crop(bbox)
    bw, bh = bird.size
    side = max(bw, bh)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(bird, ((side - bw) // 2, (side - bh) // 2), bird)
    return sq


def main() -> None:
    (ROOT / "favicon.svg").write_text(build_svg(), encoding="utf-8")
    build_pixel_png(32).save(ROOT / "favicon.png")
    print("Wrote favicon.svg, favicon.png")

    if SOURCE.is_file():
        extracted = extract_from_photo(SOURCE)
        for size, name in [(512, ASSETS / "milo-plush-extracted.png"), (180, ROOT / "apple-touch-icon.png")]:
            scaled = extracted.resize((size, size), Image.Resampling.LANCZOS)
            scaled.save(name)
        print("Wrote apple-touch-icon.png from", SOURCE.name)
    else:
        build_pixel_png(180).save(ROOT / "apple-touch-icon.png")
        print("No plush source — used pixel art for apple-touch-icon.png")


if __name__ == "__main__":
    main()
