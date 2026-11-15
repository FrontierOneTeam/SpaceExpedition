// Mission Control's message (SPEC 10.4, 4.9) and the guided-start hint (7.1). Pure: no DOM.

import {
  config,
  currentGoal,
  forecast,
  isGoalDone,
  isUnlocked,
  radioBlocked,
  resolvePower,
  validTiles,
  buildingAt,
  isSheltered,
  type Building,
  type Chapter,
  type DayLog,
  type DayPreview,
  type GameState,
  type PlaceableType,
  type Run,
  type GoalId,
  type ChosenKind,
} from '../sim/index.ts';
import { buildingLower, strongestClass } from './info.ts';
import { t, type StringKey } from './strings.ts';

const { BUILDINGS, RESEARCH_COSTS, ROCKET } = config;

export type Mood = 'calm' | 'worried' | 'cheering';

export interface McMessage {
  text: string;
  mood: Mood;
  /** True when the message is the predict question, shown with its answer buttons. */
  question?: boolean;
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
  return home ? { r: home.r, c: home.c } : null;
}

/** A building on the hinted shelter spot that a shelter cannot cover (a solar panel), or null. */
export function shelterBlocker(_state:GameState):Building|null { return null; }

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

// ---- What to do next (SPEC 16.4.2) ----

/** The control the next action marks with the amber ring. */
export type NextTarget =
  | { kind: 'build'; type: PlaceableType }
  | { kind: 'tiles' }
  | { kind: 'tile'; r: number; c: number }
  | { kind: 'remove' }
  | { kind: 'end' }
  | null;

export interface NextAction {
  text: string;
  target: NextTarget;
  /** A building is picked: show Cancel next to the line. */
  cancel: boolean;
}

function canAfford(state: GameState, type: PlaceableType): boolean {
  const cost = type === 'shelter' ? config.SHELTER.cost : BUILDINGS[type].cost;
  return state.parts >= cost.parts && state.soil >= cost.soil;
}

/** Unlocked, affordable and with at least one valid tile. */
function canBuildNow(state: GameState, type: PlaceableType): boolean {
  return state.unlocked.includes(type) && canAfford(state, type) && validTiles(state, type).length > 0;
}

/** One short sentence on why nothing can be placed for the picked building. */
function noTileReason(state: GameState, type: PlaceableType): string {
  const cost = type === 'shelter' ? config.SHELTER.cost : BUILDINGS[type].cost;
  if (state.parts < cost.parts) return t('next.needParts', { n: cost.parts, have: state.parts });
  if (state.soil < cost.soil) return t('next.needSoil', { n: cost.soil, have: state.soil });
  if (type === 'mine') return t('next.noIce');
  if (type === 'dig') return t('next.noRock');
  if (type === 'shelter') return t('next.noShelter');
  return t('next.noTile');
}

function pick(state: GameState, type: PlaceableType, key: StringKey = 'next.pick'): NextAction {
  return { text: t(key, { name: buildingLower(type) }), target: { kind: 'build', type }, cancel: false };
}

const END = (key: StringKey): NextAction => ({ text: t(key), target: { kind: 'end' }, cancel: false });

/** Is any habitat, or at a storm level any breakable building, standing outside a shelter? */
function stormExposed(state: GameState, level: number): boolean {
  return state.buildings.some((b) => {
    if (isSheltered(state, b.r, b.c)) return false;
    if (b.type === 'home') return true;
    return level >= 2 && BUILDINGS[b.type].stormBreakable && BUILDINGS[b.type].canBeSheltered;
  });
}

/**
 * The next action in plain words and the control it marks. `openBuilding` is the building whose
 * card is open in the message area, if any. Null while the run is stopped or a report is pending.
 */
