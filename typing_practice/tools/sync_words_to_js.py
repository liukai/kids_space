#!/usr/bin/env python3
"""
Embed data/words.json → js/words-data.js for pure-local file:// use (no fetch).

After editing data/words.json, run from typing_practice/:

  python3 tools/sync_words_to_js.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "data" / "words.json"
OUT_PATH = ROOT / "js" / "words-data.js"

HEADER = """/**
 * Embedded word bank for offline / file:// — no fetch required.
 * Regenerate after editing data/words.json:
 *   python3 tools/sync_words_to_js.py
 */
"""


def main() -> None:
    if not JSON_PATH.is_file():
        print("Missing", JSON_PATH, file=sys.stderr)
        sys.exit(1)
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        print("words.json must be a JSON array", file=sys.stderr)
        sys.exit(1)
    blob = json.dumps(data, ensure_ascii=False, indent=2)
    OUT_PATH.write_text(
        HEADER + "window.TYPING_PRACTICE_PRELOADED_WORDS = " + blob + ";\n",
        encoding="utf-8",
    )
    print("Wrote", len(data), "entries →", OUT_PATH.relative_to(ROOT))


if __name__ == "__main__":
    main()
