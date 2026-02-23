#!/usr/bin/env bash
set -euo pipefail

# Default URLs can be overridden via environment variables.
AERA_URL="${AERA_URL:-https://aerasmartmirror.netlify.app/}"
CHATGPT_URL="${CHATGPT_URL:-https://chatgpt.com/}"
DISPLAY_VAR="${DISPLAY:-:0}"
XAUTH_VAR="${XAUTHORITY:-${HOME}/.Xauthority}"

# Prefer chromium-browser (Raspberry Pi OS), fallback to chromium.
if command -v chromium-browser >/dev/null 2>&1; then
  CHROMIUM_BIN="chromium-browser"
elif command -v chromium >/dev/null 2>&1; then
  CHROMIUM_BIN="chromium"
else
  echo "Chromium is not installed. Install it first."
  exit 1
fi

PROFILE_DIR="${HOME}/.config/chromium-aera-kiosk"

mkdir -p "${PROFILE_DIR}"

# Hide cursor after short idle if available.
if command -v unclutter >/dev/null 2>&1; then
  pkill -f "unclutter -idle 0.2 -root" >/dev/null 2>&1 || true
  unclutter -idle 0.2 -root &
fi

# Close prior kiosk instance using this profile.
pkill -f "${CHROMIUM_BIN}.*${PROFILE_DIR}" >/dev/null 2>&1 || true
sleep 1

DISPLAY="${DISPLAY_VAR}" XAUTHORITY="${XAUTH_VAR}" "${CHROMIUM_BIN}" \
  --user-data-dir="${PROFILE_DIR}" \
  --kiosk \
  --start-maximized \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --noerrdialogs \
  --ignore-gpu-blocklist \
  --enable-gpu-rasterization \
  --enable-zero-copy \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  "${AERA_URL}" "${CHATGPT_URL}" &

# Force focus to tab 1 (AERA) so ChatGPT stays in background tab.
if command -v xdotool >/dev/null 2>&1; then
  sleep 5
  WINDOW_ID="$(DISPLAY="${DISPLAY_VAR}" XAUTHORITY="${XAUTH_VAR}" xdotool search --onlyvisible --class chromium | head -n 1 || true)"
  if [[ -n "${WINDOW_ID}" ]]; then
    DISPLAY="${DISPLAY_VAR}" XAUTHORITY="${XAUTH_VAR}" xdotool windowactivate "${WINDOW_ID}" key --window "${WINDOW_ID}" ctrl+1
  fi
fi
