#!/usr/bin/env bash
# The typecheck runs only after the tests pass, so a Red step still fails on its test.
# Extra arguments filter each package's tests and skip the typecheck: `scripts/test-fast.sh now-view`.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --recursive --if-present --stream run test "$@"
if [ "$#" -eq 0 ]; then
  pnpm --recursive --if-present --stream run typecheck
fi
