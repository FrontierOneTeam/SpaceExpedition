import { describe, expect, it } from 'vitest';
import { endDay, keepBuilding, newRun } from '../src/sim/day.ts';
import { goalsCompleted } from '../src/sim/goals.ts';
import { revealedSize } from '../src/sim/terrain.ts';
import { cardById } from '../src/ui/content.ts';
import { buildReport, looksLikeReport, reportView } from '../src/ui/report.ts';
import { book, scriptedDay, sep2017 } from './helpers.ts';

function playChapter(seed = 4821) {
  const run = newRun(seed, book);
  while (!run.pendingReport && !run.state.lost) {
    run.state.air = 30;
    run.state.food = 30;
    run.state.health = 10;
    scriptedDay(run, book);
  }
  return run;
}

describe('report "This really happened" (SPEC 10.7)', () => {
  it('has one row per card date, with NASA text and base text in separate fields', () => {
    const run = playChapter();
    expect(run.pendingReport).toBe(true);
    const entry = buildReport(run, sep2017, false);
    expect(looksLikeReport(JSON.parse(JSON.stringify(entry)))).toBe(true);
    const cardDays = sep2017.days.filter((d) => d.cardId);
    expect(entry.rows.map((r) => r.date)).toEqual(cardDays.map((d) => d.date));
    const view = reportView(entry, sep2017);
    expect(view.rows.length).toBe(5);
    view.rows.forEach((row, i) => {
      // NASA's words exactly as in cards.json, never mixed with the base's story.
      expect(row.nasa).toBe(cardById(cardDays[i].cardId!)!.text);
      expect(row.base.length).toBeGreaterThan(0);
      for (const line of row.base) expect(row.nasa).not.toContain(line);
      expect(row.sources.length).toBeGreaterThan(0);
    });
    expect(view.period).toBe('2 to 15 September 2017');
    expect(view.replay).toBeNull();
    expect(view.partial).toBeNull();
    expect(view.traded.length).toBeLessThanOrEqual(2);
    expect(view.simplified).toEqual(sep2017.simplified);
    expect(view.sources.every((s) => s.status === 'used')).toBe(true);
  });

  it('base lines state only what the log shows on storm days', () => {
    const run = playChapter();
    const entry = buildReport(run, sep2017, false);
    const storm = entry.rows.find((r) => r.date === '2017-09-11')!;
    const log = run.state.log.find((l) => l.date === '2017-09-11' && l.replay === 1)!;
    const broken = log.events.filter((e) => e.type === 'broken').length;
    expect(storm.base.storm).toBe(3);
    expect(storm.base.broken.length).toBe(broken);
    const lost = log.events.reduce((n, e) => (e.type === 'health' && e.amount < 0 ? n - e.amount : n), 0);
    expect(storm.base.healthLost).toBe(lost);
    const calm = entry.rows.find((r) => r.date === '2017-09-06')!;
    expect(calm.base.storm).toBe(0);
    expect(reportView(entry, sep2017).rows[0].base[0]).toBe('No storm hit your base.');
  });

  it('"Your outpost grew" matches the state and the chapter start', () => {
    const run = playChapter();
    const s = run.state;
    const start = s.chapterStart;
    const g = buildReport(run, sep2017, false).grew;
    expect(g.crew).toEqual({ from: start.crew, to: s.crew });
    expect(g.buildings).toEqual({ from: start.buildings + start.shelters, to: s.buildings.length + s.shelters.length });
    expect(g.goals).toBe(goalsCompleted(s) - start.goalsCompleted);
    expect(g.land).toEqual({ from: 6, to: revealedSize(s.ring) });
    expect(g.predictions).toEqual(s.predictions);
  });

  it('a replay report counts only the replay, and says so', () => {
    const run = playChapter();
    keepBuilding(run, book);
    while (!run.pendingReport) {
      run.state.air = 30;
      run.state.food = 30;
      run.state.health = 10;
      endDay(run, book);
    }
    const entry = buildReport(run, sep2017, false);
    expect(entry.replay).toBe(2);
    expect(entry.sols).toEqual({ first: 15, last: 28 });
    expect(entry.rows.every((r) => r.sol >= 15)).toBe(true);
    expect(reportView(entry, sep2017).replay).toBe('Replay 2 of the September 2017 records');
  });

  it('a stopped run gives a partial report for the days played', () => {
    const run = newRun(4821, book);
    while (!run.state.lost) endDay(run, book);
    const entry = buildReport(run, sep2017, true);
    const view = reportView(entry, sep2017);
    expect(entry.sols.first).toBe(1);
    expect(entry.sols.last).toBe(run.state.lost!.sol);
    expect(view.partial).toContain('the days you played');
    // Only card dates that were played, and only real lines from the played period.
    for (const r of entry.rows) expect(r.sol).toBeLessThanOrEqual(run.state.lost!.sol);
    for (const line of view.real) expect(line).not.toContain('11 September');
  });

  it('rejects damaged stored entries', () => {
    expect(looksLikeReport(null)).toBe(false);
    expect(looksLikeReport({ chapterId: 'sep2017' })).toBe(false);
  });
});
