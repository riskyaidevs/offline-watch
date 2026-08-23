#!/usr/bin/env bash
# Generate a self-signed TLS cert for the hotspot server.
# HTTPS is required: getUserMedia (mic) and service workers only run in a
# secure context, and http://192.168.x.x is NOT one. Each participant accepts
# the certificate warning once when joining.
set -euo pipefail

CERT_DIR="${1:-$(dirname "$0")/../certs}"
mkdir -p "$CERT_DIR"

# Include every likely LAN IP plus localhost in the SAN list.
IPS="127.0.0.1"
while read -r ip; do
  case "$ip" in 10.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*|192.168.*) IPS="$IPS,$ip";; esac
done < <(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$' || true)

SAN="DNS:localhost,DNS:flightparty.local"
IFS=',' read -ra ADDR <<< "$IPS"
for ip in "${ADDR[@]}"; do
  SAN="$SAN,IP:$ip"
done

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -days 365 \
  -subj "/CN=flightparty.local" \
  -addext "subjectAltName=$SAN"

chmod 600 "$CERT_DIR/key.pem"
echo "Wrote $CERT_DIR/key.pem and $CERT_DIR/cert.pem"
echo "SANs: $SAN"
echo
echo "Note: each participant must accept the certificate warning once in their browser."
