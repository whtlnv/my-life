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
# Quoted: a login PATH can hold a directory with a space ("VMware Fusion.app/..."), which an unquoted eval splits.
PATH="$(/bin/zsh -lc 'printf %s "$PATH"')"
export PATH
exec pnpm --filter @my-life/backend start
