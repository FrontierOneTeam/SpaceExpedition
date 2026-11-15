import { readdirSync, readFileSync, rmSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { filesToRemove, type AudioEntry } from './tools/approved-audio.ts';

const BASE = '/SpaceExpedition/';

function approvedNames(): string[] {
  const entries = JSON.parse(readFileSync('src/data/audio.json', 'utf8')) as AudioEntry[];
  return entries.filter((e) => e.approved).map((e) => e.name);
}

function pngsUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pngsUnder(path);
    return name.toLowerCase().endsWith('.png') ? [path] : [];
  });
}

/**
 * After the bundle is written, and before the service worker lists the files:
 * 1. delete every sound that is not approved (SPEC 11.3);
 * 2. compress every PNG (SPEC 11.1), losslessly, keeping transparency and pixel size.
 * Only touches dist/, never public/.
 */
function finishDist(): Plugin {
  return {
    name: 'outpost-finish-dist',
    apply: 'build',
    closeBundle: {
      // Sequential and first, so vite-plugin-pwa (which also runs here) sees the final files.
      sequential: true,
      order: 'pre',
      async handler() {
        const audio = join('dist', 'assets', 'audio');
        if (existsSync(audio)) {
          const entries = JSON.parse(readFileSync('src/data/audio.json', 'utf8')) as AudioEntry[];
          for (const file of filesToRemove(entries, readdirSync(audio))) rmSync(join(audio, file), { force: true });
        }
        let before = 0;
        let after = 0;
        for (const file of pngsUnder('dist')) {
          const input = readFileSync(file);
          const output = await sharp(input).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
          before += input.length;
          // Lossless: same pixels and size (palette: false; sharp's `effort` or `quality` would quantise).
          // Keep the original when it is already smaller. tools/check-dist.ts checks the pixels.
          if (output.length < input.length) {
            writeFileSync(file, output);
            after += output.length;
          } else after += input.length;
        }
        console.log(`PNG compression in dist: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
      },
    },
  };
}

const approved = approvedNames();

export default defineConfig({
  base: BASE,
  plugins: [
    finishDist(),
    VitePWA({
      registerType: 'autoUpdate',
      // main.ts registers the service worker itself, so a new version reloads only when it cannot interrupt play.
      injectRegister: false,
      // The manifest icons are precached by the plugin itself; this adds the iOS one.
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Outpost Builder',
        short_name: 'Outpost',
        description: 'Grow your outpost. Keep your crew supplied. Get ready for what comes next.',
        lang: 'en',
        start_url: BASE,
        scope: BASE,
        display: 'fullscreen',
        orientation: 'any',
        // SPEC 10: page colour and panel colour.
        background_color: '#15101a',
        theme_color: '#15101a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app, the art, the bundled fonts (woff2 only) and the approved sounds. Nothing else.
        globPatterns: [
          '**/*.{js,css,html}',
          'assets/**/*.woff2',
          'assets/art/*.png',
          ...(approved.length > 0 ? [`assets/audio/{${approved.join(',')}}.{ogg,mp3}`] : []),
        ],
        globIgnores: ['**/node_modules/**', 'assets/art/sprite_layouts.txt'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Same-origin files only: no runtime caching rules, no requests to any other origin.
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
