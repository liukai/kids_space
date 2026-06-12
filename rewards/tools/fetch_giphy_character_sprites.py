#!/usr/bin/env python3
"""Download character GIFs from Giphy and patch rewards/assets/characters.json.

Usage:
  python3 rewards/tools/fetch_giphy_character_sprites.py --png-only
  python3 rewards/tools/fetch_giphy_character_sprites.py --only steve
  python3 rewards/tools/fetch_giphy_character_sprites.py --dry-run

Optional:
  export GIPHY_API_KEY=...   # official search; prefers stickers when sticker=true
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REWARD = ROOT / "rewards"
CHARS_JSON = REWARD / "assets" / "characters.json"
CHARS_EMBED = REWARD / "characters-embed.js"
SOURCES_JSON = Path(__file__).with_name("giphy_character_sources.json")
USER_AGENT = "kids_space-rewards/1.0 (local sprite cache; educational)"
GIPHY_GIF_API = "https://api.giphy.com/v1/gifs/search"
GIPHY_STICKER_API = "https://api.giphy.com/v1/stickers/search"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def regenerate_characters_embed(chars: dict) -> None:
    CHARS_EMBED.write_text(
        "window.REWARD_CHARACTERS="
        + json.dumps(chars.get("characters", []), ensure_ascii=False)
        + ";",
        encoding="utf-8",
    )
    print("Regenerated characters-embed.js")


def extract_giphy_id(value: str) -> str | None:
    value = value.strip()
    if not value:
        return None
    if re.fullmatch(r"[A-Za-z0-9]{6,20}", value):
        return value
    parsed = urllib.parse.urlparse(value)
    if parsed.path.endswith(".gif"):
        m = re.search(r"/media/(?:v1\.[^/]+/)?([^/]+)/giphy\.gif", parsed.path)
        if m:
            return m.group(1)
        m = re.search(r"/([^/]+)\.gif$", parsed.path)
        if m and re.fullmatch(r"[A-Za-z0-9]{6,20}", m.group(1)):
            return m.group(1)
    path = parsed.path.rstrip("/")
    if not path:
        return None
    slug = path.split("/")[-1]
    if slug in {"gifs", "clips", "stickers", "search"}:
        return None
    parts = slug.split("-")
    for part in reversed(parts):
        if re.fullmatch(r"[A-Za-z0-9]{6,20}", part):
            return part
    return None


def fetch_url(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def giphy_media_urls(gif_id: str) -> list[str]:
    return [
        f"https://i.giphy.com/{gif_id}.gif",
        f"https://media0.giphy.com/media/{gif_id}/giphy.gif",
        f"https://media1.giphy.com/media/{gif_id}/giphy.gif",
        f"https://media2.giphy.com/media/{gif_id}/giphy.gif",
        f"https://media3.giphy.com/media/{gif_id}/giphy.gif",
        f"https://media4.giphy.com/media/{gif_id}/giphy.gif",
    ]


def resolve_from_page(page_url: str) -> str | None:
    html = fetch_url(page_url).decode("utf-8", errors="replace")
    og = re.search(
        r'<meta\s+property="og:image"\s+content="([^"]+)"',
        html,
        re.I,
    )
    if og:
        m = re.search(r"/media/(?:v1\.[^/]+/)?([^/]+)/giphy\.gif", og.group(1))
        if m:
            return m.group(1)
    nxt = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        html,
        re.S,
    )
    if nxt:
        data = json.loads(nxt.group(1))
        gif = data.get("props", {}).get("pageProps", {}).get("gif") or {}
        gif_id = gif.get("id")
        if gif_id:
            return str(gif_id)
    return extract_giphy_id(page_url)


def pick_from_api_items(items: list, query: str) -> str | None:
    q = query.lower()
    for item in items:
        title = str(item.get("title", "")).lower()
        tags = " ".join(str(t) for t in item.get("tags", [])).lower()
        blob = title + " " + tags
        if "minecraft" in blob or "minecraft" in q:
            gif_id = item.get("id")
            if gif_id:
                return str(gif_id)
    if items:
        gif_id = items[0].get("id")
        if gif_id:
            return str(gif_id)
    return None


def search_via_api(query: str, api_key: str, stickers: bool) -> str | None:
    params = {
        "api_key": api_key,
        "q": query,
        "limit": "15",
        "rating": "g",
        "lang": "en",
    }
    endpoint = GIPHY_STICKER_API if stickers else GIPHY_GIF_API
    url = endpoint + "?" + urllib.parse.urlencode(params)
    payload = json.loads(fetch_url(url, timeout=45).decode("utf-8"))
    return pick_from_api_items(payload.get("data", []), query)


def search_via_scrape(query: str, stickers: bool) -> str | None:
    slug = urllib.parse.quote(query.replace(" ", "-"))
    kind = "stickers" if stickers else "gifs"
    url = f"https://giphy.com/{kind}/search/{slug}"
    html = fetch_url(url, timeout=45).decode("utf-8", errors="replace")
    nxt = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        html,
        re.S,
    )
    if not nxt:
        return None
    data = json.loads(nxt.group(1))
    gifs = data.get("props", {}).get("pageProps", {}).get("gifs", [])
    return pick_from_api_items(gifs, query)


def search_giphy_id(query: str, api_key: str | None, prefer_sticker: bool) -> tuple[str | None, str]:
    order = (True, False) if prefer_sticker else (False, True)
    for stickers in order:
        label = "sticker" if stickers else "gif"
        if api_key:
            try:
                gif_id = search_via_api(query, api_key, stickers)
                if gif_id:
                    return gif_id, f"api-{label}:{query}"
            except urllib.error.URLError as exc:
                print(f"  warn: api {label} search failed:", exc)
        try:
            gif_id = search_via_scrape(query, stickers)
            if gif_id:
                return gif_id, f"search-{label}:{query}"
        except urllib.error.URLError as exc:
            print(f"  warn: {label} scrape failed:", exc)
    return None, f"no results for {query}"


def resolve_gif_id(spec: dict, api_key: str | None) -> tuple[str | None, str]:
    if spec.get("skip"):
        return None, "skipped"

    if spec.get("url"):
        url = str(spec["url"]).strip()
        gif_id = extract_giphy_id(url)
        if gif_id and not url.startswith("http"):
            return gif_id, "url-id"
        if url.startswith("http") and url.lower().endswith(".gif"):
            return url, "direct-url"
        if gif_id:
            return gif_id, "url"
        return None, "invalid url"

    if spec.get("id"):
        return str(spec["id"]), "id"

    if spec.get("giphy"):
        page = str(spec["giphy"]).strip()
        if page.startswith("http"):
            try:
                resolved = resolve_from_page(page)
                if resolved:
                    return resolved, "page"
            except urllib.error.URLError as exc:
                print("  warn: page lookup failed:", exc)
        gif_id = extract_giphy_id(page)
        if gif_id:
            return gif_id, "giphy"
        return None, "invalid giphy url"

    query = str(spec.get("search", "")).strip()
    if not query:
        return None, "no source"
    prefer_sticker = bool(spec.get("sticker", True))
    return search_giphy_id(query, api_key, prefer_sticker)


def download_gif(gif_id_or_url: str, dest: Path, dry_run: bool) -> None:
    urls = (
        [gif_id_or_url]
        if gif_id_or_url.startswith("http")
        else giphy_media_urls(gif_id_or_url)
    )
    last_err: Exception | None = None
    for url in urls:
        try:
            if dry_run:
                print("  would download:", url, "->", dest.name)
                return
            data = fetch_url(url)
            if len(data) < 256:
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            print("  saved:", dest.relative_to(ROOT), f"({len(data)} bytes)")
            return
        except Exception as exc:  # noqa: BLE001
            last_err = exc
    raise RuntimeError(f"could not download {gif_id_or_url}: {last_err}")


def is_png_character(entry: dict) -> bool:
    src = str(entry.get("src", "")).lower()
    return src.endswith(".png")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--png-only", action="store_true", help="Only characters still using .png sprites")
    parser.add_argument("--only", help="Comma-separated character ids")
    args = parser.parse_args()

    if not CHARS_JSON.is_file():
        print("Missing", CHARS_JSON, file=sys.stderr)
        return 1
    if not SOURCES_JSON.is_file():
        print("Missing", SOURCES_JSON, file=sys.stderr)
        return 1

    sources = load_json(SOURCES_JSON).get("characters", {})
    chars = load_json(CHARS_JSON)
    only = {x.strip() for x in args.only.split(",") if x.strip()} if args.only else None
    api_key = os.environ.get("GIPHY_API_KEY", "").strip() or None

    updated = 0
    skipped = 0
    failed: list[str] = []

    for entry in chars.get("characters", []):
        char_id = str(entry.get("id", "")).strip()
        if not char_id:
            continue
        if only and char_id not in only:
            continue
        if args.png_only and not is_png_character(entry):
            continue

        spec = sources.get(char_id, {"search": f"minecraft {entry.get('name', char_id)} sticker", "sticker": True})
        gif_id, reason = resolve_gif_id(spec, api_key)
        if spec.get("skip") or reason == "skipped":
            print(f"[skip] {char_id}: custom/local")
            skipped += 1
            continue
        if not gif_id:
            print(f"[fail] {char_id}: {reason}")
            failed.append(char_id)
            continue

        rel = f"assets/sprites/{char_id}.gif"
        dest = REWARD / rel
        print(f"[{char_id}] {reason} -> {gif_id}")
        try:
            download_gif(gif_id, dest, args.dry_run)
            if not args.dry_run:
                entry["src"] = rel
                updated += 1
            time.sleep(0.2)
        except Exception as exc:  # noqa: BLE001
            print(f"[fail] {char_id}: {exc}")
            failed.append(char_id)

    if not args.dry_run and updated:
        write_json(CHARS_JSON, chars)
        regenerate_characters_embed(chars)

    print(
        f"Done. updated={updated} skipped={skipped} failed={len(failed)}"
        + (f" ({', '.join(failed)})" if failed else "")
    )
    return 0 if not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())
