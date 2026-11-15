import { describe, expect, it } from 'vitest';
import { endDay, newRun } from '../src/sim/day.ts';
import { place } from '../src/sim/placement.ts';
import { failureChain } from '../src/ui/failureChain.ts';
import { book, flatTerrain, lab } from './helpers.ts';

describe('failure chain (SPEC 4.10, 10.6)', () => {
  it('an idle run lost on air shows the direct cause alone', () => {
    const run = newRun(4821, book);
    for (let i = 0; i < 20 && !run.state.lost; i++) endDay(run, book);
    expect(run.state.lost?.cause).toBe('air');
    const chain = failureChain(run.state);
    expect(chain).toHaveLength(1);
    expect(chain[0].icon).toBe('air');
    expect(chain[0].text).toBe(`Air ran out on sol ${run.state.lost!.sol}.`);
  });

  it('a storm that broke the greenhouse links through to food running out', () => {
    const { run, book: b } = lab(10, [3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const s = run.state;
    flatTerrain(s, [[4, 6]]);
    expect(place(s, 'mine', 4, 6).ok).toBe(true);
    expect(place(s, 'farm', 3, 5).ok).toBe(true);
    s.food = 1;
    s.buildings.find(b=>b.type==='farm')!.manualRepair=true;
    s.air = 30;
    for (let i = 0; i < 10 && !s.lost; i++) endDay(run, b);
    expect(s.lost?.cause).toBe('food');
    const chain = failureChain(s);
    expect(chain.map((p) => p.icon)).toEqual(['broken', 'food', 'food']);
    expect(chain[0].text).toBe('The storm broke the greenhouse.');
    expect(chain[1].text).toContain('Food fell');
    expect(chain[2].text).toBe(`Food ran out on sol ${s.lost!.sol}.`);
  });

  it('is empty while the run goes on', () => {
    expect(failureChain(newRun(1, book).state)).toEqual([]);
  });
});
