#!/usr/bin/env bash
# Download a single HTML file from a URL (e.g. bundled export from "Save for later").
# The split project (index.html + css/ + js/) is best obtained via git clone or zip, not one URL.
set -euo pipefail
cd "$(dirname "$0")"

# Example: bundled file you uploaded, or raw single-file export
# export TYPING_PRACTICE_URL='https://raw.githubusercontent.com/you/repo/main/path/typing-practice.html'
URL="${TYPING_PRACTICE_URL:-}"

if [[ -z "$URL" ]]; then
  echo "Set TYPING_PRACTICE_URL or edit this script, e.g.:"
  echo "  export TYPING_PRACTICE_URL='https://…/typing-practice-bundled.html'"
  echo "  $0"
  echo ""
  echo "For the full project (index.html + css/ + js/), clone or zip the typing_practice folder."
  exit 1
fi

OUT="${1:-typing-practice-downloaded.html}"
echo "Fetching → $OUT"
curl -fsSL "$URL" -o "$OUT"
echo "Done. Open $OUT in a browser."
