import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildChapter } from '../tools/build-chapter';

const read = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

const FIXTURE = 'src/data/raw/donki-flr-2017-09-04_2017-09-11.json';
const SOURCE = 'src/data/raw/donki-flr-2017-09-02_2017-09-15.json';
const DONKI_BASE = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get/';

interface Flare {
  beginTime: string;
  peakTime: string;
  classType: string;
  activeRegionNum: number | null;
}

const fixture: Flare[] = read(FIXTURE);
const chapter = read('src/data/chapters/sep2017.json');

// Rank flares by letter (X > M > C > B) then number.
const rank = (c: string) => 'BCMX'.indexOf(c[0]) * 1000 + Number(c.slice(1));

describe('DONKI fixture (4 to 11 September 2017)', () => {
  it('is an array of 33 records with the expected fields', () => {
    expect(Array.isArray(fixture)).toBe(true);
    expect(fixture).toHaveLength(33);
    for (const f of fixture) {
      expect(f.beginTime).toBeTruthy();
      expect(f.peakTime).toBeTruthy();
      expect(f.classType).toBeTruthy();
      expect(f).toHaveProperty('activeRegionNum');
    }
  });

  it('holds the four X flares from region 12673', () => {
    const x = fixture.filter((f) => f.classType.startsWith('X')).map((f) => [f.peakTime, f.classType, f.activeRegionNum]);
    expect(x).toEqual([
      ['2017-09-06T09:10Z', 'X2.2', 12673],
      ['2017-09-06T12:02Z', 'X9.3', 12673],
      ['2017-09-07T14:36Z', 'X1.3', 12673],
      ['2017-09-10T16:06Z', 'X8.2', 12673],
    ]);
  });

  it('holds 27 M, 1 C and 1 B flares', () => {
    const count = (letter: string) => fixture.filter((f) => f.classType.startsWith(letter)).length;
    expect(count('M')).toBe(27);
    expect(count('C')).toBe(1);
    expect(count('B')).toBe(1);
  });

  it('has the expected strongest flare on each day', () => {
    const strongest = (date: string) => {
      const day = fixture.filter((f) => f.peakTime.startsWith(date));
      return day.reduce((a, b) => (rank(b.classType) > rank(a.classType) ? b : a)).classType;
    };
    expect(strongest('2017-09-04')).toBe('M5.5');
    expect(strongest('2017-09-05')).toBe('M4.2');
    expect(strongest('2017-09-08')).toBe('M8.1');
    expect(strongest('2017-09-09')).toBe('M3.7');
    expect(strongest('2017-09-11')).toBe('B9.8');
  });
});

describe('raw file details', () => {
  it.each([
    ['src/data/raw/donki-flr-2017-09-02_2017-09-15.meta.json'],
    ['src/data/raw/donki-flr-2017-09-04_2017-09-11.meta.json'],
  ])('%s records the source', (path) => {
    const meta = read(path);
    expect(meta.sourceUrl.startsWith(DONKI_BASE)).toBe(true);
    expect(meta.fetchedAt).toBeTruthy();
    expect(meta.query).toBeTruthy();
  });
});

describe('chapter sep2017', () => {
  const dateOf = (d: { date: string }) => d.date;
  const byDate = (date: string) => chapter.days.find((d: { date: string }) => d.date === date);

  it('has 14 consecutive days starting on startDate', () => {
    expect(chapter.days).toHaveLength(14);
    expect(chapter.days[0].date).toBe(chapter.startDate);
    expect(chapter.startDate).toBe('2017-09-02');
    const expected = Array.from({ length: 14 }, (_, i) => `2017-09-${String(2 + i).padStart(2, '0')}`);
    expect(chapter.days.map(dateOf)).toEqual(expected);
  });

  it('sets the flare flag as specified', () => {
    for (const d of ['06', '07', '10']) expect(byDate(`2017-09-${d}`).flare).toBe('major');
    for (const d of ['04', '08']) expect(byDate(`2017-09-${d}`).flare).toBe('strong');
    for (const day of chapter.days) {
      if (!['06', '07', '10', '04', '08'].includes(day.date.slice(8))) expect(day.flare).toBe('none');
    }
  });

  it('sets radiation and sunlight as specified', () => {
    for (const day of chapter.days) {
      const expected = { '2017-09-11': 3, '2017-09-12': 2, '2017-09-13': 1 }[day.date as string] ?? 0;
      expect(day.radiation).toBe(expected);
      expect(day.sunlight).toBe(1);
    }
  });

  it('matches buildChapter() applied to the committed raw file', () => {
    expect(chapter).toEqual(buildChapter(read(SOURCE)));
  });

  it('carries each day\'s flare count and strongest record from the raw file (SPEC 16.4.5)', () => {
    const source: Flare[] = read(SOURCE);
    for (const day of chapter.days) {
      const onDay = source.filter((f) => f.peakTime.slice(0, 10) === day.date);
      expect(day.flareCount, day.date).toBe(onDay.length);
      if (onDay.length === 0) {
        expect(day.strongest, day.date).toBeUndefined();
      } else {
        const best = onDay.reduce((a, b) => (rank(b.classType) > rank(a.classType) ? b : a));
        expect(day.strongest, day.date).toEqual({ peakTime: best.peakTime, classType: best.classType });
      }
    }
    expect(byDate('2017-09-03').flareCount).toBe(0);
    expect(byDate('2017-09-03').strongest).toBeUndefined();
    expect(byDate('2017-09-05').flareCount).toBe(5);
    expect(byDate('2017-09-05').strongest.classType).toBe('M4.2');
    expect(byDate('2017-09-06').strongest).toEqual({ peakTime: '2017-09-06T12:02Z', classType: 'X9.3' });
    expect(byDate('2017-09-11').flareCount).toBe(1);
    expect(byDate('2017-09-11').strongest.classType).toBe('B9.8');
  });

  it('points only at known cards and is listed in the archive', () => {
    const cards: { id: string }[] = read('src/data/cards.json');
    const ids = new Set(cards.map((c) => c.id));
    for (const day of chapter.days) {
      if (day.cardId !== undefined) expect(ids.has(day.cardId)).toBe(true);
    }
    expect(read('src/data/archive.json')).toContain(chapter.id);
  });
});
