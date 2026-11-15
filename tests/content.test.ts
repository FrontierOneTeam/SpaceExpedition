import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readText = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const read = (path: string) => JSON.parse(readText(path));

interface Card {
  id: string;
  text: string;
  sourceIds: string[];
}
interface Row {
  id: string;
  name: string;
  url: string;
  group: string;
  kind: string;
  usedFor: string;
  status: string;
}

const cards: Card[] = read('src/data/cards.json');
const register: Row[] = read('src/data/register.json');

describe('cards', () => {
  it('each card has text and sources that resolve to the register', () => {
    const ids = new Set(register.map((r) => r.id));
    for (const card of cards) {
      expect(card.text.trim()).not.toBe('');
      expect(card.sourceIds.length).toBeGreaterThan(0);
      for (const id of card.sourceIds) expect(ids.has(id)).toBe(true);
    }
  });
});

describe('register', () => {
  it('each row is complete and uses allowed values', () => {
    for (const row of register) {
      expect(row.name.trim()).not.toBe('');
      expect(row.usedFor.trim()).not.toBe('');
      expect(row.url).toMatch(/^https?:\/\//);
      expect(['listed', 'additional']).toContain(row.group);
      expect(['data', 'image', 'sound', 'reading']).toContain(row.kind);
      expect(['used', 'planned', 'not used']).toContain(row.status);
    }
  });
});

describe('content files', () => {
  it.each([
    'src/data/cards.json',
    'src/data/register.json',
    'src/data/chapters/sep2017.json',
    'src/data/strings.en.json',
  ])('%s has no TODO(content)', (path) => {
    expect(readText(path)).not.toContain('TODO(content)');
  });
});
