import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/sim/config.ts';
import { endDay } from '../src/sim/day.ts';
import { place, removeBuilding } from '../src/sim/placement.ts';
import { resolvePower } from '../src/sim/power.ts';
import type { SimEvent } from '../src/sim/types.ts';
import { addBuilding, byId, lab } from './helpers.ts';

function produced(events: SimEvent[], id: number) {
  const out: Record<string, number> = {};
  for (const e of events) {
    if (e.type === 'produced' && e.buildingId === id) out[e.resource] = (out[e.resource] ?? 0) + e.amount;
    if (e.type === 'consumed' && e.buildingId === id) out[e.resource] = (out[e.resource] ?? 0) - e.amount;
  }
  return out;
}

describe('building table (SPEC 4.3)', () => {
  it('has the costs and power uses of the table', () => {
    const table = Object.fromEntries(
      Object.entries(BUILDINGS).map(([id, s]) => [id, [s.cost.parts, s.cost.soil, s.power, s.powerSheltered]]),
    );
    expect(table).toEqual({
      sun: [1, 0, 0, 0],
      batt: [2, 0, 0, 0],
      o2: [2, 0, 2, 2],
      farm: [2, 0, 2, 3],
      home: [3, 0, 1, 1],
      mine: [2, 0, 1, 1],
      dig: [2, 0, 1, 1],
      fab: [3, 0, 2, 2],
      pad: [0, 0, 0, 0],
    });
  });

  it('pays the cost on placement', () => {
    const { run } = lab();
    const s = run.state;
    s.parts = 10;
    s.soil = 4;
    expect(place(s, 'o2', 4, 4).ok).toBe(true);
    expect(s.parts).toBe(8);
    expect(place(s, 'fab', 3, 4).ok).toBe(true);
    expect(s.parts).toBe(5);
    expect(place(s, 'shelter', 2, 3).ok).toBe(false); // not revealed
    expect(place(s, 'shelter', 3, 3).ok).toBe(true);
    expect(s.soil).toBe(0);
    expect(s.parts).toBe(5);
  });

  it('crew each use 1 air and 1 food a day', () => {
    const { run, book } = lab();
    const res = endDay(run, book);
    expect(run.state.air).toBe(10);
    expect(run.state.food).toBe(10);
    expect(res.events).toContainEqual({ type: 'crew_used', crew: 2, air: 2, food: 2 });
  });

  it('sun: +3 power x sunlight', () => {
    const { run } = lab();
    addBuilding(run.state, 'sun', 4, 4);
    expect(resolvePower(run.state, 1).supply).toBe(9);
  });

  it('o2: +3 air when powered', () => {
    const { run, book } = lab();
    const id = addBuilding(run.state, 'o2', 4, 4);
    expect(produced(endDay(run, book).events, id)).toEqual({ air: 3 });
    expect(run.state.air).toBe(12 + 3 - 2);
  });

  it('farm: uses 1 water, makes 3 food and 1 air; nothing without water', () => {
    const { run, book } = lab();
    const s = run.state;
    const id = addBuilding(s, 'farm', 4, 4);
    expect(produced(endDay(run, book).events, id)).toEqual({ water: -1, food: 3, air: 1 });
    expect(s.water).toBe(5);
    s.water = 0;
    const ev = endDay(run, book).events;
    expect(produced(ev, id)).toEqual({});
    expect(ev).toContainEqual({ type: 'missing_input', buildingId: id, building: 'farm', resource: 'water' });
  });

  it('mine runs before greenhouse, so its water is usable the same day', () => {
    const { run, book } = lab();
    const s = run.state;
    s.terrain[3][5] = 'ice';
    const farm = addBuilding(s, 'farm', 4, 4);
    const mine = addBuilding(s, 'mine', 3, 5);
    s.water = 0;
    const ev = endDay(run, book).events;
    expect(produced(ev, mine)).toEqual({ water: 2 });
    expect(produced(ev, farm)).toEqual({ water: -1, food: 3, air: 1 });
    expect(s.water).toBe(1);
  });

  it('home: +2 crew when built, cannot be removed, unpowered costs 2 health', () => {
    const { run, book } = lab();
    const s = run.state;
    const r = place(s, 'home', 4, 4);
    expect(r.ok).toBe(true);
    expect(s.crew).toBe(4);
    expect(removeBuilding(s, 1)).toEqual({ ok: false, reason: 'cannot_remove' });
    s.buildings = s.buildings.filter((b) => b.type !== 'sun');
    s.charge = 1;
    s.health = 10;
    const ev = endDay(run, book).events;
    // One habitat powered by the battery, one not.
    expect(ev.filter((e) => e.type === 'health' && e.cause === 'unpowered_habitat')).toHaveLength(1);
    expect(s.health).toBe(8);
  });

  it('mine: +2 water, dig: +2 soil', () => {
    const { run, book } = lab();
    const s = run.state;
    s.terrain[3][5] = 'ice';
    s.terrain[4][4] = 'rock';
    const mine = addBuilding(s, 'mine', 3, 5);
    const dig = addBuilding(s, 'dig', 4, 4);
    s.soil = 0;
    const ev = endDay(run, book).events;
    expect(produced(ev, mine)).toEqual({ water: 2 });
    expect(produced(ev, dig)).toEqual({ soil: 2 });
    expect(s.water).toBe(8);
    expect(s.soil).toBe(2);
  });

  it('fab: turns 1 soil into 1 part, up to 2 a day', () => {
    const { run, book } = lab();
    const s = run.state;
    const fab = addBuilding(s, 'fab', 4, 4);
    s.soil = 5;
    s.parts = 0;
    expect(produced(endDay(run, book).events, fab)).toEqual({ soil: -2, parts: 2 });
    expect([s.soil, s.parts]).toEqual([3, 2]);
    s.soil = 1;
    expect(produced(endDay(run, book).events, fab)).toEqual({ soil: -1, parts: 1 });
    expect([s.soil, s.parts]).toEqual([0, 3]);
    expect(produced(endDay(run, book).events, fab)).toEqual({});
  });

  it('unpowered and broken buildings make nothing', () => {
    const { run, book } = lab();
    const s = run.state;
    s.buildings = s.buildings.filter((b) => b.type !== 'sun');
    const o2 = addBuilding(s, 'o2', 4, 4);
    expect(produced(endDay(run, book).events, o2)).toEqual({});
    addBuilding(s, 'sun', 4, 3);
    byId(s, o2).brokenDays = 2;
    expect(produced(endDay(run, book).events, o2)).toEqual({});
  });

  it('clamps air and food to 30 and water to 20', () => {
    const { run, book } = lab();
    const s = run.state;
    s.air = 30;
    s.food = 30;
    s.water = 20;
    s.terrain[3][5] = 'ice';
    addBuilding(s, 'mine', 3, 5);
    addBuilding(s, 'o2', 4, 4);
    endDay(run, book);
    expect(s.air).toBe(30); // 30 + 3 - 2, clamped
    expect(s.water).toBe(20); // 20 + 2, clamped
    expect(s.food).toBe(28);
  });

  it('pad cannot be removed; other buildings can, returning nothing', () => {
    const { run } = lab();
    const s = run.state;
    expect(removeBuilding(s, 5)).toEqual({ ok: false, reason: 'cannot_remove' });
    const parts = s.parts;
    expect(removeBuilding(s, 2).ok).toBe(true);
    expect(s.parts).toBe(parts);
  });
});