export function nextAction(run: Run, chapter: Chapter, selected: PlaceableType | null, preview: DayPreview, openBuilding: number | null = null): NextAction | null {
  const state = run.state;
  if (state.lost || run.pendingReport) return null;

  if (selected) {
    if (validTiles(state, selected).length === 0) return { text: noTileReason(state, selected), target: null, cancel: true };
    return { text: t('next.tap', { name: buildingLower(selected) }), target: { kind: 'tiles' }, cancel: true };
  }

  const goal = currentGoal(state);
  if (isGoalDone(state, goal)) return END('next.goalDone');

  const need = starterNeed(state);
  if (need === 'shelter') {
    const blocker = shelterBlocker(state);
    if (blocker) {
      if (openBuilding === blocker.id) return { text: t('next.tapRemove'), target: { kind: 'remove' }, cancel: false };
      return { text: t('next.removePanel'), target: { kind: 'tile', r: blocker.r, c: blocker.c }, cancel: false };
    }
  }
  if (need) {
    if (canBuildNow(state, need)) return pick(state, need);
    if ((need === 'mine' || need === 'dig') && canAfford(state, need)) {
      const hint = guidedHint(state, need);
      if (hint && hint.kind === 'tile') return { text: t('next.buildNear'), target: { kind: 'tile', r: hint.r, c: hint.c }, cancel: false };
    }
    return END('next.needMore');
  }

  const { tomorrow } = forecast(chapter, run.chapterDay);
  if (tomorrow && tomorrow.radiation > 0 && stormExposed(state, tomorrow.radiation) && canBuildNow(state, 'shelter')) return pick(state, 'shelter', 'next.storm');

  if (preview.power.unpowered.length > 0 && canBuildNow(state, 'sun')) return { ...pick(state, 'sun'), text: t('next.power') };

  return chosenGoalAction(state, goal.id);
}

/** What to build for each chosen goal (SPEC 18.2). */
const GOAL_BUILD: Partial<Record<GoalId, PlaceableType>> = {
  storm_cover: 'shelter',
  shelter_machines: 'shelter',
  cover_homes: 'shelter',
  house_crew: 'home',
  more_air: 'o2',
  more_food: 'farm',
  new_mine: 'mine',
  new_digger: 'dig',
  more_power: 'sun',
  more_storage: 'batt',
};

