#!/usr/bin/env python3
"""Emit ../words-embed.js — one JSON object per line. From repo root:
   python3 flashcards/tools/build_words_embed.py
"""

import json
from pathlib import Path

from word_list_data import BASE_ROWS, PRON

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "words-embed.js"


def main() -> None:
    data = []
    for row in BASE_ROWS:
        r = dict(row)
        w = r["word"]
        if w in PRON:
            ipa, resp = PRON[w]
            r["ipa"] = ipa
            r["respelling"] = resp
        else:
            r.setdefault("ipa", "")
            r.setdefault("respelling", "")
        data.append(r)

    mc_count = sum(1 for row in data if row.get("type") == "minecraft")
    banner = (
        f"// {len(data)} words ({mc_count} Minecraft). "
        "Edit tools/word_list_data.py, then:\n"
        "//   python3 flashcards/tools/build_words_embed.py\n"
        "//   python3 flashcards/tools/merge-pronunciations.py\n"
    )
    lines = [banner + "window.__FLASHCARD_WORDS__ = [\n"]
    for i, row in enumerate(data):
        tail = ",\n" if i < len(data) - 1 else "\n"
        lines.append("  " + json.dumps(row, ensure_ascii=False) + tail)
    lines.append("]\n")
    OUT.write_text("".join(lines), encoding="utf-8")
    print("Wrote", len(data), "rows ->", OUT)


if __name__ == "__main__":
    main()
