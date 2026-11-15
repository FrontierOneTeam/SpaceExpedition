import { describe, expect, it } from 'vitest';
import { endDay } from '../src/sim/day.ts';
import { checkGoals, currentGoal } from '../src/sim/goals.ts';
import { place } from '../src/sim/placement.ts';
import { addBuilding, addShelter, book, flatTerrain, lab, run } from './helpers.ts';

describe('starter goals (SPEC 7.1)', () => {
  it('teaches in order and unlocks the right buildings, checked only at the end of the day', () => {
    const r = run(5);
    const s = r.state;
    s.air = 30;
    s.food = 30;
    flatTerrain(s, [[3, 5]], [[4, 4]]);
    s.parts = 50;

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
    expect(place(s, 'shelter', 4, 4).ok).toBe(true); // over the digger, battery and habitat
    expect(currentGoal(s).progress).toBe(1);
    ev = endDay(r, book).events;
    expect(ev).toContainEqual({ type: 'unlocked', building: 'home' });
    expect(s.goals.starterDone).toBe(4);
    expect(currentGoal(s)).toMatchObject({ id: 'house_crew', kind: 'repeating', index: 0, target: 4 });
  });

  it('starter goal 4 needs the FIRST habitat sheltered', () => {
    const { run: r } = lab();
    const s = r.state;
    s.goals.starterDone = 3;
    addBuilding(s, 'home', 7, 6);
    addShelter(s, 7, 6); // covers the second habitat only
    expect(currentGoal(s).progress).toBe(0);
    expect(checkGoals(s)).toEqual([]);
    addShelter(s, 4, 4);
    expect(currentGoal(s).progress).toBe(1);
  });
});

describe('repeating goals (SPEC 7.2)', () => {
  it('cycles house crew, fill stores, stockpile parts with rising levels', () => {
    const { run: r } = lab();
    const s = r.state;
    s.goals.starterDone = 4;
    const seen: [string, number][] = [];
    for (let k = 0; k < 9; k++) {
      s.goals.repeatingDone = k;
      const g = currentGoal(s);
      seen.push([g.id, g.target]);
      expect(g.level).toBe(Math.floor(k / 3));
    }
    expect(seen).toEqual([
      ['house_crew', 4],
      ['fill_stores', 20],
      ['stockpile_parts', 8],
      ['house_crew', 6],
      ['fill_stores', 20],
      ['stockpile_parts', 12],
      ['house_crew', 8],
      ['fill_stores', 20],
      ['stockpile_parts', 16],
    ]);
  });

  it('fill stores needs both air and food at 20', () => {
    const { run: r } = lab();
    const s = r.state;
    s.goals.starterDone = 4;
    s.goals.repeatingDone = 1;
    s.parts = 0;
    s.air = 25;
    s.food = 19;
    expect(currentGoal(s).progress).toBe(19);
    expect(checkGoals(s)).toEqual([]);
    s.food = 20;
    expect(checkGoals(s).filter((e) => e.type === 'goal_done')).toHaveLength(1);
  });

  it('completes at most three a day, gives 3 parts each, and grows the map every second repeating goal', () => {
    const { run: r } = lab();
    const s = r.state;
    s.goals.starterDone = 4;
    s.crew = 20;
    s.air = 25;
    s.food = 25;
    s.parts = 100;

    expect(currentGoal(s).growsMap).toBe(false);
    let ev = checkGoals(s);
    expect(ev.filter((e) => e.type === 'goal_done')).toHaveLength(3);
    expect(s.parts).toBe(109);
    expect(s.goals.repeatingDone).toBe(3);
    expect(ev.filter((e) => e.type === 'map_grew')).toEqual([{ type: 'map_grew', ring: 1, size: 8 }]);
    expect(s.ring).toBe(1);

    expect(currentGoal(s).growsMap).toBe(true); // k = 3 is the 4th
    ev = checkGoals(s);
    expect(ev.filter((e) => e.type === 'map_grew')).toEqual([
      { type: 'map_grew', ring: 2, size: 10 },
      { type: 'map_grew', ring: 3, size: 12 },
    ]);
    ev = checkGoals(s);
    expect(ev.filter((e) => e.type === 'goal_done')).toHaveLength(3);
    expect(ev.filter((e) => e.type === 'map_grew')).toEqual([]);
    expect(s.ring).toBe(3);
    expect(currentGoal(s).growsMap).toBe(false);
  });

  it('a starter goal reward can complete the next goal the same day, up to three', () => {
    const { run: r } = lab();
    const s = r.state;
    s.goals.starterDone = 3;
    addShelter(s, 4, 4);
    s.crew = 4;
    s.air = 25;
    s.food = 25;
    s.parts = 0;
    const ev = checkGoals(s);
    expect(ev.filter((e) => e.type === 'goal_done').map((e) => (e.type === 'goal_done' ? e.goal.id : ''))).toEqual([
      'starter_cover',
      'house_crew',
      'fill_stores',
    ]);
  });
});
