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
    s.soil = 3;
    expect(canPlace(s, 'shelter', 3, 3)).toEqual({ ok: false, reason: 'need_soil' });
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

describe('soil shelter (SPEC 4.5)', () => {
  it('covers a 2x2 block from its top tile; a tile inside is sheltered', () => {
    const { run: r } = lab();
    const s = r.state;
    const res = place(s, 'shelter', 4, 4); // (4,4) (4,5) batt (5,4) (5,5) home
    expect(res.ok).toBe(true);
    for (const [rr, cc] of [[4, 4], [4, 5], [5, 4], [5, 5]]) expect(isSheltered(s, rr, cc)).toBe(true);
    for (const [rr, cc] of [[3, 4], [4, 3], [5, 6], [6, 5], [6, 6]]) expect(isSheltered(s, rr, cc)).toBe(false);
    expect(s.soil).toBe(96);
  });

  it('never covers a solar panel or the pad', () => {
    const { run: r } = lab();
    const s = r.state;
    expect(canPlace(s, 'shelter', 4, 5)).toEqual({ ok: false, reason: 'cannot_cover' }); // (5,6) sun
    expect(canPlace(s, 'shelter', 5, 4)).toEqual({ ok: false, reason: 'cannot_cover' }); // (6,5) sun
    expect(canPlace(s, 'shelter', 6, 6)).toEqual({ ok: false, reason: 'cannot_cover' }); // pad
  });

  it('may not overlap another shelter', () => {
    const { run: r } = lab();
    const s = r.state;
    expect(place(s, 'shelter', 4, 4).ok).toBe(true);
    expect(canPlace(s, 'shelter', 3, 3)).toEqual({ ok: false, reason: 'shelter_overlap' });
    expect(canPlace(s, 'shelter', 3, 4)).toEqual({ ok: false, reason: 'shelter_overlap' });
    expect(canPlace(s, 'shelter', 2, 4)).toEqual({ ok: false, reason: 'not_revealed' });
    expect(canPlace(s, 'shelter', 3, 6).ok).toBe(true); // beside it, no overlap
  });

  it('needs one of its tiles to hold or touch a building', () => {
    const { run: r } = lab();
    const s = r.state;
    expect(canPlace(s, 'shelter', 7, 3)).toEqual({ ok: false, reason: 'not_adjacent' });
    expect(canPlace(s, 'shelter', 6, 3).ok).toBe(true); // (6,4) touches the panel at (6,5)
    expect(canPlace(s, 'shelter', 8, 8)).toEqual({ ok: false, reason: 'not_revealed' });
  });

  it('buildings may go under an existing shelter later, except panels', () => {
    const { run: r } = lab();
    const s = r.state;
    expect(place(s, 'shelter', 3, 4).ok).toBe(true); // (3,4) (3,5) (4,4) (4,5) batt
    expect(canPlace(s, 'o2', 4, 4).ok).toBe(true);
    expect(canPlace(s, 'sun', 4, 4)).toEqual({ ok: false, reason: 'cannot_be_sheltered' });
    expect(canPlace(s, 'sun', 3, 4)).toEqual({ ok: false, reason: 'cannot_be_sheltered' });
  });

  it('a shelter with a building under it cannot be removed; an empty one can', () => {
    const { run: r } = lab();
    const s = r.state;
    const full = place(s, 'shelter', 4, 4);
    const other = place(s, 'shelter', 6, 3); // (6,3) (6,4) (7,3) (7,4), empty, touches panel
    expect(full.ok && other.ok).toBe(true);
    if (full.ok) expect(removeShelter(s, full.id)).toEqual({ ok: false, reason: 'shelter_not_empty' });
    if (other.ok) expect(removeShelter(s, other.id)).toEqual({ ok: true });
    expect(isSheltered(s, 6, 3)).toBe(false);
  });

  it('a building under a shelter still counts for adjacency', () => {
    const { run: r } = lab();
    const s = r.state;
    addShelter(s, 3, 3);
    addBuilding(s, 'o2', 4, 4);
    expect(canPlace(s, 'o2', 3, 4).ok).toBe(true); // next to the o2
    expect(canPlace(s, 'o2', 3, 3).ok).toBe(false); // diagonal only
  });
});
