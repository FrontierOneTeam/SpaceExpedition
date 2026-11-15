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

  it('approves exactly the three sounds of SPEC 16.3 and keeps only their files', () => {
    const real = JSON.parse(readFileSync('src/data/audio.json', 'utf8')) as (AudioEntry & { realRecording: boolean })[];
    expect(real).toHaveLength(37);
    expect(real.some((e) => e.name === 'mus_storm_intense')).toBe(false);
    const approved = real.filter((e) => e.approved).map((e) => e.name).sort();
    expect(approved).toEqual(['amb_mars_wind', 'mc_radio_close', 'mc_radio_open']);
    // None is marked as a checked real recording yet.
    expect(real.every((e) => e.realRecording === false)).toBe(true);
    const files = readdirSync('public/assets/audio').filter((f) => /\.(ogg|mp3)$/.test(f));
    const removed = new Set(filesToRemove(real, files));
    const kept = files.filter((f) => !removed.has(f)).sort();
    const expected = approved.flatMap((n) => [`${n}.mp3`, `${n}.ogg`]).filter((f) => files.includes(f)).sort();
    expect(kept).toEqual(expected);
  });
});
