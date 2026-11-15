// Every tunable number of the simulation lives here (SPEC 0.3).
// Values follow SPEC.md sections 4, 5 and 7 and the clarifications in section 16.

import type { BuildingType, PlaceableType, ResourceId, TerrainKind } from './types.ts';

// ---- Map (SPEC 5) ----

/** The site is SITE_SIZE x SITE_SIZE tiles, rows and columns 0 to SITE_SIZE - 1. */
export const SITE_SIZE = 12;

/** Revealed rings (SPEC 5.3). Index 0 is the starting area. */
export const REVEAL_RINGS: readonly { size: number; min: number; max: number }[] = [
  { size: 6, min: 3, max: 8 },
  { size: 8, min: 2, max: 9 },
  { size: 10, min: 1, max: 10 },
  { size: 12, min: 0, max: 11 },
];
export const START_RING = 0;

/** Terrain generation (SPEC 5.4, 16.2). */
export const TERRAIN = {
  ice: 8,
  rock: 8,
  craters: 6,
  /** Manhattan distance from a starting building for the guaranteed near tiles. */
  nearBaseDistance: 2,
  nearBaseIce: 1,
  nearBaseRock: 1,
  /** Each later ring holds at least this many of each deposit. */
  perRingIce: 1,
  perRingRock: 1,
} as const;

/** Starting base, coordinates are (row, column) (SPEC 5.5). */
export const STARTING_BASE: readonly { type: BuildingType; r: number; c: number }[] = [
  { type: 'home', r: 5, c: 5 },
  { type: 'sun', r: 5, c: 6 },
  { type: 'sun', r: 6, c: 5 },
  { type: 'batt', r: 4, c: 5 },
  { type: 'pad', r: 6, c: 6 },
];

// ---- Resources (SPEC 4.2, 16.2) ----

export const START_STOCKS = {
  air: 12,
  food: 12,
  water: 6,
  parts: 8,
  soil: 0,
  health: 10,
  crew: 2,
  charge: 0,
} as const;

/** Upper and lower limits applied at step 3 (and to health whenever it changes). */
export const LIMITS = {
  air: { min: 0, max: 30 },
  food: { min: 0, max: 30 },
  water: { min: 0, max: 20 },
  health: { min: 0, max: 10 },
} as const;

/** Each crew member uses this much per day (SPEC 4.3). */
export const CREW_USE = { air: 1, food: 1 } as const;

/** Buildings unlocked at the start of a run (SPEC 7.1). */
export const START_UNLOCKED: readonly PlaceableType[] = ['sun', 'o2'];

// ---- Buildings (SPEC 4.3, 16.2) ----

export interface BuildingSpec {
  /** Paid on placement. */
  cost: { parts: number; soil: number };
  /** Power use per day when working. */
  power: number;
  /** Power use when under a shelter. */
  powerSheltered: number;
  /** Production when powered and working: runs up to maxRuns times, each run uses `uses` and makes `makes`. */
  uses: Partial<Record<ResourceId, number>>;
  makes: Partial<Record<ResourceId, number>>;
  maxRuns: number;
  /** Terrain the tile must have, or null. */
  needsTerrain: TerrainKind | null;
  /** May stand under a shelter. */
  canBeSheltered: boolean;
  removable: boolean;
  /** Can be chosen in the build menu (the pad is pre-placed only). */
  placeable: boolean;
  /** Crew added the moment it is built. */
  crewOnBuild: number;
  /** Health lost at step 4 when the building is unpowered (habitats). */
  unpoweredHealthLoss: number;
  /** Battery capacity added while working. */
  storage: number;
  /** Power made per panel at sunlight 1, before rounding. */
  solarOutput: number;
  /** Can be broken by a radiation storm when unsheltered (SPEC 4.8, 16.1). */
  stormBreakable: boolean;
  /** Takes damage days from a storm instead of breaking (solar panels). */
  stormDamageable: boolean;
}

function spec(partial: Partial<BuildingSpec> & Pick<BuildingSpec, 'cost' | 'power'>): BuildingSpec {
  return {
    powerSheltered: partial.power,
    uses: {},
    makes: {},
    maxRuns: 0,
    needsTerrain: null,
    canBeSheltered: true,
    removable: true,
    placeable: true,
    crewOnBuild: 0,
    unpoweredHealthLoss: 0,
    storage: 0,
    solarOutput: 0,
    stormBreakable: false,
    stormDamageable: false,
    ...partial,
  };
}

