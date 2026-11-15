// Make the home-screen icons (SPEC 2, phase 4) from public/assets/art/logo.png.
// Writes only into public/icons/. Never changes anything under public/assets/.
// Run: npm run icons
//
// The delivered logo is 192 x 192, so the 512 px icons are scaled up from it and look soft.
// A larger logo from the art team can replace logo.png and this script makes sharper icons.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SOURCE = join('public', 'assets', 'art', 'logo.png');
const OUT = join('public', 'icons');
/** SPEC 10 page colour, behind the maskable icon. */
const BACKGROUND = '#15101a';
/** A maskable icon keeps its picture inside the middle 80% (the safe zone). */
const MASKABLE_SHARE = 0.8;

async function plain(size: number, name: string): Promise<void> {
  await sharp(SOURCE).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(join(OUT, name));
}

async function onBackground(size: number, share: number, name: string): Promise<void> {
  const inner = Math.round(size * share);
  const logo = await sharp(SOURCE).resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: logo, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, name));
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await plain(192, 'icon-192.png');
  await plain(512, 'icon-512.png');
  await onBackground(512, MASKABLE_SHARE, 'icon-maskable-512.png');
  // iOS home screen: no transparency, so the logo sits on the page colour.
  await onBackground(180, 0.9, 'apple-touch-icon.png');
  console.log(`Icons written to ${OUT}`);
}

void main();
