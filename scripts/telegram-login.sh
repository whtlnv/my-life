#!/usr/bin/env bash
# The one-time Telegram login (PENDING_TASKS.md § 6): reads MY_LIFE_TELEGRAM_API_ID and _API_HASH from the repo's
# .env, asks for the phone number, the code Telegram sends and the 2FA password if set, and writes the session file
# (MY_LIFE_TELEGRAM_SESSION_PATH, default ~/Library/Application Support/my-life/telegram-session, mode 0600).
# Run it in your own terminal; it needs a keyboard.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
exec pnpm --silent --filter @my-life/backend telegram-login