export const BUILDINGS: Readonly<Record<BuildingType, BuildingSpec>> = {
  sun: spec({ cost: { parts: 1, soil: 0 }, power: 0, solarOutput: 3, canBeSheltered: false, stormDamageable: true }),
  batt: spec({ cost: { parts: 2, soil: 0 }, power: 0, storage: 4, stormBreakable: true }),
  o2: spec({ cost: { parts: 2, soil: 0 }, power: 2, makes: { air: 3 }, maxRuns: 1, stormBreakable: true }),
  farm: spec({
    cost: { parts: 2, soil: 0 },
    power: 2,
    powerSheltered: 3,
    uses: { water: 1 },
    makes: { food: 3, air: 1 },
    maxRuns: 1,
    stormBreakable: true,
  }),
  home: spec({ cost: { parts: 3, soil: 0 }, power: 1, crewOnBuild: 2, unpoweredHealthLoss: 2, removable: false }),
  mine: spec({ cost: { parts: 2, soil: 0 }, power: 1, makes: { water: 2 }, maxRuns: 1, needsTerrain: 'ice', stormBreakable: true }),
  dig: spec({ cost: { parts: 2, soil: 0 }, power: 1, makes: { soil: 2 }, maxRuns: 1, needsTerrain: 'rock', stormBreakable: true }),
  // The parts factory turns 1 soil into 1 part, up to 2 a day (SPEC 16.2).
  fab: spec({ cost: { parts: 3, soil: 0 }, power: 2, uses: { soil: 1 }, makes: { parts: 1 }, maxRuns: 2, stormBreakable: true }),
  pad: spec({ cost: { parts: 0, soil: 0 }, power: 0, canBeSheltered: false, removable: false, placeable: false, stormBreakable: true }),
};

/** Production order at step 2 (SPEC 4.7). */
export const PRODUCTION_ORDER: readonly BuildingType[] = ['mine', 'farm', 'o2', 'dig', 'fab'];

/** Soil shelter (SPEC 4.5). */
export const SHELTER = { cost: { parts: 0, soil: 4 }, size: 2 } as const;

/** A damaged panel makes this much less power, minimum 0 (SPEC 4.6). */
export const DAMAGED_PANEL_PENALTY = 1;

// ---- Weather (SPEC 4.8, 16.1) ----

/** Indexed by radiation level 0 to 3. */
export const RADIATION: readonly { health: number; breakDays: number; damageDays: number }[] = [
  { health: 0, breakDays: 0, damageDays: 0 },
  { health: 1, breakDays: 0, damageDays: 0 },
  { health: 2, breakDays: 1, damageDays: 1 },
  { health: 3, breakDays: 2, damageDays: 2 },
];

/** Health regained on a day with no health loss (SPEC 4.7 step 10). */
export const HEALTH_RECOVERY = 1;

// ---- Supply rocket (SPEC 4.7 step 7) ----

export const ROCKET = { interval: 6, parts: 3 } as const;

// ---- Goals (SPEC 7) ----

export const GOAL_REWARD_PARTS = 3;
export const MAX_GOALS_PER_DAY = 3;
/** Every this many completed repeating goals, the map grows one ring. */
export const REPEATING_GOALS_PER_RING = 2;

export const STARTER_GOALS: readonly { id: 'starter_air' | 'starter_food' | 'starter_soil' | 'starter_cover'; unlocks: PlaceableType[] }[] = [
  { id: 'starter_air', unlocks: ['farm', 'mine'] },
  { id: 'starter_food', unlocks: ['batt', 'dig'] },
  { id: 'starter_soil', unlocks: ['shelter', 'fab'] },
  { id: 'starter_cover', unlocks: ['home'] },
];

export const REPEATING_GOALS = {
  cycle: 3,
  crewBase: 4,
  crewPerLevel: 2,
  storesAir: 20,
  storesFood: 20,
  partsBase: 8,
  partsPerLevel: 4,
} as const;

// ---- Predict question (SPEC 8.2, 16.2) ----

export const PREDICT = {
  /** Tomorrow's radiation must be at least this, and today's below it. */
  stormLevel: 2,
  /** Building types that may be asked about, in order of preference after `prefer`. */
  candidates: ['o2', 'farm', 'mine', 'dig', 'fab', 'batt'] as BuildingType[],
  /** Preferred subjects, first match wins; otherwise the oldest candidate. */
  prefer: ['farm', 'o2'] as BuildingType[],
} as const;

// ===================================================================================
// ---- Interface and rendering (phase 2). Render-only numbers, not used by the rules. ----
// Appended by the phase 2 interface work. The sim never reads these.
// ===================================================================================

/** Shelters are drawn at this share of their own opacity (SPEC 11.1). */
export const SHELTER_ALPHA = 0.8;

