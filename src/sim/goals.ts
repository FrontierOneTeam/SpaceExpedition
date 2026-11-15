// Starter goals and unlocks (SPEC 7.1), then the goal chooser, land growth and stages (SPEC 18.2).
//
// After the four starter goals, the next goal is chosen from the state of the base and the weather
// the player can already see (today and tomorrow). Every goal asks the player to do something: none
// can be finished by only ending days. The choice is deterministic, never the same kind twice in a
// row, and only offers goals the base can reach.

import {
  BUILDINGS,
  GOAL_CHOOSER,
  GOAL_REWARD_PARTS,
  MAX_GOALS_PER_DAY,
  REPEATING_GOALS_PER_RING,
  RESEARCH_COSTS,
  STAGES,
  STARTER_GOALS,
} from './config.ts';
import { buildingAt, isSheltered } from './placement.ts';
import { powerUse } from './power.ts';
import { checkStage, stageOf, storageLimit } from './storage.ts';
import { revealedSize, expandTerrain, isRevealed } from './terrain.ts';
import type { BuildingType, ChosenGoal, ChosenKind, GameState, GoalInfo, PlaceableType, SimEvent } from './types.ts';

/** The weather the player can see when the next goal is shown: that morning's today and tomorrow. */
export interface GoalWeather {
  today: number;
  tomorrow: number;
}

const NO_WEATHER: GoalWeather = { today: 0, tomorrow: 0 };

function count(state: GameState, type: BuildingType): number {
  return state.buildings.filter((b) => b.type === type).length;
}

function firstHabitatSheltered(state: GameState): boolean {
  const homes = state.buildings.filter((b) => b.type === 'home').sort((a, b) => a.id - b.id);
  return homes.length > 0 && isSheltered(state, homes[0].r, homes[0].c);
}

// ---- What the base can do, from its buildings (not today's luck) ----

/** Machines that make something, can be broken by a storm and may stand under a shelter. Batteries and habitats are not machines here. */
function isMachine(type: BuildingType): boolean {
  const spec = BUILDINGS[type];
  return spec.stormBreakable && spec.canBeSheltered && spec.maxRuns + (type === 'lab' ? 1 : 0) > 0;
}

export function shelteredMachines(state: GameState): number {
  return state.buildings.filter((b) => isMachine(b.type) && isSheltered(state, b.r, b.c)).length;
}

export function openMachines(state: GameState): number {
  return state.buildings.filter((b) => isMachine(b.type) && !isSheltered(state, b.r, b.c)).length;
}

/** Air all the base's machines make in a day when they work. */
export function airRate(state: GameState): number {
  const split = state.research?.includes('split') ? count(state, 'mine') : 0;
  return state.buildings.reduce((n, b) => n + (BUILDINGS[b.type].makes.air ?? 0) * BUILDINGS[b.type].maxRuns, 0) + split;
}

/** Food all the greenhouses make in a day when they work. */
export function foodRate(state: GameState): number {
  return state.buildings.reduce((n, b) => n + (BUILDINGS[b.type].makes.food ?? 0) * BUILDINGS[b.type].maxRuns, 0);
}

function waterRate(state: GameState): number {
  return state.buildings.reduce((n, b) => n + (BUILDINGS[b.type].makes.water ?? 0) * BUILDINGS[b.type].maxRuns, 0);
}

function waterUse(state: GameState): number {
  const each = state.research?.includes('rec') ? 0.5 : BUILDINGS.farm.uses.water ?? 0;
  return count(state, 'farm') * each;
}

/** Power the panels and reactors make in full sunlight. */
export function powerRate(state: GameState): number {
  const pan = state.research?.includes('pan') ? 1 : 0;
  return state.buildings.reduce((n, b) => n + BUILDINGS[b.type].solarOutput + (b.type === 'sun' ? pan : 0), 0);
}

/** Power every building would use. */
export function powerNeed(state: GameState): number {
  return state.buildings.reduce((n, b) => n + powerUse(state, b), 0);
}

export function storageRate(state: GameState): number {
  return state.buildings.reduce((n, b) => n + BUILDINGS[b.type].storage, 0);
}

const NEIGHBOURS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** A surveyed, empty tile on the map. */
function openTile(state: GameState, r: number, c: number): boolean {
  return !!state.terrain[r]?.[c] && isRevealed(state.ring, r, c) && !buildingAt(state, r, c);
}

