// SPEC 18.2 point 1: stocks cannot pile up, and ending days again and again is not a way to win.

import { describe, expect, it } from 'vitest';
import { config, createRng, endDay, goalsCompleted, keepBuilding, newRun, storageLimit, type GameState, type Run } from '../src/sim/index.ts';
import { removeBuilding } from '../src/sim/placement.ts';
import { requestAid } from '../src/sim/emergency.ts';
import { loadSave, SAVE_KEY } from '../src/save/save.ts';
import { sensible } from '../tools/balance-bot.ts';
import { addBuilding, book, lab } from './helpers.ts';

describe('storage limits', () => {
  it('parts and soil have a limit that grows with the stage', () => {
    const s = newRun(1, book).state;
    expect(storageLimit(s, 'parts')).toBe(config.STAGES[0].parts);
    expect(storageLimit(s, 'soil')).toBe(config.STAGES[0].soil);
    s.stage = 2;
    expect(storageLimit(s, 'parts')).toBe(config.STAGES[2].parts);
  });

  it('what does not fit is not stored, and the day says so', () => {
    const { run, book: b } = lab();
    const s = run.state;
    s.parts = 25;
    s.soil = 25;
    const ev = endDay(run, b).events;
    expect(s.parts).toBe(config.STAGES[0].parts);
    expect(s.soil).toBe(config.STAGES[0].soil);
    expect(ev).toContainEqual({ type: 'stock_full', resource: 'parts', lost: 5 });
    expect(ev).toContainEqual({ type: 'stock_full', resource: 'soil', lost: 15 });
  });

  it('refunds and aid are capped too', () => {
    const { run } = lab();
    const s = run.state;
    s.parts = config.STAGES[0].parts;
    const fab = addBuilding(s, 'fab', 4, 6);
    expect(removeBuilding(s, fab).ok).toBe(true);
    expect(s.parts).toBe(config.STAGES[0].parts);
    s.air = 1;
    expect(requestAid(s).ok).toBe(true);
    expect(s.parts).toBe(config.STAGES[0].parts);
  });
});

/** A sensible base grown for `sols` days on chapter one and its replays. */
function grownBase(sols: number): Run {
  const r = newRun(9, book);
  const rng = createRng(9);
  for (let i = 0; i < sols && !r.state.lost; i++) {
    if (r.pendingReport) keepBuilding(r, book);
    sensible(r, rng);
    endDay(r, book);
  }
  return r;
}

function progress(s: GameState) {
  return { goals: goalsCompleted(s), stage: s.stage, crew: s.crew, ring: s.ring, land: s.terrain.length, buildings: s.buildings.length };
}

describe('an outpost whose player only ends the day', () => {
  it('never moves up in goals, stage, crew or land, and its stocks stay at or under their limits', () => {
    const r = grownBase(80);
    expect(r.state.lost).toBeNull();
    const before = progress(r.state);
    for (let i = 0; i < 300; i++) {
      if (r.pendingReport) keepBuilding(r, book);
      // Keep the crew alive so the outpost can be watched for a long time: the test is about drift.
      r.state.air = Math.max(r.state.air, r.state.crew * 2);
      r.state.food = Math.max(r.state.food, r.state.crew * 2);
      r.state.health = 10;
      endDay(r, book);
      expect(progress(r.state)).toEqual(before);
      expect(r.state.parts).toBeLessThanOrEqual(storageLimit(r.state, 'parts'));
      expect(r.state.soil).toBeLessThanOrEqual(storageLimit(r.state, 'soil'));
    }
  }, 60_000);

  it('a new outpost left alone is lost in the first chapter without a goal done', () => {
    const r = newRun(3, book);
    while (!r.state.lost && !r.pendingReport) endDay(r, book);
    expect(r.state.lost).not.toBeNull();
    expect(goalsCompleted(r.state)).toBe(0);
  });
});

describe('old saves (SPEC 18.2 migration)', () => {
  it('get a stage, a chosen goal and capped stocks', () => {
    const r = newRun(5, book);
    const s = r.state as GameState & Record<string, unknown>;
    s.goals = { starterDone: 4, repeatingDone: 40 };
    delete s.stage;
    s.unlocked.push('farm', 'mine', 'batt', 'dig', 'shelter', 'fab', 'home', 'lab');
    s.crew = 52;
    s.parts = 2220;
    s.soil = 2580;
    const raw = JSON.stringify({ version: 1, muted: false, reports: [], notebook: [], outpost: r });
    const loaded = loadSave({ getItem: (k) => (k === SAVE_KEY ? raw : null), setItem: () => undefined, removeItem: () => undefined }).outpost!;
    const st = loaded.state;
    expect(st.stage).toBe(2); // 44 goals and 52 crew: Busy outpost (42 goals, 8 crew), not yet Little village (82 goals)
    expect(st.parts).toBe(storageLimit(st, 'parts'));
    expect(st.soil).toBe(storageLimit(st, 'soil'));
    expect(st.goals.current).not.toBeUndefined();
  });
});