function chosenGoalAction(state: GameState, id: GoalId): NextAction {
  if (id === 'fix_incident') return { text: t('next.repair'), target: null, cancel: false };
  if (id === 'research') {
    if (!state.buildings.some((b) => b.type === 'lab')) return canBuildNow(state, 'lab') ? pick(state, 'lab') : END('next.end');
    const pts = state.researchPoints ?? 0;
    const can = Object.entries(RESEARCH_COSTS).some(([rid, cost]) => !(state.research ?? []).includes(rid) && pts >= cost);
    return can ? { text: t('next.research'), target: null, cancel: false } : END('next.waitResearch');
  }
  const type = GOAL_BUILD[id];
  if (!type) return END('next.end');
  if (canBuildNow(state, type)) return pick(state, type);
  if ((type === 'mine' || type === 'dig') && canAfford(state, type)) return { text: t('next.buildNear'), target: { kind: 'build', type: 'sun' }, cancel: false };
  return END('next.needMore');
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

function goalStatusMessage(state: GameState): McMessage | null {
  const log = yesterdayLog(state);
  if (log && log.events.some((e) => e.type === 'goal_done')) return { text: t('mc.goalDone'), mood: 'cheering' };
  const goal = currentGoal(state);
  if (isGoalDone(state, goal)) return { text: t('mc.goalReady'), mood: 'cheering' };
  return null;
}

function starterGoalMessage(state: GameState): McMessage | null {
  const goal = currentGoal(state);
  if (goal.kind !== 'starter') return null;
  if (goal.index === 3 && shelterBlocker(state)) return { text: t('mc.shelterBlocked'), mood: 'worried' };
  const need = starterNeed(state);
  const key: StringKey | null =
    need === 'o2' ? 'mc.goal.o2' : need === 'mine' ? 'mc.goal.mine' : need === 'farm' ? 'mc.goal.farm' : need === 'dig' ? 'mc.goal.dig' : need === 'shelter' ? 'mc.goal.shelter' : null;
  return key ? { text: t(key), mood: 'calm' } : null;
}

const GOAL_COACH: Record<ChosenKind, StringKey> = {
  storm_cover: 'mc.goal.storm_cover',
  fix_incident: 'mc.goal.fix_incident',
  cover_homes: 'mc.goal.cover_homes',
  house_crew: 'mc.goal.house_crew',
  more_air: 'mc.goal.more_air',
  more_food: 'mc.goal.more_food',
  new_mine: 'mc.goal.new_mine',
  new_digger: 'mc.goal.new_digger',
  more_power: 'mc.goal.more_power',
  more_storage: 'mc.goal.more_storage',
  shelter_machines: 'mc.goal.shelter_machines',
  research: 'mc.goal.research',
};

function repeatingGoalMessage(state: GameState): McMessage | null {
  const goal = currentGoal(state);
  if (goal.kind !== 'repeating' || goal.id === 'none') return null;
  const kind = goal.id as ChosenKind;
  const worried = kind === 'storm_cover' || kind === 'fix_incident' || kind === 'cover_homes';
  return { text: t(GOAL_COACH[kind], { have: goal.progress, target: goal.target }), mood: worried ? 'worried' : 'calm' };
}

const TIPS: StringKey[] = ['mc.tip.power', 'mc.tip.battery', 'mc.tip.shelter', 'mc.tip.rocket', 'mc.tip.stock'];

function idleTip(state: GameState): McMessage {
  return { text: t(TIPS[state.day % TIPS.length], { n: ROCKET.interval }), mood: 'calm' };
}

/**
 * This morning's one message. Priority: the predict question; tomorrow's weather warning; then
 * advice from Earth (yesterday's problem, goal progress, active storm/flare/power/research coaching,
 * an idle tip), which a radio blackout replaces. The question and the warning never depend on the radio (SPEC 4.9, 10.4).
 */
export function missionControlMessage(run: Run, chapter: Chapter): McMessage {
  const q = run.state.question;
  if (q && !run.state.lost) return { text: t('mc.question', { name: buildingLower(q.building) }), mood: 'worried', question: true };
  const { today, tomorrow } = forecast(chapter, run.chapterDay);
  // A game storm is called one; a storm from a NASA report keeps the plain warning (SPEC 18.1).
  const nasa = tomorrow?.stormSource === 'nasa-report';
  if (tomorrow && tomorrow.radiation >= 2) return { text: t(nasa ? 'mc.warnStorm' : 'mc.warnGameStorm'), mood: 'worried' };
  if (tomorrow && tomorrow.radiation === 1) return { text: t(nasa ? 'mc.warnRising' : 'mc.warnGameRising'), mood: 'worried' };
  if (radioBlocked(chapter, run.chapterDay)) return { text: t('mc.blackout'), mood: 'worried' };
  const state = run.state;
  const yesterday = adviceFromYesterday(state);
  if (yesterday) return yesterday;
  const doneOrReady = goalStatusMessage(state);
  if (doneOrReady) return doneOrReady;
  const starter = starterGoalMessage(state);
  if (starter) return starter;
  if (today && today.radiation >= 1) {
    const exposed = state.buildings.filter((b) => (b.type === 'home' || (BUILDINGS[b.type].stormBreakable && BUILDINGS[b.type].canBeSheltered)) && !isSheltered(state, b.r, b.c)).length;
    if (exposed > 0 && isUnlocked(state, 'shelter')) return { text: t('mc.todayStormCover', { n: exposed }), mood: 'worried' };
    if (exposed === 0) return { text: t('mc.todayStormSafe'), mood: 'cheering' };
  }
  const power = resolvePower(state, today?.sunlight ?? 1);
  if (power.demand > power.supply + state.charge) {
    return { text: t('mc.powerShortNow', { need: power.demand }), mood: 'worried' };
  }
  if (today && today.flare !== 'none') {
    const cls = strongestClass(today) ?? today.strongest?.classType ?? (today.flare === 'major' ? 'X' : 'M');
    return { text: t(today.flare === 'major' ? 'mc.todayFlareMajor' : 'mc.todayFlareStrong', { cls }), mood: 'calm' };
  }
  const pts = state.researchPoints ?? 0;
  const unlockedTechs = state.research ?? [];
  const canResearch = Object.entries(RESEARCH_COSTS).some(([id, cost]) => !unlockedTechs.includes(id) && pts >= cost);
  if (canResearch) return { text: t('mc.researchReady', { n: pts }), mood: 'cheering' };
  return repeatingGoalMessage(state) ?? idleTip(state);
}
