import { describe, expect, test } from 'bun:test';
import { inflateSync } from 'node:zlib';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeIcons } from '../scripts/icons.ts';

const out = await mkdtemp(join(tmpdir(), 'jobfill-icons-'));
await writeIcons(out);

function chunks(png: Buffer): Array<{ type: string; body: Buffer; crcOk: boolean }> {
  const found: Array<{ type: string; body: Buffer; crcOk: boolean }> = [];
  let pos = 8;
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.subarray(pos + 4, pos + 8).toString();
    const body = png.subarray(pos + 8, pos + 8 + length);
    const crc = png.readUInt32BE(pos + 8 + length);
    const { crc32 } = require('node:zlib');
    found.push({ type, body, crcOk: crc32 ? crc32(png.subarray(pos + 4, pos + 8 + length)) === crc : true });
    pos += 12 + length;
  }
  return found;
}

describe('the icons the build generates', () => {
  for (const size of [16, 32, 48, 128]) {
    test(`icon${size}.png is a PNG a browser can actually decode`, async () => {
      const png = await readFile(join(out, `icon${size}.png`));

      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const parts = chunks(png);
      expect(parts.map((part) => part.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
      expect(parts.every((part) => part.crcOk)).toBe(true);

      const header = parts[0]!.body;
      expect(header.readUInt32BE(0)).toBe(size);
      expect(header.readUInt32BE(4)).toBe(size);

      const pixels = inflateSync(parts[1]!.body);
      expect(pixels.length).toBe(size * (size * 4 + 1));
    });
  }

  test('the artwork is blue, with a lighter glyph on it', async () => {
    const png = await readFile(join(out, 'icon128.png'));
    const pixels = inflateSync(chunks(png)[1]!.body);

    const at = (x: number, y: number) => {
      const start = y * (128 * 4 + 1) + 1 + x * 4;
      return [pixels[start]!, pixels[start + 1]!, pixels[start + 2]!, pixels[start + 3]!];
    };

    const ground = at(12, 64);
    expect(ground[2]).toBeGreaterThan(ground[0]);
    expect(ground[3]).toBe(255);

    let glyph = 0;
    let transparent = 0;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const [r, g, b, a] = at(x, y);
        if (a === 0) transparent++;
        else if (r! > 240 && g! > 240 && b! > 240) glyph++;
      }
    }

    expect(glyph).toBeGreaterThan(400);
    expect(transparent).toBeGreaterThan(100);
  });
});
