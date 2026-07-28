/**
 * scripts/generate-icons.mjs — regenerate the PWA icons in public/.
 *
 * Run with:  node scripts/generate-icons.mjs
 *
 * The icons are a deliberate echo of the header's weekly-score ring: a gold
 * ring on the app's near-black background. They are written as PNGs by hand
 * (zlib is the only dependency, and it ships with Node) so the project stays
 * free of an image-processing dependency it would otherwise never use, and so
 * the icons are reproducible from source rather than being opaque binaries
 * checked into the repo.
 *
 * Content sits inside the maskable "safe zone" — the ring's outer diameter is
 * 68% of the canvas, comfortably within the inner 80% that Android is allowed
 * to crop to — so the same image works as both a normal and a maskable icon.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BG = [0x0e, 0x0c, 0x08]; // --bg
const GOLD = [0xe5, 0xa8, 0x3b]; // --gold

/* ------------------------------------------------------------------ PNG */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** Encode raw RGBA pixel data (size x size) as a PNG buffer. */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with a filter-type byte (0 = None).
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ----------------------------------------------------------------- draw */

/**
 * Coverage of a ring at distance d, with 1px feathering on both edges so the
 * curve reads as smooth rather than stair-stepped.
 */
function ringCoverage(d, inner, outer) {
  const aa = 0.75;
  const outerEdge = Math.min(1, Math.max(0, (outer - d) / aa));
  const innerEdge = Math.min(1, Math.max(0, (d - inner) / aa));
  return Math.min(outerEdge, innerEdge);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const outer = size * 0.34;
  const inner = outer - size * 0.075;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      const a = ringCoverage(d, inner, outer);
      const i = (y * size + x) * 4;
      // Composite gold over the background rather than writing transparency,
      // so the icon looks identical on any OS backdrop.
      rgba[i] = Math.round(BG[0] + (GOLD[0] - BG[0]) * a);
      rgba[i + 1] = Math.round(BG[1] + (GOLD[1] - BG[1]) * a);
      rgba[i + 2] = Math.round(BG[2] + (GOLD[2] - BG[2]) * a);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, rgba);
}

/* ---------------------------------------------------------------- write */

mkdirSync(PUBLIC_DIR, { recursive: true });

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180], // iOS ignores the manifest and uses this
]) {
  const png = drawIcon(size);
  writeFileSync(join(PUBLIC_DIR, name), png);
  console.log(`wrote public/${name} (${size}x${size}, ${png.length} bytes)`);
}
