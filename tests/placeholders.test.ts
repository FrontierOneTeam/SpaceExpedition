import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePlaceholders } from '../tools/make-placeholders';

describe('makePlaceholders', () => {
  let dir: string;
  let artDir: string;
  let audioDir: string;
  const realBytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'outpost-placeholders-'));
    artDir = join(dir, 'art');
    audioDir = join(dir, 'audio');
    mkdirSync(artDir);
    mkdirSync(audioDir);
    writeFileSync(join(artDir, 'logo.png'), realBytes);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps real files, fills in missing ones', async () => {
    await makePlaceholders({ artDir, audioDir, audioNames: ['ui_tap'] });

    // the real file is untouched and has no sidecar
    expect(readFileSync(join(artDir, 'logo.png')).equals(realBytes)).toBe(true);
    expect(existsSync(join(artDir, 'logo.png.placeholder'))).toBe(false);

    // a missing art file is created at the right size, with a sidecar
    const meta = await sharp(join(artDir, 'habitat.png')).metadata();
    expect([meta.width, meta.height]).toEqual([256, 320]);
    expect(existsSync(join(artDir, 'habitat.png.placeholder'))).toBe(true);

    // a missing sound is created in both formats, with sidecars
    for (const ext of ['ogg', 'mp3']) {
      expect(existsSync(join(audioDir, `ui_tap.${ext}`))).toBe(true);
      expect(existsSync(join(audioDir, `ui_tap.${ext}.placeholder`))).toBe(true);
    }
  });

  it('creates nothing on a second run', async () => {
    const created = await makePlaceholders({ artDir, audioDir, audioNames: ['ui_tap'] });
    expect(created).toEqual([]);
    expect(readFileSync(join(artDir, 'logo.png')).equals(realBytes)).toBe(true);
  });
});
