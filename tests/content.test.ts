import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import strings from '../src/data/strings.en.json';
import { CARDS, cardById, cardSources, sourceGroups, usedSources } from '../src/ui/content.ts';
import { sourcesBodyHtml } from '../src/ui/screens.ts';

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
    'src/data/glossary.json',
    'src/data/chapters/sep2017.json',
    'src/data/strings.en.json',
  ])('%s has no TODO(content)', (path) => {
    expect(readText(path)).not.toContain('TODO(content)');
  });
});

describe('every fact on screen traces to the register (SPEC 13.1)', () => {
  const chapter = read('src/data/chapters/sep2017.json') as { days: { date: string; cardId?: string }[] };

  it('each chapter card id names a card with the same date, and each card is used by the chapter', () => {
    const withCards = chapter.days.filter((d) => d.cardId);
    expect(withCards.map((d) => d.date)).toEqual(['2017-09-06', '2017-09-07', '2017-09-10', '2017-09-11', '2017-09-12']);
    for (const d of withCards) {
      const card = cardById(d.cardId!);
      expect(card, d.cardId).not.toBeNull();
      expect(card!.date).toBe(d.date);
    }
    expect(CARDS.map((c) => c.id).sort()).toEqual(withCards.map((d) => d.cardId).sort());
  });

  it('every card resolves to used register rows, so it can be shown with its sources', () => {
    for (const card of CARDS) {
      const rows = cardSources(card);
      expect(rows, card.id).not.toBeNull();
      expect(rows!.map((r) => r.id)).toEqual(card.sourceIds);
    }
  });

  it('the sources screen shows only used rows, in the two groups', () => {
    const { listed, additional } = sourceGroups();
    const shown = [...listed, ...additional];
    expect(shown.length).toBe(usedSources().length);
    for (const row of shown) {
      expect(register.find((r) => r.id === row.id)?.status).toBe('used');
    }
    expect(listed.every((r) => r.group === 'listed')).toBe(true);
    expect(additional.every((r) => r.group === 'additional')).toBe(true);
    const html = sourcesBodyHtml();
    for (const row of register.filter((r) => r.status !== 'used')) expect(html).not.toContain(row.url);
    for (const m of html.matchAll(/<a [^>]*>/g)) {
      expect(m[0]).toContain('target="_blank"');
      expect(m[0]).toContain('rel="noopener noreferrer"');
    }
  });

  it('never says or implies "live" (SPEC 9.1)', () => {
    for (const [key, value] of Object.entries(strings as Record<string, string>)) {
      expect(/\blive\b/i.test(value), key).toBe(false);
    }
  });
});
