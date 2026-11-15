import { describe, expect, it } from 'vitest';
import { config } from '../src/sim/index.ts';
import { endDay } from '../src/sim/day.ts';
import { checkGoals, chooseGoal, chosenProgress, crewRoom, currentGoal } from '../src/sim/goals.ts';
import { place } from '../src/sim/placement.ts';
import { stageOf } from '../src/sim/storage.ts';
import type { ChosenKind, GameState } from '../src/sim/types.ts';
import { addBuilding, addShelter, book, flatTerrain, lab, run } from './helpers.ts';

describe('starter goals (SPEC 7.1, unchanged)', () => {
  it('teaches in order and unlocks the right buildings, checked only at the end of the day', () => {
    const r = run(5);
    const s = r.state;
    s.air = 30;
    s.food = 30;
    flatTerrain(s, [[3, 5]], [[4, 4]]);
    s.parts = 15;

    expect(currentGoal(s)).toMatchObject({ id: 'starter_air', target: 1, progress: 0, rewardParts: 3, unlocks: ['farm', 'mine'] });
    expect(place(s, 'o2', 4, 6).ok).toBe(true);
    expect(currentGoal(s).progress).toBe(1);
    expect(s.unlocked).toEqual(['sun', 'o2']); // not at the moment of building
    const p0 = s.parts;
    let ev = endDay(r, book).events;
    expect(ev.filter((e) => e.type === 'goal_done')).toHaveLength(1);
    expect(s.unlocked).toEqual(['sun', 'o2', 'farm', 'mine']);
    expect(s.parts).toBe(p0 + 3);

    expect(currentGoal(s)).toMatchObject({ id: 'starter_food', target: 2, progress: 0 });
    expect(place(s, 'mine', 3, 5).ok).toBe(true);
    expect(currentGoal(s).progress).toBe(1);
    endDay(r, book);
    expect(s.goals.starterDone).toBe(1);
    expect(place(s, 'farm', 3, 6).ok).toBe(true);
    ev = endDay(r, book).events;
    expect(ev).toContainEqual({ type: 'unlocked', building: 'batt' });
    expect(ev).toContainEqual({ type: 'unlocked', building: 'dig' });

    expect(currentGoal(s)).toMatchObject({ id: 'starter_soil', target: 1 });
    expect(place(s, 'dig', 4, 4).ok).toBe(true);
    endDay(r, book);
    expect(s.unlocked).toEqual(['sun', 'o2', 'farm', 'mine', 'batt', 'dig', 'shelter', 'fab']);

    expect(currentGoal(s)).toMatchObject({ id: 'starter_cover', target: 1, progress: 0 });
    expect(s.unlocked).not.toContain('home');
    s.soil = 4;
    expect(place(s, 'shelter', 5, 5).ok).toBe(true);
    expect(currentGoal(s).progress).toBe(1);
    ev = endDay(r, book).events;
    expect(ev).toContainEqual({ type: 'unlocked', building: 'home' });
    expect(ev).toContainEqual({ type: 'unlocked', building: 'lab' });
    expect(s.goals.starterDone).toBe(4);
    // The chooser takes over: a stored goal of a known kind, with no parts as its reward.
    const next = currentGoal(s);
    expect(next.kind).toBe('repeating');
    expect(s.goals.current?.kind).toBe(next.id);
    expect(next.rewardParts).toBe(0);
  });

  it('starter goal 4 needs the FIRST habitat sheltered', () => {
    const { run: r } = lab();
    const s = r.state;
    s.goals.starterDone = 3;
    addBuilding(s, 'home', 7, 6);
    addShelter(s, 7, 6); // covers the second habitat only
    expect(currentGoal(s).progress).toBe(0);
    expect(checkGoals(s).filter((e) => e.type === 'goal_done')).toEqual([]);
    addShelter(s, 4, 4);
    expect(currentGoal(s).progress).toBe(1);
  });
});

describe('one goal per day (SPEC 18.2)', () => {
  it('completes at most one goal in a day, even when the next one is also met', () => {
    const { run: r } = lab();
    const s = r.state;
    s.goals.starterDone = 2;
    addBuilding(s, 'dig', 4, 4); // starter 3 met
    addShelter(s, 5, 5); // starter 4 met as well
    expect(config.MAX_GOALS_PER_DAY).toBe(1);
    expect(checkGoals(s).filter((e) => e.type === 'goal_done')).toHaveLength(1);
    expect(s.goals.starterDone).toBe(3);
    expect(checkGoals(s).filter((e) => e.type === 'goal_done')).toHaveLength(1);
    expect(s.goals.starterDone).toBe(4);
  });
});

/** A base past the starter goals, with every building unlocked and some room. */
function grown(): GameState {
  const { run: r } = lab();
  const s = r.state;
  s.goals.starterDone = 4;
  s.unlocked.push('lab');
  s.parts = 10;
  s.soil = 5;
  addShelter(s, 5, 5);
  s.goals.current = chooseGoal(s);
  return s;
}

