#!/usr/bin/env python3
"""Merge IPA + respelling into words-embed.js (source: word_list_data.PRON)."""

import json
import pathlib

from word_list_data import PRON

ROOT = pathlib.Path(__file__).resolve().parents[1]
EMBED = ROOT / "words-embed.js"

BANNER = (
    "// Flashcard word list (source of truth). Edit tools/word_list_data.py, then:\n"
    "//   python3 flashcards/tools/build_words_embed.py\n"
    "//   python3 flashcards/tools/merge-pronunciations.py\n"
)


def _read_embed_array(path: pathlib.Path) -> list:
    text = path.read_text(encoding="utf-8")
    marker = "window.__FLASHCARD_WORDS__ = "
    i = text.find(marker)
    if i == -1:
        raise ValueError(f"{path}: missing {marker!r}")
    raw = text[i + len(marker) :].strip()
    return json.loads(raw)


def _write_embed_array(path: pathlib.Path, data: list) -> None:
    lines = [BANNER + "window.__FLASHCARD_WORDS__ = [\n"]
    for i, row in enumerate(data):
        tail = ",\n" if i < len(data) - 1 else "\n"
        lines.append(
            "  " + json.dumps(row, ensure_ascii=False) + tail
        )
    lines.append("]\n")
    path.write_text("".join(lines), encoding="utf-8")


def main() -> None:
    data = _read_embed_array(EMBED)
    for row in data:
        w = row.get("word", "")
        if w in PRON:
            ipa, resp = PRON[w]
            row["ipa"] = ipa
            row["respelling"] = resp
        else:
            row.setdefault("ipa", "")
            row.setdefault("respelling", "")
    _write_embed_array(EMBED, data)
    print("Updated", EMBED, "—", len(data), "rows")


if __name__ == "__main__":
    main()
