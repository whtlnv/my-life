#!/usr/bin/env bash
# Remove build and test outputs. Never touches node_modules, .env files or the TDD log.
#   scripts/clean.sh          build and test outputs in the repo and this project's temp folders
#   scripts/clean.sh --deep   also unreferenced pnpm store packages
set -euo pipefail
cd "$(dirname "$0")/.."

find . -name node_modules -prune -o \( -name dist -o -name coverage -o -name .output \) -type d -print0 | xargs -0 rm -rf
find . -name node_modules -prune -o -name '*.tsbuildinfo' -type f -print0 | xargs -0 rm -f
rm -f .test-output.log
# Temp folders: the backend tests' per-run folder (removed when a run ends, left by a killed run), the demo's store
# (scripts/demo.sh) and the TDD wrapper's output files. An hour's grace spares a run or demo still going.
temp="${TMPDIR:-/tmp}"
find "$temp" -maxdepth 1 -name 'my-life-*' -mmin +60 -exec rm -rf {} +
find "$temp" -maxdepth 1 -name 'run-logged.*' -type f -mmin +60 -delete

[ "${1:-}" = "--deep" ] || exit 0
if command -v pnpm >/dev/null 2>&1; then pnpm store prune >/dev/null 2>&1 || true; fi
