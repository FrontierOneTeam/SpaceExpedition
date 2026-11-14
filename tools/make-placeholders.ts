import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ART_MANIFEST } from '../src/game/artManifest';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolsDir, '..');

interface Options {
  artDir: string;
  audioDir: string;
  audioNames?: string[];
}

function exists(path: string): boolean {
  return existsSync(path);
}

function svgFor(file: string, width: number, height: number): string {
  const size = Math.max(10, Math.min(24, Math.floor(width / 10)));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="12" fill="#5a3b6b" stroke="#f2a53a" stroke-width="4"/>` +
    `<text x="${width / 2}" y="${height / 2}" font-family="sans-serif" font-size="${size}" fill="#f4ede7" text-anchor="middle">${file}</text>` +
    `</svg>`
  );
}

// Creates only what is missing. Never overwrites: checks first, then writes with the exclusive 'wx' flag.
export async function makePlaceholders({ artDir, audioDir, audioNames }: Options): Promise<string[]> {
  const created: string[] = [];
  mkdirSync(artDir, { recursive: true });
  mkdirSync(audioDir, { recursive: true });

  for (const { file, width, height } of ART_MANIFEST) {
    const target = join(artDir, file);
    if (exists(target)) continue;
    const png = await sharp(Buffer.from(svgFor(file, width, height))).png().toBuffer();
    writeFileSync(target, png, { flag: 'wx' });
    writeFileSync(target + '.placeholder', '', { flag: 'wx' });
    created.push(file, file + '.placeholder');
  }

  const names =
    audioNames ??
    (JSON.parse(readFileSync(join(root, 'src/data/audio.json'), 'utf8')) as { name: string }[]).map(
      (e) => e.name,
    );
  for (const name of names) {
    for (const ext of ['ogg', 'mp3']) {
      const file = `${name}.${ext}`;
      const target = join(audioDir, file);
      if (exists(target)) continue;
      copyFileSync(join(toolsDir, `placeholder-tone.${ext}`), target, constants.COPYFILE_EXCL);
      writeFileSync(target + '.placeholder', '', { flag: 'wx' });
      created.push(file, file + '.placeholder');
    }
  }
  return created;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const created = await makePlaceholders({
    artDir: join(root, 'public/assets/art'),
    audioDir: join(root, 'public/assets/audio'),
  });
  if (created.length === 0) console.log('Nothing was missing. No files created.');
  else for (const f of created) console.log('Created ' + f);
}
