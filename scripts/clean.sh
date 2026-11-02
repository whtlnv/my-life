#!/usr/bin/env bash
# Remove build and test outputs. Never touches node_modules, .env files or the TDD log.
#   scripts/clean.sh          build and test outputs in the repo
#   scripts/clean.sh --deep   also unreferenced pnpm store packages
set -euo pipefail
cd "$(dirname "$0")/.."

find . -name node_modules -prune -o \( -name dist -o -name coverage -o -name .output \) -type d -print0 | xargs -0 rm -rf
find . -name node_modules -prune -o -name '*.tsbuildinfo' -type f -print0 | xargs -0 rm -f
rm -f .test-output.log

[ "${1:-}" = "--deep" ] || exit 0
if command -v pnpm >/dev/null 2>&1; then pnpm store prune >/dev/null 2>&1 || true; fi
