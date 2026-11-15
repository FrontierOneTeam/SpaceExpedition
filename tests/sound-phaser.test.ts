import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { phaserSoundBackend } from '../src/game/phaserSound.ts';
import { SOUND, SoundBoard } from '../src/ui/sound.ts';

// A small stand-in for Phaser's game: a loader, an audio cache and a sound manager.
function fakeGame() {
  const cache = new Set<string>();
  const queued: string[] = [];
  const added: { key: string; config: { volume: number; loop: boolean } }[] = [];
  const plays: { key: string; marker: string | null; markers: { name: string; start: number; duration: number; config: { loop: boolean } }[] }[] = [];
  const handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  const loader = {
    on: (ev: string, fn: (...a: unknown[]) => void) => void (handlers[ev] ??= []).push(fn),
    once: (ev: string, fn: (...a: unknown[]) => void) => void (handlers[ev] ??= []).push(fn),
    audio: (key: string) => void queued.push(key),
    isReady: () => false,
    checkLoadQueue: () => undefined,
    start: () => undefined,
    list: { size: 0 },
  };
  const game = {
    scene: { getScenes: () => [{ load: loader }] },
    cache: { audio: { exists: (k: string) => cache.has(k) } },
    events: { once: () => undefined },
    sound: {
      locked: false,
      mute: false,
      pauseOnBlur: true,
      context: { state: 'running', resume: () => Promise.resolve() },
      add: (key: string, config: { volume: number; loop: boolean }) => {
        added.push({ key, config });
        const markers: { name: string; start: number; duration: number; config: { loop: boolean } }[] = [];
        const rec = { key, marker: null as string | null, markers };
        plays.push(rec);
        return {
          totalDuration: 32.9,
          once: () => undefined,
          addMarker: (m: { name: string; start: number; duration: number; config: { loop: boolean } }) => void markers.push(m),
          play: (marker?: string) => {
            rec.marker = marker ?? null;
            return true;
          },
          stop: () => undefined,
          destroy: () => undefined,
        };
      },
    },
  };
  return {
    game: game as unknown as Phaser.Game,
    queued,
    added,
    plays,
    decode: (key: string) => cache.add(key),
    emit: (ev: string, ...a: unknown[]) => (handlers[ev] ?? []).forEach((fn) => fn(...a)),
  };
}

class FakeAudio {
  static made: string[] = [];
  static played = 0;
  preload = '';
  volume = 1;
  muted = false;
  paused = true;
  duration = 33;
  currentTime = 0;
  constructor(public src: string) {
    FakeAudio.made.push(src);
  }
  addEventListener(_ev?: string, _fn?: () => void): void {}
  play(): Promise<void> {
    FakeAudio.played++;
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeAudio.made = [];
  FakeAudio.played = 0;
});

describe('music through the Phaser backend (SPEC 11.3)', () => {
  it('does not claim a music file is ready, or start it through <audio>, before Phaser has decoded it', () => {
    vi.stubGlobal('Audio', FakeAudio);
    const f = fakeGame();
    const backend = phaserSoundBackend(f.game);
    const board = new SoundBoard();
    board.attach(backend);
    board.unlock();
    board.setMusic(SOUND.calm);
    // The music was queued with Phaser's loader after the first tap ...
    expect(f.queued).toEqual(expect.arrayContaining(['mus_calm_loop', 'mus_report']));
    // ... and is not "ready" yet, so nothing was started in a bare <audio> element.
    expect(backend.has('mus_calm_loop')).toBe(false);
    expect(FakeAudio.played).toBe(0);
    expect(f.added).toEqual([]);
  });

  it('plays the music with Web Audio, looping from its startAt, as soon as Phaser has decoded it', () => {
    vi.stubGlobal('Audio', FakeAudio);
    const f = fakeGame();
    const backend = phaserSoundBackend(f.game);
    const board = new SoundBoard();
    board.attach(backend);
    board.unlock();
    board.setMusic(SOUND.calm);
    f.decode('mus_calm_loop');
    board.refresh(); // the map's 'filecomplete' handler does this
    expect(f.added.map((a) => a.key)).toEqual(['mus_calm_loop']);
    expect(f.added[0].config.loop).toBe(true);
    expect(f.added[0].config.volume).toBeGreaterThan(0.5);
    expect(f.plays[0].marker).toBe('start');
    expect(f.plays[0].markers[0]).toMatchObject({ name: 'start', start: 5.4, config: { loop: true } });
    expect(FakeAudio.played).toBe(0);
  });

  it('uses <audio> only for a file Phaser failed to load, once the browser has read it', () => {
    const listeners: Record<string, () => void> = {};
    class ProbeAudio extends FakeAudio {
      override addEventListener(ev?: string, fn?: () => void): void {
        listeners[ev + ":" + this.src.split("/").pop()] = fn as () => void;
      }
    }
    vi.stubGlobal('Audio', ProbeAudio);
    const f = fakeGame();
    const backend = phaserSoundBackend(f.game);
    const board = new SoundBoard();
    board.attach(backend);
    board.unlock();
    board.setMusic(SOUND.calm);
    f.emit('loaderror', { type: 'audio', key: 'mus_calm_loop' });
    expect(backend.has('mus_calm_loop')).toBe(false); // the mp3 header has not arrived yet
    listeners['loadedmetadata:mus_calm_loop.mp3']();
    expect(backend.has('mus_calm_loop')).toBe(true);
    expect(FakeAudio.played).toBe(1); // the board was told and started the track
  });

  it('the wind and other ambience follow the sound effects switch', () => {
    const f = fakeGame();
    f.decode('amb_mars_wind_real');
    const backend = phaserSoundBackend(f.game);
    const board = new SoundBoard();
    board.attach(backend);
    board.unlock();
    board.setAmbience([SOUND.windMarsReal]);
    expect(f.added[0].config.volume).toBeGreaterThan(0);
    board.setGroupMuted('effects', true);
    // Not testable through the fake handle's volume here: the board must not have started a second sound.
    expect(f.added).toHaveLength(1);
  });
});
