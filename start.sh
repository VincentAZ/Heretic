#!/usr/bin/env bash
# Starts Heretic Studio desktop application.
#   ./start.sh          launch Heretic Studio
#   ./start.sh --stop   stop running Heretic Studio instance
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

PIDFILE=".heretic-studio.pid"
LOGFILE=".heretic-studio.log"

if [ "${1:-}" = "--stop" ]; then
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    kill "$(cat "$PIDFILE")" && echo "Heretic Studio stopped."
  else
    pkill -f "electron.*Heretic" 2>/dev/null || true
    echo "Heretic Studio stopped."
  fi
  rm -f "$PIDFILE"
  exit 0
fi

# Build production frontend bundle on first run if missing
if [ ! -f "dist/index.html" ]; then
  npm run build >>"$LOGFILE" 2>&1
fi

ELECTRON_BIN="./node_modules/.bin/electron"
if [ ! -x "$ELECTRON_BIN" ]; then
  ELECTRON_BIN="$(command -v electron || true)"
fi

platform_flags=()
if [ "${XDG_SESSION_TYPE:-}" = "wayland" ] && [[ "${XDG_CURRENT_DESKTOP:-}" == *GNOME* ]] && [ -n "${DISPLAY:-}" ]; then
  platform_flags=(--ozone-platform=x11)
fi

nohup "$ELECTRON_BIN" . --class=heretic-studio --no-sandbox "${platform_flags[@]}" >>"$LOGFILE" 2>&1 &
echo $! >"$PIDFILE"
disown
echo "Heretic Studio launched (PID $(cat "$PIDFILE"))."
