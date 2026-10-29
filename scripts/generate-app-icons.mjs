#!/usr/bin/env node
/**
 * Rasterises the TV app icon (public/app-icons/tv.svg) into the PNG sizes
 * required for PWA installation. Dependency-free: shapes are evaluated as
 * signed distance fields with 4x4 supersampling and encoded with node:zlib.
 *
 * Usage: node scripts/generate-app-icons.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app-icons');

const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
const ORANGE = hex('#ff9900');
const INK = hex('#232f3e');
const SCREEN = hex('#0f1b2a');

// Signed distance to a rounded rectangle given its centre, half-size and radius.
function roundRect(cx, cy, hw, hh, r) {
  return (x, y) => {
    const qx = Math.abs(x - cx) - (hw - r);
    const qy = Math.abs(y - cy) - (hh - r);
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    return outside + Math.min(Math.max(qx, qy), 0) - r;
  };
}

// Signed distance to a line segment with round caps.
function segment(ax, ay, bx, by, halfWidth) {
  return (x, y) => {
    const px = x - ax;
    const py = y - ay;
    const dx = bx - ax;
    const dy = by - ay;
    const h = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - dx * h, py - dy * h) - halfWidth;
  };
}

/** Shapes in a 512x512 design space, back to front (mirrors tv.svg). */
function shapes(cornerRadius) {
  return [
    { sdf: roundRect(256, 256, 256, 256, cornerRadius), color: INK },
    { sdf: segment(256, 168, 196, 92, 12), color: ORANGE },
    { sdf: segment(256, 168, 316, 92, 12), color: ORANGE },
    { sdf: roundRect(256, 284, 164, 116, 32), color: ORANGE },
    { sdf: roundRect(256, 284, 132, 86, 16), color: SCREEN },
    { sdf: roundRect(256, 428, 60, 10, 10), color: ORANGE },
  ];
}

function rasterise(size, cornerRadius) {
  const layers = shapes(cornerRadius);
  const samples = 4;
  const scale = 512 / size;
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);

  for (let py = 0; py < size; py++) {
    raw[py * stride] = 0; // PNG filter type: none
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) * scale;
          const y = (py + (sy + 0.5) / samples) * scale;
          for (let i = layers.length - 1; i >= 0; i--) {
            if (layers[i].sdf(x, y) <= 0) {
              const c = layers[i].color;
              r += c[0];
              g += c[1];
              b += c[2];
              covered++;
              break;
            }
          }
        }
      }
      const offset = py * stride + 1 + px * 4;
      if (covered > 0) {
        raw[offset] = Math.round(r / covered);
        raw[offset + 1] = Math.round(g / covered);
        raw[offset + 2] = Math.round(b / covered);
      }
      raw[offset + 3] = Math.round((covered / (samples * samples)) * 255);
    }
  }
  return encodePng(size, size, raw);
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, raw) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(OUT_DIR, { recursive: true });
const outputs = [
  ['icon-192.png', 192, 112],
  ['icon-512.png', 512, 112],
  // Maskable icons must be full-bleed; the artwork already sits in the safe zone.
  ['icon-maskable-512.png', 512, 0],
];
for (const [name, size, radius] of outputs) {
  await writeFile(path.join(OUT_DIR, name), rasterise(size, radius));
  console.log(`Wrote ${name}`);
}
