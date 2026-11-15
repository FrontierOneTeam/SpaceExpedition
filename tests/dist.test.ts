// Checks on the built game. They run when dist/ holds a build (after `npm run build`), and are
// skipped otherwise. `npm run check:dist` runs the same checks from the command line.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BUDGET_BYTES,
  NEVER_SHIPPED,
  approvedAudioFiles,
  audioFiles,
  changedPngs,
  firstLoadBytes,
  foreignUrls,
  precacheList,
  startAudioBytes,
  serviceWorkerProblems,
} from '../tools/check-dist.ts';

const built = existsSync('dist/sw.js') && existsSync('dist/index.html');

describe.skipIf(!built)('the built game in dist/', () => {
  it('holds every approved sound file that is present, and never one of the nine', () => {
    expect(approvedAudioFiles().length).toBeGreaterThan(40);
    expect(audioFiles()).toEqual(approvedAudioFiles());
    for (const name of NEVER_SHIPPED) expect(audioFiles().some((f) => f.startsWith(`${name}.`)), name).toBe(false);
    expect(audioFiles()).toContain('amb_mars_wind_real.ogg');
    expect(audioFiles()).toContain('amb_mars_wind_real.mp3');
    expect(audioFiles().some((f) => f.startsWith('mus_storm_intense'))).toBe(false);
  });

  it('has a manifest and a service worker that stays on this site', () => {
    expect(serviceWorkerProblems()).toEqual([]);
    const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
    expect(manifest.name).toBe('Spacekeepers');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(['fullscreen', 'standalone']).toContain(manifest.display);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('precaches the app, art and fonts, and no sounds (they are cached when played)', () => {
    const urls = precacheList().map((p) => p.url);
    expect(urls).toContain('index.html');
    expect(urls.some((u) => u.startsWith('assets/art/'))).toBe(true);
    expect(urls.some((u) => u.endsWith('.woff2'))).toBe(true);
    expect(urls.filter((u) => u.startsWith('assets/audio/'))).toEqual([]);
    const sw = readFileSync('dist/sw.js', 'utf8') + readdirSync('dist').filter((f) => /^workbox-.*.js$/.test(f)).map((f) => readFileSync(`dist/${f}`, 'utf8')).join('');
    expect(sw).toContain('outpost-audio');
    expect(sw).toContain('CacheFirst');
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('asks no other origin for anything at runtime', () => {
    expect(foreignUrls()).toEqual([]);
  });

  it('keeps the first load, with the sounds loaded before the first tap, under 6 MB', () => {
    expect(startAudioBytes('mp3')).toBeGreaterThan(0);
    expect(firstLoadBytes()).toBeLessThan(BUDGET_BYTES);
  });

  it('compressed every PNG without changing its pixels, size or transparency', async () => {
    expect(await changedPngs()).toEqual([]);
  }, 60_000);
});
