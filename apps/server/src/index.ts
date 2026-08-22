import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import qrcode from 'qrcode-terminal';
import { buildServer } from './app.js';
import { CERT_DIR, DEFAULT_HOST, DEFAULT_PORT, WEB_DIST } from './config.js';

function loadCerts(): { key: string; cert: string } | null {
  const keyPath = path.join(CERT_DIR, 'key.pem');
  const certPath = path.join(CERT_DIR, 'cert.pem');
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    return null;
  }
  return { key: fs.readFileSync(keyPath, 'utf8'), cert: fs.readFileSync(certPath, 'utf8') };
}

function lanAddresses(): string[] {
  const addresses: string[] = [];
  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal) {
        addresses.push(info.address);
      }
    }
    void name;
  }
  return addresses;
}

const https = loadCerts();
if (!https) {
  console.error(`No TLS certs found in ${CERT_DIR}. Run scripts/gen-cert.sh first.`);
  console.error('HTTPS is required: getUserMedia and service workers need a secure context.');
  process.exit(1);
}

const app = buildServer({ https, staticDir: WEB_DIST, logger: true });

try {
  await app.listen({ host: DEFAULT_HOST, port: DEFAULT_PORT });
} catch (err) {
  console.error(err);
  process.exit(1);
}

console.log(`\nFlight Watch Party server listening on https://${DEFAULT_HOST}:${DEFAULT_PORT}`);
for (const address of lanAddresses()) {
  const url = `https://${address}:${DEFAULT_PORT}`;
  console.log(`\nJoin from this device: ${url}`);
  qrcode.generate(url, { small: true });
}
