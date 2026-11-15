// Turns sim values into what the interface shows: names, sentences, reasons, goals,
// weather tiles and meter styles. Pure: no DOM.

import {
  config,
  type BuildingType,
  type ChapterDay,
  type GameState,
  type GoalInfo,
  type PlaceableType,
  type PlaceFailReason,
  type DayPreview,
  type ChosenKind,
  powerNeed,
  stageOf,
} from '../sim/index.ts';
import { t, type StringKey } from './strings.ts';

const { BUILDINGS, SHELTER, STARTER_GOALS, LIMITS, UI, STAGES } = config;

export type ShownType = BuildingType | 'shelter';

/** Build menu order, as in the mockups. */
export const BUILD_MENU: PlaceableType[] = ['sun', 'batt', 'o2', 'farm', 'mine', 'dig', 'fab', 'home', 'shelter','lab','nuke'];

export const ART_FILE: Record<ShownType, string> = {
  sun: 'solar_panel',
  batt: 'battery',
  o2: 'oxygen_maker',
  farm: 'greenhouse',
  home: 'habitat',
  mine: 'ice_mine',
  dig: 'soil_digger',
  fab: 'parts_factory',
  pad: 'landing_pad_rocket',
  shelter: 'soil_shelter',
  lab:'research_lab',nuke:'reactor',
};

const NAME: Record<ShownType, StringKey> = {
  sun: 'building.sun.name',
  batt: 'building.batt.name',
  o2: 'building.o2.name',
  farm: 'building.farm.name',
  home: 'building.home.name',
  mine: 'building.mine.name',
  dig: 'building.dig.name',
  fab: 'building.fab.name',
  pad: 'building.pad.name',
  shelter: 'building.shelter.name',
  lab:'building.lab.name',nuke:'building.nuke.name',
};

/** The same name inside a sentence ("your greenhouse"). */
const NAME_LOWER: Record<ShownType, StringKey> = {
  sun: 'building.sun.lower',
  batt: 'building.batt.lower',
  o2: 'building.o2.lower',
  farm: 'building.farm.lower',
  home: 'building.home.lower',
  mine: 'building.mine.lower',
  dig: 'building.dig.lower',
  fab: 'building.fab.lower',
  pad: 'building.pad.lower',
  shelter: 'building.shelter.lower',
  lab:'building.lab.lower',nuke:'building.nuke.lower',
};

const ABOUT: Record<ShownType, StringKey> = {
  sun: 'building.sun.about',
  batt: 'building.batt.about',
  o2: 'building.o2.about',
  farm: 'building.farm.about',
  home: 'building.home.about',
  mine: 'building.mine.about',
  dig: 'building.dig.about',
  fab: 'building.fab.about',
  pad: 'building.pad.about',
  shelter: 'building.shelter.about',
  lab:'building.lab.about',nuke:'building.nuke.about',
};

export function buildingName(type: ShownType): string {
  return t(NAME[type]);
}

export function buildingLower(type: ShownType): string {
  return t(NAME_LOWER[type]);
}

/** One sentence: what it costs, what it uses, what it makes. Numbers come from config. */
export function buildingAbout(type: ShownType): string {
  if (type === 'shelter') return t(ABOUT.shelter, { soil: SHELTER.cost.soil, tiles: SHELTER.size * SHELTER.size });
  const s = BUILDINGS[type];
  return t(ABOUT[type], {
    parts: s.cost.parts,
    power: s.power,
    powerSheltered: s.powerSheltered,
    sun: s.solarOutput,
    storage: s.storage,
    crew: s.crewOnBuild,
    air: s.makes.air ?? 0,
    food: s.makes.food ?? 0,
    water: s.makes.water ?? s.uses.water ?? 0,
    soil: s.makes.soil ?? 0,
    runs: s.maxRuns,
  });
}

export function costOf(type: PlaceableType): { parts: number; soil: number } {
  return type === 'shelter' ? SHELTER.cost : BUILDINGS[type].cost;
}

/** The starter goal number (1 to 4) that unlocks a building, or null. */
export function unlockGoalNumber(type: PlaceableType): number | null {
  const i = STARTER_GOALS.findIndex((g) => g.unlocks.includes(type));
  return i < 0 ? null : i + 1;
}

