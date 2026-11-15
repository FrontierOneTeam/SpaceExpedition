import { describe, expect, it } from 'vitest';
import { endDay, previewDay } from '../src/sim/day.ts';
import { batteryCapacity, resolvePower } from '../src/sim/power.ts';
import { addBuilding, addShelter, byId, lab } from './helpers.ts';

describe('power', () => {
  it('makes round(3 x sunlight) per working panel, 1 less when damaged', () => {
    const { run } = lab();
    const s = run.state;
    expect(resolvePower(s, 1).supply).toBe(6);
    expect(resolvePower(s, 1 / 3).supply).toBe(2);
    expect(resolvePower(s, 0).supply).toBe(0);
    byId(s, 2).damagedDays = 1;
    expect(resolvePower(s, 1).supply).toBe(5);
    expect(resolvePower(s, 1 / 3).supply).toBe(1);
    expect(resolvePower(s, 0).supply).toBe(0);
  });

  it('powers habitats first, then oldest first', () => {
    const { run } = lab();
    const s = run.state;
    s.buildings = s.buildings.filter((b) => b.type !== 'home' && b.type !== 'sun');
    const o2 = addBuilding(s, 'o2', 4, 4);
    const home = addBuilding(s, 'home', 4, 6);
    s.charge = 2;
    const p = resolvePower(s, 1);
    expect(p.supply).toBe(0);
    expect(p.powered).toEqual([home]);
    expect(p.unpowered.map((u) => u.buildingId)).toEqual([o2]);
  });

  it('keeps walking so a later, cheaper consumer can still be powered', () => {
    const { run } = lab();
    const s = run.state;
    s.buildings = s.buildings.filter((b) => b.id !== 3); // one panel left: supply 3
    s.charge = 1;
    const o2a = addBuilding(s, 'o2', 4, 4);
    const o2b = addBuilding(s, 'o2', 4, 6);
    const mine = addBuilding(s, 'mine', 3, 5);
    const p = resolvePower(s, 1);
    expect(p.powered).toEqual([1, o2a, mine]);
    expect(p.unpowered.map((u) => u.buildingId)).toEqual([o2b]);
    expect(p.demand).toBe(1 + 2 + 2 + 1);
    expect(p.used).toBe(4);
    expect(p.chargeAfter).toBe(0);
  });

  it('keeps battery charge within 0 and 4 per working battery', () => {
    const { run, book } = lab();
    const s = run.state;
    s.air = 30;
    s.food = 30;
    for (let i = 0; i < 5; i++) {
      endDay(run, book);
      expect(s.charge).toBeLessThanOrEqual(4);
      expect(s.charge).toBeGreaterThanOrEqual(0);
    }
    expect(s.charge).toBe(4);
    addBuilding(s, 'batt', 4, 4);
    endDay(run, book);
    expect(s.charge).toBe(8);
    endDay(run, book);
    expect(s.charge).toBe(8);
    // A broken battery does not count toward capacity.
    byId(s, 4).brokenDays = 3;
    expect(batteryCapacity(s)).toBe(4);
    endDay(run, book);
    expect(s.charge).toBe(4);
  });

  it('uses no power for broken buildings', () => {
    const { run } = lab();
    const s = run.state;
    const o2 = addBuilding(s, 'o2', 4, 4);
    byId(s, o2).brokenDays = 1;
    const p = resolvePower(s, 1);
    expect(p.demand).toBe(1);
    expect(p.powered).toEqual([1]);
  });

  it('greenhouse uses 3 power under a shelter, 2 otherwise', () => {
    const { run } = lab();
    const s = run.state;
    const farm = addBuilding(s, 'farm', 4, 4);
    expect(resolvePower(s, 1).demand).toBe(1 + 2);
    addShelter(s, 3, 3);
    expect(resolvePower(s, 1).demand).toBe(1 + 3);
    expect(byId(s, farm)).toBeTruthy();
  });

  it('previews today without changing anything', () => {
    const { run, book } = lab();
    const s = run.state;
    s.buildings = s.buildings.filter((b) => b.id !== 3); // supply 3
    const o2 = addBuilding(s, 'o2', 4, 4);
    addBuilding(s, 'o2', 4, 6);
    const before = JSON.stringify(run);
    const p = previewDay(run, book);
    expect(JSON.stringify(run)).toBe(before);
    expect(p.power.supply).toBe(3);
    expect(p.power.demand).toBe(5);
    expect(p.power.unpowered.length).toBe(1);
    expect(p.change.air).toBe(3 - 2);
    expect(p.change.food).toBe(-2);
    expect(p.unpoweredHabitats).toEqual([]);
    endDay(run, book);
    expect(s.air).toBe(12 + p.change.air);
    expect(s.food).toBe(12 + p.change.food);
    expect(o2).toBeGreaterThan(0);
  });

  it('a broken battery gives no power: its stored charge cannot run the habitat (SPEC 16.3)', () => {
    const { run, book } = lab();
    const s = run.state;
    s.buildings = s.buildings.filter((b) => b.type !== 'sun');
    byId(s, 4).brokenDays = 1;
    s.charge = 4;
    const p = resolvePower(s, 0);
    expect(p.unpowered.map((u) => u.buildingId)).toEqual([1]);
    expect(p.chargeAfter).toBe(0);
    endDay(run, book);
    expect(s.health).toBe(8);
    expect(s.charge).toBe(0);
  });

  it('two batteries with one broken: charge 8 gives at most 4 usable', () => {
    const { run } = lab();
    const s = run.state;
    s.buildings = s.buildings.filter((b) => b.type !== 'sun');
    addBuilding(s, 'batt', 4, 4);
    byId(s, 4).brokenDays = 1;
    s.charge = 8;
    addBuilding(s, 'o2', 3, 4);
    addBuilding(s, 'o2', 3, 5);
    const p = resolvePower(s, 0);
    expect(p.used).toBe(3); // habitat 1 + one oxygen maker 2; the second would need 5
    expect(p.unpowered).toHaveLength(1);
    expect(p.chargeAfter).toBe(1);
  });
});
