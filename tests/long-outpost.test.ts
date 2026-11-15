import {isRevealed,expandTerrain} from '../src/sim/terrain.ts';
import {describe,it,expect} from 'vitest';
import {newRun} from '../src/sim/index.ts';
import {book} from './helpers.ts';
import {moveBuilding} from '../src/sim/move.ts';
describe('long outpost contracts',()=>{
 it('expands past the original boundary without replacing terrain',()=>{const s=newRun(9,book).state;const old=JSON.stringify(s.terrain);s.ring=4;expandTerrain(s);expect(s.terrain.length).toBeGreaterThan(12);expect(JSON.stringify(s.terrain.slice(0,12).map(r=>r.slice(0,12)))).toBe(old);});
 it('moves preserve identity and damage',()=>{const s=newRun(9,book).state;const b=s.buildings.find(b=>b.type==='batt')!;b.brokenDays=2;const crew=s.crew;expect(moveBuilding(s,b.id,4,6).ok).toBe(true);expect(b.brokenDays).toBe(2);expect(s.crew).toBe(crew);});
});

it('never hides surveyed land again and keeps arrays square through 500 expansions', () => {
  const s = newRun(3, book).state;
  let previous = new Set<number>();
  for (let ring = 3; ring < 500; ring++) {
    s.ring = ring;
    expandTerrain(s);
    const current = new Set<number>();
    const len = s.terrain.length;
    for (let r = 0; r < len; r++) {
      for (let c = 0; c < len; c++) {
        if (isRevealed(ring, r, c)) current.add((r << 10) | c);
      }
    }
    let keptAll = true;
    for (const key of previous) {
      if (!current.has(key)) {
        keptAll = false;
        break;
      }
    }
    expect(keptAll).toBe(true);
    expect(current.size).toBe(144 + 16 * (ring - 3));
    expect(s.terrain.every((row) => row.length === len)).toBe(true);
    previous = current;
  }
});
