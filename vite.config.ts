import { readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { filesToRemove, type AudioEntry } from './tools/approved-audio.ts';

// After the bundle is written, delete every sound that is not approved.
// Only touches dist/, never public/.
function removeUnapprovedAudio(): Plugin {
  return {
    name: 'remove-unapproved-audio',
    apply: 'build',
    closeBundle() {
      const dir = join('dist', 'assets', 'audio');
      if (!existsSync(dir)) return;
      const entries = JSON.parse(readFileSync('src/data/audio.json', 'utf8')) as AudioEntry[];
      for (const file of filesToRemove(entries, readdirSync(dir))) {
        rmSync(join(dir, file), { force: true });
      }
    },
  };
}

export default defineConfig({
  base: '/SpaceExpedition/',
  plugins: [removeUnapprovedAudio()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
