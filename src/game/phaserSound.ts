// The sound backend over Phaser's sound manager (SPEC 11.3). Every call is guarded: a missing
// or broken sound is silent and never throws.

import type Phaser from 'phaser';
import type { SoundBackend, SoundHandle } from '../ui/sound.ts';

const AUDIO = import.meta.env.BASE_URL + 'assets/audio/';

/** Each sound as .ogg and .mp3: Phaser picks the one the browser can play. */
export function soundUrls(name: string): string[] {
  return [`${AUDIO}${name}.ogg`, `${AUDIO}${name}.mp3`];
}

export function phaserSoundBackend(game: Phaser.Game): SoundBackend {
  return {
    has(name) {
      try {
        return game.cache.audio.exists(name);
      } catch {
        return false;
      }
    },
    play(name, volume, loop, onEnd): SoundHandle | null {
      try {
        if (!game.cache.audio.exists(name)) return null;
        const sound = game.sound.add(name, { volume, loop });
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
        sound.play();
        return {
          setVolume: (v) => {
            try {
              (sound as Phaser.Sound.WebAudioSound).setVolume(v);
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
      } catch {
        return null;
      }
    },
    setMuted(muted) {
      try {
        game.sound.mute = muted;
      } catch {
        // No audio on this device.
      }
    },
  };
}
