import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/types.ts';
import { config } from '../src/sim/index.ts';
import {
  AUDIO_ENTRIES,
  FALLBACK,
  LATER_PHASE_SOUNDS,
  PLAYLIST,
  RETIRED_SOUNDS,
  SOUND,
  SoundBoard,
  gainOf,
  musicModeFor,
  ambienceFor,
  allApprovedSounds,
  approvedSounds,
  musicSounds,
  daySounds,
  groupOf,
  startAtOf,
  nowPlaying,
  type AudioEntry,
  type SoundBackend,
} from '../src/ui/sound.ts';
import { nowPlayingHtml } from '../src/ui/screens.ts';

const entry = (name: string, approved: boolean, extra: Partial<AudioEntry> = {}): AudioEntry => ({
  name,
  approved,
  realRecording: false,
  source: '',
  sourceUrl: '',
  edits: '',
  ...extra,
});

interface Played {
  name: string;
  volume: number;
  loop: boolean;
  end: () => void;
  volumes: number[];
  stopped: boolean;
}

const { AUDIO } = config;
const OLD_MUSIC = ['mus_calm_loop', 'mus_report', 'mus_storm_intense'];
const NEW_MUSIC = ['mus_habitat', 'mus_groove', 'mus_drone', 'mus_theme', 'mus_storm'];

const NINE = ['amb_moon_base', 'ui_open_panel', 'bld_power_up', 'bld_repaired', 'evt_storm_warning', 'evt_rocket_land', 'evt_survey_expand', 'prd_question', 'astro_dance'];

function fakeBackend(loaded: string[] = AUDIO_ENTRIES.map((e) => e.name)) {
  // `loaded` may be changed by the test, as the loader would as files arrive.
  const played: Played[] = [];
  const startAts: Record<string, number | undefined> = {};
  const loadCalls: string[][] = [];
  let failCb: ((name: string) => void) | null = null;
  const asked: string[] = [];
  let muted = false;
  const backend: SoundBackend = {
    has: (name) => {
      asked.push(name);
      return loaded.includes(name);
    },
    play: (name, volume, loop, onEnd, startAt) => {
      startAts[name] = startAt;
      const p: Played = { name, volume, loop, end: onEnd, volumes: [volume], stopped: false };
      played.push(p);
      return { setVolume: (v) => void p.volumes.push(v), stop: () => void (p.stopped = true) };
    },
    setMuted: (m) => void (muted = m),
    load: (names) => void loadCalls.push(names),
    onLoadFailed: (cb) => void (failCb = cb),
  };
  return { backend, played, asked, startAts, loadCalls, fail: (name: string) => failCb?.(name), isMuted: () => muted };
}

