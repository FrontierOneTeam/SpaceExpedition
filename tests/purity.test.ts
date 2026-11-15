import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SIM = join('src', 'sim');

const FORBIDDEN: [string, RegExp][] = [
  ['phaser import', /from\s+['"]phaser['"]|import\s*\(\s*['"]phaser['"]\s*\)|require\(\s*['"]phaser['"]\s*\)/i],
  ['document', /\bdocument\b/],
  ['window', /\bwindow\b/],
  ['Math.random', /Math\.random/],
  ['Date.now', /Date\.now/],
  ['localStorage', /localStorage/],
  ['new Date()', /new\s+Date\s*\(\s*\)/],
];

describe('purity of src/sim', () => {
  const files = readdirSync(SIM).filter((f) => f.endsWith('.ts'));

  it('has the files of SPEC 3', () => {
    for (const f of ['config.ts', 'types.ts', 'rng.ts', 'terrain.ts', 'power.ts', 'day.ts', 'placement.ts', 'weather.ts', 'goals.ts', 'predict.ts']) {
      expect(files).toContain(f);
    }
  });

  for (const file of readdirSync(SIM).filter((f) => f.endsWith('.ts'))) {
    it(`${file} has no Phaser, DOM, storage, clock or Math.random`, () => {
      const text = readFileSync(join(SIM, file), 'utf8');
      for (const [name, re] of FORBIDDEN) expect(re.test(text), `${file}: ${name}`).toBe(false);
    });
  }
});
