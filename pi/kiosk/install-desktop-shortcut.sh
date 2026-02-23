#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAUNCH_SCRIPT="${SCRIPT_DIR}/start-aera-kiosk.sh"

AERA_URL_DEFAULT="${1:-https://aerasmartmirror.netlify.app/}"
CHATGPT_URL_DEFAULT="${2:-https://chatgpt.com/}"

echo "Installing kiosk helpers (xdotool/unclutter)..."
sudo apt-get update
sudo apt-get install -y xdotool unclutter

chmod +x "${LAUNCH_SCRIPT}"

DESKTOP_DIR="${HOME}/Desktop"
DESKTOP_FILE="${DESKTOP_DIR}/AERA Kiosk.desktop"

mkdir -p "${DESKTOP_DIR}"

cat > "${DESKTOP_FILE}" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=AERA Kiosk
Comment=Open AERA + ChatGPT in kiosk mode
Exec=env AERA_URL=${AERA_URL_DEFAULT} CHATGPT_URL=${CHATGPT_URL_DEFAULT} /bin/bash ${LAUNCH_SCRIPT}
Icon=chromium-browser
Terminal=false
Categories=Utility;
StartupNotify=false
EOF

chmod +x "${DESKTOP_FILE}"

if command -v gio >/dev/null 2>&1; then
  gio set "${DESKTOP_FILE}" "metadata::trusted" true >/dev/null 2>&1 || true
fi

echo
echo "Desktop shortcut created:"
echo "  ${DESKTOP_FILE}"
echo
echo "Double-click 'AERA Kiosk' on Desktop to launch."
echo "URL values used:"
echo "  AERA:    ${AERA_URL_DEFAULT}"
echo "  ChatGPT: ${CHATGPT_URL_DEFAULT}"
