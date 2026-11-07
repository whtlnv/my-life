#!/usr/bin/env bash
# A second backend on its own port with a throwaway store, seeded with realistic calendar and mail scenarios through a
# scripted triage, so the dashboard can be looked at and screenshotted without the real inbox or the Anthropic key.
# Usage: scripts/demo.sh [port]   (default 7778)
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter @my-life/dashboard build
MY_LIFE_DEMO_PORT="${1:-7778}" exec pnpm --filter @my-life/backend demo
