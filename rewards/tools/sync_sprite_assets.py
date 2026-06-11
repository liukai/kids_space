#!/usr/bin/env python3
"""Download reward sprites locally and patch JSON src paths.

Usage:
  python3 rewards/tools/sync_sprite_assets.py
"""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REWARD = ROOT / "rewards"
WIKI_IMAGES = ROOT / "flashcards" / "tools" / "mc_wiki_images.json"
ITEMS_JSON = REWARD / "assets" / "mc_items.json"
CHARS_JSON = REWARD / "assets" / "characters.json"
SPRITES = REWARD / "assets" / "sprites"
API = "https://minecraft.wiki/api.php"
USER_AGENT = "kids_space-rewards/1.0 (educational; local cache)"
THUMB = 128

CHAR_PAGES = {
    "steve": "Steve",
    "alex": "Alex",
    "wandering-trader": "Wandering Trader",
    "cave-spider": "Cave Spider",
    "zombified-piglin": "Zombified Piglin",
    "magma-cube": "Magma Cube",
}

ITEM_ARRAYS = (
    "likesCommon",
    "likesRare",
    "likesEpic",
    "dislikesMild",
    "dislikesSevere",
)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def api_thumbnails(titles: list[str]) -> dict[str, str | None]:
    if not titles:
        return {}
    params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "prop": "pageimages",
        "pithumbsize": str(THUMB),
        "titles": "|".join(titles),
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


def ext_for_url(url: str) -> str:
    path = urllib.parse.urlparse(url).path.lower()
    if path.endswith(".gif"):
        return ".gif"
    if path.endswith(".webp"):
        return ".png"
    return ".png"


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        dest.write_bytes(resp.read())


def wiki_thumb_url(filename: str, size: int = 128) -> str:
    seg = urllib.parse.quote(filename.replace(" ", "_"), safe="")
    return f"https://minecraft.wiki/images/thumb/{seg}/{size}px-{seg}"


def resolve_url(
    key: str,
    label: str,
    wiki_images: dict[str, str],
    extra_files: dict[str, str],
    api_cache: dict[str, str | None],
) -> str | None:
    if key in wiki_images:
        url = wiki_images[key]
        if ".webp" in url.lower():
            return url.replace(".webp", ".png")
        return url
    if key in extra_files:
        return wiki_thumb_url(extra_files[key])
    page = CHAR_PAGES.get(key, label)
    if page not in api_cache:
        fetched = api_thumbnails([page])
        api_cache.update(fetched)
        time.sleep(0.25)
    url = api_cache.get(page)
    if url:
        return url
    return None


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


def patch_entry(
    entry: dict,
    wiki_images: dict[str, str],
    api_cache: dict[str, str | None],
    downloaded: dict[str, str],
) -> None:
    entry_id = str(entry.get("id", "")).strip()
    wiki_key = str(entry.get("wikiKey", entry_id)).strip()
    label = str(entry.get("label", entry_id)).strip()
    if not entry_id:
        return

    cache_key = f"{entry_id}:{wiki_key}"
    if cache_key in downloaded:
        entry["src"] = downloaded[cache_key]
        return

    url = resolve_url(wiki_key, label, wiki_images, EXTRA_FILES, api_cache)
    if not url:
        print("  skip (no URL):", entry_id, wiki_key)
        return

    download_url = url
    extra_name = EXTRA_FILES.get(wiki_key) or EXTRA_FILES.get(entry_id)
    if extra_name:
        download_url = wiki_thumb_url(extra_name)

    ext = ext_for_url(download_url)
    extra_name = EXTRA_FILES.get(wiki_key) or EXTRA_FILES.get(entry_id)
    if extra_name and extra_name.lower().endswith(".gif"):
        ext = ".gif"
    rel = f"assets/sprites/{entry_id}{ext}"
    dest = REWARD / rel
    if not dest.exists() or dest.stat().st_size < 32:
        print("  download:", entry_id, "->", rel)
        download(download_url, dest)
        time.sleep(0.15)
    else:
        print("  cached:", entry_id)

    entry["src"] = rel
    downloaded[cache_key] = rel


def regenerate_embeds(items: dict, chars: dict) -> None:
    items_js = REWARD / "mc-items-embed.js"
    chars_js = REWARD / "characters-embed.js"
    items_js.write_text(
        "window.REWARD_MC_ITEMS=" + json.dumps(items, ensure_ascii=False) + ";",
        encoding="utf-8",
    )
    chars_js.write_text(
        "window.REWARD_CHARACTERS="
        + json.dumps(chars.get("characters", []), ensure_ascii=False)
        + ";",
        encoding="utf-8",
    )
    print("Regenerated embed JS files")


def main() -> None:
    wiki_images = load_json(WIKI_IMAGES) if WIKI_IMAGES.is_file() else {}
    items = load_json(ITEMS_JSON)
    chars = load_json(CHARS_JSON)
    api_cache: dict[str, str | None] = {}
    downloaded: dict[str, str] = {}

    print("Syncing MC item sprites...")
    for array_name in ITEM_ARRAYS:
        for entry in items.get(array_name, []):
            patch_entry(entry, wiki_images, api_cache, downloaded)

    print("Syncing character sprites...")
    for entry in chars.get("characters", []):
        patch_entry(entry, wiki_images, api_cache, downloaded)

    write_json(ITEMS_JSON, items)
    write_json(CHARS_JSON, chars)
    regenerate_embeds(items, chars)
    print("Done.", len(downloaded), "sprites referenced")


if __name__ == "__main__":
    main()
