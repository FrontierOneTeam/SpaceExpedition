import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { phaserSoundBackend } from '../src/game/phaserSound.ts';
import { config } from '../src/sim/index.ts';
import { SOUND, SoundBoard, gainOf } from '../src/ui/sound.ts';

// A small stand-in for Phaser's game: a loader, an audio cache and a sound manager.
function fakeGame() {
  const cache = new Set<string>();
  const queued: string[] = [];
  const added: { key: string; config: { volume: number; loop: boolean } }[] = [];
  const plays: { key: string; marker: string | null; markers: { name: string; start: number; duration: number; config: { loop: boolean } }[] }[] = [];
  const handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  const completes: (() => void)[] = [];
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
          once: (ev: string, fn: () => void) => {
            if (ev === 'complete') completes.push(fn);
          },
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
    /** The newest one-shot sound reaches its end. */
    complete: () => completes.at(-1)?.(),
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
    board.setMusic('build');
    // Only the first playlist track was queued with Phaser's loader, after the first tap ...
    expect(f.queued).toEqual(['mus_habitat']);
    // ... and is not "ready" yet, so nothing was started in a bare <audio> element.
    expect(backend.has('mus_habitat')).toBe(false);
    expect(FakeAudio.played).toBe(0);
    expect(f.added).toEqual([]);
  });

  it('plays a playlist track once with Web Audio, at exactly its group volume, as soon as Phaser has decoded it', () => {
    vi.stubGlobal('Audio', FakeAudio);
    const f = fakeGame();
    const backend = phaserSoundBackend(f.game);
    const board = new SoundBoard();
    board.attach(backend);
    board.unlock();
    board.setMusic('build');
    f.decode('mus_habitat');
    board.refresh(); // the map's 'filecomplete' handler does this
    expect(f.added.map((a) => a.key)).toEqual(['mus_habitat']);
    expect(f.added[0].config.loop).toBe(false);
    // No special boost for music any more: the group volume times the track's gain (1).
    expect(f.added[0].config.volume).toBe(config.AUDIO.volume.music);
    expect(f.plays[0].marker).toBeNull();
    expect(FakeAudio.played).toBe(0);
  });

  it('a finished track makes the board ask for and play the next one', () => {
    const f = fakeGame();
    const backend = phaserSoundBackend(f.game);
    const board = new SoundBoard();
    board.attach(backend);
    board.unlock();
    board.setMusic('build');
    f.decode('mus_habitat');
    board.refresh();
    f.complete();
    expect(f.queued).toEqual(['mus_habitat', 'mus_groove']);
    f.decode('mus_groove');
    board.refresh();
    expect(f.added.map((a) => a.key)).toEqual(['mus_habitat', 'mus_groove']);
  });

  it('plays the report and storm tracks looped', () => {
    const f = fakeGame();
    const backend = phaserSoundBackend(f.game);
    const board = new SoundBoard();
    board.attach(backend);
    board.unlock();
    board.setMusic('report');
    f.decode('mus_theme');
    board.refresh();
    board.setMusic('storm');
    f.decode('mus_storm');
    board.refresh();
    expect(f.added.map((a) => [a.key, a.config.loop])).toEqual([['mus_theme', true], ['mus_storm', true]]);
    expect(f.queued).toEqual(['mus_theme', 'mus_storm']);
  });

  it('applies the gain of an effect, and never asks for the first-version tracks', () => {
    const f = fakeGame();
    f.decode('ui_tap');
    const backend = phaserSoundBackend(f.game);
    const board = new SoundBoard();
    board.attach(backend);
    board.unlock();
    board.effect(SOUND.tap);
    expect(f.added[0].config.volume).toBeCloseTo(config.AUDIO.volume.effects * gainOf(SOUND.tap), 9);
    for (const mode of ['build', 'report', 'storm'] as const) board.setMusic(mode);
    for (const old of ['mus_calm_loop', 'mus_report', 'mus_storm_intense']) expect(f.queued).not.toContain(old);
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
    f.emit('loaderror', { type: 'audio', key: 'ui_tap' });
    expect(backend.has('ui_tap')).toBe(false); // the mp3 header has not arrived yet
    board.effect(SOUND.tap);
    expect(FakeAudio.played).toBe(0);
    listeners['loadedmetadata:ui_tap.mp3']();
    expect(backend.has('ui_tap')).toBe(true);
    board.effect(SOUND.tap);
    expect(FakeAudio.played).toBe(1);
  });

  it('skips a music track whose file failed to load and asks for the next one', () => {
    vi.stubGlobal('Audio', FakeAudio);
    const f = fakeGame();
    const backend = phaserSoundBackend(f.game);
    const board = new SoundBoard();
    board.attach(backend);
    board.unlock();
    board.setMusic('build');
    expect(f.queued).toEqual(['mus_habitat']);
    f.emit('loaderror', { type: 'audio', key: 'mus_habitat' });
    expect(f.queued).toEqual(['mus_habitat', 'mus_groove']);
    expect(FakeAudio.played).toBe(0);
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
