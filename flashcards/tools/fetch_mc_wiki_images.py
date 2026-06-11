#!/usr/bin/env python3
"""Fetch Minecraft Wiki thumbnails for MC flashcard words.

Writes tools/mc_wiki_images_remote.json (word -> thumbnail URL). Then cache locally:
  python3 flashcards/tools/fetch_mc_wiki_images.py
  python3 flashcards/tools/sync_wiki_assets.py
  python3 flashcards/tools/merge-pronunciations.py
"""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

from minecraft_wiki_data import _BY_WORD

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "mc_wiki_images_remote.json"
API = "https://minecraft.wiki/api.php"
USER_AGENT = "kids_space-flashcards/1.0 (educational; contact: github.com/liukai/kids_space)"
BATCH = 20
THUMB_SIZE = 128


def fetch_thumbnails(page_titles: list[str]) -> dict[str, str | None]:
    params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "prop": "pageimages",
        "pithumbsize": str(THUMB_SIZE),
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
    words_pages = [(word, page) for word, (page, _blurb) in sorted(_BY_WORD.items())]
    images: dict[str, str] = {}
    missing: list[str] = []

    for i in range(0, len(words_pages), BATCH):
        batch = words_pages[i : i + BATCH]
        titles = [page for _word, page in batch]
        try:
            thumbs = fetch_thumbnails(titles)
        except Exception as exc:  # noqa: BLE001
            print("Batch failed:", exc)
            thumbs = {}
        for word, page in batch:
            url = thumbs.get(page)
            if url:
                images[word] = url
            else:
                missing.append(word)
        print(f"Fetched {min(i + BATCH, len(words_pages))}/{len(words_pages)}")
        time.sleep(0.35)

    OUT.write_text(json.dumps(images, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Wrote", len(images), "URLs ->", OUT)
    if missing:
        print("No thumbnail for", len(missing), "words:", ", ".join(missing[:12]), "...")
    if not images:
        raise SystemExit(
            "No thumbnails fetched — check network access to minecraft.wiki and retry."
        )


if __name__ == "__main__":
    main()
