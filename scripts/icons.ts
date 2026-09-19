import { mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const SIZES = [16, 32, 48, 128];
const TOP: [number, number, number] = [4, 95, 214];
const BOTTOM: [number, number, number] = [43, 139, 255];
const CHECK: Array<[number, number]> = [[0.25, 0.52], [0.42, 0.69], [0.76, 0.31]];
const STROKE = 0.115;
const SUPERSAMPLE = 4;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(type.length + data.length);
  body.set([...type].map((ch) => ch.charCodeAt(0)), 0);
  body.set(data, type.length);

  const out = new Uint8Array(body.length + 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(out.length - 4, crc32(body));
  return out;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function onGlyph(px: number, py: number, size: number): boolean {
  const half = (STROKE / 2) * size;
  for (let i = 0; i < CHECK.length - 1; i++) {
    const [ax, ay] = CHECK[i]!;
    const [bx, by] = CHECK[i + 1]!;
    if (distanceToSegment(px, py, ax * size, ay * size, bx * size, by * size) <= half) return true;
  }
  return false;
}

function render(size: number): Uint8Array {
  const radius = size * 0.22;
  const rows: number[] = [];

  for (let y = 0; y < size; y++) {
    rows.push(0);
    const t = y / Math.max(size - 1, 1);
    const background = TOP.map((channel, i) => Math.round(channel + (BOTTOM[i]! - channel) * t));

    for (let x = 0; x < size; x++) {
      let coverage = 0;
      let glyph = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const px = x + (sx + 0.5) / SUPERSAMPLE;
          const py = y + (sy + 0.5) / SUPERSAMPLE;
          const cx = Math.min(Math.max(px, radius), size - radius);
          const cy = Math.min(Math.max(py, radius), size - radius);
          if ((px - cx) ** 2 + (py - cy) ** 2 > radius * radius) continue;
          coverage++;
          if (onGlyph(px, py, size)) glyph++;
        }
      }

      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const mix = glyph / samples;
      rows.push(
        ...background.map((channel) => Math.round(channel + (255 - channel) * mix)),
        Math.round((255 * coverage) / samples)
      );
    }
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  header.set([8, 6, 0, 0, 0], 8);

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(new Uint8Array(rows)))),
    chunk('IEND', new Uint8Array(0))
  ];

  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

export async function writeIcons(outDir: string): Promise<number> {
  await mkdir(outDir, { recursive: true });
  for (const size of SIZES) await Bun.write(join(outDir, `icon${size}.png`), render(size));
  return SIZES.length;
}

if (import.meta.main) {
  const target = process.argv[2] ?? 'dist/icons';
  console.log(`wrote ${await writeIcons(target)} icons to ${target}`);
}
