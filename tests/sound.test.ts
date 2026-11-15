import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/sim/types.ts';
import {
  AUDIO_ENTRIES,
  LATER_PHASE_SOUNDS,
  SOUND,
  SoundBoard,
  ambienceFor,
  approvedSounds,
  daySounds,
  groupOf,
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

function fakeBackend(loaded: string[] = AUDIO_ENTRIES.map((e) => e.name)) {
  const played: Played[] = [];
  const asked: string[] = [];
  let muted = false;
  const backend: SoundBackend = {
    has: (name) => {
      asked.push(name);
      return loaded.includes(name);
    },
    play: (name, volume, loop, onEnd) => {
      const p: Played = { name, volume, loop, end: onEnd, volumes: [volume], stopped: false };
      played.push(p);
      return { setVolume: (v) => void p.volumes.push(v), stop: () => void (p.stopped = true) };
    },
    setMuted: (m) => void (muted = m),
  };
  return { backend, played, asked, isMuted: () => muted };
}

describe('approved sounds only (SPEC 11.3, 13.1)', () => {
  it('only approved entries are ever requested for loading', () => {
    expect(approvedSounds().sort()).toEqual(['amb_mars_wind', 'mc_radio_close', 'mc_radio_open']);
    expect(new SoundBoard().toLoad().sort()).toEqual(['amb_mars_wind', 'mc_radio_close', 'mc_radio_open']);
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
    const approved = new Set(approvedSounds());
    expect(f.played.length).toBeGreaterThan(0);
    for (const p of f.played) expect(approved.has(p.name), p.name).toBe(true);
    // Unapproved names are not even looked up.
    for (const name of f.asked) expect(approved.has(name), name).toBe(true);
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
    board.setAmbience([SOUND.windMars]);
    expect(f.played).toEqual([]);
    // A sound that cannot play finishes at once, so whatever waits on it carries on.
    expect(done).toBe(2);
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
    expect(f.played.map((p) => p.name)).toEqual([SOUND.windMars]);
    expect(ambienceFor('mars', 0)).toEqual([SOUND.windMars]);
    expect(ambienceFor('mars', 2)).toEqual([SOUND.solarStorm, SOUND.windMars]);
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
  it('is hidden for every sound today', () => {
    for (const e of AUDIO_ENTRIES) expect(nowPlaying(e.name), e.name).toBeNull();
    expect(nowPlaying(null)).toBeNull();
    expect(nowPlayingHtml(nowPlaying(SOUND.windMars))).toBe('');
  });

  it('shows only with realRecording and a sourceUrl together', () => {
    const url = 'https://example.org/exact-clip';
    const only = (extra: Partial<AudioEntry>) => [entry(SOUND.windMars, true, extra)];
    expect(nowPlaying(SOUND.windMars, only({ realRecording: true }))).toBeNull();
    expect(nowPlaying(SOUND.windMars, only({ sourceUrl: url }))).toBeNull();
    expect(nowPlaying(SOUND.windMars, only({ realRecording: true, sourceUrl: '   ' }))).toBeNull();
    expect(nowPlaying(SOUND.windMars, [entry(SOUND.windMars, false, { realRecording: true, sourceUrl: url })])).toBeNull();
    const line = nowPlaying(SOUND.windMars, only({ realRecording: true, sourceUrl: url }));
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