function besideBuilding(state: GameState, r: number, c: number): boolean {
  return NEIGHBOURS.some(([dr, dc]) => buildingAt(state, r + dr, c + dc) !== null);
}

/** A free tile next to a building where this building could stand. Its cost is not counted. */
function hasSpot(state: GameState, type: BuildingType): boolean {
  if (!state.unlocked.includes(type as PlaceableType)) return false;
  const spec = BUILDINGS[type];
  return state.buildings.some((b) =>
    NEIGHBOURS.some(([dr, dc]) => {
      const r = b.r + dr;
      const c = b.c + dc;
      if (!openTile(state, r, c)) return false;
      if (spec.needsTerrain && state.terrain[r][c] !== spec.needsTerrain) return false;
      return spec.canBeSheltered || !isSheltered(state, r, c);
    }),
  );
}

/** A free deposit that stands next to a building, or one free tile away from one. */
function depositInReach(state: GameState, kind: 'ice' | 'rock'): boolean {
  for (let r = 0; r < state.terrain.length; r++) {
    for (let c = 0; c < state.terrain.length; c++) {
      if (state.terrain[r][c] !== kind || !openTile(state, r, c)) continue;
      if (besideBuilding(state, r, c)) return true;
      if (NEIGHBOURS.some(([dr, dc]) => openTile(state, r + dr, c + dc) && besideBuilding(state, r + dr, c + dc))) return true;
    }
  }
  return false;
}

function researchLeft(state: GameState): boolean {
  return Object.keys(RESEARCH_COSTS).some((id) => !(state.research ?? []).includes(id));
}

// ---- The goal kinds ----

/** How far along a chosen goal is now. */
export function chosenProgress(state: GameState, kind: ChosenKind): number {
  switch (kind) {
    case 'storm_cover':
    case 'shelter_machines':
      return shelteredMachines(state);
    case 'fix_incident':
      return state.buildings.some((b) => b.manualRepair) ? 0 : 1;
    case 'cover_homes':
      return state.buildings.filter((b) => b.type === 'home' && isSheltered(state, b.r, b.c)).length;
    case 'house_crew':
      return state.crew;
    case 'more_air':
      return airRate(state);
    case 'more_food':
      return foodRate(state);
    case 'new_mine':
      return count(state, 'mine');
    case 'new_digger':
      return count(state, 'dig');
    case 'more_power':
      return powerRate(state);
    case 'more_storage':
      return storageRate(state);
    case 'research':
      return (state.research ?? []).length;
  }
}

/** True while the base can still reach a goal of this kind (land, deposits, unlocks). */
function reachable(state: GameState, kind: ChosenKind): boolean {
  switch (kind) {
    case 'storm_cover':
    case 'shelter_machines':
    case 'cover_homes':
      return state.unlocked.includes('shelter');
    case 'fix_incident':
      return true;
    case 'house_crew':
      return hasSpot(state, 'home');
    case 'more_air':
      return hasSpot(state, 'o2');
    case 'more_food':
      return hasSpot(state, 'farm');
    case 'new_mine':
      return state.unlocked.includes('mine') && depositInReach(state, 'ice');
    case 'new_digger':
      return state.unlocked.includes('dig') && depositInReach(state, 'rock');
    case 'more_power':
      return hasSpot(state, 'sun');
    case 'more_storage':
      return hasSpot(state, 'batt');
    case 'research':
      // Research comes once the outpost has a steady supply of parts: from the second stage.
      return state.unlocked.includes('lab') && researchLeft(state) && stageOf(state) >= GOAL_CHOOSER.researchStage;
  }
}

/**
 * The target if this kind can be offered now, or null. A kind is offered only when the base can
 * reach it and needs it, and its target is never met already. Targets come from the base as it is.
 */
