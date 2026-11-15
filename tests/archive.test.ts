import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAllMonths, MONTHS, monthId, rawFileName } from '../tools/build-archive';
import { validateChapter } from '../src/sim/weather.ts';
import type { Chapter, ChapterDay } from '../src/sim/types.ts';

const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as T;

interface Raw {
  peakTime: string;
  classType: string;
}
const IDS = MONTHS.map(monthId);
const chapters = new Map<string, Chapter>(IDS.map((id) => [id, read<Chapter>(`src/data/chapters/${id}.json`)]));
const raws = new Map<string, Raw[]>(MONTHS.map((m) => [monthId(m), read<Raw[]>(`src/data/raw/${rawFileName(m)}`)]));
const allDays: { id: string; day: ChapterDay }[] = IDS.flatMap((id) => chapters.get(id)!.days.map((day) => ({ id, day })));
const allRaw: Raw[] = [...raws.values()].flat();

// Independent helpers (not imported from the builder).
const rank = (c: string) => 'ABCMX'.indexOf(c[0]) * 1000 + Number(c.slice(1));
const onDate = (date: string) => allRaw.filter((f) => f.peakTime.slice(0, 10) === date);
const dayAfter = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const strongestClass = (date: string): string | null => {
  const list = onDate(date).sort((a, b) => rank(b.classType) - rank(a.classType));
  return list.length ? list[0].classType : null;
};
const levelAfter = (c: string | null): number => {
  if (!c) return 0;
  const n = Number(c.slice(1));
  if (c[0] === 'X') return n >= 5 ? 3 : 2;
  if (c[0] === 'M' && n >= 5) return 1;
  return 0;
};

describe('archive chapters are the output of the builder (SPEC 18.1)', () => {
  const built = buildAllMonths();
  it('builds 36 months', () => expect(built.map((c) => c.id)).toEqual(IDS));
  for (const ch of built) {
    it(`${ch.id} equals the committed JSON`, () => expect(chapters.get(ch.id)).toEqual(ch));
  }
  it('every chapter passes validateChapter', () => {
    for (const ch of chapters.values()) expect(validateChapter(ch)).toEqual([]);
  });
});

