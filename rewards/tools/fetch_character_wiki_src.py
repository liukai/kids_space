#!/usr/bin/env python3
"""Fetch working Minecraft Wiki thumbnail URLs for reward characters.

Updates rewards/assets/characters.json and regenerates characters-embed.js.

Usage:
  python3 rewards/tools/fetch_character_wiki_src.py
"""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHARS_JSON = ROOT / "rewards" / "assets" / "characters.json"
CHARS_EMBED = ROOT / "rewards" / "characters-embed.js"
WIKI_IMAGES = ROOT / "flashcards" / "tools" / "mc_wiki_images.json"
API = "https://minecraft.wiki/api.php"
USER_AGENT = "kids_space-rewards/1.0 (educational; local cache)"
THUMB = 128

PAGE_OVERRIDES = {
    "librarian": "Librarian",
    "farmer": "Farmer",
    "wandering-trader": "Wandering Trader",
    "cave-spider": "Cave Spider",
    "zombified-piglin": "Zombified Piglin",
    "magma-cube": "Magma Cube",
}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def fetch_thumbnails(page_titles: list[str]) -> dict[str, str | None]:
    params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "prop": "pageimages",
        "pithumbsize": str(THUMB),
        "titles": "|".join(page_titles),
    }
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.load(resp)
    out: dict[str, str | None] = {}
    for page in data.get("query", {}).get("pages", []):
        title = page.get("title", "")
        thumb = page.get("thumbnail", {}).get("source")
        out[title] = thumb
    return out


def main() -> None:
    chars = load_json(CHARS_JSON)
    wiki_images = load_json(WIKI_IMAGES) if WIKI_IMAGES.is_file() else {}
    entries = chars.get("characters", [])
    pages: list[tuple[str, str]] = []
    for entry in entries:
        char_id = str(entry.get("id", "")).strip()
        name = str(entry.get("name", char_id)).strip()
        page = PAGE_OVERRIDES.get(char_id, name)
        pages.append((char_id, page))

    titles = [page for _cid, page in pages]
    thumbs = fetch_thumbnails(titles)
    time.sleep(0.25)

    updated = 0
    missing: list[str] = []
    for char_id, page in pages:
        url = wiki_images.get(char_id) or thumbs.get(page)
        if not url:
            missing.append(char_id)
            continue
        for entry in entries:
            if str(entry.get("id", "")).strip() == char_id:
                if entry.get("src") != url:
                    entry["src"] = url
                    updated += 1
                entry["wikiKey"] = char_id
                break

    if missing:
        print("No URL for:", ", ".join(missing))

    CHARS_JSON.write_text(
        json.dumps(chars, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    CHARS_EMBED.write_text(
        "window.REWARD_CHARACTERS="
        + json.dumps(chars["characters"], ensure_ascii=False)
        + ";",
        encoding="utf-8",
    )
    print(f"Updated {updated} character src URLs -> {CHARS_JSON}")


if __name__ == "__main__":
    main()
