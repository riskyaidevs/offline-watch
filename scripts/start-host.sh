#!/usr/bin/env bash
# Start the Flight Watch Party host on Android/Termux (or any Linux box).
#
# Prereqs on the host phone:
#   pkg install nodejs openssl
#   npm install && npm run build
#
# Then: turn on the Android hotspot, and run this script.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Flight Watch Party host ==="

# 1. Check we have a LAN IP (i.e. the hotspot is up and we're on it).
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$IP" ]; then
  IP=$(ip -4 addr show 2>/dev/null | awk '/inet / && $2 !~ /^127\./ {sub(/\/.*/, "", $2); print $2; exit}')
fi
if [ -z "$IP" ]; then
  echo "ERROR: no LAN IP found. Is the hotspot on and is this device hosting it?"
  exit 1
fi
echo "LAN IP: $IP"
echo "Tell everyone: connect to this hotspot, airplane mode is fine (Wi-Fi back on)."

# 2. Certs.
if [ ! -f certs/cert.pem ] || [ ! -f certs/key.pem ]; then
  echo "No TLS certs yet — generating (HTTPS is required for mic + PWA)…"
  bash scripts/gen-cert.sh
fi

# 3. Build the web app if needed.
if [ ! -f apps/web/dist/index.html ]; then
  echo "Building the web app…"
  npm install
  npm run build
fi

# 4. Go. The server prints the join URL + QR code.
echo
echo "Participants open: https://$IP:8443"
echo "(Each person taps through the certificate warning once — that's expected.)"
echo
npm run start -w @flightwatch/server