describe('approved sounds only (SPEC 11.3, 13.1)', () => {
  it('only approved entries are ever requested for loading, and never the nine', () => {
    const start = approvedSounds();
    for (const n of NINE) expect(start, n).not.toContain(n);
    for (const n of start) expect(AUDIO_ENTRIES.find((e) => e.name === n)?.approved, n).toBe(true);
    expect(allApprovedSounds()).toHaveLength(32);
    expect(allApprovedSounds()).toContain('amb_mars_wind_real');
    for (const n of OLD_MUSIC) expect(allApprovedSounds(), n).not.toContain(n);
    for (const n of NEW_MUSIC) expect(allApprovedSounds(), n).toContain(n);
    expect(new SoundBoard().toLoad().sort()).toEqual([...start].sort());
    // Not at the start: music (after the first tap), later-phase sounds, and the stand-in wind.
    for (const n of [...LATER_PHASE_SOUNDS, ...NEW_MUSIC, ...OLD_MUSIC, 'amb_mars_wind']) expect(start, n).not.toContain(n);
    expect(start).toContain('amb_mars_wind_real');
    expect(musicSounds().sort()).toEqual([...NEW_MUSIC].sort());
    // The stand-in wind is loaded at the start when the real one is not approved.
    const noReal = AUDIO_ENTRIES.map((e) => (e.name === 'amb_mars_wind_real' ? { ...e, approved: false } : e));
    expect(approvedSounds(noReal)).toContain('amb_mars_wind');
    expect(approvedSounds(noReal)).not.toContain('amb_mars_wind_real');
    // The map loads exactly the names approvedSounds() gives, as .ogg and .mp3.
    const scene = readFileSync('src/game/MapScene.ts', 'utf8');
    expect(scene).toMatch(/const names = approvedSounds\(\);[\s\S]*for \(const name of names\) this\.load\.audio\(name, soundUrls\(name\)\)/);
    expect(scene.match(/load\.audio\(/g)).toHaveLength(1);
    const urls = readFileSync('src/game/phaserSound.ts', 'utf8');
    expect(urls).toContain('.ogg');
    expect(urls).toContain('.mp3');
  });

  it('never plays an unapproved sound, even when its file is loaded', () => {
    const f = fakeBackend();
    const board = new SoundBoard();
    board.attach(f.backend);
    board.unlock();
    for (const name of Object.values(SOUND)) board.effect(name);
    board.message([SOUND.radioOpen, SOUND.typing, SOUND.radioClose]);
    board.setMusic('build');
    board.setAmbience([SOUND.solarStorm, SOUND.windMars]);
    const approved = new Set(allApprovedSounds());
    expect(f.played.length).toBeGreaterThan(0);
    for (const p of f.played) expect(approved.has(p.name), p.name).toBe(true);
    // Unapproved names are not even looked up.
    for (const name of f.asked) expect(approved.has(name), name).toBe(true);
    for (const n of NINE) expect(f.played.some((p) => p.name === n), n).toBe(false);
  });

  it('a missing sound is silent and an unapproved one does not throw', () => {
    const f = fakeBackend([]);
    const board = new SoundBoard();
    board.attach(f.backend);
    board.unlock();
    let done = 0;
    expect(() => board.effect(SOUND.radioOpen, () => done++)).not.toThrow();
    expect(() => board.effect(SOUND.place, () => done++)).not.toThrow();
    expect(() => board.effect('no_such_sound')).not.toThrow();
    board.setAmbience(ambienceFor('mars', 0));
    expect(f.played).toEqual([]);
    // A sound that cannot play finishes at once, so whatever waits on it carries on.
    expect(done).toBe(2);
  });

  it('the real wind falls back to the delivered wind when the real file is missing', () => {
    const f = fakeBackend(['amb_mars_wind']);
    const board = new SoundBoard();
    board.attach(f.backend);
    board.unlock();
    board.setAmbience(ambienceFor('mars', 0));
    expect(f.played.map((p) => p.name)).toEqual([SOUND.windMars]);
    expect(nowPlaying(board.ambienceName())).toBeNull();
    // Nothing loaded at all: silent, no throw.
    const none = fakeBackend([]);
    const quiet = new SoundBoard();
    quiet.attach(none.backend);
    quiet.unlock();
    expect(() => quiet.setAmbience(ambienceFor('mars', 0))).not.toThrow();
    expect(none.played).toEqual([]);
  });

  it('uses the real wind when it is loaded, and asks for the stand-in only when the real one fails to load', () => {
    const f = fakeBackend();
    const board = new SoundBoard();
    board.attach(f.backend);
    board.unlock();
    board.setAmbience(ambienceFor('mars', 0));
    expect(f.played.map((p) => p.name)).toEqual([SOUND.windMarsReal]);
    expect(nowPlaying(board.ambienceName())?.url).toContain('45828_SCAM_MIC_SOL004_RUN001.mp3');
    expect(f.loadCalls).not.toContainEqual(['amb_mars_wind']);
    f.fail(SOUND.windMarsReal);
    expect(f.loadCalls).toContainEqual(['amb_mars_wind']);
    expect(FALLBACK[SOUND.windMarsReal]).toBe(SOUND.windMars);
    // A sound with no stand-in asks for nothing.
    const before = f.loadCalls.length;
    f.fail('ui_tap');
    expect(f.loadCalls).toHaveLength(before);
  });

  it('asks for a music track only when it is first needed, and never before the first tap', () => {
    const f = fakeBackend();
    const board = new SoundBoard();
    board.attach(f.backend);
    board.setMusic('build');
    expect(f.loadCalls).toEqual([]);
    expect(f.played).toEqual([]);
    board.unlock();
    // Only the first playlist track, not all five.
    expect(f.loadCalls).toEqual([['mus_habitat']]);
    board.unlock();
    board.refresh();
    board.setMusic('build');
    expect(f.loadCalls).toHaveLength(1);
    // The report track is asked for when the report opens, once.
    board.setMusic('report');
    board.setMusic('build');
    board.setMusic('report');
    expect(f.loadCalls).toEqual([['mus_habitat'], ['mus_theme']]);
    expect(f.loadCalls.flat()).not.toContain('mus_storm');
  });

  it('skips the silent start of a sound and passes it on, also for loops', () => {
    expect(startAtOf('amb_mars_dust_storm')).toBe(6);
    for (const n of NEW_MUSIC) expect(startAtOf(n), n).toBe(0);
    expect(startAtOf('ui_tap')).toBe(0);
    expect(startAtOf('no_such_sound')).toBe(0);
    const f = fakeBackend();
    const board = new SoundBoard();
    board.attach(f.backend);
    board.unlock();
    board.setMusic('report');
    board.setAmbience([SOUND.solarStorm]);
    board.effect(SOUND.tap);
    expect(f.played.find((p) => p.name === SOUND.theme)!.loop).toBe(true);
    expect(f.startAts.mus_theme).toBe(0);
    expect(f.startAts.amb_solar_storm).toBe(0);
    expect(f.startAts.ui_tap).toBe(0);
    // An entry with a bad startAt is not skipped.
    const odd = [entry('x_a', true, { startAt: -3 }), entry('x_b', true, { startAt: Number.NaN })];
    expect(startAtOf('x_a', odd)).toBe(0);
    expect(startAtOf('x_b', odd)).toBe(0);
  });

  it('the Phaser backend starts a sound at its startAt with a loopable marker', () => {
    const src = readFileSync('src/game/phaserSound.ts', 'utf8');
    expect(src).toMatch(/addMarker\(\{ name: 'start', start: startAt/);
    expect(src).toContain("sound.play('start')");
  });

  it('a backend that throws never breaks the game', () => {
    const angry: SoundBackend = {
      has: () => {
        throw new Error('broken');
      },
      play: () => {
        throw new Error('broken');
      },
      setMuted: () => {
        throw new Error('broken');
      },
    };
    const board = new SoundBoard();
    expect(() => {
      board.attach(angry);
      board.unlock();
      board.setMuted(true);
      board.setMuted(false);
      board.effect(SOUND.radioOpen);
      board.message([SOUND.radioOpen]);
      board.setAmbience([SOUND.windMars]);
      board.detach();
    }).not.toThrow();
    const half: SoundBackend = { has: () => true, play: () => { throw new Error('x'); }, setMuted: () => undefined };
    board.attach(half);
    expect(() => board.setAmbience([SOUND.windMars])).not.toThrow();
  });

  it('plays nothing before the first tap', () => {
    const f = fakeBackend();
    const board = new SoundBoard();
    board.attach(f.backend);
    board.setAmbience([SOUND.windMars]);
    board.effect(SOUND.radioOpen);
    board.message([SOUND.radioOpen]);
    expect(f.played).toEqual([]);
    board.unlock();
    expect(f.played.map((p) => p.name)).toEqual([SOUND.windMars]);
    expect(f.played[0].loop).toBe(true);
  });
});

describe('volumes, loops and mute (SPEC 11.3)', () => {
  const all = AUDIO_ENTRIES.map((e) => ({ ...e, approved: true }));

  it('uses the three volume groups', () => {
    expect(groupOf('amb_mars_wind')).toBe('ambience');
    expect(groupOf('mus_theme')).toBe('music');
    expect(groupOf('ui_tap')).toBe('effects');
    const f = fakeBackend();
    const board = new SoundBoard(all);
    board.attach(f.backend);
    board.unlock();
    board.setAmbience([SOUND.windMars]);
    board.setMusic('build');
    board.effect(SOUND.tap);
    const vol = (n: string) => f.played.find((p) => p.name === n)!.volume;
    // Group volume times the sound's own gain.
    expect(vol(SOUND.windMars)).toBeCloseTo(AUDIO.volume.ambience * gainOf(SOUND.windMars), 6);
    expect(vol(SOUND.habitat)).toBeCloseTo(AUDIO.volume.music * gainOf(SOUND.habitat), 6);
    expect(vol(SOUND.tap)).toBeCloseTo(AUDIO.volume.effects * gainOf(SOUND.tap), 6);
    // Music files are levelled to about -22 dB mean and effects to about -17 dB,
    // so compare the levels a player hears, not the bare group numbers.
    const musicDb = -22 + 20 * Math.log10(AUDIO.volume.music);
    const effectsDb = -17 + 20 * Math.log10(AUDIO.volume.effects);
    expect(musicDb).toBeLessThan(effectsDb);
    expect(AUDIO.volume.ambience).toBeLessThan(AUDIO.volume.music);
  });

  it('keeps one ambience and one music track, and lowers both while a message sound plays', () => {
    const f = fakeBackend();
    const board = new SoundBoard(all);
    board.attach(f.backend);
    board.unlock();
    board.setAmbience([SOUND.windMars]);
    board.setAmbience([SOUND.solarStorm, SOUND.windMars]);
    board.setMusic('build');
    board.setMusic('report');
    const wind = f.played.find((p) => p.name === SOUND.windMars)!;
    const storm = f.played.find((p) => p.name === SOUND.solarStorm)!;
    const calm = f.played.find((p) => p.name === SOUND.habitat)!;
    const report = f.played.find((p) => p.name === SOUND.theme)!;
    expect(wind.stopped).toBe(true);
    expect(calm.stopped).toBe(true);
    expect(storm.stopped).toBe(false);
    expect(report.stopped).toBe(false);

    board.message([SOUND.radioOpen, SOUND.typing, SOUND.radioClose]);
    const stormFull = AUDIO.volume.ambience * gainOf(SOUND.solarStorm);
    const reportFull = AUDIO.volume.music * gainOf(SOUND.theme);
    expect(storm.volumes.at(-1)!).toBeCloseTo(stormFull * AUDIO.duckShare, 6);
    expect(report.volumes.at(-1)!).toBeCloseTo(reportFull * AUDIO.duckShare, 6);
    // Each sound starts when the one before ends; the loops come back up at the end.
    f.played.find((p) => p.name === SOUND.radioOpen)!.end();
    f.played.find((p) => p.name === SOUND.typing)!.end();
    expect(storm.volumes.at(-1)!).toBeCloseTo(stormFull * AUDIO.duckShare, 6);
    f.played.find((p) => p.name === SOUND.radioClose)!.end();
    expect(storm.volumes.at(-1)).toBeCloseTo(stormFull, 6);
    expect(report.volumes.at(-1)).toBeCloseTo(reportFull, 6);
  });

  it('falls back to the next ambience when the first cannot play', () => {
    const f = fakeBackend();
    const board = new SoundBoard();
    board.attach(f.backend);
    board.unlock();
    board.setAmbience(ambienceFor('mars', 3));
    expect(f.played.map((p) => p.name)).toEqual([SOUND.solarStorm]);
    expect(ambienceFor('mars', 0)).toEqual([SOUND.windMarsReal, SOUND.windMars]);
    expect(ambienceFor('mars', 2)).toEqual([SOUND.solarStorm, SOUND.windMarsReal, SOUND.windMars]);
    expect(ambienceFor('moon', 0)).toEqual([SOUND.moonBase]);
  });

  it('mute is passed on and skips effects', () => {
    const f = fakeBackend();
    const board = new SoundBoard(all);
    board.setMuted(true);
    board.attach(f.backend);
    expect(f.isMuted()).toBe(true);
    board.unlock();
    board.effect(SOUND.tap);
    board.message([SOUND.radioOpen]);
    expect(f.played.filter((p) => !p.loop)).toEqual([]);
    board.setMuted(false);
    expect(f.isMuted()).toBe(false);
  });
});

describe('music: playlist, report, storm (SPEC 11.3, 18.3)', () => {
  /** A board with every sound loaded, and a helper that plays each started playlist track to its end. */
  function setup(loaded: string[] = AUDIO_ENTRIES.map((e) => e.name)) {
    const f = fakeBackend(loaded);
    const board = new SoundBoard();
    board.attach(f.backend);
    board.unlock();
    const music = () => f.played.filter((p) => p.name.startsWith('mus_'));
    const playing = () => music().filter((p) => !p.stopped);
    const finish = () => {
      const p = playing().at(-1)!;
      p.stopped = true; // a finished sound is gone
      p.end();
    };
    return { f, board, music, playing, finish };
  }

  it('the playlist is habitat, groove, drone', () => {
    expect([...PLAYLIST]).toEqual(['mus_habitat', 'mus_groove', 'mus_drone']);
  });

  it('plays each playlist track once to its end, then the next, then around again', () => {
    const { board, music, playing, finish } = setup();
    board.setMusic('build');
    expect(music().map((p) => p.name)).toEqual(['mus_habitat']);
    expect(music()[0].loop).toBe(false);
    for (const next of ['mus_groove', 'mus_drone', 'mus_habitat', 'mus_groove']) {
      finish();
      expect(playing().map((p) => p.name)).toEqual([next]);
      expect(playing()[0].loop).toBe(false);
    }
    expect(board.musicName()).toBe('mus_groove');
  });

  it('only one music track plays at a time', () => {
    const { board, music, playing, finish } = setup();
    board.setMusic('build');
    finish();
    board.setMusic('report');
    board.setMusic('storm');
    board.setMusic('build');
    finish();
    expect(playing()).toHaveLength(1);
    expect(music().length).toBeGreaterThan(3);
  });

  it('asks for the next track only when the one before has ended', () => {
    const loaded = ['mus_habitat', 'amb_mars_wind_real'];
    const { f, board, finish, playing } = setup(loaded);
    board.setMusic('build');
    expect(f.loadCalls).toEqual([['mus_habitat']]);
    finish();
    // The next track is asked for now, not before, and silence lasts until it has loaded.
    expect(f.loadCalls).toEqual([['mus_habitat'], ['mus_groove']]);
    expect(playing()).toEqual([]);
    loaded.push('mus_groove');
    board.refresh(); // the map does this when a file has loaded
    expect(playing().map((p) => p.name)).toEqual(['mus_groove']);
    expect(f.loadCalls).toHaveLength(2);
  });

  it('plays the main theme in a loop on the report and goes back to the playlist where it left off', () => {
    const { board, playing, finish } = setup();
    board.setMusic('build');
    finish(); // habitat is over, groove plays
    expect(playing().map((p) => p.name)).toEqual(['mus_groove']);
    board.setMusic('report');
    expect(playing().map((p) => p.name)).toEqual(['mus_theme']);
    expect(playing()[0].loop).toBe(true);
    board.setMusic('build');
    expect(playing().map((p) => p.name)).toEqual(['mus_groove']);
    expect(playing()[0].loop).toBe(false);
    finish();
    expect(playing().map((p) => p.name)).toEqual(['mus_drone']);
  });

  it('plays the storm track on a storm day and returns to the playlist when it is over', () => {
    const { board, playing } = setup();
    board.setMusic('build');
    board.setMusic('storm');
    expect(playing().map((p) => p.name)).toEqual(['mus_storm']);
    expect(playing()[0].loop).toBe(true);
    board.setMusic('build');
    expect(playing().map((p) => p.name)).toEqual(['mus_habitat']);
    board.setMusic(null);
    expect(playing()).toEqual([]);
  });

  it('chooses the mode: report first, then a lost run, then a storm day', () => {
    expect(musicModeFor(false, false, 0)).toBe('build');
    expect(musicModeFor(false, false, 1)).toBe('build');
    expect(musicModeFor(false, false, 2)).toBe('storm');
    expect(musicModeFor(false, false, 5)).toBe('storm');
    expect(musicModeFor(true, false, 5)).toBe('report');
    expect(musicModeFor(true, true, 0)).toBe('report');
    expect(musicModeFor(false, true, 3)).toBeNull();
    expect(AUDIO.stormMusicLevel).toBe(2);
  });

  it('skips a track that cannot load, and goes quiet when none can', () => {
    const { f, board, playing, finish } = setup(AUDIO_ENTRIES.map((e) => e.name).filter((n) => n !== 'mus_drone'));
    board.setMusic('build');
    finish(); // groove plays
    finish(); // its end asks for the drone, which has not loaded
    expect(playing()).toEqual([]);
    f.fail('mus_drone');
    expect(playing().map((p) => p.name)).toEqual(['mus_habitat']);
    const none = setup([]);
    none.board.setMusic('build');
    expect(none.music()).toEqual([]);
  });

  it('the music switch stops the music and fetches nothing while it is off', () => {
    const { f, board, playing } = setup();
    board.setGroupMuted('music', true);
    board.setMusic('build');
    expect(playing()).toEqual([]);
    expect(f.loadCalls).toEqual([]);
    board.setGroupMuted('music', false);
    expect(playing().map((p) => p.name)).toEqual(['mus_habitat']);
    expect(f.loadCalls).toEqual([['mus_habitat']]);
    board.setGroupMuted('music', true);
    expect(playing()).toEqual([]);
    // Effects still play.
    board.effect(SOUND.tap);
    expect(f.played.some((p) => p.name === SOUND.tap)).toBe(true);
  });

  it('mute silences everything through the backend', () => {
    const { f, board, playing } = setup();
    board.setMusic('build');
    board.setMuted(true);
    expect(f.isMuted()).toBe(true);
    board.effect(SOUND.tap);
    expect(f.played.some((p) => p.name === SOUND.tap)).toBe(false);
    expect(playing()).toHaveLength(1); // still held by the backend, which outputs nothing
    board.setMuted(false);
    expect(f.isMuted()).toBe(false);
  });

  it('never asks for or plays the first-version tracks', () => {
    const { f, board, played } = (() => {
      const s = setup();
      return { ...s, played: s.f.played };
    })();
    for (const mode of ['build', 'report', 'storm', 'build', null] as const) board.setMusic(mode);
    for (const name of Object.values(SOUND)) board.effect(name);
    const asked = f.loadCalls.flat();
    for (const n of OLD_MUSIC) {
      expect(asked, n).not.toContain(n);
      expect(played.some((p) => p.name === n), n).toBe(false);
      expect(allApprovedSounds(), n).not.toContain(n);
    }
  });
});

describe('per-sound gain', () => {
  it('is applied to the volume of effects, ambience and music, and defaults to 1', () => {
    const entries = [
      entry('ui_tap', true, { gain: 0.5 }),
      entry('ui_select', true),
      entry('amb_mars_wind', true, { gain: 1.5 }),
      entry('mus_habitat', true, { gain: 0.8 }),
    ];
    const f = fakeBackend();
    const board = new SoundBoard(entries);
    board.attach(f.backend);
    board.unlock();
    board.effect('ui_tap');
    board.effect('ui_select');
    board.setAmbience(['amb_mars_wind']);
    board.setMusic('build');
    const vol = (n: string) => f.played.find((p) => p.name === n)!.volume;
    expect(vol('ui_tap')).toBeCloseTo(AUDIO.volume.effects * 0.5, 9);
    expect(vol('ui_select')).toBeCloseTo(AUDIO.volume.effects, 9);
    expect(vol('amb_mars_wind')).toBeCloseTo(AUDIO.volume.ambience * 1.5, 9);
    expect(vol('mus_habitat')).toBeCloseTo(AUDIO.volume.music * 0.8, 9);
    // The gain also holds while a Mission Control sound lowers the loops.
    board.message(['ui_tap']);
    const wind = f.played.find((p) => p.name === 'amb_mars_wind')!;
    expect(wind.volumes.at(-1)).toBeCloseTo(AUDIO.volume.ambience * 1.5 * AUDIO.duckShare, 9);
  });

  it('ignores a gain that is not a number above 0 and up to 2', () => {
    const bad = [0, -1, 2.5, Number.NaN, Infinity, '1.2' as unknown as number];
    for (const gain of bad) expect(gainOf('x', [entry('x', true, { gain })]), String(gain)).toBe(1);
    expect(gainOf('x', [entry('x', true)])).toBe(1);
    expect(gainOf('missing', [])).toBe(1);
    expect(gainOf('x', [entry('x', true, { gain: 2 })])).toBe(2);
    expect(gainOf('x', [entry('x', true, { gain: 0.37 })])).toBe(0.37);
  });

  it('the shipped gains are measured, never above 2, and written into edits', () => {
    for (const e of AUDIO_ENTRIES.filter((x) => x.approved && !x.name.startsWith('mus_'))) {
      expect(e.gain, e.name).toBeGreaterThan(0);
      expect(e.gain!, e.name).toBeLessThanOrEqual(2);
      expect(e.edits, e.name).toContain(`Playback gain ${e.gain}`);
      expect(e.edits, e.name).toContain('measured with ffmpeg');
    }
    // The levelled music needs no gain.
    for (const n of NEW_MUSIC) expect(gainOf(n), n).toBe(1);
  });

  it('keeps every effect clearly under full scale and the music under the effects', () => {
    // Peaks of the delivered files are about -3 dB; after gain and group volume they stay 6 dB or more below full scale.
    const peakDb = (e: AudioEntry) => {
      const m = /peak (-?[\d.]+) dB/.exec(e.edits);
      return m ? Number(m[1]) : null;
    };
    for (const e of AUDIO_ENTRIES.filter((x) => x.approved && groupOf(x.name) === 'effects')) {
      const peak = peakDb(e)!;
      expect(peak, e.name).not.toBeNull();
      const finalPeak = peak + 20 * Math.log10(gainOf(e.name) * AUDIO.volume.effects);
      expect(finalPeak, e.name).toBeLessThanOrEqual(-6);
    }
    // Heard level: music (about -22 dB mean as levelled) stays under the effects (about -17 dB).
    expect(-22 + 20 * Math.log10(AUDIO.volume.music)).toBeLessThan(-17 + 20 * Math.log10(AUDIO.volume.effects));
  });
});

describe('the "Now playing" line (SPEC 9.4, 11.3)', () => {
  it('shows for the real Mars wind and for no other sound', () => {
    for (const e of AUDIO_ENTRIES) {
      if (e.name === SOUND.windMarsReal) expect(nowPlaying(e.name)?.text).toBe('Now playing: Mars wind, recorded by the Perseverance rover.');
      else expect(nowPlaying(e.name), e.name).toBeNull();
    }
    expect(nowPlaying(null)).toBeNull();
    expect(nowPlaying(SOUND.windMars)).toBeNull();
    expect(nowPlayingHtml(nowPlaying(SOUND.windMarsReal))).toContain('45828_SCAM_MIC_SOL004_RUN001.mp3');
    // Even marked as real with a link, another sound shows no line.
    expect(nowPlaying('mus_habitat', [entry('mus_habitat', true, { realRecording: true, sourceUrl: 'https://example.org/x' })])).toBeNull();
  });

  it('shows only with realRecording and a sourceUrl together', () => {
    const url = 'https://example.org/exact-clip';
    const only = (extra: Partial<AudioEntry>) => [entry(SOUND.windMarsReal, true, extra)];
    expect(nowPlaying(SOUND.windMarsReal, only({ realRecording: true }))).toBeNull();
    expect(nowPlaying(SOUND.windMarsReal, only({ sourceUrl: url }))).toBeNull();
    expect(nowPlaying(SOUND.windMarsReal, only({ realRecording: true, sourceUrl: '   ' }))).toBeNull();
    expect(nowPlaying(SOUND.windMarsReal, [entry(SOUND.windMarsReal, false, { realRecording: true, sourceUrl: url })])).toBeNull();
    const line = nowPlaying(SOUND.windMarsReal, only({ realRecording: true, sourceUrl: url }));
    expect(line).toEqual({ text: 'Now playing: Mars wind, recorded by the Perseverance rover.', url });
    expect(nowPlayingHtml(line)).toContain(url);
  });
});

describe('sound wiring (SPEC 11.3)', () => {
  const names = AUDIO_ENTRIES.map((e) => e.name);

  it('every sound name in the wiring exists in audio.json', () => {
    for (const n of [...Object.values(SOUND), ...LATER_PHASE_SOUNDS, ...RETIRED_SOUNDS]) expect(names, n).toContain(n);
  });

  it('every entry of audio.json is wired to a moment or listed as later-phase', () => {
    const wired = new Set<string>([...Object.values(SOUND), ...LATER_PHASE_SOUNDS, ...RETIRED_SOUNDS]);
    for (const n of names) expect(wired.has(n), n).toBe(true);
  });

  it('picks the most important day sounds, at most two', () => {
    const storm: SimEvent[] = [
      { type: 'storm', level: 3, sheltered: 0, unsheltered: 3, allHabitatsSheltered: false },
      { type: 'broken', buildingId: 1, building: 'o2', days: 2, daysLeft: 2 },
      { type: 'rocket_landed', parts: 3 },
    ];
    expect(daySounds(storm, false, false)).toEqual([SOUND.stormHit, SOUND.broken]);
    expect(daySounds([{ type: 'rocket_landed', parts: 3 }], true, false)).toEqual([SOUND.rocketLand, SOUND.stormWarning]);
    expect(daySounds([], false, true)).toEqual([SOUND.question]);
    expect(daySounds([{ type: 'chapter_end', chapterId: 'x', replay: 1 }], false, false)).toEqual([SOUND.chapterComplete]);
    expect(daySounds([{ type: 'storm', level: 1, sheltered: 0, unsheltered: 1, allHabitatsSheltered: false }], false, false)).toEqual([]);
  });
});
