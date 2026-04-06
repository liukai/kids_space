#!/usr/bin/env bash
# Resize flashcards/assets/set-maze/chomper.png for web (macOS sips).
# Run from anywhere; replaces file in place. Optional: MAX_PX=128 ./process-chomper-asset.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets/set-maze/chomper.png"
MAX="${MAX_PX:-96}"
base="$(mktemp "${TMPDIR:-/tmp}/chomper.XXXXXX")"
tmp="${base}.png"
rm -f "$base"
[[ -f "$SRC" ]] || {
  echo "Missing $SRC — add chomper.png first." >&2
  exit 1
}
sips -Z "$MAX" "$SRC" --out "$tmp" >/dev/null
mv "$tmp" "$SRC"
echo "Wrote $SRC (max dimension ${MAX}px)"
sips -g pixelWidth -g pixelHeight "$SRC" | paste -s -d' ' -
