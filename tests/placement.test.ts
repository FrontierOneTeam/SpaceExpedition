import { describe, expect, it } from 'vitest';
import { canPlace, isSheltered, place, removeBuilding, removeShelter, validTiles } from '../src/sim/placement.ts';
import { addBuilding, addShelter, flatTerrain, lab, run } from './helpers.ts';

describe('building placement (SPEC 4.4, 16.2)', () => {
  it('needs a revealed, empty tile next to a building', () => {
    const { run: r } = lab();
    const s = r.state;
    expect(canPlace(s, 'o2', 4, 4)).toEqual({ ok: true, wastesDeposit: null });
    expect(canPlace(s, 'o2', 5, 5)).toEqual({ ok: false, reason: 'occupied' });
    expect(canPlace(s, 'o2', 3, 3)).toEqual({ ok: false, reason: 'not_adjacent' });
    expect(canPlace(s, 'o2', 4, 6).ok).toBe(true); // diagonal to the habitat, next to battery
    expect(canPlace(s, 'o2', 2, 5)).toEqual({ ok: false, reason: 'not_revealed' });
    expect(canPlace(s, 'o2', -1, 5)).toEqual({ ok: false, reason: 'out_of_bounds' });
  });

  it('counts the pad as a building for adjacency', () => {
    const { run: r } = lab();
    expect(canPlace(r.state, 'o2', 7, 6).ok).toBe(true); // only next to the pad
  });

  it('does not count an empty tile under a shelter as a building', () => {
    const { run: r } = lab();
    const s = r.state;
    addShelter(s, 7, 3); // covers (7,3) (7,4) (8,3) (8,4), all empty
    expect(canPlace(s, 'o2', 8, 5)).toEqual({ ok: false, reason: 'not_adjacent' });
  });

  it('places mine on ice and dig on rock only; flags wasted deposits', () => {
    const { run: r } = lab();
    const s = r.state;
    flatTerrain(s, [[4, 4]], [[4, 6]]);
    expect(canPlace(s, 'mine', 3, 5)).toEqual({ ok: false, reason: 'need_ice' });
    expect(canPlace(s, 'dig', 3, 5)).toEqual({ ok: false, reason: 'need_rock' });
    expect(canPlace(s, 'mine', 4, 4)).toEqual({ ok: true, wastesDeposit: null });
    expect(canPlace(s, 'dig', 4, 6)).toEqual({ ok: true, wastesDeposit: null });
    expect(canPlace(s, 'o2', 4, 4)).toEqual({ ok: true, wastesDeposit: 'ice' });
    expect(canPlace(s, 'sun', 4, 6)).toEqual({ ok: true, wastesDeposit: 'rock' });
    expect(canPlace(s, 'dig', 4, 4)).toEqual({ ok: false, reason: 'need_rock' });
  });

  it('allows building on a crater', () => {
    const { run: r } = lab();
    r.state.terrain[4][4] = 'crater';
    expect(canPlace(r.state, 'o2', 4, 4)).toEqual({ ok: true, wastesDeposit: null });
  });

  it('only unlocked buildings can be placed', () => {
    const s = run(3).state;
    flatTerrain(s);
    expect(canPlace(s, 'o2', 4, 4).ok).toBe(true);
    expect(canPlace(s, 'sun', 4, 4).ok).toBe(true);
    for (const t of ['batt', 'farm', 'home', 'mine', 'dig', 'fab', 'shelter'] as const) {
      expect(canPlace(s, t, 4, 4), t).toEqual({ ok: false, reason: 'locked' });
    }
  });

  it('fails with its own reason when parts or soil are short', () => {
    const { run: r } = lab();
    const s = r.state;
    s.parts = 1;
    expect(canPlace(s, 'o2', 4, 4)).toEqual({ ok: false, reason: 'need_parts' });
    expect(place(s, 'o2', 4, 4)).toEqual({ ok: false, reason: 'need_parts' });
    expect(s.parts).toBe(1);
    s.soil = 0;
    expect(canPlace(s, 'shelter', 5, 5)).toEqual({ ok: false, reason: 'need_soil' });
  });

  it('removing needs no connection check', () => {
    const { run: r } = lab();
    const s = r.state;
    const a = place(s, 'o2', 4, 4);
    const b = place(s, 'o2', 3, 4);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok) expect(removeBuilding(s, a.id)).toEqual({ ok: true });
    expect(s.buildings.some((x) => x.r === 3 && x.c === 4)).toBe(true);
    expect(removeBuilding(s, 999)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('lists valid tiles for the interface', () => {
    const s = run(3).state;
    flatTerrain(s);
    const tiles = validTiles(s, 'o2');
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) expect(canPlace(s, 'o2', t.r, t.c).ok).toBe(true);
  });
});

describe('single tile shelter (user revision)',()=>{
 it('covers only the selected tile for 1 soil',()=>{const s=lab().run.state;expect(place(s,'shelter',5,5).ok).toBe(true);expect(isSheltered(s,5,5)).toBe(true);expect(isSheltered(s,4,5)).toBe(false);expect(s.soil).toBe(99);});
 it('cannot cover panels or the pad',()=>{const s=lab().run.state;for(const [r,c] of [[5,6],[6,5],[6,6]])expect(canPlace(s,'shelter',r,c)).toEqual({ok:false,reason:'cannot_cover'});});
 it('rejects duplicate cover but allows an adjacent tile',()=>{const s=lab().run.state;place(s,'shelter',5,5);expect(canPlace(s,'shelter',5,5)).toEqual({ok:false,reason:'shelter_overlap'});expect(place(s,'shelter',4,5).ok).toBe(true);});
 it('needs a building or an adjoining shelter',()=>{const s=lab().run.state;expect(canPlace(s,'shelter',8,8)).toEqual({ok:false,reason:'not_adjacent'});expect(place(s,'shelter',5,4).ok).toBe(true);});
 it('can be removed without removing the occupant',()=>{const s=lab().run.state;const shield=place(s,'shelter',5,5);expect(shield.ok).toBe(true);if(shield.ok)expect(removeShelter(s,shield.id)).toEqual({ok:true});expect(isSheltered(s,5,5)).toBe(false);expect(s.buildings.some(b=>b.type==='home')).toBe(true);});
 it('retains legacy 2x2 coverage during migration',()=>{const s=lab().run.state;addShelter(s,4,4);expect(isSheltered(s,5,5)).toBe(true);expect(isSheltered(s,4,4)).toBe(true);});
});
