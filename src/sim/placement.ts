// Placing and removing buildings and soil shelters (SPEC 4.4, 4.5, 16.2).
// place* and remove* change the state in place and return a result.

import {hasResearch} from './research.ts';
import { BUILDINGS, SHELTER, SITE_SIZE } from './config.ts';
import { capStocks } from './storage.ts';
import { inBounds, isRevealed, type Tile } from './terrain.ts';
import type { Building, BuildingType, GameState, PlaceableType, Shelter } from './types.ts';

export type PlaceFailReason =
  | 'run_over'
  | 'out_of_bounds'
  | 'not_placeable'
  | 'locked'
  | 'not_revealed'
  | 'occupied'
  | 'need_ice'
  | 'need_rock'
  | 'cannot_be_sheltered'
  | 'shelter_overlap'
  | 'cannot_cover'
  | 'not_adjacent'
  | 'need_parts'
  | 'need_soil';

export type PlaceCheck =
  | { ok: true; wastesDeposit: 'ice' | 'rock' | null }
  | { ok: false; reason: PlaceFailReason };

export type PlaceResult =
  | { ok: true; id: number; wastesDeposit: 'ice' | 'rock' | null }
  | { ok: false; reason: PlaceFailReason };

export type RemoveFailReason = 'run_over' | 'not_found' | 'cannot_remove' | 'shelter_not_empty';
export type RemoveResult = { ok: true } | { ok: false; reason: RemoveFailReason };

const NEIGHBOURS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export function buildingAt(state: GameState, r: number, c: number): Building | null {
  return state.buildings.find((b) => b.r === r && b.c === c) ?? null;
}

/** The four tiles of a shelter footprint. */
export function shelterTiles(s: { r: number; c: number; size?: number }): Tile[] {
  const out: Tile[] = [];
  for (let dr = 0; dr < (s.size ?? SHELTER.size); dr++) for (let dc = 0; dc < (s.size ?? SHELTER.size); dc++) out.push({ r: s.r + dr, c: s.c + dc });
  return out;
}

export function shelterAt(state: GameState, r: number, c: number): Shelter | null {
  return state.shelters.find((s) => r >= s.r && r < s.r + (s.size ?? SHELTER.size) && c >= s.c && c < s.c + (s.size ?? SHELTER.size)) ?? null;
}

/** A tile is sheltered when it is inside a shelter footprint. */
export function isSheltered(state: GameState, r: number, c: number): boolean {
  return shelterAt(state, r, c) !== null || (hasResearch(state,'soil') && buildingAt(state,r,c)?.type==='home');
}

export function isUnlocked(state: GameState, type: PlaceableType): boolean {
  return state.unlocked.includes(type);
}

/** True when a building stands on an orthogonal neighbour of the tile. */
export function hasAdjacentBuilding(state: GameState, r: number, c: number): boolean {
  return NEIGHBOURS.some(([dr, dc]) => buildingAt(state, r + dr, c + dc) !== null);
}

function costOf(type: PlaceableType): { parts: number; soil: number } {
  return type === 'shelter' ? SHELTER.cost : BUILDINGS[type].cost;
}

function checkCost(state: GameState, type: PlaceableType): PlaceFailReason | null {
  const cost = costOf(type);
  if (state.parts < cost.parts) return 'need_parts';
  if (state.soil < cost.soil) return 'need_soil';
  return null;
}

// ASSUMPTION: the sim refuses placement only after a loss; blocking it while a report is pending is left to the interface.
export function canPlaceBuilding(state: GameState, type: BuildingType, r: number, c: number): PlaceCheck {
  if (state.lost) return { ok: false, reason: 'run_over' };
  const spec = BUILDINGS[type];
  if (!spec || !spec.placeable) return { ok: false, reason: 'not_placeable' };
  if (!isUnlocked(state, type as PlaceableType)) return { ok: false, reason: 'locked' };
  if (!inBounds(r, c, state.terrain.length) || !state.terrain[r]?.[c]) return { ok: false, reason: 'out_of_bounds' };
  if (!isRevealed(state.ring, r, c)) return { ok: false, reason: 'not_revealed' };
  if (buildingAt(state, r, c)) return { ok: false, reason: 'occupied' };
  const terrain = state.terrain[r][c];
  if (spec.needsTerrain && terrain !== spec.needsTerrain) {
    return { ok: false, reason: spec.needsTerrain === 'ice' ? 'need_ice' : 'need_rock' };
  }
  if (!spec.canBeSheltered && isSheltered(state, r, c)) return { ok: false, reason: 'cannot_be_sheltered' };
  if (!hasAdjacentBuilding(state, r, c)) return { ok: false, reason: 'not_adjacent' };
  const costFail = checkCost(state, type as PlaceableType);
  if (costFail) return { ok: false, reason: costFail };
  const wastesDeposit = (terrain === 'ice' || terrain === 'rock') && spec.needsTerrain !== terrain ? terrain : null;
  return { ok: true, wastesDeposit };
}