function offer(state: GameState, kind: ChosenKind, weather: GoalWeather, filler = false): number | null {
  if (!reachable(state, kind)) return null;
  const G = GOAL_CHOOSER;
  const open = openMachines(state);
  const shelter = shelteredMachines(state) + Math.min(G.shelterStep, open);
  switch (kind) {
    case 'storm_cover':
      return Math.max(weather.today, weather.tomorrow) >= G.stormLevel && open > 0 ? shelter : null;
    case 'shelter_machines':
      return open > 0 ? shelter : null;
    case 'fix_incident':
      return state.buildings.some((b) => b.manualRepair) ? 1 : null;
    case 'cover_homes': {
      const homes = count(state, 'home');
      return chosenProgress(state, 'cover_homes') < homes ? homes : null;
    }
    case 'house_crew':
      return state.crew < crewRoom(state) ? state.crew + G.crewStep : null;
    case 'more_air': {
      const target = state.crew + G.airFoodMargin;
      return airRate(state) < target ? target : null;
    }
    case 'more_food': {
      // A new greenhouse needs water to work.
      const target = state.crew + G.airFoodMargin;
      const water = waterRate(state) >= waterUse(state) + (BUILDINGS.farm.uses.water ?? 0);
      return water && foodRate(state) < target ? target : null;
    }
    case 'new_mine':
      return waterRate(state) < waterUse(state) + G.waterMargin ? count(state, 'mine') + 1 : null;
    case 'new_digger':
      return state.soil < storageLimit(state, 'soil') * G.soilShare ? count(state, 'dig') + 1 : null;
    case 'more_power': {
      // As a filler: a bigger power plant for a bigger outpost.
      // As a filler: spare panels for storm days, more for a bigger outpost.
      if (filler) return Math.max(powerRate(state), powerNeed(state)) + G.powerMargin * scale(state);
      const target = powerNeed(state) + G.powerMargin;
      return powerRate(state) < target ? target : null;
    }
    case 'more_storage':
      // Only as a filler: batteries always help on dark days.
      // Only as a filler: batteries keep power for later, more for a bigger outpost.
      return filler ? storageRate(state) + G.storageStep * scale(state) : null;
    case 'research':
      return (state.research ?? []).length + 1;
  }
}

/**
 * How many crew the house goal works toward: what the next stage needs, and after the last stage one
 * more habitat for every few goals (SPEC 18.2). This keeps the crew growing with progress, not with time.
 */
export function crewRoom(state: GameState): number {
  const i = stageOf(state);
  const next = STAGES[i + 1];
  if (next) return next.crew;
  const last = STAGES[STAGES.length - 1];
  const extra = Math.max(0, goalsCompleted(state) - last.goals);
  return last.crew + GOAL_CHOOSER.crewStep * Math.floor(extra / GOAL_CHOOSER.freePlayGoalsPerHabitat);
}

/** Bigger outposts get bigger filler goals: 1, then one more step for every few crew. */
function scale(state: GameState): number {
  return 1 + Math.floor(state.crew / GOAL_CHOOSER.crewPerScale);
}

/** Urgent kinds, checked first, in this order. */
const URGENT: readonly ChosenKind[] = ['storm_cover', 'fix_incident', 'cover_homes'];

/**
 * Choose the next goal. Deterministic: the same state and weather give the same goal. Urgent goals
 * come first (a storm today or tomorrow, a machine that needs a repair, a habitat without a
 * shelter), then growth goals in turn. `last` is never chosen again straight away.
 */
export function chooseGoal(state: GameState, weather: GoalWeather = NO_WEATHER, last: ChosenKind | undefined = state.goals.lastKind): ChosenGoal | null {
  const rot = GOAL_CHOOSER.rotation;
  const start = state.goals.repeatingDone % rot.length;
  const order: ChosenKind[] = [...URGENT, ...rot.slice(start), ...rot.slice(0, start)];
  const fillers: readonly ChosenKind[] = GOAL_CHOOSER.fillers;
  for (const [i, kind] of [...order, ...fillers].entries()) {
    if (kind === last) continue;
    const target = offer(state, kind, weather, i >= order.length);
    if (target === null) continue;
    if (kind === 'storm_cover') {
      // The storm goal lasts until the storm the player can see has hit.
      const until = weather.today >= GOAL_CHOOSER.stormLevel ? state.day + 1 : state.day + 2;
      return { kind, target, until };
    }
    return { kind, target };
  }
  return null;
}

/** Whether completing the next chosen goal grows the map. */
function chosenGrowsMap(k: number): boolean {
  return (k + 1) % REPEATING_GOALS_PER_RING === 0;
}

