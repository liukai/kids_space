#!/usr/bin/env python3
"""Discover animated GIF thumbnails from Minecraft Wiki pages.

Updates rewards/assets/wiki_gif_urls.json and regenerates wiki-gif-urls-embed.js.

Usage:
  python3 rewards/tools/fetch_wiki_gifs.py
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
CHARS = REWARD / "assets" / "characters.json"
ITEMS = REWARD / "assets" / "mc_items.json"
OUT = REWARD / "assets" / "wiki_gif_urls.json"
EMBED = REWARD / "wiki-gif-urls-embed.js"
API = "https://minecraft.wiki/api.php"
UA = "kids_space-rewards/1.0 (educational; gif sync)"
THUMB = 128

SKIP = re.compile(
    r"icon|gui|inventory|screenshot|preview|chunk|render_|pixel|multiplayer|dedicated|"
    r"disambig|old|beta|unused|texture|model|animation sheet",
    re.I,
)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def api(params: dict) -> dict:
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.load(resp)


def score_gif(name: str, page: str) -> float:
    n = name.lower()
    if not n.endswith(".gif") or SKIP.search(n):
        return -999.0
    p = page.lower().replace(" ", "")
    score = 0.0
    if p in n.replace("_", "").replace(" ", ""):
        score += 50
    for part in page.lower().split():
        if part in n:
            score += 20
    if re.search(r"je\d|be\d", n):
        score += 8
    if any(k in n for k in ("idle", "walk", "sniff", "ambient", "swim")):
        score += 5
    score -= len(n) * 0.02
    return score


def page_gifs(page: str) -> list[str]:
    data = api(
        {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "images",
            "titles": page,
        }
    )
    pages = data.get("query", {}).get("pages", [])
    if not pages:
        return []
    out: list[str] = []
    for img in pages[0].get("images") or []:
        title = str(img.get("title", "")).replace("File:", "")
        if title.lower().endswith(".gif"):
            out.append(title)
    return out


def thumb_for_file(filename: str) -> str | None:
    data = api(
        {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "imageinfo",
            "titles": "File:" + filename,
            "iiprop": "url",
            "iiurlwidth": str(THUMB),
        }
    )
    pages = data.get("query", {}).get("pages", [])
    if not pages:
        return None
    info = (pages[0].get("imageinfo") or [{}])[0]
    return info.get("thumburl") or info.get("url")


def collect_entries() -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    chars = load_json(CHARS).get("characters", [])
    for c in chars:
        entries.append((str(c["id"]), str(c["name"])))
    items = load_json(ITEMS)
    for key in (
        "likesCommon",
        "likesRare",
        "likesEpic",
        "dislikesMild",
        "dislikesSevere",
    ):
        for item in items.get(key, []):
            entries.append((str(item["id"]), str(item["label"])))
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for wiki_key, page in entries:
        if wiki_key in seen:
            continue
        seen.add(wiki_key)
        out.append((wiki_key, page))
    return out


def main() -> None:
    urls: dict[str, str] = {}
    missing: list[str] = []
    for wiki_key, page in collect_entries():
        gifs = page_gifs(page)
        if not gifs:
            missing.append(wiki_key)
            time.sleep(0.2)
            continue
        ranked = sorted(
            ((score_gif(g, page), g) for g in gifs),
            reverse=True,
        )
        url = None
        for score, name in ranked:
            if score < 0:
                continue
            url = thumb_for_file(name)
            if url and ".gif" in url.lower():
                break
            time.sleep(0.15)
        if url:
            urls[wiki_key] = url
            print("gif", wiki_key, "->", ranked[0][1])
        else:
            missing.append(wiki_key)
        time.sleep(0.25)

    OUT.write_text(json.dumps(urls, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    EMBED.write_text(
        "window.REWARD_WIKI_GIF_URLS=" + json.dumps(urls, ensure_ascii=False) + ";",
        encoding="utf-8",
    )
    print("Wrote", len(urls), "GIF URLs;", len(missing), "without wiki GIF")


if __name__ == "__main__":
    main()
