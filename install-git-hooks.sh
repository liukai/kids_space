#!/usr/bin/env sh
# Point this repo at version-controlled hooks (strip Cursor commit footers, etc.).
cd "$(dirname "$0")" || exit 1
git config core.hooksPath .githooks
printf 'core.hooksPath=%s\n' "$(git config core.hooksPath)"
