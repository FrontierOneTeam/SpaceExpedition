import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import strings from '../src/data/strings.en.json';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('strings', () => {
  const data = strings as Record<string, string>;

  it('has every key used with t()', () => {
    const files = [...sourceFiles('src/ui'), ...sourceFiles('src/game')];
    const used: string[] = [];
    for (const file of files) {
      // t('key') and t('key', { ... }). Keys held in typed maps are checked by TypeScript (StringKey).
      for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*['"]([^'"]+)['"]\s*[,)]/g)) {
        used.push(m[1]);
      }
    }
    expect(used.length).toBeGreaterThan(0);
    for (const key of used) expect(Object.keys(data), key).toContain(key);
  });

  it('has no empty values', () => {
    for (const [key, value] of Object.entries(data)) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('has no TODO(content)', () => {
    for (const [key, value] of Object.entries(data)) {
      expect(value, key).not.toContain('TODO(content)');
    }
  });
});
