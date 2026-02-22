#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
START_SCRIPT="${SCRIPT_DIR}/start-aera-kiosk.sh"

AERA_URL_DEFAULT="https://aerasmartmirrror.netlify.app/"
CHATGPT_URL_DEFAULT="https://chatgpt.com/"

echo "Installing kiosk helpers (xdotool/unclutter)..."
sudo apt-get update
sudo apt-get install -y xdotool unclutter

chmod +x "${START_SCRIPT}"

AUTOSTART_DIR="${HOME}/.config/autostart"
AUTOSTART_FILE="${AUTOSTART_DIR}/aera-kiosk.desktop"

mkdir -p "${AUTOSTART_DIR}"

cat > "${AUTOSTART_FILE}" <<EOF
[Desktop Entry]
Type=Application
Name=AERA Kiosk
Comment=Start AERA kiosk with hidden ChatGPT audio tab
Exec=env AERA_URL=${AERA_URL_DEFAULT} CHATGPT_URL=${CHATGPT_URL_DEFAULT} /bin/bash ${START_SCRIPT}
X-GNOME-Autostart-enabled=true
NoDisplay=false
Terminal=false
EOF

echo
echo "Kiosk autostart created:"
echo "  ${AUTOSTART_FILE}"
echo
echo "Next:"
echo "1) Reboot Pi and let kiosk open automatically."
echo "2) In tab 2 (ChatGPT), sign in and start Voice mode once."
echo "3) Press Ctrl+1 to return to AERA tab."
echo
echo "Tip: To stop autostart, remove this file:"
echo "  ${AUTOSTART_FILE}"

