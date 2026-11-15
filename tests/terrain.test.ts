import { describe, expect, it } from 'vitest';
import { REVEAL_RINGS, STARTING_BASE, TERRAIN } from '../src/sim/config.ts';
import { generateTerrain, isRevealed, manhattan, ringOf, revealedSize } from '../src/sim/terrain.ts';
import { run } from './helpers.ts';

describe('terrain', () => {
  it('gives the same site for the same number', () => {
    expect(generateTerrain(4821)).toEqual(generateTerrain(4821));
    expect(generateTerrain(1)).not.toEqual(generateTerrain(2));
  });

  it('holds the 5.4 guarantees for seeds 1 to 500', () => {
    const base = STARTING_BASE.map((b) => ({ r: b.r, c: b.c }));
    for (let seed = 1; seed <= 500; seed++) {
      const grid = generateTerrain(seed);
      const tiles = grid.flatMap((row, r) => row.map((kind, c) => ({ r, c, kind })));
      const ice = tiles.filter((t) => t.kind === 'ice');
      const rock = tiles.filter((t) => t.kind === 'rock');
      const craters = tiles.filter((t) => t.kind === 'crater');
      expect(ice.length, `seed ${seed}`).toBe(TERRAIN.ice);
      expect(rock.length, `seed ${seed}`).toBe(TERRAIN.rock);
      expect(craters.length, `seed ${seed}`).toBe(TERRAIN.craters);
      for (const b of base) expect(grid[b.r][b.c], `seed ${seed}`).toBe('ground');

      const near = (t: { r: number; c: number }) => ringOf(t.r, t.c) === 0 && base.some((b) => manhattan(b, t) <= 2);
      expect(ice.some(near), `seed ${seed} near ice`).toBe(true);
      expect(rock.some(near), `seed ${seed} near rock`).toBe(true);
      for (let ring = 1; ring < REVEAL_RINGS.length; ring++) {
        expect(ice.some((t) => ringOf(t.r, t.c) === ring), `seed ${seed} ring ${ring} ice`).toBe(true);
        expect(rock.some((t) => ringOf(t.r, t.c) === ring), `seed ${seed} ring ${ring} rock`).toBe(true);
      }
    }
  });

  it('reveals rings 6x6, 8x8, 10x10, 12x12', () => {
    expect([0, 1, 2, 3].map(revealedSize)).toEqual([6, 8, 10, 12]);
    expect(isRevealed(0, 3, 3)).toBe(true);
    expect(isRevealed(0, 8, 8)).toBe(true);
    expect(isRevealed(0, 2, 5)).toBe(false);
    expect(isRevealed(1, 2, 5)).toBe(true);
    expect(isRevealed(2, 0, 5)).toBe(false);
    expect(isRevealed(3, 0, 11)).toBe(true);
    expect(isRevealed(3, 12, 0)).toBe(false);
  });

  it('starts a run with the 5.5 base, 6x6 revealed and the 4.2 stocks', () => {
    const { state } = run(7);
    expect(state.buildings.map((b) => [b.type, b.r, b.c])).toEqual([
      ['home', 5, 5],
      ['sun', 5, 6],
      ['sun', 6, 5],
      ['batt', 4, 5],
      ['pad', 6, 6],
    ]);
    expect(revealedSize(state.ring)).toBe(6);
    expect({ air: state.air, food: state.food, water: state.water, parts: state.parts, soil: state.soil, health: state.health, crew: state.crew, charge: state.charge }).toEqual({
      air: 12, food: 12, water: 6, parts: 8, soil: 0, health: 10, crew: 2, charge: 0,
    });
    expect(state.unlocked).toEqual(['sun', 'o2']);
    expect(state.day).toBe(1);
  });
});
