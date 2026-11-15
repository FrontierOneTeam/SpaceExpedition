import { describe, expect, it } from 'vitest';
import { canEndDay, endDay, keepBuilding, newRun } from '../src/sim/day.ts';
import { forecast } from '../src/sim/weather.ts';
import type { ChapterBook, Run, SimEvent } from '../src/sim/types.ts';
import { book, scriptedDay, sep2017, testChapter } from './helpers.ts';

function playChapter(r: Run, b: ChapterBook = book): void {
  while (!r.pendingReport && !r.state.lost) scriptedDay(r, b);
}

function stormEvents(r: Run, replay: number) {
  return r.state.log
    .filter((d) => d.replay === replay)
    .map((d) => [d.chapterDay, d.date, d.events.flatMap((e: SimEvent) => (e.type === 'storm' ? [e.level] : []))]);
}

describe('chapter end and Keep building (SPEC 4.7, 9.6)', () => {
  it('sets pendingReport on the last day and then refuses to run a day', () => {
    const r = newRun(9, book);
    r.state.air = 30;
    r.state.food = 30;
    playChapter(r);
    expect(r.state.lost).toBeNull();
    expect(r.pendingReport).toBe(true);
    expect(r.state.day).toBe(15);
    expect(r.state.log.at(-1)?.events.at(-1)).toEqual({ type: 'chapter_end', chapterId: 'sep2017', replay: 1 });
    expect(canEndDay(r, book)).toBe(false);
    const before = JSON.stringify(r);
    expect(endDay(r, book)).toEqual({ ran: false, events: [] });
    expect(endDay(r, book).ran).toBe(false);
    expect(JSON.stringify(r)).toBe(before);
  });

  it('keeps the base, crew, stocks, goals and land; state.day keeps counting; chapterDay resets', () => {
    const r = newRun(9, book);
    r.state.air = 30;
    r.state.food = 30;
    playChapter(r);
    const before = JSON.parse(JSON.stringify(r.state));
    expect(keepBuilding(r, book)).toBe(true);
    expect(r.chapterId).toBe('sep2017');
    expect(r.replay).toBe(2);
    expect(r.chapterDay).toBe(1);
    expect(r.pendingReport).toBe(false);
    // Nothing in the base changed: no free day and no parts.
    // Nothing in the base changed except the new chapter-start snapshot.
    expect({ ...r.state, chapterStart: null }).toEqual({ ...before, chapterStart: null });
    expect(r.state.chapterStart).toEqual({
      sol: 15,
      crew: r.state.crew,
      buildings: r.state.buildings.length,
      shelters: r.state.shelters.length,
      goalsCompleted: r.state.goals.starterDone + r.state.goals.repeatingDone,
      revealedSize: 6 + 2 * r.state.ring,
      predictions: r.state.predictions,
    });
    expect(before.chapterStart).toMatchObject({ sol: 1, crew: 2, buildings: 5, shelters: 0, goalsCompleted: 0, revealedSize: 6 });
    expect(keepBuilding(r, book)).toBe(false); // only once per report

    endDay(r, book);
    expect(r.state.log.at(-1)).toMatchObject({ sol: 15, chapterDay: 1, replay: 2, date: '2017-09-02' });
    expect(r.state.day).toBe(16);
    expect(r.chapterDay).toBe(2);
  });

  it('a replay has the same dates and events as the first play', () => {
    const r = newRun(9, book);
    r.state.air = 30;
    r.state.food = 30;
    playChapter(r);
    keepBuilding(r, book);
    r.state.air = 30;
    r.state.food = 30;
    playChapter(r);
    expect(r.state.lost).toBeNull();
    expect(stormEvents(r, 2)).toEqual(stormEvents(r, 1));
    for (let d = 1; d <= 14; d++) expect(forecast(sep2017, d)).toEqual(forecast(sep2017, d));
    expect(r.state.log.filter((d) => d.replay === 2).map((d) => d.date)).toEqual(sep2017.days.map((d) => d.date));
  });

  it('moves through the archive in order, then back to the first with replay + 1', () => {
    const a = testChapter([0, 0], 'a');
    const b2 = testChapter([0, 0, 0], 'b');
    const twoBook: ChapterBook = { archive: ['a', 'b'], chapters: { a, b: b2 } };
    const r = newRun(1, twoBook);
    expect(r.chapterId).toBe('a');
    endDay(r, twoBook);
    endDay(r, twoBook);
    expect(r.pendingReport).toBe(true);
    keepBuilding(r, twoBook);
    expect([r.chapterId, r.replay, r.chapterDay, r.state.day]).toEqual(['b', 1, 1, 3]);
    endDays(r, twoBook, 3);
    keepBuilding(r, twoBook);
    expect([r.chapterId, r.replay, r.chapterDay, r.state.day]).toEqual(['a', 2, 1, 6]);
  });

  it('a chapter id missing from the archive counts as the last chapter', () => {
    const a = testChapter([0], 'a');
    const old = testChapter([0], 'old');
    const b: ChapterBook = { archive: ['a'], chapters: { a, old } };
    const r = newRun(1, b, 'old');
    endDay(r, b);
    expect(r.pendingReport).toBe(true);
    expect(keepBuilding(r, b)).toBe(true);
    expect([r.chapterId, r.replay, r.chapterDay]).toEqual(['a', 2, 1]);
  });

  it('a loss takes priority over the chapter end and does not advance', () => {
    const ch = testChapter([0, 0, 0], 'short');
    const b: ChapterBook = { archive: ['short'], chapters: { short: ch } };
    const r = newRun(1, b);
    r.state.air = 6;
    endDays(r, b, 3);
    expect(r.state.lost).toEqual({ cause: 'air', sol: 3 });
    expect(r.pendingReport).toBe(false);
    expect(r.state.day).toBe(3);
    expect(r.chapterDay).toBe(3);
    expect(keepBuilding(r, b)).toBe(false);
  });
});

describe('idle check', () => {
  it('a run with no building at all loses on air at the end of sol 6', () => {
    const r = newRun(1, book);
    for (let i = 0; i < 5; i++) {
      endDay(r, book);
      expect(r.state.lost).toBeNull();
    }
    const ev = endDay(r, book).events;
    expect(r.state.lost).toEqual({ cause: 'air', sol: 6 });
    expect(ev.at(-1)).toEqual({ type: 'lost', cause: 'air', sol: 6 });
    expect(r.state.day).toBe(6);
    const before = JSON.stringify(r);
    expect(endDay(r, book).ran).toBe(false);
    expect(JSON.stringify(r)).toBe(before);
  });
});

function endDays(r: Run, b: ChapterBook, n: number): void {
  for (let i = 0; i < n; i++) endDay(r, b);
}
