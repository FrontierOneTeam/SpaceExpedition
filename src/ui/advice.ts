// Mission Control's message (SPEC 10.4, 4.9) and the guided-start hint (7.1). Pure: no DOM.

import {
  config,
  currentGoal,
  forecast,
  isGoalDone,
  radioBlocked,
  validTiles,
  buildingAt,
  type Building,
  type Chapter,
  type DayLog,
  type GameState,
  type PlaceableType,
  type Run,
} from '../sim/index.ts';
import { buildingLower } from './info.ts';
import { t, type StringKey } from './strings.ts';

const { BUILDINGS, ROCKET } = config;

export type Mood = 'calm' | 'worried' | 'cheering';

export interface McMessage {
  text: string;
  mood: Mood;
}

// ---- Guided start ----

export type Hint =
  | { kind: 'button'; type: PlaceableType }
  | { kind: 'tile'; r: number; c: number; label: string }
  | null;

function count(state: GameState, type: Building['type']): number {
  return state.buildings.filter((b) => b.type === type).length;
}

function firstHabitat(state: GameState): Building | null {
  return state.buildings.filter((b) => b.type === 'home').sort((a, b) => a.id - b.id)[0] ?? null;
}

/**
 * The one shelter spot that covers the first habitat without touching a solar panel or the pad:
 * the block whose top tile is up and left of the habitat ((4,4) for the starting base).
 */
export function shelterHintTop(state: GameState): { r: number; c: number } | null {
  const home = firstHabitat(state);
  return home ? { r: home.r - 1, c: home.c - 1 } : null;
}

/** A building on the hinted shelter spot that a shelter cannot cover (a solar panel), or null. */
export function shelterBlocker(state: GameState): Building | null {
  const top = shelterHintTop(state);
  if (!top) return null;
  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 2; dc++) {
      const b = buildingAt(state, top.r + dr, top.c + dc);
      if (b && !BUILDINGS[b.type].canBeSheltered) return b;
    }
  }
  return null;
}

/** The building the current starter goal still needs, or null. */
export function starterNeed(state: GameState): PlaceableType | null {
  const goal = currentGoal(state);
  if (goal.kind !== 'starter' || isGoalDone(state, goal)) return null;
  switch (goal.index) {
    case 0:
      return 'o2';
    case 1:
      return count(state, 'mine') === 0 ? 'mine' : 'farm';
    case 2:
      return 'dig';
    default:
      return 'shelter';
  }
}

/** One highlighted hint pointing at the first action for the current starter goal. */
export function guidedHint(state: GameState, selected: PlaceableType | null): Hint {
  if (state.lost) return null;
  const need = starterNeed(state);
  if (!need) return null;
  if (need === 'shelter') {
    const blocker = shelterBlocker(state);
    if (blocker) return { kind: 'tile', r: blocker.r, c: blocker.c, label: t('hint.removePanel') };
    // When the shelter is chosen, the outline at the hinted spot is the pointer.
    return selected === 'shelter' ? null : { kind: 'button', type: 'shelter' };
  }
  if (selected !== need) return { kind: 'button', type: need };
  const tiles = validTiles(state, need);
  const plain = tiles.find((tile) => state.terrain[tile.r][tile.c] !== 'ice' && state.terrain[tile.r][tile.c] !== 'rock');
  const pick = need === 'mine' || need === 'dig' ? tiles[0] : plain ?? tiles[0];
  if (pick) return { kind: 'tile', r: pick.r, c: pick.c, label: t('hint.tap') };
  // No valid tile: point at the nearest deposit so the child builds next to it first.
  if (need === 'mine' || need === 'dig') {
    const kind = need === 'mine' ? 'ice' : 'rock';
    const home = firstHabitat(state);
    let best: { r: number; c: number; d: number } | null = null;
    state.terrain.forEach((row, r) =>
      row.forEach((k, c) => {
        if (k !== kind || buildingAt(state, r, c)) return;
        const d = home ? Math.abs(home.r - r) + Math.abs(home.c - c) : 0;
        if (!best || d < best.d) best = { r, c, d };
      }),
    );
    const found = best as { r: number; c: number; d: number } | null;
    if (found) return { kind: 'tile', r: found.r, c: found.c, label: t('hint.buildNear') };
  }
  return null;
}

// ---- Mission Control ----

