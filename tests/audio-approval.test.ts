import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filesToRemove, type AudioEntry } from '../tools/approved-audio';

// These nine stay unapproved for good: their files are not in the repository (SPEC 16.1).
const NINE = ['amb_moon_base', 'ui_open_panel', 'bld_power_up', 'bld_repaired', 'evt_storm_warning', 'evt_rocket_land', 'evt_survey_expand', 'prd_question', 'astro_dance'];

const NEW_MUSIC = ['mus_habitat', 'mus_groove', 'mus_drone', 'mus_theme', 'mus_storm'];

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
    // The first-version music is unapproved in audio.json, so the build drops it.
    const real = JSON.parse(readFileSync('src/data/audio.json', 'utf8')) as AudioEntry[];
    expect(filesToRemove(real, ['mus_calm_loop.ogg', 'mus_report.mp3', 'mus_habitat.ogg', 'mus_theme.mp3']).sort()).toEqual(['mus_calm_loop.ogg', 'mus_report.mp3']);
  });

  it('leaves other files alone', () => {
    expect(filesToRemove(entries, ['notes.txt'])).toEqual([]);
  });

  it('approves every sound except the nine, and keeps every other file that is present', () => {
    const real = JSON.parse(readFileSync('src/data/audio.json', 'utf8')) as (AudioEntry & { realRecording: boolean; source: string; sourceUrl: string; edits: string; startAt?: number; gain?: number })[];
    expect(real).toHaveLength(43);
    expect(real.some((e) => e.name === 'mus_storm_intense')).toBe(false);
    const approved = real.filter((e) => e.approved).map((e) => e.name).sort();
    // Unapproved: the nine, and the two first-version music tracks the new ones replace.
    expect(real.filter((e) => !e.approved).map((e) => e.name).sort()).toEqual([...NINE, 'mus_calm_loop', 'mus_report'].sort());
    expect(approved).toHaveLength(32);
    for (const n of NEW_MUSIC) expect(approved, n).toContain(n);
    for (const n of ['mus_calm_loop', 'mus_report']) expect(approved, n).not.toContain(n);
    expect(approved).toContain('amb_mars_wind_real');

    // Only NASA's wind is a checked real recording, with its exact clip link and credit line.
    expect(real.filter((e) => e.realRecording).map((e) => e.name)).toEqual(['amb_mars_wind_real']);
    const wind = real.find((e) => e.name === 'amb_mars_wind_real')!;
    expect(wind.sourceUrl).toBe('https://assets.science.nasa.gov/content/dam/science/psd/mars/downloadable_items/4/5/45828_SCAM_MIC_SOL004_RUN001.mp3');
    expect(wind.source).toBe('NASA/JPL-Caltech/LANL/CNES/CNRS/ISAE-Supaero');
    expect(wind.edits).not.toBe('');

    // The silent starts of SPEC 11.3, each noted in the entry's edits. The two first-version tracks are
    // now unapproved and say that the new tracks replace them.
    for (const [name, at] of [['mus_calm_loop', 5.4], ['mus_report', 2.0], ['amb_mars_dust_storm', 6.0]] as const) {
      const e = real.find((x) => x.name === name)!;
      expect(e.startAt, name).toBe(at);
      expect(e.edits, name).toContain(at.toFixed(1));
    }
    for (const n of ['mus_calm_loop', 'mus_report']) {
      const e = real.find((x) => x.name === n)!;
      expect(e.approved, n).toBe(false);
      expect(e.edits, n).toContain('Replaced by the new music tracks');
    }
    expect(real.filter((e) => e.startAt !== undefined)).toHaveLength(3);

    // The five new tracks: made by the team, not a real recording, levelled by ffmpeg.
    for (const n of NEW_MUSIC) {
      const e = real.find((x) => x.name === n)!;
      expect(e.approved, n).toBe(true);
      expect(e.realRecording, n).toBe(false);
      expect(e.source, n).toBe('Made by the team for this game (NASA Space Apps Challenge 2026)');
      expect(e.sourceUrl, n).toBe('');
      expect(e.edits, n).toContain('loudnorm');
      expect(e.edits, n).toContain('-20 LUFS');
      expect(e.startAt, n).toBeUndefined();
    }

    // Every other approved sound has a measured gain, 2 at most.
    for (const e of real.filter((x) => x.approved && !x.name.startsWith('mus_'))) {
      expect(e.gain, e.name).toBeGreaterThan(0);
      expect(e.gain!, e.name).toBeLessThanOrEqual(2);
    }

    const files = readdirSync('public/assets/audio').filter((f) => /\.(ogg|mp3)$/.test(f));
    const removed = new Set(filesToRemove(real, files));
    const kept = files.filter((f) => !removed.has(f)).sort();
    // Every approved sound file on disk is kept; none of the nine is.
    const expected = approved.flatMap((n) => [`${n}.mp3`, `${n}.ogg`]).filter((f) => files.includes(f)).sort();
    expect(kept).toEqual(expected);
    for (const n of NINE) expect(kept.some((f) => f.startsWith(`${n}.`)), n).toBe(false);
    expect(kept).toContain('amb_mars_wind_real.mp3');
    expect(kept).toContain('amb_mars_wind_real.ogg');

    // The five new tracks are on disk in both formats, small enough for a phone; the old files stay on disk but are not kept.
    for (const n of NEW_MUSIC) {
      for (const ext of ['ogg', 'mp3']) {
        expect(files, `${n}.${ext}`).toContain(`${n}.${ext}`);
        expect(kept, `${n}.${ext}`).toContain(`${n}.${ext}`);
        expect(statSync(`public/assets/audio/${n}.${ext}`).size, `${n}.${ext}`).toBeLessThan(2.3 * 1024 * 1024);
      }
    }
    for (const n of ['mus_calm_loop', 'mus_report', 'mus_storm_intense']) {
      expect(files).toContain(`${n}.ogg`);
      expect(kept.some((f) => f.startsWith(`${n}.`)), n).toBe(false);
    }
  });
});
