#!/usr/bin/env python3
"""
Convert a legacy word-bank.js (c/sight/sim/phrase helpers) → data/words.json

  python3 tools/js_bank_to_json.py path/to/word-bank.js

Output is always typing_practice/data/words.json (overwritten).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "data" / "words.json"

FUNCS = ("c", "sight", "sim", "phrase")
KIND_MAP = {"c": "cvc", "sight": "sight", "sim": "simple", "phrase": "phrase"}


def read_js_string(src: str, i: int) -> tuple[str, int]:
    """Parse "..." with \\ escapes; i points at opening quote."""
    assert src[i] == '"'
    i += 1
    out = []
    while i < len(src):
        ch = src[i]
        if ch == "\\":
            i += 1
            if i >= len(src):
                break
            out.append(src[i])
            i += 1
            continue
        if ch == '"':
            return "".join(out), i + 1
        out.append(ch)
        i += 1
    raise ValueError("unterminated string")


def skip_ws(src: str, i: int) -> int:
    while i < len(src) and src[i] in " \t\n\r":
        i += 1
    return i


def parse_call_arguments(src: str, open_paren: int) -> list[str]:
    """Arguments are only string literals (as in word-bank.js). open_paren = index of '('"""
    i = open_paren + 1
    args: list[str] = []
    while True:
        i = skip_ws(src, i)
        if i >= len(src):
            raise ValueError("eof in call")
        if src[i] == ")":
            return args
        if src[i] != '"':
            raise ValueError(f"expected string at {i}: {src[i : i + 20]!r}")
        s, i = read_js_string(src, i)
        args.append(s)
        i = skip_ws(src, i)
        if i < len(src) and src[i] == ",":
            i += 1
            continue
        i = skip_ws(src, i)
        if src[i] == ")":
            return args
        raise ValueError(f"expected , or ) at {i}")


def extract_calls(body: str) -> list[tuple[str, list[str]]]:
    out: list[tuple[str, list[str]]] = []
    for m in re.finditer(r"\b(" + "|".join(FUNCS) + r")\s*\(", body):
        fn = m.group(1)
        paren = m.end() - 1
        try:
            args = parse_call_arguments(body, paren)
        except ValueError as e:
            raise RuntimeError(f"parse error at {fn}(…): {e}") from e
        out.append((fn, args))
    return out


def main() -> None:
    if len(sys.argv) < 2:
        print(
            "Usage: python3 tools/js_bank_to_json.py <path/to/word-bank.js>",
            file=sys.stderr,
        )
        sys.exit(1)
    js_path = Path(sys.argv[1]).expanduser().resolve()
    if not js_path.is_file():
        print("Not found:", js_path, file=sys.stderr)
        sys.exit(1)
    text = js_path.read_text(encoding="utf-8")
    m = re.search(r"\breturn\s*\[", text)
    if not m:
        print("No return [ in word-bank", file=sys.stderr)
        sys.exit(1)
    body = text[m.end() :]
    end = body.rfind("];")
    if end < 0:
        print("No ];", file=sys.stderr)
        sys.exit(1)
    body = body[:end]
    calls = extract_calls(body)
    rows = []
    for fn, args in calls:
        kind = KIND_MAP[fn]
        if len(args) == 3:
            w, zh, e = args
            rows.append({"w": w, "zh": zh, "kind": kind, "e": e})
        elif len(args) == 4:
            w, zh, e, level = args
            rows.append({"w": w, "zh": zh, "kind": kind, "e": e, "level": level})
        else:
            print("bad arg count", fn, len(args), file=sys.stderr)
            sys.exit(1)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Wrote", len(rows), "entries →", OUT_PATH.relative_to(ROOT))


if __name__ == "__main__":
    main()
