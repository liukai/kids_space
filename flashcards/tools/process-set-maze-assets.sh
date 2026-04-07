#!/usr/bin/env bash
# Resize raster assets in assets/set-maze/ for web (macOS sips).
# PNGs are resized in place. WebP files are converted to max-dimension PNG
# with the same basename (e.g. foo.webp -> foo.png); original .webp is removed
# only if the new .png is written successfully (avoid losing artwork).
# Usage: ./tools/process-set-maze-assets.sh
#        MAX_PX=128 ./tools/process-set-maze-assets.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAZE="$ROOT/assets/set-maze"
MAX="${MAX_PX:-96}"

process_png() {
  local f="$1"
  local base="$2"
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/set-maze.XXXXXX").png"
  if sips -Z "$MAX" "$f" --out "$tmp" >/dev/null 2>&1; then
    mv "$tmp" "$f"
    echo "OK  $base (max ${MAX}px)"
    return 0
  else
    rm -f "$tmp"
    echo "SKIP $base (sips failed)" >&2
    return 1
  fi
}

shopt -s nullglob
count=0
for f in "$MAZE"/*.png "$MAZE"/*.PNG; do
  [[ -f "$f" ]] || continue
  base="$(basename "$f")"
  [[ "$base" == .DS_Store ]] && continue
  if process_png "$f" "$base"; then
    count=$((count + 1))
  fi
done

for f in "$MAZE"/*.webp "$MAZE"/*.WEBP; do
  [[ -f "$f" ]] || continue
  base="$(basename "$f")"
  stem="${base%.*}"
  out="$MAZE/${stem}.png"
  tmp="$(mktemp "${TMPDIR:-/tmp}/set-maze.XXXXXX").png"
  if sips -Z "$MAX" "$f" --out "$tmp" >/dev/null 2>&1; then
    mv "$tmp" "$out"
    rm -f "$f"
    echo "OK  $base -> $(basename "$out") (max ${MAX}px)"
    count=$((count + 1))
  else
    rm -f "$tmp"
    echo "SKIP $base (sips could not read WebP — convert to PNG manually)" >&2
  fi
done

if [[ "$count" -eq 0 ]]; then
  echo "No PNG/WebP files processed in $MAZE" >&2
  exit 1
fi
echo "Processed $count file(s) in $MAZE"
