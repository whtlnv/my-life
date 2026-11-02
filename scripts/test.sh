#!/usr/bin/env bash
# Full suite with a one-line outcome: the unit tests with each package's coverage floor (as CI runs them), then the
# typecheck. `✅ N tests OK · Xs (…)` on green, the failure detail on red. Complete output always lands in
# .test-output.log.
set -uo pipefail
cd "$(dirname "$0")/.."
log=".test-output.log"
start=$SECONDS

failed() {
  echo "❌ $1 FAILED — full output in ${log}"
  grep -E 'FAIL|AssertionError|Error:|✗|×' "$log" || true
  exit 1
}

scripts/test-coverage.sh >"$log" 2>&1 || failed "unit tests (with the coverage floors)"
pnpm --recursive --if-present --stream run typecheck >>"$log" 2>&1 || failed "typecheck"

plain=$(sed -E 's/\x1b\[[0-9;]*m//g' "$log")
# One summary line per package, e.g. "packages/domain test:coverage: Tests  1 passed" (Vitest).
unit=$(printf '%s\n' "$plain" \
  | grep -E '^[^ ]+ test:coverage: +Tests:? +([0-9]+ skipped, )?[0-9]+ passed' \
  | sed -E 's#^([^ ]+) test:coverage: +Tests:? +([0-9]+ skipped, )?([0-9]+) passed.*#\1 \3#')

passed=$(printf '%s\n' "$unit" | awk '{ sum += $2 } END { print sum + 0 }')
breakdown=$(printf '%s\n' "$unit" | awk 'NF { sub(".*/", "", $1); printf "%s%s %s", sep, $1, $2; sep = " · " }')
if [ -z "$unit" ]; then
  echo "❌ suite passed but test counts were not parsed — the summary format changed; see ${log}"
  exit 1
fi
echo "✅ ${passed} tests OK · $((SECONDS - start))s (${breakdown})"
