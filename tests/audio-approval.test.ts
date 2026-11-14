import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filesToRemove, type AudioEntry } from '../tools/approved-audio';

describe('filesToRemove', () => {
  const entries: AudioEntry[] = [
    { name: 'good', approved: true },
    { name: 'bad', approved: false },
  ];

  it('removes unapproved and unknown sound files, keeps approved ones', () => {
    const files = ['good.ogg', 'good.mp3', 'bad.ogg', 'bad.mp3', 'mus_storm_intense.ogg', 'mus_storm_intense.mp3'];
    expect(filesToRemove(entries, files).sort()).toEqual(
      ['bad.mp3', 'bad.ogg', 'mus_storm_intense.mp3', 'mus_storm_intense.ogg'],
    );
  });

  it('leaves other files alone', () => {
    expect(filesToRemove(entries, ['notes.txt'])).toEqual([]);
  });

  it('removes every real sound file while all entries are unapproved', () => {
    const real = JSON.parse(readFileSync('src/data/audio.json', 'utf8')) as AudioEntry[];
    expect(real).toHaveLength(37);
    expect(real.every((e) => !e.approved)).toBe(true);
    const files = readdirSync('public/assets/audio').filter((f) => /\.(ogg|mp3)$/.test(f));
    expect(filesToRemove(real, files).sort()).toEqual([...files].sort());
  });
});
