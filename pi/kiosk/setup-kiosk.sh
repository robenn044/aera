#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
START_SCRIPT="${SCRIPT_DIR}/start-aera-kiosk.sh"

AERA_URL_DEFAULT="https://aerasmartmirror.netlify.app/"

echo "Installing kiosk helpers (unclutter)..."
sudo apt-get update
sudo apt-get install -y unclutter

chmod +x "${START_SCRIPT}"

AUTOSTART_DIR="${HOME}/.config/autostart"
AUTOSTART_FILE="${AUTOSTART_DIR}/aera-kiosk.desktop"

mkdir -p "${AUTOSTART_DIR}"

cat > "${AUTOSTART_FILE}" <<EOF
[Desktop Entry]
Type=Application
Name=AERA Kiosk
Comment=Start AERA kiosk
Exec=env AERA_URL=${AERA_URL_DEFAULT} /bin/bash ${START_SCRIPT}
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
echo "2) Open AERA once and grant camera + microphone permissions."
echo "3) Confirm voice works by saying: 'Aera what's the weather?'"
echo
echo "Tip: To stop autostart, remove this file:"
echo "  ${AUTOSTART_FILE}"

