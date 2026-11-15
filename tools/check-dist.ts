// Check the built game in dist/ (phase 4). Run after `npm run build`: npm run check:dist
//
// - dist/assets/audio holds every approved sound whose file is in public/, as .ogg and .mp3, and
//   never one of the nine sounds that stay unapproved (SPEC 16.1, 16.4);
// - the five music tracks are in dist in both formats, the two first-version tracks are not, and no
//   music is part of the first visit's download (each track is fetched when first needed);
// - the service worker does not precache sounds (they are cached when played);
// - a web app manifest and a service worker exist, and the service worker precaches only files
//   of this site (no other origin);
// - no built file asks another origin for anything at runtime;
// - every PNG in dist has the same pixels, size and transparency as its source in public/;
// - the first-visit download (precache plus the sounds loaded before the first tap, in the larger
//   of the two formats) stays inside the 6 MB budget (SPEC 2).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { approvedSounds, type AudioEntry } from '../src/ui/sound.ts';

export const DIST = 'dist';
export const BUDGET_BYTES = 6 * 1024 * 1024;

/** Never loaded and never in dist: their files are not in the repository (SPEC 16.1). */
export const NEVER_SHIPPED = [
  'amb_moon_base',
  'ui_open_panel',
  'bld_power_up',
  'bld_repaired',
  'evt_storm_warning',
  'evt_rocket_land',
  'evt_survey_expand',
  'prd_question',
  'astro_dance',
] as const;

/** The five music tracks: each is in dist as .ogg and .mp3, and none is loaded before the first tap. */
export const MUSIC_TRACKS = ['mus_habitat', 'mus_groove', 'mus_drone', 'mus_theme', 'mus_storm'] as const;

/** The first-version music, replaced by the five above: never loaded and never shipped. */
export const RETIRED_MUSIC = ['mus_calm_loop', 'mus_report', 'mus_storm_intense'] as const;

/**
 * URLs that may appear in built files because nothing ever requests them:
 * SVG and XHTML namespace names; Phaser's banner and default game URL (text only);
 * a Workbox console warning. Links the player can tap come from src/data and are added below.
 */
