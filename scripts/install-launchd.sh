#!/usr/bin/env bash
# Install (or reinstall) the backend as a launchd user agent so it starts at login and restarts if it dies.
#   scripts/install-launchd.sh            install and start
#   scripts/install-launchd.sh --print    print the generated plist and validate it, install nothing
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
label="com.my-life.backend"
generated="$(mktemp -t "$label")"
sed -e "s#__REPO__#${repo}#g" -e "s#__HOME__#${HOME}#g" "${repo}/scripts/launchd/${label}.plist" > "$generated"
plutil -lint "$generated"
if [ "${1:-}" = "--print" ]; then
  cat "$generated"
  rm -f "$generated"
  exit 0
fi
mkdir -p "${HOME}/Library/LaunchAgents" "${HOME}/Library/Logs/my-life"
target="${HOME}/Library/LaunchAgents/${label}.plist"
launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
mv "$generated" "$target"
launchctl bootstrap "gui/$(id -u)" "$target"
launchctl kickstart -k "gui/$(id -u)/${label}"
echo "installed ${target}; log at ~/Library/Logs/my-life/backend.log"