function yesterdayLog(state: GameState): DayLog | null {
  const last = state.log[state.log.length - 1];
  return last && last.sol === state.day - 1 ? last : null;
}

/** Advice about a problem that began yesterday, read from yesterday's day log. */
export function adviceFromYesterday(state: GameState): McMessage | null {
  const log = yesterdayLog(state);
  if (!log) return null;
  const ev = log.events;
  const worried = (text: string): McMessage => ({ text, mood: 'worried' });

  for (const e of ev) {
    if (e.type === 'health' && e.cause === 'radiation') return worried(t('mc.radiationHurt'));
  }
  for (const e of ev) {
    if (e.type === 'unpowered' && e.building === 'home') return worried(t('mc.habitatNoPower'));
  }
  for (const e of ev) {
    if (e.type === 'broken') {
      const key: StringKey = e.daysLeft === 1 ? 'mc.brokeOne' : 'mc.brokeMany';
      return worried(t(key, { name: buildingLower(e.building), n: e.daysLeft }));
    }
  }
  for (const e of ev) {
    if (e.type === 'rocket_blocked') return worried(t('mc.rocketBlocked'));
  }
  for (const e of ev) {
    if (e.type === 'unpowered') return worried(t('mc.noPower', { name: buildingLower(e.building) }));
  }
  for (const e of ev) {
    if (e.type === 'missing_input') {
      const key: StringKey = e.resource === 'water' ? 'mc.noWater' : 'mc.noSoil';
      return worried(t(key, { name: buildingLower(e.building) }));
    }
  }
  if (stockChange(log, 'air') < 0) return worried(t('mc.airFalling'));
  if (stockChange(log, 'food') < 0) return worried(t('mc.foodFalling'));
  return null;
}

/** How a day's production and crew use changed air or food. */
export function stockChange(log: DayLog, resource: 'air' | 'food'): number {
  let change = 0;
  for (const e of log.events) {
    if (e.type === 'produced' && e.resource === resource) change += e.amount;
    if (e.type === 'consumed' && e.resource === resource) change -= e.amount;
    if (e.type === 'crew_used') change -= e[resource];
  }
  return change;
}

function goalMessage(state: GameState): McMessage | null {
  const log = yesterdayLog(state);
  if (log && log.events.some((e) => e.type === 'goal_done')) return { text: t('mc.goalDone'), mood: 'cheering' };
  const goal = currentGoal(state);
  if (isGoalDone(state, goal)) return { text: t('mc.goalReady'), mood: 'cheering' };
  if (goal.kind === 'starter') {
    if (goal.index === 3 && shelterBlocker(state)) return { text: t('mc.shelterBlocked'), mood: 'worried' };
    const need = starterNeed(state);
    const key: StringKey | null =
      need === 'o2' ? 'mc.goal.o2' : need === 'mine' ? 'mc.goal.mine' : need === 'farm' ? 'mc.goal.farm' : need === 'dig' ? 'mc.goal.dig' : need === 'shelter' ? 'mc.goal.shelter' : null;
    return key ? { text: t(key), mood: 'calm' } : null;
  }
  return null;
}

const TIPS: StringKey[] = ['mc.tip.power', 'mc.tip.battery', 'mc.tip.shelter', 'mc.tip.rocket', 'mc.tip.stock'];

function idleTip(state: GameState): McMessage {
  return { text: t(TIPS[state.day % TIPS.length], { n: ROCKET.interval }), mood: 'calm' };
}

/**
 * This morning's one message. Priority: tomorrow's weather warning; then advice from Earth
 * (yesterday's problem, goal progress, an idle tip), which a radio blackout replaces.
 * The predict question belongs to phase 3 and is not shown.
 */
export function missionControlMessage(run: Run, chapter: Chapter): McMessage {
  const { tomorrow } = forecast(chapter, run.chapterDay);
  if (tomorrow && tomorrow.radiation >= 2) return { text: t('mc.warnStorm'), mood: 'worried' };
  if (tomorrow && tomorrow.radiation === 1) return { text: t('mc.warnRising'), mood: 'worried' };
  if (radioBlocked(chapter, run.chapterDay)) return { text: t('mc.blackout'), mood: 'worried' };
  const state = run.state;
  return adviceFromYesterday(state) ?? goalMessage(state) ?? idleTip(state);
}
