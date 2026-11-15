// The sound backend over Phaser's sound manager (SPEC 11.3). Every call is guarded: a missing
// or broken sound is silent and never throws. Includes WebAudio unlock sync, music gain
// compensation for softly mastered loops, and an HTML5 <audio> fallback.

import type Phaser from 'phaser';
import type { SoundBackend, SoundHandle } from '../ui/sound.ts';

const AUDIO = import.meta.env.BASE_URL + 'assets/audio/';

/** Each sound as .ogg and .mp3: Phaser picks the one the browser can play. */
export function soundUrls(name: string): string[] {
  return [`${AUDIO}${name}.ogg`, `${AUDIO}${name}.mp3`];
}

/** Boost softly mastered music loops at hardware output without changing simulation config numbers. */
function outputVolume(name: string, volume: number): number {
  const scaled = name === 'mus_calm_loop' || name === 'mus_report' ? volume * 1.65 : volume;
  return Math.max(0, Math.min(1, scaled));
}

/** The map scene's loader, which also loads the sounds. Null until the scene exists. */
function loaderOf(game: Phaser.Game): Phaser.Loader.LoaderPlugin | null {
  try {
    return game.scene.getScenes(false)[0]?.load ?? null;
  } catch {
    return null;
  }
}

export function phaserSoundBackend(game: Phaser.Game): SoundBackend {
  // Sounds whose file failed to load, so the game can fall back to another (SPEC 16.4 point 7).
  const failed = new Set<string>();
  const listeners: ((name: string) => void)[] = [];
  const htmlReady = new Set<string>();
  const htmlProbing = new Set<string>();
  const readyListeners: (() => void)[] = [];
  const activeHtml = new Map<HTMLAudioElement, { name: string; volume: number; loop: boolean; startAt: number; stopped: boolean }>();
  let isMuted = false;

  const unlockPhaser = (): void => {
    try {
      const mgr = game.sound as Phaser.Sound.WebAudioSoundManager & { locked?: boolean; unlocked?: boolean };
      const ctx = mgr.context;
      if (ctx && ctx.state === 'running' && mgr.locked) {
        mgr.unlocked = true;
        mgr.locked = false;
        mgr.emit?.('unlocked', mgr);
      }
    } catch {
      // No WebAudio manager.
    }
  };

  const retryBlockedHtml = (): void => {
    for (const [el, meta] of activeHtml) {
      if (!meta.stopped && el.paused && !isMuted) {
        void el.play().catch(() => undefined);
      }
    }
  };

  const resumeContext = (): void => {
    try {
      game.sound.pauseOnBlur = false;
      const ctx = (game.sound as Phaser.Sound.WebAudioSoundManager).context;
      if (ctx) {
        if (ctx.state === 'suspended') {
          void ctx.resume().then(() => {
            unlockPhaser();
          }).catch(() => undefined);
        } else if (ctx.state === 'running') {
          unlockPhaser();
        }
      }
    } catch {
      // No WebAudio context.
    }
    retryBlockedHtml();
  };

  resumeContext();
  if (typeof window !== 'undefined') {
    for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'touchstart'] as const) {
      window.addEventListener(ev, resumeContext, { passive: true });
    }
    try {
      game.events.once('destroy', () => {
        for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'touchstart'] as const) {
          window.removeEventListener(ev, resumeContext);
        }
        for (const [el, meta] of activeHtml) {
          meta.stopped = true;
          try {
            el.pause();
            el.src = '';
          } catch {
            // Ignore cleanup errors.
          }
        }
        activeHtml.clear();
      });
    } catch {
      // Fake game in unit tests may lack events.
    }
  }

  try {
    loaderOf(game)?.on('loaderror', (file: Phaser.Loader.File) => {
      if (file.type !== 'audio') return;
      failed.add(file.key);
      probeHtml(file.key);
      for (const cb of listeners) {
        try {
          cb(file.key);
        } catch {
          // A broken listener never stops the loader.
        }
      }
    });
  } catch {
    // No loader: nothing can fail to load.
  }

  // The <audio> fallback is used only for a sound Phaser could not load, and only once the browser
  // has read the file's header. Before that `has` stays false, so the board never starts a track
  // through <audio> in place of the Web Audio one (a bare play() is refused outside a tap on iPad
  // and Safari, and it was the reason the music stayed silent while wind and effects played).
  const probeHtml = (name: string): void => {
    if (typeof Audio === 'undefined' || htmlReady.has(name) || htmlProbing.has(name)) return;
    htmlProbing.add(name);
    try {
      const probe = new Audio(`${AUDIO}${name}.mp3`);
      probe.preload = 'metadata';
      probe.addEventListener('loadedmetadata', () => {
        htmlProbing.delete(name);
        htmlReady.add(name);
        for (const cb of readyListeners) {
          try {
            cb();
          } catch {
            // A broken listener never stops the others.
          }
        }
      }, { once: true });
      probe.addEventListener('error', () => {
        htmlProbing.delete(name);
      }, { once: true });
    } catch {
      htmlProbing.delete(name);
    }
  };

  const playHtml = (name: string, volume: number, loop: boolean, onEnd: () => void, startAt: number): SoundHandle | null => {
    if (typeof Audio === 'undefined') return null;
    try {
      const el = new Audio(`${AUDIO}${name}.mp3`);
      const meta = { name, volume, loop, startAt, stopped: false };
      activeHtml.set(el, meta);
      el.muted = isMuted;
      el.volume = outputVolume(name, volume);
      const seekStart = (): void => {
        if (meta.startAt > 0 && Number.isFinite(el.duration) && el.duration > meta.startAt) {
          try {
            el.currentTime = meta.startAt;
          } catch {
            // Seek ignored until metadata ready.
          }
        }
      };
      if (meta.startAt > 0) {
        el.addEventListener('loadedmetadata', seekStart, { once: true });
      }
      el.addEventListener('ended', () => {
        if (meta.stopped) return;
        if (meta.loop) {
          el.currentTime = meta.startAt > 0 && Number.isFinite(el.duration) && el.duration > meta.startAt ? meta.startAt : 0;
          void el.play().catch(() => undefined);
        } else {
          activeHtml.delete(el);
          onEnd();
        }
      });
      void el.play().catch(() => {
        if (!meta.loop && !meta.stopped) {
          meta.stopped = true;
          activeHtml.delete(el);
          onEnd();
        }
      });
      return {
        setVolume: (v) => {
          meta.volume = v;
          try {
            el.volume = outputVolume(name, v);
          } catch {
            // Ignore.
          }
        },
        stop: () => {
          meta.stopped = true;
          activeHtml.delete(el);
          try {
            el.pause();
            el.src = '';
          } catch {
            // Ignore.
          }
        },
      };
    } catch {
      return null;
    }
  };

  return {
    load(names) {
      try {
        const loader = loaderOf(game);
        if (!loader) return;
        for (const name of names) if (!game.cache.audio.exists(name)) loader.audio(name, soundUrls(name));
        if (loader.isReady()) loader.start();
        else {
          (loader as unknown as { checkLoadQueue?: () => void }).checkLoadQueue?.();
          loader.once('complete', () => {
            for (const name of names) if (!game.cache.audio.exists(name) && !failed.has(name)) loader.audio(name, soundUrls(name));
            if (loader.isReady() && loader.list.size > 0) loader.start();
          });
        }
      } catch {
        // Nothing more to load.
      }
    },
    onLoadFailed(cb) {
      listeners.push(cb);
      for (const name of failed) cb(name);
    },
    onFallbackReady(cb) {
      readyListeners.push(cb);
    },
    has(name) {
      try {
        return game.cache.audio.exists(name) || htmlReady.has(name);
      } catch {
        return htmlReady.has(name);
      }
    },
    play(name, volume, loop, onEnd, startAt = 0): SoundHandle | null {
      resumeContext();
      try {
        if (game.cache.audio.exists(name)) {
          const scaled = outputVolume(name, volume);
          const sound = game.sound.add(name, { volume: scaled, loop });
          if (!loop) {
            sound.once('complete', () => {
              try {
                sound.destroy();
              } catch {
                // Already gone.
              }
              onEnd();
            });
          }
          // While the browser still holds audio back, Phaser queues the play and starts it on unlock.
          // A marker starts `startAt` seconds in and, with loop, loops from there (never from 0).
          const total = (sound as Phaser.Sound.WebAudioSound).totalDuration;
          let started = false;
          if (startAt > 0 && total > startAt) {
            sound.addMarker({ name: 'start', start: startAt, duration: total - startAt, config: { volume: scaled, loop } });
            started = sound.play('start');
          } else {
            started = sound.play();
          }
          const locked = Boolean((game.sound as Phaser.Sound.WebAudioSoundManager & { locked?: boolean }).locked);
          if (started || locked) {
            return {
              setVolume: (v) => {
                try {
                  (sound as Phaser.Sound.WebAudioSound).setVolume(outputVolume(name, v));
                } catch {
                  // The sound was destroyed with the map.
                }
              },
              stop: () => {
                try {
                  sound.stop();
                  sound.destroy();
                } catch {
                  // The sound was destroyed with the map.
                }
              },
            };
          }
          try {
            sound.destroy();
          } catch {
            // Ignore.
          }
        }
      } catch {
        // Fall through to HTML5 <audio> fallback.
      }
      // <audio> only for a sound whose Phaser load failed and whose mp3 was read (see probeHtml).
      if (!htmlReady.has(name)) return null;
      return playHtml(name, volume, loop, onEnd, startAt);
    },
    setMuted(muted) {
      isMuted = muted;
      try {
        game.sound.mute = muted;
      } catch {
        // No audio on this device.
      }
      for (const [el, meta] of activeHtml) {
        try {
          el.muted = muted;
          if (!muted && el.paused && !meta.stopped) void el.play().catch(() => undefined);
        } catch {
          // Ignore.
        }
      }
    },
  };
}