export const RENDER = {
  /** Tile footprint in world units (SPEC 5.1). */
  tileWidth: 128,
  tileHeight: 64,
  /** The art is delivered at 2x and drawn at half size (SPEC 11.1). */
  artScale: 0.5,
  /** Astronauts are drawn slightly smaller than buildings (SPEC 11.1, phase 4). */
  astronautScale: 0.4,
  /** The canvas draws at the screen's pixel density, capped here to keep phones fast. */
  maxPixelRatio: 2,
  backgroundColour: '#3a2018',
  /** Room above the top row for building pictures, in world units, when fitting the camera. */
  fitHeadroom: 60,
  /** Share of the view the revealed area may fill. */
  fitMargin: 0.94,
  /** A press that moves less than this (CSS px) counts as a tap. */
  tapSlopPx: 10,
  /** Picture pixels with alpha above this count as a hit on a building. */
  pickAlpha: 60,
  highlightColour: 0xf2a53a,
  highlightAlpha: 0.32,
  highlightLine: 2,
  outlineColour: 0xf4ede7,
  outlineFillAlpha: 0.18,
  outlineLine: 4,
  hintColour: 0xf2a53a,
  pulseMs: 700,
  pulseMinAlpha: 0.35,
  /** Unpowered buildings are tinted darker; damaged panels get a light tint (SPEC 11.1). */
  unpoweredTint: 0x6f6878,
  damagedTint: 0xffc9b3,
  /** Broken buildings flicker slowly between full and this opacity. */
  brokenAlpha: 0.5,
  brokenFlickerMs: 900,
  /** How far above a tile centre a status badge sits, in world units. */
  badgeLift: 110,
  shelterBadgeLift: 110,
} as const;

export const UI = {
  /** Ignore a second End the day tap that arrives within this time. */
  endDayCooldownMs: 600,
  /** Air and food meters: warning at half, danger at a quarter (SPEC 10.2). */
  meterWarnFraction: 0.5,
  meterDangerFraction: 0.25,
  /** Danger also when the stock falls tomorrow and is under this. */
  meterFallingDanger: 10,
  healthMarks: 10,
  /** "Mission Control · sent 12 minutes ago" (SPEC 10.4), fixed for this chapter. */
  missionControlMinutes: 12,
  /** New site numbers are picked by the interface from this range. */
  siteMin: 1000,
  siteMax: 9999,
} as const;

// ---- Camera (phase 3, SPEC 5.3, 5.6). Render-only. ----

export const CAMERA = {
  /** Closest zoom: CSS pixels per world unit, so a tile is drawn at twice its size (SPEC 5.6). */
  maxZoom: 2,
  /** One tap on + or − zooms by this factor. */
  buttonStep: 1.4,
  /** Mouse wheel: zoom factor per wheel unit, as exp(-deltaY * wheelStep). */
  wheelStep: 0.0015,
  /** The "Survey expanded" moment: camera eases out and new tiles fade in over this time. */
  surveyMs: 1200,
} as const;

// ---- Life (phase 4, SPEC 11.2, 11.3). Render and sound only, never read by the rules. ----

export const AUDIO = {
  /** Volume groups (SPEC 11.3). */
  volume: { ambience: 0.5, effects: 1, music: 0.6 },
  /** Ambience and music drop to this share of their volume while a Mission Control sound plays. */
  duckShare: 0.35,
  /** At most this many event sounds play together at the end of a day. */
  maxDaySounds: 2,
  /** A storm that hits at this radiation level or above plays the storm-hit sound. */
  stormHitLevel: 2,
} as const;

export const ASTRONAUT = {
  /** One astronaut per crew member, up to this many (SPEC 11.2). */
  max: 8,
  /** Sheet cells (SPEC 11.1): 8 columns of 96 x 128. */
  frameWidth: 96,
  frameHeight: 128,
  columns: 8,
  /** Rows of the sheet, top to bottom, with their frame counts and speeds. */
  anims: {
    idle: { row: 0, frames: 2, fps: 2 },
    walk: { row: 1, frames: 6, fps: 10 },
    dance: { row: 2, frames: 8, fps: 10 },
    shiver: { row: 3, frames: 2, fps: 8 },
    run: { row: 4, frames: 6, fps: 14 },
  },
  /** Walking and running speed, in tiles per second. */
  walkSpeed: 1.1,
  runSpeed: 2.8,
  /** Idle pause between walks, in milliseconds (SPEC 11.2: 2 to 5 seconds). */
  pauseMinMs: 2000,
  pauseMaxMs: 5000,
  /** Everyone dances this long when a goal or chapter is completed. */
  celebrateMs: 3000,
  /** Tomorrow's radiation at or above this sends everyone to the nearest habitat. */
  shelterRadiation: 2,
  /** Feet sit this far below the tile centre, in world units, so they stand on the ground. */
  footOffset: 6,
} as const;
