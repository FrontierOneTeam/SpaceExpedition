import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/types.ts';
import {
  AUDIO_ENTRIES,
  FALLBACK,
  LATER_PHASE_SOUNDS,
  SOUND,
  SoundBoard,
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

const NINE = ['amb_moon_base', 'ui_open_panel', 'bld_power_up', 'bld_repaired', 'evt_storm_warning', 'evt_rocket_land', 'evt_survey_expand', 'prd_question', 'astro_dance'];

function fakeBackend(loaded: string[] = AUDIO_ENTRIES.map((e) => e.name)) {
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
    expect(allApprovedSounds()).toHaveLength(29);
    expect(allApprovedSounds()).toContain('amb_mars_wind_real');
    expect(allApprovedSounds()).not.toContain('mus_storm_intense');
    expect(new SoundBoard().toLoad().sort()).toEqual([...start].sort());
    // Not at the start: music (after the first tap), later-phase sounds, and the stand-in wind.
    for (const n of [...LATER_PHASE_SOUNDS, 'mus_calm_loop', 'mus_report', 'amb_mars_wind']) expect(start, n).not.toContain(n);
    expect(start).toContain('amb_mars_wind_real');
    expect(musicSounds().sort()).toEqual(['mus_calm_loop', 'mus_report']);
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
    board.setMusic(SOUND.calm);
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

  it('loads the music only after the first tap', () => {
    const f = fakeBackend();
    const board = new SoundBoard();
    board.attach(f.backend);
    expect(f.loadCalls).toEqual([]);
    board.unlock();
    expect(f.loadCalls).toEqual([['mus_calm_loop', 'mus_report']]);
    board.unlock();
    expect(f.loadCalls).toHaveLength(1);
  });

  it('skips the silent start of a sound and passes it on, also for loops', () => {
    expect(startAtOf('mus_calm_loop')).toBe(5.4);
    expect(startAtOf('mus_report')).toBe(2);
    expect(startAtOf('amb_mars_dust_storm')).toBe(6);
    expect(startAtOf('ui_tap')).toBe(0);
    expect(startAtOf('no_such_sound')).toBe(0);
    const f = fakeBackend();
    const board = new SoundBoard();
    board.attach(f.backend);
    board.unlock();
    board.setMusic(SOUND.calm);
    board.setMusic(SOUND.report);
    board.effect(SOUND.tap);
    expect(f.played.find((p) => p.name === SOUND.calm)!.loop).toBe(true);
    expect(f.startAts.mus_calm_loop).toBe(5.4);
    expect(f.startAts.mus_report).toBe(2);
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
    expect(groupOf('mus_report')).toBe('music');
    expect(groupOf('ui_tap')).toBe('effects');
    const f = fakeBackend();
    const board = new SoundBoard(all);
    board.attach(f.backend);
    board.unlock();
    board.setAmbience([SOUND.windMars]);
    board.setMusic(SOUND.calm);
    board.effect(SOUND.tap);
    const vol = (n: string) => f.played.find((p) => p.name === n)!.volume;
    expect(vol(SOUND.windMars)).toBe(0.5);
    expect(vol(SOUND.calm)).toBe(0.6);
    expect(vol(SOUND.tap)).toBe(1);
  });

  it('keeps one ambience and one music track, and lowers both while a message sound plays', () => {
    const f = fakeBackend();
    const board = new SoundBoard(all);
    board.attach(f.backend);
    board.unlock();
    board.setAmbience([SOUND.windMars]);
    board.setAmbience([SOUND.solarStorm, SOUND.windMars]);
    board.setMusic(SOUND.calm);
    board.setMusic(SOUND.report);
    const wind = f.played.find((p) => p.name === SOUND.windMars)!;
    const storm = f.played.find((p) => p.name === SOUND.solarStorm)!;
    const calm = f.played.find((p) => p.name === SOUND.calm)!;
    const report = f.played.find((p) => p.name === SOUND.report)!;
    expect(wind.stopped).toBe(true);
    expect(calm.stopped).toBe(true);
    expect(storm.stopped).toBe(false);
    expect(report.stopped).toBe(false);

    board.message([SOUND.radioOpen, SOUND.typing, SOUND.radioClose]);
    expect(storm.volumes.at(-1)!).toBeLessThan(0.5);
    expect(report.volumes.at(-1)!).toBeLessThan(0.6);
    // Each sound starts when the one before ends; the loops come back up at the end.
    f.played.find((p) => p.name === SOUND.radioOpen)!.end();
    f.played.find((p) => p.name === SOUND.typing)!.end();
    expect(storm.volumes.at(-1)!).toBeLessThan(0.5);
    f.played.find((p) => p.name === SOUND.radioClose)!.end();
    expect(storm.volumes.at(-1)).toBe(0.5);
    expect(report.volumes.at(-1)).toBe(0.6);
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
    expect(nowPlaying('mus_calm_loop', [entry('mus_calm_loop', true, { realRecording: true, sourceUrl: 'https://example.org/x' })])).toBeNull();
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
    for (const n of [...Object.values(SOUND), ...LATER_PHASE_SOUNDS]) expect(names, n).toContain(n);
  });

  it('every entry of audio.json is wired to a moment or listed as later-phase', () => {
    const wired = new Set<string>([...Object.values(SOUND), ...LATER_PHASE_SOUNDS]);
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
