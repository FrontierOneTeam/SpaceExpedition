import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import glossary from '../src/data/glossary.json';
import { gloss, glossSentence, glossText } from '../src/ui/glossary.ts';

/** The approved table of SPEC 8.3, read from SPEC.md itself. */
function approved(): Record<string, string> {
  const spec = readFileSync(new URL('../SPEC.md', import.meta.url), 'utf8');
  const section = spec.split('### 8.3')[1].split('### 8.4')[0];
  const out: Record<string, string> = {};
  for (const line of section.split('\n')) {
    const m = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/.exec(line.trim());
    if (!m || m[1] === 'Word' || m[1].startsWith('-')) continue;
    out[m[1]] = m[2];
  }
  return out;
}

describe('glossary (SPEC 8.3)', () => {
  it('holds exactly the seven approved entries, word for word', () => {
    const table = approved();
    expect(Object.keys(table).length).toBe(7);
    expect(glossary).toEqual(table);
  });

  it('marks glossary words with a dotted-underline control and keeps the text', () => {
    const html = glossText('Sol 9. A solar flare of class X9.3 brought radiation.');
    expect(html).toContain('data-word="sol"');
    expect(html).toContain('data-word="solar flare"');
    expect(html).toContain('data-word="class X"');
    expect(html).toContain('data-word="radiation"');
    expect(html.replace(/<[^>]+>/g, '')).toBe('Sol 9. A solar flare of class X9.3 brought radiation.');
  });

  it('marks only the first use of a word, and never inside other words', () => {
    const html = gloss('radiation and radiation; solar panels; soldiers');
    expect(html.match(/data-word="radiation"/g)!.length).toBe(1);
    expect(html).not.toContain('data-word="sol"');
  });

  it('gives each word its sentence', () => {
    expect(glossSentence('regolith')).toBe('Regolith is the loose soil and broken rock on the ground of Mars and the Moon.');
    expect(glossSentence('nothing')).toBeNull();
  });
});