const REASON: Record<PlaceFailReason, StringKey> = {
  run_over: 'reason.run_over',
  out_of_bounds: 'reason.out_of_bounds',
  not_placeable: 'reason.not_placeable',
  locked: 'reason.locked',
  not_revealed: 'reason.not_revealed',
  occupied: 'reason.occupied',
  need_ice: 'reason.need_ice',
  need_rock: 'reason.need_rock',
  cannot_be_sheltered: 'reason.cannot_be_sheltered',
  shelter_overlap: 'reason.shelter_overlap',
  cannot_cover: 'reason.cannot_cover',
  not_adjacent: 'reason.not_adjacent',
  need_parts: 'reason.need_parts',
  need_soil: 'reason.need_soil',
};

export function reasonText(reason: PlaceFailReason): string {
  return t(REASON[reason]);
}

// ---- Goals ----

const STARTER_TEXT: StringKey[] = ['goal.starter.1', 'goal.starter.2', 'goal.starter.3', 'goal.starter.4'];

/** The goal's words, by kind, with {n} its target. */
const GOAL_KEY: Record<ChosenKind, StringKey> = {
  storm_cover: 'goal.storm_cover',
  fix_incident: 'goal.fix_incident',
  cover_homes: 'goal.cover_homes',
  house_crew: 'goal.house',
  more_air: 'goal.more_air',
  more_food: 'goal.more_food',
  new_mine: 'goal.new_mine',
  new_digger: 'goal.new_digger',
  more_power: 'goal.more_power',
  more_storage: 'goal.more_storage',
  shelter_machines: 'goal.shelter_machines',
  research: 'goal.research',
};

/** The goal as shown on the card. Starter goals use the exact text of SPEC 7.1. */
export function goalText(goal: GoalInfo): string {
  if (goal.kind === 'starter') return t(STARTER_TEXT[goal.index]);
  if (goal.id === 'none') return t('goal.none');
  return t(GOAL_KEY[goal.id as ChosenKind], { n: goal.target });
}

export function starterGoalText(index: number): string {
  return t(STARTER_TEXT[index]);
}

/** "You have 4." for a chosen goal, so the child sees where they stand. Empty for starter goals. */
export function goalHave(goal: GoalInfo, state: GameState): string {
  if (goal.kind === 'starter' || goal.id === 'none') return '';
  const n = goal.progress;
  switch (goal.id as ChosenKind) {
    case 'storm_cover':
    case 'shelter_machines':
      return t('goal.have.sheltered', { n });
    case 'fix_incident':
      return '';
    case 'cover_homes':
      return t('goal.have.covered', { n });
    case 'more_air':
      return t('goal.have.air', { n, crew: state.crew });
    case 'more_food':
      return t('goal.have.food', { n, crew: state.crew });
    case 'more_power':
      return t('goal.have.power', { n, need: powerNeed(state) });
    case 'more_storage':
      return t('goal.have.storage', { n });
    case 'research':
      return t('goal.have.research', { n });
    default:
      return t('goal.have.house', { n });
  }
}

/** The stage a chosen goal moves toward, or null after the last stage. */
function nextStageName(state: GameState): string | null {
  const i = stageOf(state) + 1;
  return i < STAGES.length ? stageName(i) : null;
}

export function goalReward(goal: GoalInfo, state?: GameState): string {
  if (goal.kind === 'starter') {
    if (goal.unlocks.length > 0) {
      return t('goal.rewardUnlocks', { n: goal.rewardParts, names: goal.unlocks.map((u) => buildingName(u)).join(t('list.separator')) });
    }
    return t('goal.reward', { n: goal.rewardParts });
  }
  if (goal.id === 'none') return '';
  // A chosen goal's reward is progress, never parts (SPEC 18.2).
  const stage = state ? nextStageName(state) : null;
  if (stage) return t(goal.growsMap ? 'goal.rewardLandStage' : 'goal.rewardStage', { stage });
  return t(goal.growsMap ? 'goal.rewardLandOnly' : 'goal.rewardFree');
}

// ---- Stages (SPEC 18.2) ----

const STAGE_NAME: Record<(typeof STAGES)[number]['id'], StringKey> = {
  camp: 'stage.camp',
  base: 'stage.base',
  outpost: 'stage.outpost',
  hamlet: 'stage.hamlet',
  village: 'stage.village',
  town: 'stage.town',
};

export function stageName(i: number): string {
  return t(STAGE_NAME[STAGES[Math.min(Math.max(0, i), STAGES.length - 1)].id]);
}

