// Small builders for simulation tests.

import archive from '../src/data/archive.json';
import sep2017Json from '../src/data/chapters/sep2017.json';
import { newRun, endDay } from '../src/sim/day.ts';
import { place, validTiles } from '../src/sim/placement.ts';
import { answerQuestion } from '../src/sim/predict.ts';
import type { BuildingType, Chapter, ChapterBook, ChapterDay, GameState, PlaceableType, RadiationLevel, Run } from '../src/sim/types.ts';

export const sep2017 = sep2017Json as unknown as Chapter;
export const book: ChapterBook = { archive: archive as string[], chapters: { sep2017 } };

export const ALL_PLACEABLE: PlaceableType[] = ['sun', 'batt', 'o2', 'farm', 'home', 'mine', 'dig', 'fab', 'shelter'];

/** A made-up test chapter with the given radiation per day (sunlight 1, no flares). */
export function testChapter(radiation: RadiationLevel[], id = 'test'): Chapter {
  const start = Date.UTC(2030, 0, 1);
  const days: ChapterDay[] = radiation.map((r, i) => {
    const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    return { date: d, sunlight: 1, radiation: r, flare: 'none', flares: [] };
  });
  return { id, title: 't', site: 'mars', startDate: days[0].date, setup: '', days, simplified: [] };
}

export function testBook(radiation: RadiationLevel[]): ChapterBook {
  const ch = testChapter(radiation);
  return { archive: [ch.id], chapters: { [ch.id]: ch } };
}

/** A new run on the real chapter. */
export function run(seed = 1): Run {
  return newRun(seed, book);
}

/** Make every tile ordinary ground, then set the listed deposits. */
export function flatTerrain(state: GameState, ice: [number, number][] = [], rock: [number, number][] = []): void {
  for (const row of state.terrain) row.fill('ground');
  for (const [r, c] of ice) state.terrain[r][c] = 'ice';
  for (const [r, c] of rock) state.terrain[r][c] = 'rock';
}

export function unlockAll(state: GameState): void {
  state.unlocked = ALL_PLACEABLE.slice();
}

/** Insert a building directly, skipping placement rules. Returns its id. */
export function addBuilding(state: GameState, type: BuildingType, r: number, c: number): number {
  const id = state.nextId++;
  state.buildings.push({ id, type, r, c, brokenDays: 0, damagedDays: 0 });
  return id;
}

/** Insert a shelter directly. Returns its id. */
export function addShelter(state: GameState, r: number, c: number): number {
  const id = state.nextId++;
  state.shelters.push({ id, r, c });
  return id;
}

export function byId(state: GameState, id: number) {
  const b = state.buildings.find((x) => x.id === id);
  if (!b) throw new Error(`no building ${id}`);
  return b;
}

/**
 * A calm test run (no radiation for `days` days) on flat ground with everything unlocked
 * and plenty of parts and soil. Only the starting base stands.
 */
export function lab(days = 30, radiation?: RadiationLevel[]): { run: Run; book: ChapterBook } {
  const b = testBook(radiation ?? Array<RadiationLevel>(days).fill(0));
  const r = newRun(1, b);
  flatTerrain(r.state);
  unlockAll(r.state);
  r.state.parts = 100;
  r.state.soil = 100;
  return { run: r, book: b };
}

const SCRIPT: PlaceableType[] = ['o2', 'mine', 'farm', 'dig', 'sun', 'shelter', 'fab', 'sun', 'batt'];

/** A fixed, deterministic set of player actions for one morning, then End the day. */
export function scriptedDay(r: Run, b: ChapterBook): void {
  const s = r.state;
  if (s.question) answerQuestion(s, 'break');
  const type = SCRIPT[(s.day - 1) % SCRIPT.length];
  const tiles = validTiles(s, type);
  if (tiles.length > 0) place(s, type, tiles[0].r, tiles[0].c);
  endDay(r, b);
}

/** End n days, returning every day's events. */
export function endDays(r: Run, b: ChapterBook, n: number) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(endDay(r, b));
  return out;
}