describe('the goal chooser (SPEC 18.2)', () => {
  it('is deterministic: the same state and weather give the same goal', () => {
    const s = grown();
    const copy = JSON.parse(JSON.stringify(s)) as GameState;
    expect(chooseGoal(copy, { today: 0, tomorrow: 2 })).toEqual(chooseGoal(s, { today: 0, tomorrow: 2 }));
    expect(chooseGoal(copy)).toEqual(chooseGoal(s));
  });

  it('offers a storm goal only for a storm today or tomorrow, and drops it after the storm', () => {
    const s = grown();
    addBuilding(s, 'o2', 4, 6); // a machine outside a shelter
    s.goals.lastKind = undefined;
    expect(chooseGoal(s, { today: 0, tomorrow: 0 })?.kind).not.toBe('storm_cover');
    const storm = chooseGoal(s, { today: 0, tomorrow: 2 })!;
    expect(storm.kind).toBe('storm_cover');
    expect(storm.until).toBe(s.day + 2);
    expect(chooseGoal(s, { today: 3, tomorrow: 0 })).toMatchObject({ kind: 'storm_cover', until: s.day + 1 });
    s.goals.current = storm;
    s.day = storm.until!;
    checkGoals(s);
    expect(s.goals.current?.kind).not.toBe('storm_cover');
    expect(s.goals.lastKind).toBe('storm_cover');
  });

  it('never offers a goal that is already met, and never the same kind twice in a row', () => {
    const s = grown();
    for (let i = 0; i < 40; i++) {
      const g = chooseGoal(s);
      if (!g) break;
      expect(chosenProgress(s, g.kind)).toBeLessThan(g.target);
      expect(g.kind).not.toBe(s.goals.lastKind);
      s.goals.lastKind = g.kind;
      s.goals.repeatingDone++;
    }
  });

  it('offers a habitat only while the crew is below the room for it', () => {
    const s = grown();
    s.goals.lastKind = undefined;
    s.goals.repeatingDone = 0; // the rotation starts at house_crew
    expect(crewRoom(s)).toBeGreaterThan(s.crew);
    expect(chooseGoal(s)?.kind).toBe('house_crew');
    s.crew = crewRoom(s);
    expect(chooseGoal(s)?.kind).not.toBe('house_crew');
  });

  it('a goal the base can no longer reach is replaced, with no reward', () => {
    const s = grown();
    s.goals.current = { kind: 'new_mine', target: 5 };
    const parts = s.parts;
    const ev = checkGoals(s); // flat ground: no ice to reach
    expect(ev.filter((e) => e.type === 'goal_done')).toEqual([]);
    expect(s.goals.current?.kind).not.toBe('new_mine');
    expect(s.parts).toBe(parts);
  });

  it('every second chosen goal grows the map', () => {
    const s = grown();
    s.goals.repeatingDone = 0;
    s.goals.current = { kind: 'more_power', target: 1 };
    let ev = checkGoals(s);
    expect(ev.filter((e) => e.type === 'goal_done')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'map_grew')).toEqual([]);
    s.goals.current = { kind: 'research', target: 0 };
    ev = checkGoals(s);
    expect(ev.filter((e) => e.type === 'map_grew')).toEqual([{ type: 'map_grew', ring: 1, size: 8 }]);
  });
});

describe('stages (SPEC 18.2 point 3)', () => {
  it('has four to six stages in order, each needing more goals and crew and storing more', () => {
    const S = config.STAGES;
    expect(S.length).toBeGreaterThanOrEqual(4);
    expect(S.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < S.length; i++) {
      expect(S[i].goals).toBeGreaterThan(S[i - 1].goals);
      expect(S[i].crew).toBeGreaterThan(S[i - 1].crew);
      expect(S[i].parts).toBeGreaterThan(S[i - 1].parts);
      expect(S[i].soil).toBeGreaterThan(S[i - 1].soil);
    }
  });

  it('a new stage needs both its goals and its crew, and comes one at a time', () => {
    const s = grown();
    s.stage = 0;
    s.goals.repeatingDone = 500;
    s.crew = config.STAGES[1].crew - 1;
    expect(checkGoals(s).filter((e) => e.type === 'stage_up')).toEqual([]);
    s.crew = 1000;
    expect(checkGoals(s).filter((e) => e.type === 'stage_up')).toEqual([{ type: 'stage_up', stage: 1 }]);
    expect(checkGoals(s).filter((e) => e.type === 'stage_up')).toEqual([{ type: 'stage_up', stage: 2 }]);
    for (let i = 0; i < 10; i++) checkGoals(s);
    expect(stageOf(s)).toBe(config.STAGES.length - 1); // free play after the last stage
  });
});

describe('long play (SPEC 18.2)', () => {
  it('reaches at least eight goal kinds and never repeats a kind in a row over a long sensible run', async () => {
    const { sensible } = await import('../tools/balance-bot.ts');
    const { createRng, keepBuilding, newRun } = await import('../src/sim/index.ts');
    const r = newRun(9, book);
    const rng = createRng(9);
    const kinds: ChosenKind[] = [];
    let last = '';
    for (let i = 0; i < 400 && !r.state.lost; i++) {
      if (r.pendingReport) keepBuilding(r, book);
      sensible(r, rng);
      endDay(r, book);
      const cur = r.state.goals.current;
      const key = cur ? `${cur.kind}:${r.state.goals.repeatingDone}:${cur.target}` : '';
      if (!cur && key !== last) kinds.push('none' as ChosenKind); // a day with no goal sits between two goals
      if (cur && key !== last) {
        kinds.push(cur.kind);
        // Always reachable and not yet met when it is offered.
        expect(chosenProgress(r.state, cur.kind)).toBeLessThan(cur.target);
      }
      last = key;
    }
    expect(r.state.lost).toBeNull();
    for (let i = 1; i < kinds.length; i++) if ((kinds[i] as string) !== 'none') expect(kinds[i]).not.toBe(kinds[i - 1]);
    expect(new Set(kinds.filter((k) => (k as string) !== 'none')).size).toBeGreaterThanOrEqual(8);
  }, 60_000);
});