export interface StageView {
  /** Stage number from 1, and its name. */
  n: number;
  name: string;
  total: number;
  /** What the next stage needs, or null after the last stage (free play). */
  next: {
    name: string;
    goals: { have: number; need: number };
    crew: { have: number; need: number };
    /** Share of the way there, 0 to 1, for the bar. */
    share: number;
  } | null;
}

export function stageView(state: GameState): StageView {
  const i = stageOf(state);
  const nextDef = STAGES[i + 1];
  const done = state.goals.starterDone + state.goals.repeatingDone;
  const view: StageView = { n: i + 1, name: stageName(i), total: STAGES.length, next: null };
  if (!nextDef) return view;
  const prev = STAGES[i];
  const goals = { have: Math.min(done, nextDef.goals), need: nextDef.goals };
  const crew = { have: Math.min(state.crew, nextDef.crew), need: nextDef.crew };
  // The bar fills with goals and crew together, each from where this stage began.
  const part = (have: number, from: number, need: number) => (need <= from ? 1 : Math.min(1, Math.max(0, (have - from) / (need - from))));
  const share = (part(done, prev.goals, nextDef.goals) + part(state.crew, prev.crew, nextDef.crew)) / 2;
  view.next = { name: stageName(i + 1), goals, crew, share };
  return view;
}

// ---- Weather tiles (SPEC 4.8, 4.9, 10.5) ----

export interface WeatherTile {
  icon: 'calm' | 'storm';
  name: string;
  line: string;
  danger: boolean;
}

const RADIATION_NAME: StringKey[] = ['weather.calm', 'weather.radiation1', 'weather.radiation2', 'weather.radiation3'];

const CLASS_RANK = 'ABCMX';

/** The strongest flare class of the day, from the chapter file, or null. */
export function strongestClass(day: ChapterDay): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const f of day.flares) {
    const rank = CLASS_RANK.indexOf(f.classType.charAt(0));
    const score = rank * 1000 + parseFloat(f.classType.slice(1) || '0');
    if (rank >= 0 && score > bestScore) {
      bestScore = score;
      best = f.classType;
    }
  }
  return best;
}

const GAME_STORM_NAME: StringKey[] = ['weather.calm', 'weather.game1', 'weather.game2', 'weather.game3'];

/** True only for a storm a NASA report places at Mars (SPEC 18.1). Anything else is a game storm. */
export function isNasaStorm(day: ChapterDay): boolean {
  return day.radiation > 0 && day.stormSource === 'nasa-report';
}

/** The storm's name: a game storm is always called one (SPEC 18.1 point 5). */
export function stormName(day: ChapterDay): string {
  return t(isNasaStorm(day) ? RADIATION_NAME[day.radiation] : GAME_STORM_NAME[day.radiation]);
}

export function weatherTile(day: ChapterDay, isTomorrow: boolean): WeatherTile {
  if (day.radiation > 0) {
    const nasa = isNasaStorm(day);
    const strong = day.radiation >= 2;
    return {
      icon: 'storm',
      name: stormName(day),
      line: t(nasa ? (strong ? 'weather.lineStormNasa' : 'weather.lineRisingNasa') : strong ? 'weather.lineStorm' : 'weather.lineRising'),
      danger: isTomorrow && strong,
    };
  }
  if (day.flare !== 'none') {
    const cls = strongestClass(day);
    return {
      icon: 'storm',
      name: t(day.flare === 'major' ? 'weather.flareMajor' : 'weather.flareStrong'),
      line: cls ? t('weather.class', { cls }) : '',
      danger: false,
    };
  }
  return { icon: 'calm', name: t(RADIATION_NAME[0]), line: '', danger: false };
}

// ---- Meters (SPEC 10.2) ----

export type MeterLevel = 'ok' | 'warn' | 'danger';

export function powerLevel(preview: DayPreview, charge: number): MeterLevel {
  return preview.power.demand > preview.power.supply + charge ? 'danger' : 'ok';
}

/** Warning at half, danger at a quarter, or when falling while under the low line. */
export function stockLevel(stock: number, change: number, max: number): MeterLevel {
  if (stock <= max * UI.meterDangerFraction || (change < 0 && stock < UI.meterFallingDanger)) return 'danger';
  if (stock <= max * UI.meterWarnFraction) return 'warn';
  return 'ok';
}

export function airLevel(state: GameState, change: number): MeterLevel {
  return stockLevel(state.air, change, LIMITS.air.max);
}

export function foodLevel(state: GameState, change: number): MeterLevel {
  return stockLevel(state.food, change, LIMITS.food.max);
}
