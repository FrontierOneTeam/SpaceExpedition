// SPEC 18.1 point 5: a game storm is always called a game storm, and never shown as something
// NASA observed at Mars. A storm from a NASA report may say so.

import { describe, expect, it } from 'vitest';
import may2024Json from '../src/data/chapters/archive-2024-05.json';
import { endDay, newRun } from '../src/sim/day.ts';
import type { Chapter, ChapterBook, Run } from '../src/sim/types.ts';
import { missionControlMessage } from '../src/ui/advice.ts';
import { weatherTile } from '../src/ui/info.ts';
import { recordView, timelineCells } from '../src/ui/record.ts';
import { buildReport, realLines, reportView } from '../src/ui/report.ts';
import { daySummary } from '../src/ui/summary.ts';
import { book as sepBook, sep2017 } from './helpers.ts';

const may = may2024Json as unknown as Chapter;
const mayBook: ChapterBook = { archive: [may.id], chapters: { [may.id]: may } };

/** Play a whole chapter, keeping the crew alive so every day is logged. */
function playAll(b: ChapterBook): Run {
  const run = newRun(7, b);
  while (!run.pendingReport && !run.state.lost) {
    run.state.air = 30;
    run.state.food = 30;
    run.state.health = 10;
    endDay(run, b);
  }
  return run;
}

const gameDay = may.days.findIndex((d) => d.radiation >= 2 && d.stormSource === 'game-rule') + 1;
const nasaMayDay = may.days.findIndex((d) => d.stormSource === 'nasa-report') + 1;
const nasaSepDay = sep2017.days.findIndex((d) => d.radiation === 3) + 1;

describe('storm labels (SPEC 18.1 point 5)', () => {
  it('the chapter files used here hold both kinds of storm', () => {
    expect(may.days[gameDay - 1].stormSource).toBe('game-rule');
    expect(may.days[nasaMayDay - 1].stormSource).toBe('nasa-report');
    expect(sep2017.days[nasaSepDay - 1].stormSource).toBe('nasa-report');
  });

  it('weather tiles, the record strip and the timeline call a game-rule storm a game storm', () => {
    const tile = weatherTile(may.days[gameDay - 1], true);
    expect(tile.name.toLowerCase()).toContain('game');
    expect(tile.line).not.toMatch(/NASA/);
    const rec = recordView(may, gameDay, gameDay)!;
    expect(rec.storm).toMatch(/part of the game/);
    expect(rec.storm).toMatch(/NASA did not report it/);
    const cell = timelineCells(may, gameDay).find((c) => c.chapterDay === gameDay)!;
    expect(cell.word).toBe('game storm');
  });

  it('a nasa-report storm may say NASA reported it, and is not called a game storm', () => {
    const tile = weatherTile(sep2017.days[nasaSepDay - 1], true);
    expect(tile.name.toLowerCase()).not.toContain('game');
    expect(tile.line).toMatch(/NASA reported/);
    expect(recordView(sep2017, nasaSepDay, nasaSepDay)!.storm).toMatch(/NASA report/);
    expect(timelineCells(sep2017, nasaSepDay).find((c) => c.chapterDay === nasaSepDay)!.word).toBe('storm');
  });

  it('the warning the day before a game storm says it is a game storm', () => {
    const run = newRun(7, mayBook);
    run.chapterDay = gameDay - 1;
    run.state.question = null;
    expect(missionControlMessage(run, may).text).toMatch(/game storm/i);
    const sep = newRun(7, sepBook);
    sep.chapterDay = nasaSepDay - 1;
    sep.state.question = null;
    expect(missionControlMessage(sep, sep2017).text).not.toMatch(/game/i);
  });

  it('the day summary and the report base column call a game storm a game storm', () => {
    const run = playAll(mayBook);
    const log = run.state.log.find((l) => l.chapterDay === gameDay)!;
    expect(log.events).toContainEqual(expect.objectContaining({ type: 'storm', source: 'game-rule' }));
    expect(daySummary(log)[0].text.toLowerCase()).toContain('game storm');
    const view = reportView(buildReport(run, may, false), may);
    const row11 = view.rows.find((r) => r.date === '11 May 2024')!;
    expect(row11.base.join(' ')).toMatch(/game storm/);
  });

  it('a game-rule storm never appears in NASA-observed text; a nasa-report storm does', () => {
    const run = playAll(mayBook);
    const view = reportView(buildReport(run, may, false), may);
    for (const row of view.rows) expect(row.nasa).not.toMatch(/game/i);
    // The Real box names only the storm NASA reported (20 May 2024), never a game storm.
    const storms = view.real.filter((l) => l.includes('radiation storm'));
    expect(storms).toEqual(['The radiation storm at Mars on 20 May 2024.']);
    for (const d of may.days.filter((x) => x.stormSource === 'game-rule')) {
      expect(view.real.join(' ')).not.toContain(`storm at Mars on ${Number(d.date.slice(8))} May`);
    }
    // Game storms get their own clearly labelled game line.
    expect(view.simplified.some((l) => /game storms/.test(l) && /not NASA records/.test(l))).toBe(true);
    expect(realLines(sep2017, sep2017.days[0].date, sep2017.days[13].date)).toContain('The radiation storm at Mars on 11 September 2017.');
  });

  it('an archive month without cards shows the NASA flare records as what NASA observed', () => {
    const ch: Chapter = { ...may, id: 'nocards', days: may.days.map(({ cardId: _c, ...d }) => d) };
    const b: ChapterBook = { archive: [ch.id], chapters: { [ch.id]: ch } };
    const run = playAll(b);
    const view = reportView(buildReport(run, ch, false), ch);
    expect(view.rows.length).toBe(ch.days.filter((d) => d.flare !== 'none').length);
    for (const row of view.rows) {
      expect(row.nasa).toMatch(/^NASA recorded/);
      expect(row.sources.map((s) => s.id)).toEqual(['donki']);
    }
  });
});
