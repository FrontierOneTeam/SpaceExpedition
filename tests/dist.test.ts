// Checks on the built game. They run when dist/ holds a build (after `npm run build`), and are
// skipped otherwise. `npm run check:dist` runs the same checks from the command line.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BUDGET_BYTES,
  approvedAudioFiles,
  audioFiles,
  changedPngs,
  firstLoadBytes,
  foreignUrls,
  precacheList,
  serviceWorkerProblems,
} from '../tools/check-dist.ts';

const built = existsSync('dist/sw.js') && existsSync('dist/index.html');

describe.skipIf(!built)('the built game in dist/', () => {
  it('holds only the approved sounds, 3 names in 2 formats', () => {
    expect(approvedAudioFiles()).toHaveLength(6);
    expect(audioFiles()).toEqual(approvedAudioFiles());
  });

  it('has a manifest and a service worker that stays on this site', () => {
    expect(serviceWorkerProblems()).toEqual([]);
    const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
    expect(manifest.name).toBe('Outpost Builder');
    expect(manifest.start_url).toBe('/SpaceExpedition/');
    expect(manifest.scope).toBe('/SpaceExpedition/');
    expect(['fullscreen', 'standalone']).toContain(manifest.display);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('precaches the app, art, fonts and approved audio, and nothing unapproved', () => {
    const urls = precacheList().map((p) => p.url);
    expect(urls).toContain('index.html');
    expect(urls.some((u) => u.startsWith('assets/art/'))).toBe(true);
    expect(urls.some((u) => u.endsWith('.woff2'))).toBe(true);
    const audio = urls.filter((u) => u.startsWith('assets/audio/')).map((u) => u.slice('assets/audio/'.length)).sort();
    expect(audio).toEqual(approvedAudioFiles());
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('asks no other origin for anything at runtime', () => {
    expect(foreignUrls()).toEqual([]);
  });

  it('keeps the first load under 6 MB', () => {
    expect(firstLoadBytes()).toBeLessThan(BUDGET_BYTES);
  });

  it('compressed every PNG without changing its pixels, size or transparency', async () => {
    expect(await changedPngs()).toEqual([]);
  }, 60_000);
});