/** The goal on screen now, with its target and progress for the progress bar. */
export function currentGoal(state: GameState): GoalInfo {
  const s = state.goals.starterDone;
  if (s < STARTER_GOALS.length) {
    const def = STARTER_GOALS[s];
    const base = { kind: 'starter' as const, index: s, level: 0, rewardParts: GOAL_REWARD_PARTS, growsMap: false, unlocks: def.unlocks.slice() };
    switch (def.id) {
      case 'starter_air':
        return { ...base, id: def.id, target: 1, progress: Math.min(1, count(state, 'o2')) };
      case 'starter_food':
        return { ...base, id: def.id, target: 2, progress: Math.min(1, count(state, 'mine')) + Math.min(1, count(state, 'farm')) };
      case 'starter_soil':
        return { ...base, id: def.id, target: 1, progress: Math.min(1, count(state, 'dig')) };
      case 'starter_cover':
        return { ...base, id: def.id, target: 1, progress: firstHabitatSheltered(state) ? 1 : 0 };
    }
  }
  const k = state.goals.repeatingDone;
  // An old save has no stored goal yet: show what the chooser would pick (it is stored at the end of the day).
  const goal = state.goals.current === undefined ? chooseGoal(state) : state.goals.current;
  // A chosen goal gives no parts: its reward is progress (land, a step to the next stage).
  const base = { kind: 'repeating' as const, index: k, level: 0, rewardParts: 0, growsMap: chosenGrowsMap(k), unlocks: [] };
  if (!goal) return { ...base, id: 'none', target: 1, progress: 0, growsMap: false };
  return { ...base, id: goal.kind, target: goal.target, progress: Math.min(goal.target, chosenProgress(state, goal.kind)) };
}

export function isGoalDone(state: GameState, goal: GoalInfo): boolean {
  if (goal.id === 'none') return false;
  return goal.progress >= goal.target;
}

/**
 * Step 8: check the goal, pay its reward, unlock buildings, grow the map, choose the next goal and
 * reach a new stage. At most one goal completes per day. `weather` is what the player will see next
 * morning (that day and the one after), for choosing the next goal. Changes the state.
 */
export function checkGoals(state: GameState, weather: GoalWeather = NO_WEATHER): SimEvent[] {
  const events: SimEvent[] = [];
  for (let n = 0; n < MAX_GOALS_PER_DAY; n++) {
    const goal = currentGoal(state);
    if (!isGoalDone(state, goal)) break;
    state.parts += goal.rewardParts;
    events.push({ type: 'goal_done', goal });
    if (goal.kind === 'starter') {
      state.goals.starterDone++;
      for (const u of goal.unlocks) {
        if (!state.unlocked.includes(u)) {
          state.unlocked.push(u);
          events.push({ type: 'unlocked', building: u });
        }
      }
      if (state.goals.starterDone === STARTER_GOALS.length) state.goals.current = chooseGoal(state, weather);
    } else {
      state.goals.repeatingDone++;
      state.goals.lastKind = goal.id as ChosenKind;
      if (goal.growsMap) {
        state.ring++;
        expandTerrain(state);
        events.push({ type: 'map_grew', ring: state.ring, size: revealedSize(state.ring) });
      }
      state.goals.current = chooseGoal(state, weather);
    }
  }
  // A goal finished today was replaced just now: the next checks wait for tomorrow.
  const finishedToday = events.some((e) => e.type === 'goal_done');
  if (state.goals.starterDone >= STARTER_GOALS.length && !finishedToday) {
    const cur = state.goals.current;
    if (cur === undefined || cur === null) {
      // An old save, or no goal could be offered: try again. A day with no goal sits between two
      // goals, so after it any kind may come (the same kind is still never shown twice in a row).
      if (cur === null) state.goals.lastKind = undefined;
      state.goals.current = chooseGoal(state, weather);
    } else if (chosenProgress(state, cur.kind) < cur.target && ((cur.until !== undefined && state.day >= cur.until) || !reachable(state, cur.kind))) {
      // A storm goal whose storm has passed, or a goal the base can no longer reach: choose again, with no reward.
      state.goals.lastKind = cur.kind;
      state.goals.current = chooseGoal(state, weather, cur.kind);
    }
  }
  events.push(...checkStage(state));
  return events;
}

export function goalsCompleted(state: GameState): number {
  return state.goals.starterDone + state.goals.repeatingDone;
}
