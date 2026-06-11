#!/usr/bin/env python3
"""Download Minecraft Wiki thumbnails locally for flashcards.

Reads tools/mc_wiki_images_remote.json, saves under assets/wiki/{word}.{ext},
patches trail-mascots.json and app defaults, then rebuilds words-embed.js.

Usage:
  python3 flashcards/tools/fetch_mc_wiki_images.py   # refresh remote URLs first
  python3 flashcards/tools/sync_wiki_assets.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from minecraft_wiki_data import local_wiki_image_path

ROOT = Path(__file__).resolve().parents[2]
FLASH = ROOT / "flashcards"
TOOLS = FLASH / "tools"
REMOTE_JSON = TOOLS / "mc_wiki_images_remote.json"
LEGACY_JSON = TOOLS / "mc_wiki_images.json"
WIKI_DIR = FLASH / "assets" / "wiki"
REWARD_SPRITES = ROOT / "rewards" / "assets" / "sprites"
TRAIL_JSON = FLASH / "assets" / "set-maze" / "trail-mascots.json"
USER_AGENT = "kids_space-flashcards/1.0 (educational; local cache)"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def is_remote(url: str) -> bool:
    return url.strip().lower().startswith(("http://", "https://"))


def norm_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url.strip())
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"


def load_remote_urls() -> dict[str, str]:
    for path in (REMOTE_JSON, LEGACY_JSON):
        if not path.is_file():
            continue
        raw = load_json(path)
        out = {
            word: str(url).strip()
            for word, url in raw.items()
            if str(url).strip() and is_remote(str(url))
        }
        if out:
            return out
    print("Missing remote URL manifest — run fetch_mc_wiki_images.py first", file=sys.stderr)
    sys.exit(1)


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        dest.write_bytes(resp.read())


def copy_from_reward_sprites(word: str, dest: Path) -> bool:
    for ext in (dest.suffix, ".png", ".gif", ".webp"):
        if not ext:
            continue
        src = REWARD_SPRITES / f"{word}{ext}"
        if src.is_file() and src.stat().st_size >= 32:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(src.read_bytes())
            return True
    return False


def sync_word_images(remote: dict[str, str]) -> dict[str, str]:
    url_to_local: dict[str, str] = {}
    downloaded = 0
    cached = 0
    copied = 0
    failed = 0

    for word, url in sorted(remote.items()):
        rel = local_wiki_image_path(word, url)
        dest = FLASH / rel
        if dest.is_file() and dest.stat().st_size >= 32:
            cached += 1
        else:
            try:
                print("  download:", word, "->", rel)
                download(url, dest)
                downloaded += 1
                time.sleep(0.12)
            except OSError as err:
                if copy_from_reward_sprites(word, dest):
                    print("  copied from rewards/sprites:", word)
                    copied += 1
                else:
                    print("  failed:", word, err, file=sys.stderr)
                    failed += 1
                    continue
        url_to_local[norm_url(url)] = rel
        url_to_local[url] = rel

    print(
        f"Wiki images: {downloaded} downloaded, {copied} copied, "
        f"{cached} cached, {failed} failed -> {WIKI_DIR}"
    )
    if failed and downloaded == 0 and cached == 0:
        print(
            "No files downloaded — check network access to minecraft.wiki, then retry.",
            file=sys.stderr,
        )
    return url_to_local


def patch_src_urls(node: object, url_to_local: dict[str, str]) -> bool:
    changed = False
    if isinstance(node, dict):
        src = node.get("src")
        if isinstance(src, str) and is_remote(src):
            local = url_to_local.get(norm_url(src)) or url_to_local.get(src)
            if local:
                node["src"] = local
                changed = True
        for value in node.values():
            if patch_src_urls(value, url_to_local):
                changed = True
    elif isinstance(node, list):
        for item in node:
            if patch_src_urls(item, url_to_local):
                changed = True
    return changed


def patch_trail_mascots(url_to_local: dict[str, str]) -> None:
    if not TRAIL_JSON.is_file() or not url_to_local:
        return
    data = load_json(TRAIL_JSON)
    if patch_src_urls(data, url_to_local):
        write_json(TRAIL_JSON, data)
        print("Patched", TRAIL_JSON.relative_to(ROOT))
    else:
        print("Trail mascots already local:", TRAIL_JSON.relative_to(ROOT))


def patch_js_file(path: Path, url_to_local: dict[str, str]) -> None:
    if not path.is_file() or not url_to_local:
        return
    text = path.read_text(encoding="utf-8")
    original = text
    for remote in sorted(
        (u for u in url_to_local if is_remote(u)),
        key=len,
        reverse=True,
    ):
        text = text.replace(remote, url_to_local[remote])
    if text != original:
        path.write_text(text, encoding="utf-8")
        print("Patched", path.relative_to(ROOT))


def rebuild_words_embed() -> None:
    script = TOOLS / "build_words_embed.py"
    subprocess.run([sys.executable, str(script)], check=True, cwd=ROOT)


def main() -> None:
    remote = load_remote_urls()
    url_to_local = sync_word_images(remote)
    patch_trail_mascots(url_to_local)
    patch_js_file(FLASH / "app.js", url_to_local)
    patch_js_file(ROOT / "rewards" / "app.js", url_to_local)
    rebuild_words_embed()
    print("Done.")


if __name__ == "__main__":
    main()
