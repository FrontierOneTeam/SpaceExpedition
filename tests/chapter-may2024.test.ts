import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildChapter, CHAPTERS } from '../tools/build-chapter';

const read = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

const RAW = 'src/data/raw/donki-flr-2024-05-08_2024-05-25.json';
const raw: { peakTime: string; classType: string; activeRegionNum: number | null }[] = read(RAW);
const chapter = read('src/data/chapters/may2024.json');
const cards: { id: string; date: string; text: string; sourceIds: string[] }[] = read('src/data/cards.json');
const register: { id: string }[] = read('src/data/register.json');
const def = CHAPTERS.find((c) => c.id === 'may2024')!;
const byDate = (date: string) => chapter.days.find((d: { date: string }) => d.date === date);

const isX = (c: string) => c.startsWith('X');
const isStrong = (c: string) => isX(c) || (c.startsWith('M') && Number(c.slice(1)) >= 5);

describe('May 2024 raw DONKI file', () => {
  it('is a JSON array with a meta file', () => {
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.length).toBeGreaterThan(0);
    const meta = read('src/data/raw/donki-flr-2024-05-08_2024-05-25.meta.json');
    expect(meta.sourceUrl.startsWith('https://ccmc.gsfc.nasa.gov/DONKI-API/get/')).toBe(true);
    expect(meta.fetchedAt).toBeTruthy();
    expect(meta.query).toBeTruthy();
  });
});

describe('chapter may2024', () => {
  it('has 14 consecutive days from 2024-05-11', () => {
    expect(chapter.id).toBe('may2024');
    expect(chapter.startDate).toBe('2024-05-11');
    expect(chapter.days.map((d: { date: string }) => d.date)).toEqual(
      Array.from({ length: 14 }, (_, i) => `2024-05-${String(11 + i).padStart(2, '0')}`),
    );
  });

  it('sets radiation 3 on 20 May and 0 elsewhere, sunlight 1', () => {
    for (const d of chapter.days) {
      expect(d.radiation).toBe(d.date === '2024-05-20' ? 3 : 0);
      expect(d.sunlight).toBe(1);
    }
  });

  it('matches buildChapter() applied to the committed raw file', () => {
    expect(chapter).toEqual(buildChapter(raw, def));
  });

  it('sets each flare flag and flares list from the raw records', () => {
    for (const d of chapter.days) {
      const strong = raw
        .filter((f) => f.peakTime.slice(0, 10) === d.date && isStrong(f.classType))
        .sort((a, b) => a.peakTime.localeCompare(b.peakTime));
      expect(d.flares).toEqual(strong.map((f) => ({ peakTime: f.peakTime, classType: f.classType })));
      expect(d.flare).toBe(strong.some((f) => isX(f.classType)) ? 'major' : strong.length ? 'strong' : 'none');
    }
  });

  it('gives 20 May no flare and a note', () => {
    const d = byDate('2024-05-20');
    expect(d.flare).toBe('none');
    expect(d.flares).toEqual([]);
    expect(d.notes).toBeTruthy();
  });

  it('setup is supported: X-class flares on several of 8 to 11 May', () => {
    const days = new Set(raw.filter((f) => isX(f.classType) && f.peakTime >= '2024-05-08' && f.peakTime < '2024-05-12').map((f) => f.peakTime.slice(0, 10)));
    expect(days.size).toBeGreaterThanOrEqual(3);
  });

  it('every cardId exists, matches its date, and every source is in the register', () => {
    const ids = new Set(register.map((r) => r.id));
    for (const d of chapter.days) {
      if (!d.cardId) continue;
      const card = cards.find((c) => c.id === d.cardId);
      expect(card, d.cardId).toBeDefined();
      expect(card!.date).toBe(d.date);
      for (const s of card!.sourceIds) expect(ids.has(s), s).toBe(true);
    }
  });

  it('May 2024 cards that cite donki state only facts found in the raw file', () => {
    for (const card of cards.filter((c) => c.id.startsWith('may2024') && c.sourceIds.includes('donki'))) {
      const flares = raw.filter((f) => f.peakTime.startsWith(card.date) && isX(f.classType));
      const classes = [...card.text.matchAll(/class (X\d+\.\d)/g)].map((m) => m[1]);
      const times = [...card.text.matchAll(/(\d\d:\d\d) UTC/g)].map((m) => m[1]);
      const regions = [...card.text.matchAll(/region (\d+)/g)].map((m) => Number(m[1]));
      expect(classes.length, card.id).toBeGreaterThan(0);
      // Every class, time and region named must belong to the same raw record.
      const match = flares.some(
        (f) =>
          classes.every((c) => c === f.classType) &&
          times.every((t) => f.peakTime.slice(11, 16) === t) &&
          regions.every((r) => r === f.activeRegionNum),
      );
      expect(match, card.id).toBe(true);
    }
  });

  it('the X12 class and Curiosity claims are never credited to donki', () => {
    for (const card of cards.filter((c) => c.id.startsWith('may2024') && c.sourceIds.includes('donki'))) {
      expect(card.text).not.toMatch(/X12|Curiosity|MAVEN/);
    }
  });
});