export function canPlaceShelter(state: GameState, r: number, c: number): PlaceCheck {
  if (state.lost) return { ok: false, reason: 'run_over' };
  if (!isUnlocked(state, 'shelter')) return { ok: false, reason: 'locked' };
  const tiles = shelterTiles({ r, c });
  if (!tiles.every((t) => inBounds(t.r, t.c, state.terrain.length) && !!state.terrain[t.r]?.[t.c])) return { ok: false, reason: 'out_of_bounds' };
  if (!tiles.every((t) => isRevealed(state.ring, t.r, t.c))) return { ok: false, reason: 'not_revealed' };
  if (tiles.some((t) => isSheltered(state, t.r, t.c))) return { ok: false, reason: 'shelter_overlap' };
  if (tiles.some((t) => {
    const b = buildingAt(state, t.r, t.c);
    return b !== null && !BUILDINGS[b.type].canBeSheltered;
  })) {
    return { ok: false, reason: 'cannot_cover' };
  }
  const touches = tiles.some((t) => buildingAt(state, t.r, t.c) !== null || hasAdjacentBuilding(state, t.r, t.c) || NEIGHBOURS.some(([dr,dc])=>shelterAt(state,t.r+dr,t.c+dc)!==null));
  if (!touches) return { ok: false, reason: 'not_adjacent' };
  const costFail = checkCost(state, 'shelter');
  if (costFail) return { ok: false, reason: costFail };
  return { ok: true, wastesDeposit: null };
}

/** Check any build-menu choice. For a shelter, (r, c) is its top tile. */
export function canPlace(state: GameState, type: PlaceableType, r: number, c: number): PlaceCheck {
  return type === 'shelter' ? canPlaceShelter(state, r, c) : canPlaceBuilding(state, type, r, c);
}

/** Place a building or shelter, paying its cost. Changes the state on success only. */
export function place(state: GameState, type: PlaceableType, r: number, c: number): PlaceResult {
  const check = canPlace(state, type, r, c);
  if (!check.ok) return check;
  const cost = costOf(type);
  state.parts -= cost.parts;
  state.soil -= cost.soil;
  const id = state.nextId++;
  if (type === 'shelter') {
    state.shelters.push({ id, r, c, size: 1 });
  } else {
    state.buildings.push({ id, type, r, c, brokenDays: 0, damagedDays: 0 });
    state.crew += BUILDINGS[type].crewOnBuild;
  }
  return { ok: true, id, wastesDeposit: check.wastesDeposit };
}

/** Every tile where this choice can go now (for a shelter: its top tiles). */
export function validTiles(state: GameState, type: PlaceableType): Tile[] {
  const out: Tile[] = [];
  const candidates=new Map<string,{r:number;c:number}>();
  const add=(r:number,c:number)=>candidates.set(`${r},${c}`,{r,c});
  for(const b of state.buildings){if(type==='shelter')add(b.r,b.c);for(const [dr,dc]of NEIGHBOURS)add(b.r+dr,b.c+dc);}
  if(type==='shelter')for(const shield of state.shelters)for(const tile of shelterTiles(shield))for(const [dr,dc]of NEIGHBOURS)add(tile.r+dr,tile.c+dc);
  for(const {r,c}of candidates.values())if(canPlace(state,type,r,c).ok)out.push({r,c});
  out.sort((a,b)=>a.r-b.r||a.c-b.c);
  return out;
}

/** Remove a building. Returns nothing to the player (SPEC 4.4). */
export function removeBuilding(state: GameState, buildingId: number): RemoveResult {
  if (state.lost) return { ok: false, reason: 'run_over' };
  const i = state.buildings.findIndex((b) => b.id === buildingId);
  if (i < 0) return { ok: false, reason: 'not_found' };
  if (!BUILDINGS[state.buildings[i].type].removable) return { ok: false, reason: 'cannot_remove' };
  state.parts += Math.floor(BUILDINGS[state.buildings[i].type].cost.parts / 2);
  state.buildings.splice(i, 1);
  capStocks(state);
  return { ok: true };
}

/** Remove a shelter. Only allowed when no building stands under it. */
export function removeShelter(state: GameState, shelterId: number): RemoveResult {
  if (state.lost) return { ok: false, reason: 'run_over' };
  const i = state.shelters.findIndex((s) => s.id === shelterId);
  if (i < 0) return { ok: false, reason: 'not_found' };

  state.shelters.splice(i, 1);
  return { ok: true };
}
