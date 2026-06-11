#!/usr/bin/env python3
"""Patch character src fields to working Minecraft Wiki thumbnail URLs.

Usage:
  python3 rewards/tools/patch_character_wiki_src.py
"""

from __future__ import annotations

import json
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WIKI_IMAGES = ROOT / "flashcards" / "tools" / "mc_wiki_images.json"
CHARS_JSON = ROOT / "rewards" / "assets" / "characters.json"
CHARS_EMBED = ROOT / "rewards" / "characters-embed.js"

EXTRA_FILES = {
    "steve": "Steve_(classic)_JE2.png",
    "alex": "Alex_(slim)_JE2.png",
    "pig": "Temperate_Pig_JE3_BE2.png",
    "cow": "Cow_JE5_BE3.png",
    "sheep": "Sheep_JE4_BE3.png",
    "horse": "Chestnut_Horse_JE3_BE2.png",
    "bee": "Bee_JE2_BE2.gif",
    "panda": "Panda_JE2_BE2.png",
    "fox": "Fox_JE2_BE2.png",
    "cat": "Tuxedo_Cat_JE2_BE2.png",
    "librarian": "Plains_Librarian_Base_JE2.png",
    "farmer": "Plains_Farmer_Base_JE2.png",
    "wandering-trader": "Wandering_Trader_JE2.png",
    "cave-spider": "Cave_Spider_JE2_BE2.png",
    "witch": "Witch_JE2.png",
    "zombified-piglin": "Zombified_Piglin_JE2_BE2.png",
    "magma-cube": "Magma_Cube_JE2_BE2.png",
}


def wiki_filepath_url(filename: str) -> str:
    return (
        "https://minecraft.wiki/Special:FilePath/"
        + urllib.parse.quote(filename)
        + "?width=128"
    )


def resolve_url(char_id: str, wiki_images: dict[str, str]) -> str | None:
    if char_id in wiki_images:
        return wiki_images[char_id]
    if char_id in EXTRA_FILES:
        return wiki_filepath_url(EXTRA_FILES[char_id])
    return None


def main() -> None:
    wiki_images = json.loads(WIKI_IMAGES.read_text(encoding="utf-8"))
    data = json.loads(CHARS_JSON.read_text(encoding="utf-8"))
    missing: list[str] = []

    for entry in data.get("characters", []):
        char_id = str(entry.get("id", "")).strip()
        url = resolve_url(char_id, wiki_images)
        if not url:
            missing.append(char_id)
            continue
        entry["wikiKey"] = char_id
        entry["src"] = url

    if missing:
        raise SystemExit("No wiki URL for: " + ", ".join(missing))

    CHARS_JSON.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    CHARS_EMBED.write_text(
        "window.REWARD_CHARACTERS="
        + json.dumps(data["characters"], ensure_ascii=False)
        + ";",
        encoding="utf-8",
    )
    print("Patched", len(data["characters"]), "characters")


if __name__ == "__main__":
    main()
