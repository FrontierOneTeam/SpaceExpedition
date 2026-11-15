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
} from '../sim/index.ts';
import { t, type StringKey } from './strings.ts';

const { BUILDINGS, SHELTER, STARTER_GOALS, LIMITS, UI } = config;

export type ShownType = BuildingType | 'shelter';

/** Build menu order, as in the mockups. */
export const BUILD_MENU: PlaceableType[] = ['sun', 'batt', 'o2', 'farm', 'mine', 'dig', 'fab', 'home', 'shelter'];

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

/** The goal as shown on the card. Starter goals use the exact text of SPEC 7.1. */
export function goalText(goal: GoalInfo): string {
  if (goal.kind === 'starter') return t(STARTER_TEXT[goal.index]);
  if (goal.id === 'house_crew') return t('goal.house', { n: goal.target });
  if (goal.id === 'fill_stores') return t('goal.stores', { n: goal.target });
  return t('goal.parts', { n: goal.target });
}

export function starterGoalText(index: number): string {
  return t(STARTER_TEXT[index]);
}

/** "You have 4." for a repeating goal, so the child sees where they stand. Empty for starter goals. */
export function goalHave(goal: GoalInfo, state: GameState): string {
  if (goal.kind === 'starter') return '';
  if (goal.id === 'house_crew') return t('goal.have.house', { n: state.crew });
  if (goal.id === 'fill_stores') return t('goal.have.stores', { air: state.air, food: state.food });
  return t('goal.have.parts', { n: state.parts });
}

export function goalReward(goal: GoalInfo): string {
  if (goal.growsMap) return t('goal.rewardLand', { n: goal.rewardParts });
  if (goal.unlocks.length > 0) {
    return t('goal.rewardUnlocks', { n: goal.rewardParts, names: goal.unlocks.map((u) => buildingName(u)).join(t('list.separator')) });
  }
  return t('goal.reward', { n: goal.rewardParts });
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

export function weatherTile(day: ChapterDay, isTomorrow: boolean): WeatherTile {
  if (day.radiation > 0) {
    return {
      icon: 'storm',
      name: t(RADIATION_NAME[day.radiation]),
      line: t(day.radiation >= 2 ? 'weather.lineStorm' : 'weather.lineRising'),
      danger: isTomorrow && day.radiation >= 2,
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
