import { describe, expect, it } from 'vitest';
import { cloneRun, newRun } from '../src/sim/day.ts';
import type { Run } from '../src/sim/types.ts';
import { book, scriptedDay } from './helpers.ts';

function play(seed: number, days: number, from?: Run): Run {
  const r = from ?? newRun(seed, book);
  for (let i = 0; i < days; i++) scriptedDay(r, book);
  return r;
}

describe('determinism', () => {
  it('same seed and same actions give an identical final state', () => {
    for (const seed of [1, 42, 4821]) {
      const a = play(seed, 14);
      const b = play(seed, 14);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.state.buildings.length).toBeGreaterThan(5); // the script really built things
    }
  });

  it('a JSON round trip mid-run gives the same final state', () => {
    const a = play(7, 14);
    const half = play(7, 7);
    const restored = JSON.parse(JSON.stringify(half)) as Run;
    expect(restored).toEqual(half);
    play(7, 7, restored);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(a));
  });

  it('cloneRun makes an independent, equal copy', () => {
    const a = play(3, 5);
    const b = cloneRun(a);
    expect(b).toEqual(a);
    b.state.parts += 1;
    expect(b.state.parts).not.toBe(a.state.parts);
  });
});
