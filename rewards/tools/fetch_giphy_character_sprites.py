#!/usr/bin/env python3
"""Download character GIFs from Giphy and patch rewards/assets/characters.json.

Usage:
  python3 rewards/tools/fetch_giphy_character_sprites.py
  python3 rewards/tools/fetch_giphy_character_sprites.py --dry-run
  python3 rewards/tools/fetch_giphy_character_sprites.py --only alex,wolf,creeper

Optional:
  export GIPHY_API_KEY=...   # uses official search when set; otherwise scrapes giphy.com
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
SPRITES = REWARD / "assets" / "sprites"
USER_AGENT = "kids_space-rewards/1.0 (local sprite cache; educational)"
GIPHY_API = "https://api.giphy.com/v1/gifs/search"


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
    path = urllib.parse.urlparse(value).path.rstrip("/")
    if not path:
        return None
    slug = path.split("/")[-1]
    if slug in {"gifs", "clips", "stickers"}:
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


def search_via_api(query: str, api_key: str) -> str | None:
    params = {
        "api_key": api_key,
        "q": query,
        "limit": "10",
        "rating": "g",
        "lang": "en",
    }
    url = GIPHY_API + "?" + urllib.parse.urlencode(params)
    payload = json.loads(fetch_url(url, timeout=45).decode("utf-8"))
    for item in payload.get("data", []):
        title = str(item.get("title", "")).lower()
        gif_id = item.get("id")
        if not gif_id:
            continue
        if "minecraft" in title or "minecraft" in query.lower():
            return str(gif_id)
    if payload.get("data"):
        return str(payload["data"][0]["id"])
    return None


def search_via_scrape(query: str) -> str | None:
    slug = urllib.parse.quote(query.replace(" ", "-"))
    url = f"https://giphy.com/search/{slug}"
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
    for gif in gifs:
        title = str(gif.get("title", "")).lower()
        tags = " ".join(str(t) for t in gif.get("tags", [])).lower()
        blob = title + " " + tags
        if "minecraft" in blob:
            gif_id = gif.get("id")
            if gif_id:
                return str(gif_id)
    if gifs:
        gif_id = gifs[0].get("id")
        if gif_id:
            return str(gif_id)
    return None


def resolve_gif_id(spec: dict, api_key: str | None) -> tuple[str | None, str]:
    if spec.get("skip"):
        return None, "skipped"
    if spec.get("id"):
        return str(spec["id"]), "id"
    if spec.get("giphy"):
        gif_id = extract_giphy_id(str(spec["giphy"]))
        if not gif_id:
            return None, "invalid giphy url"
        if str(spec["giphy"]).startswith("http"):
            try:
                resolved = resolve_from_page(str(spec["giphy"]))
                if resolved:
                    return resolved, "page"
            except urllib.error.URLError as exc:
                print("  warn: page lookup failed:", exc)
        return gif_id, "url"
    query = str(spec.get("search", "")).strip()
    if not query:
        return None, "no source"
    if api_key:
        try:
            gif_id = search_via_api(query, api_key)
            if gif_id:
                return gif_id, f"api:{query}"
        except urllib.error.URLError as exc:
            print("  warn: api search failed:", exc)
    try:
        gif_id = search_via_scrape(query)
        if gif_id:
            return gif_id, f"search:{query}"
    except urllib.error.URLError as exc:
        return None, f"search failed: {exc}"
    return None, f"no results for {query}"


def download_gif(gif_id: str, dest: Path, dry_run: bool) -> None:
    last_err: Exception | None = None
    for url in giphy_media_urls(gif_id):
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
        except Exception as exc:  # noqa: BLE001 - try next mirror
            last_err = exc
    raise RuntimeError(f"could not download gif {gif_id}: {last_err}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
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
        spec = sources.get(char_id, {"search": f"minecraft {entry.get('name', char_id)}"})
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
