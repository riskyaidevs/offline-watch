import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The server must bind to all interfaces: participants connect from other
 * devices on the hotspot, so 127.0.0.1 is not enough.
 */
export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_PORT = 8443;

export const CERT_DIR = process.env.FW_CERT_DIR ?? path.resolve(here, '../../../certs');
export const WEB_DIST = process.env.FW_WEB_DIST ?? path.resolve(here, '../../web/dist');

export const MAX_ROOM_SIZE = 12;
export const MAX_ROOMS = 64;

/** Chat rate limit: burst of 5, then 1 message per second. */
export const CHAT_BURST = 5;
export const CHAT_REFILL_PER_SECOND = 1;
