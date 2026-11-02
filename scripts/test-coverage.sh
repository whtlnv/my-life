#!/usr/bin/env bash
# Every package's unit tests with coverage: a package below the floor its own test config sets fails.
# CI's unit-test job runs it; the TDD loop (scripts/test-fast.sh) runs without coverage.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --recursive --if-present --stream run test:coverage
