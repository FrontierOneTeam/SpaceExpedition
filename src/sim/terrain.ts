// Site generation (SPEC 5.4), revealed rings (5.3) and the starting base (5.5).

import { REVEAL_RINGS, SITE_SIZE, STARTING_BASE, TERRAIN } from './config.ts';
import { createRng, shuffle, type Rng } from './rng.ts';
import type { Building, TerrainKind } from './types.ts';

export interface Tile {
  r: number;
  c: number;
}

export function inBounds(r: number, c: number, size=SITE_SIZE): boolean {
  return Number.isInteger(r) && Number.isInteger(c) && r >= 0 && c >= 0 && r < size && c < size;
}

/** The ring a tile first appears in: 0 for the starting area, up to REVEAL_RINGS.length - 1. */
export function ringOf(r: number, c: number): number {
  for (let i = 0; i < REVEAL_RINGS.length; i++) {
    const ring = REVEAL_RINGS[i];
    if (r >= ring.min && r <= ring.max && c >= ring.min && c <= ring.max) return i;
  }
  return REVEAL_RINGS.length - 1;
}

/** True when the tile is inside the revealed area for this ring index. */
export function isRevealed(ring: number, r: number, c: number): boolean {
  if (ring < REVEAL_RINGS.length) {
    const bounds = REVEAL_RINGS[Math.max(0, ring)];
    return inBounds(r, c, bounds.max + 1) && r >= bounds.min && c >= bounds.min && r <= bounds.max && c <= bounds.max;
  }
  const bounds = revealBounds(ring);
  if (!inBounds(r, c, bounds.max + 1)) return false;
  const m = r > c ? r : c;
  const order = m * m + (r === m ? c : m + 1 + r);
  return order < SITE_SIZE * SITE_SIZE + 16 * (ring - REVEAL_RINGS.length + 1);
}

/** Width and height of the revealed area for a ring index. */
export function revealedSize(ring: number): number {
  return revealBounds(ring).size;
}

export function manhattan(a: Tile, b: Tile): number {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

export function startingBase(): Building[] {
  return STARTING_BASE.map((b, i) => ({ id: i + 1, type: b.type, r: b.r, c: b.c, brokenDays: 0, damagedDays: 0 }));
}

function allTiles(): Tile[] {
  const out: Tile[] = [];
  for (let r = 0; r < SITE_SIZE; r++) for (let c = 0; c < SITE_SIZE; c++) out.push({ r, c });
  return out;
}

/** Generate the whole site from a site number. Same number, same site. */
export function generateTerrain(siteNumber: number): TerrainKind[][] {
  const rng: Rng = createRng(siteNumber);
  const grid: TerrainKind[][] = Array.from({ length: SITE_SIZE }, () => Array<TerrainKind>(SITE_SIZE).fill('ground'));
  const base = STARTING_BASE.map((b) => ({ r: b.r, c: b.c }));
  const isBaseTile = (t: Tile) => base.some((b) => b.r === t.r && b.c === t.c);
  const free = (t: Tile) => grid[t.r][t.c] === 'ground' && !isBaseTile(t);
  const tiles = allTiles();
  const counts = { ice: 0, rock: 0 };

  const placeOne = (kind: 'ice' | 'rock' | 'crater', candidates: Tile[]): void => {
    const pick = shuffle(rng, candidates.filter(free))[0];
    if (!pick) return;
    grid[pick.r][pick.c] = kind;
    if (kind !== 'crater') counts[kind]++;
  };

  // Near the base, inside the starting area (SPEC 5.4, 16.2).
  const near = tiles.filter(
    (t) => ringOf(t.r, t.c) === 0 && base.some((b) => manhattan(b, t) <= TERRAIN.nearBaseDistance),
  );
  for (let i = 0; i < TERRAIN.nearBaseIce; i++) placeOne('ice', near);
  for (let i = 0; i < TERRAIN.nearBaseRock; i++) placeOne('rock', near);

  // Each later ring.
  for (let ring = 1; ring < REVEAL_RINGS.length; ring++) {
    const inRing = tiles.filter((t) => ringOf(t.r, t.c) === ring);
    for (let i = 0; i < TERRAIN.perRingIce; i++) placeOne('ice', inRing);
    for (let i = 0; i < TERRAIN.perRingRock; i++) placeOne('rock', inRing);
  }

  // The rest anywhere.
  while (counts.ice < TERRAIN.ice) placeOne('ice', tiles);
  while (counts.rock < TERRAIN.rock) placeOne('rock', tiles);
  for (let i = 0; i < TERRAIN.craters; i++) placeOne('crater', tiles);

  return grid;
}

/** Initial rings stay fixed; later surveys add land to the east and south. */
export function revealBounds(ring:number):{min:number;max:number;size:number} {
 if(ring<REVEAL_RINGS.length) return REVEAL_RINGS[Math.max(0,ring)];
 const size=Math.ceil(Math.sqrt(SITE_SIZE*SITE_SIZE+16*(ring-REVEAL_RINGS.length+1)));return {min:0,max:size-1,size};
}
/** Coordinate-derived deposits: extending a save never regenerates existing ground. */
export function expandTerrain(state:import('./types.ts').GameState):void {
 const size=revealedSize(state.ring);const previous=state.terrain.length;
 if(size<=previous)return;
 for(let r=0;r<size;r++){
  state.terrain[r] ??=[];
  for(let c=0;c<size;c++) if(r>=previous||c>=previous){
   const value=((r*73856093)^(c*19349663)^(state.terrainSeed??1))>>>0;
   state.terrain[r][c]=value%9===0?'ice':value%9===1?'rock':'ground';
  }
 }
 // Each added edge has accessible deposits even for unlucky coordinate hashes.
 state.terrain[previous][previous]='ice';state.terrain[previous][previous-1]='rock';
}
