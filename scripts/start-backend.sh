#!/usr/bin/env bash
# The backend's start command, as launchd runs it: the repo's .env (MY_LIFE_ALLOWED_EMAILS and friends, gitignored)
# then the backend package's start script. launchd gives a near-empty PATH, so the tool paths come from the login shell.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
eval "$(/bin/zsh -lc 'echo "export PATH=$PATH"')"
exec pnpm --filter @my-life/backend start