describe('raw files', () => {
  it('each has a meta file with sourceUrl, fetchedAt and query', () => {
    for (const m of MONTHS) {
      const file = rawFileName(m).replace(/\.json$/, '.meta.json');
      expect(existsSync(new URL(`../src/data/raw/${file}`, import.meta.url)), file).toBe(true);
      const meta = read<{ sourceUrl: string; fetchedAt: string; query: unknown }>(`src/data/raw/${file}`);
      expect(meta.sourceUrl).toMatch(/^https:\/\/ccmc\.gsfc\.nasa\.gov\/DONKI-API\/get\//);
      expect(meta.fetchedAt).toBeTruthy();
      expect(meta.query).toBeTruthy();
    }
  });
});

describe('flare flag', () => {
  it('follows the SPEC 9.3 rule on every day, from the raw records', () => {
    for (const { id, day } of allDays) {
      const recs = onDate(day.date);
      const strong = recs.filter((f) => f.classType[0] === 'X' || (f.classType[0] === 'M' && Number(f.classType.slice(1)) >= 5));
      const expected = recs.some((f) => f.classType[0] === 'X') ? 'major' : strong.length ? 'strong' : 'none';
      expect(day.flare, `${id} ${day.date}`).toBe(expected);
      expect(day.flares.map((f) => f.peakTime), day.date).toEqual(strong.map((f) => f.peakTime).sort());
      expect(day.flareCount, day.date).toBe(recs.length);
    }
  });
  it('a day whose strongest flare is below M5.0 is never strong or major', () => {
    for (const { day } of allDays) {
      const s = strongestClass(day.date);
      if (s !== null && rank(s) < rank('M5.0')) expect(day.flare, day.date).toBe('none');
    }
  });
  it('2022-01-12 is none', () => {
    expect(allDays.find((x) => x.day.date === '2022-01-12')!.day.flare).toBe('none');
  });
});

describe('storms', () => {
  it('every storm day has a stormSource and calm days have none', () => {
    for (const { day } of allDays) {
      if (day.radiation > 0) expect(['nasa-report', 'game-rule'], day.date).toContain(day.stormSource);
      else expect(day.stormSource, day.date).toBeUndefined();
    }
  });
  it('a game-rule level matches the previous day strongest flare', () => {
    for (const { day } of allDays) {
      if (day.date === '2022-01-01') {
        expect(day.radiation).toBe(0);
        continue;
      }
      if (day.date === '2024-05-20') continue;
      expect(day.radiation, day.date).toBe(levelAfter(strongestClass(dayAfter(day.date, -1))));
      if (day.radiation > 0) expect(day.stormSource, day.date).toBe('game-rule');
    }
  });
  it('2024-05-20 is a NASA-reported level 3', () => {
    const d = allDays.find((x) => x.day.date === '2024-05-20')!.day;
    expect(d.radiation).toBe(3);
    expect(d.stormSource).toBe('nasa-report');
  });
  it('the only nasa-report storm in the archive months is 2024-05-20', () => {
    expect(allDays.filter((x) => x.day.stormSource === 'nasa-report').map((x) => x.day.date)).toEqual(['2024-05-20']);
  });
  it('game storm days carry the game storm note', () => {
    for (const { day } of allDays) {
      if (day.stormSource === 'game-rule') expect(day.notes).toMatch(/^Game storm\./);
    }
  });
});

describe('dates, cards and order', () => {
  it('1,096 unique consecutive dates from 2022-01-01 to 2024-12-31', () => {
    const dates = allDays.map((x) => x.day.date);
    expect(dates.length).toBe(1096);
    expect(new Set(dates).size).toBe(1096);
    expect(dates[0]).toBe('2022-01-01');
    expect(dates[dates.length - 1]).toBe('2024-12-31');
    for (let i = 1; i < dates.length; i++) expect(dates[i]).toBe(dayAfter(dates[i - 1], 1));
  });
  it('cards only on archive-2024-05, on the four may2024 card dates, and all resolve', () => {
    const cards = read<{ id: string; date: string; sourceIds: string[] }[]>('src/data/cards.json');
    const register = read<{ id: string }[]>('src/data/register.json');
    const may = cards.filter((c) => c.id.startsWith('may2024-'));
    expect(may.length).toBe(4);
    const withCard = allDays.filter((x) => x.day.cardId);
    expect(withCard.every((x) => x.id === 'archive-2024-05')).toBe(true);
    expect(withCard.map((x) => `${x.day.date} ${x.day.cardId}`).sort()).toEqual(may.map((c) => `${c.date} ${c.id}`).sort());
    for (const { day } of withCard) {
      const card = cards.find((c) => c.id === day.cardId)!;
      expect(card.date).toBe(day.date);
      for (const s of card.sourceIds) expect(register.some((r) => r.id === s), s).toBe(true);
    }
  });
  it('archive.json has sep2017 first, archive-2024-05 second and every month once', () => {
    const order = read<string[]>('src/data/archive.json');
    expect(order[0]).toBe('sep2017');
    expect(order[1]).toBe('archive-2024-05');
    expect(order.length).toBe(37);
    expect(new Set(order).size).toBe(37);
    expect([...order].sort()).toEqual(['sep2017', ...IDS].sort());
  });
  it('no stretch of more than 31 days without an event in archive order', () => {
    const order = read<string[]>('src/data/archive.json');
    let run = 0;
    let longest = 0;
    for (const id of order) {
      const ch = id === 'sep2017' ? read<Chapter>('src/data/chapters/sep2017.json') : chapters.get(id)!;
      for (const d of ch.days) {
        if (d.flare !== 'none' || d.radiation > 0) run = 0;
        else longest = Math.max(longest, ++run);
      }
    }
    expect(longest).toBeLessThanOrEqual(31);
  });
});