const INERT_URLS = ['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xhtml', 'https://phaser.io', 'https://phaser.io/', 'https://bit.ly/wb-precache'];

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** Every http(s) URL written in a src/data JSON file: links the player can tap, never fetched. */
export function dataLinks(): Set<string> {
  const out = new Set<string>();
  for (const file of files(join('src', 'data')).filter((f) => f.endsWith('.json'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/https?:\/\/[^"\s]+/g)) out.add(m[0]);
  }
  return out;
}

const TEXT = /\.(js|css|html|webmanifest|json|svg|txt)$/;

/** URLs to other origins in built text files that are neither player links nor inert names. */
export function foreignUrls(dist = DIST): { file: string; url: string }[] {
  const allowed = new Set([...INERT_URLS, ...dataLinks()]);
  const out: { file: string; url: string }[] = [];
  for (const file of files(dist).filter((f) => TEXT.test(f))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^"'`\s)<>\\]*/gi)) {
      const url = m[0];
      if (!/^https?:/i.test(url)) {
        // A protocol-relative URL ("//host/...") would also reach another origin.
        if (url.startsWith('//')) out.push({ file, url });
        continue;
      }
      if (!allowed.has(url)) out.push({ file, url });
    }
  }
  return out;
}

/** Player links may only be followed by a tap: they must never sit in a fetch, import or precache. */
export function serviceWorkerProblems(dist = DIST): string[] {
  const problems: string[] = [];
  const sw = join(dist, 'sw.js');
  if (!existsSync(join(dist, 'manifest.webmanifest'))) problems.push('no manifest.webmanifest');
  if (!existsSync(sw)) return [...problems, 'no sw.js'];
  const text = readFileSync(sw, 'utf8');
  if (/https?:\/\//.test(text)) problems.push('sw.js names another origin');
  for (const m of text.matchAll(/importScripts\(([^)]*)\)/g)) if (/\/\//.test(m[1])) problems.push(`sw.js imports from another origin: ${m[1]}`);
  for (const m of text.matchAll(/url:"([^"]+)"/g)) if (/^(https?:)?\/\//.test(m[1])) problems.push(`precache entry on another origin: ${m[1]}`);
  return problems;
}

/** The files the service worker precaches, with their sizes. */
export function precacheList(dist = DIST): { url: string; bytes: number }[] {
  const sw = join(dist, 'sw.js');
  if (!existsSync(sw)) return [];
  const text = readFileSync(sw, 'utf8');
  return [...text.matchAll(/url:"([^"]+)"/g)].map((m) => {
    const path = join(dist, m[1]);
    return { url: m[1], bytes: existsSync(path) ? statSync(path).size : 0 };
  });
}

export function audioFiles(dist = DIST): string[] {
  const dir = join(dist, 'assets', 'audio');
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

function audioEntries(): AudioEntry[] {
  return JSON.parse(readFileSync(join('src', 'data', 'audio.json'), 'utf8')) as AudioEntry[];
}

/** Every approved sound file that exists in public/assets/audio: what dist must hold. */
export function approvedAudioFiles(): string[] {
  const source = join('public', 'assets', 'audio');
  return audioEntries()
    .filter((e) => e.approved)
    .flatMap((e) => [`${e.name}.mp3`, `${e.name}.ogg`])
    .filter((f) => existsSync(join(source, f)))
    .sort();
}

/** What one browser downloads before the first tap: the sounds the map loads at the start, in one format. */
export function startAudioBytes(format: 'ogg' | 'mp3', dist = DIST): number {
  return approvedSounds(audioEntries()).reduce((n, name) => {
    const path = join(dist, 'assets', 'audio', `${name}.${format}`);
    return n + (existsSync(path) ? statSync(path).size : 0);
  }, 0);
}

/** Music, loaded after the first tap, in one format. */
export function musicBytes(format: 'ogg' | 'mp3', dist = DIST): number {
  const start = new Set(approvedSounds(audioEntries()));
  return audioEntries()
    .filter((e) => e.approved && e.name.startsWith('mus_') && !start.has(e.name))
    .reduce((n, e) => n + (existsSync(join(dist, 'assets', 'audio', `${e.name}.${format}`)) ? statSync(join(dist, 'assets', 'audio', `${e.name}.${format}`)).size : 0), 0);
}

/** PNGs whose pixels, size or transparency differ from the source in public/. */
export async function changedPngs(dist = DIST): Promise<string[]> {
  const out: string[] = [];
  for (const built of files(dist).filter((f) => f.toLowerCase().endsWith('.png'))) {
    const source = join('public', relative(dist, built));
    if (!existsSync(source)) continue;
    const [a, b] = await Promise.all([source, built].map((f) => sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    const [ma, mb] = await Promise.all([source, built].map((f) => sharp(f).metadata()));
    const same = a.info.width === b.info.width && a.info.height === b.info.height && ma.hasAlpha === mb.hasAlpha && a.data.equals(b.data);
    if (!same) out.push(built);
  }
  return out;
}

/**
 * What one first visit downloads before the first tap: the precache, the service worker files and
 * manifest, and the sounds the map loads at the start. A browser fetches one format of each
 * sound, so the larger of the two formats is counted.
 */
export function firstLoadBytes(dist = DIST): number {
  const extra = files(dist).filter((f) => /(^|[\\/])(sw\.js|workbox-[^\\/]+\.js|manifest\.webmanifest)$/.test(f));
  const pre = precacheList(dist).reduce((n, p) => n + p.bytes, 0);
  const audio = Math.max(startAudioBytes('ogg', dist), startAudioBytes('mp3', dist));
  return pre + audio + extra.reduce((n, f) => n + statSync(f).size, 0);
}

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;

async function main(): Promise<void> {
  if (!existsSync(DIST)) {
    console.error('No dist/ folder. Run npm run build first.');
    process.exit(1);
  }
  const problems: string[] = [];
  const audio = audioFiles();
  const want = approvedAudioFiles();
  if (JSON.stringify(audio) !== JSON.stringify(want)) problems.push(`audio in dist: ${audio.join(', ')}; expected ${want.join(', ')}`);
  for (const name of [...NEVER_SHIPPED, ...RETIRED_MUSIC]) if (audio.some((f) => f.startsWith(`${name}.`))) problems.push(`${name} must not be in dist`);
  for (const name of MUSIC_TRACKS) for (const ext of ['ogg', 'mp3']) if (!audio.includes(`${name}.${ext}`)) problems.push(`${name}.${ext} must be in dist`);
  if (approvedSounds(audioEntries()).some((n) => n.startsWith('mus_'))) problems.push('music is loaded before the first tap');
  for (const u of precacheList()) if (u.url.startsWith('assets/audio/')) problems.push(`sound precached: ${u.url}`);
  problems.push(...serviceWorkerProblems());
  for (const f of foreignUrls()) problems.push(`other origin in ${f.file}: ${f.url}`);
  for (const f of await changedPngs()) problems.push(`PNG pixels changed: ${f}`);
  const pre = precacheList();
  const preBytes = pre.reduce((n, p) => n + p.bytes, 0);
  const first = firstLoadBytes();
  if (first > BUDGET_BYTES) problems.push(`first load ${kb(first)} is over the 6 MB budget`);
  console.log(`Audio in dist: ${audio.length} files`);
  console.log(`Sounds loaded before the first tap (no music): ogg ${kb(startAudioBytes('ogg'))}, mp3 ${kb(startAudioBytes('mp3'))}; music, each track fetched when first needed: ogg ${kb(musicBytes('ogg'))}, mp3 ${kb(musicBytes('mp3'))}`);
  console.log(`Precache: ${pre.length} files, ${kb(preBytes)}`);
  console.log(`First visit downloads: ${kb(first)} (budget ${kb(BUDGET_BYTES)})`);
  if (problems.length > 0) {
    for (const p of problems) console.error(`PROBLEM: ${p}`);
    process.exit(1);
  }
  console.log('dist check passed.');
}

if (process.argv[1] && /check-dist/.test(process.argv[1])) void main();
