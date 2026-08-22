#!/usr/bin/env node
/**
 * Generates simple PNG app icons (192, 512) with zero dependencies.
 * Dark rounded-square background with an accent circle and a play triangle.
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/public/icons');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    rows[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const o = rowStart + 1 + x * 4;
      let r = 0x1a, g = 0x22, b = 0x33, a = 255; // --panel background
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy < (size * 0.42) ** 2) {
        r = 0x4d; g = 0xa3; b = 0xff; // accent circle
      }
      // Play triangle in the middle.
      const tx = x - cx + size * 0.1;
      const ty = Math.abs(y - cy);
      if (tx > 0 && tx < size * 0.18 && ty < tx * 0.8) {
        r = 0x08; g = 0x11; b = 0x1f;
      }
      rows[o] = r; rows[o + 1] = g; rows[o + 2] = b; rows[o + 3] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png(size));
  console.log(`wrote icon-${size}.png`);
}
