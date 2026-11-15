// Plain data types for the simulation. Everything here is JSON-serialisable:
// no classes, Map, Set, functions or undefined-valued fields.

// ---- Chapter data (made by tools/build-chapter.ts) ----

export type FlareLevel = 'none' | 'strong' | 'major';
export type RadiationLevel = 0 | 1 | 2 | 3;

export interface ChapterDay {
  date: string;
  sunlight: number;
  radiation: RadiationLevel;
  flare: FlareLevel;
  flares: { peakTime: string; classType: string }[];
  cardId?: string;
  notes?: string;
}

export interface Chapter {
  id: string;
  title: string;
  site: string;
  startDate: string;
  setup: string;
  days: ChapterDay[];
  simplified: string[];
}

/** The ordered archive and the chapters it names. */
export interface ChapterBook {
  archive: string[];
  chapters: Record<string, Chapter>;
}

// ---- Map and buildings ----

export type TerrainKind = 'ground' | 'ice' | 'rock' | 'crater';
export type BuildingType = 'sun' | 'batt' | 'o2' | 'farm' | 'home' | 'mine' | 'dig' | 'fab' | 'pad';
/** What the player can choose in the build menu. */
export type PlaceableType = Exclude<BuildingType, 'pad'> | 'shelter';
export type ResourceId = 'air' | 'food' | 'water' | 'parts' | 'soil';

export interface Building {
  /** Unique, increasing: a lower id is an older building. */
  id: number;
  type: BuildingType;
  r: number;
  c: number;
  /** Days left broken. 0 means working. */
  brokenDays: number;
  /** Days left damaged (solar panels only). 0 means undamaged. */
  damagedDays: number;
}

export interface Shelter {
  id: number;
  /** Top tile (lowest row and column) of the 2x2 footprint. */
  r: number;
  c: number;
}

// ---- Goals ----

export type GoalId = 'starter_air' | 'starter_food' | 'starter_soil' | 'starter_cover' | 'house_crew' | 'fill_stores' | 'stockpile_parts';

export interface GoalInfo {
  id: GoalId;
  kind: 'starter' | 'repeating';
  /** Starter goal index 0 to 3, or repeating goal k from 0. */
  index: number;
  /** Level of a repeating goal (floor(k / 3)), 0 for starter goals. */
  level: number;
  target: number;
  progress: number;
  rewardParts: number;
  /** True when completing it also grows the map. */
  growsMap: boolean;
  unlocks: PlaceableType[];
}

// ---- Predict ----

export type PredictAnswer = 'fine' | 'break';

export interface PredictQuestion {
  buildingId: number;
  building: BuildingType;
  /** Sol it is asked on. */
  sol: number;
}

export interface PendingPrediction {
  buildingId: number;
  building: BuildingType;
  answer: PredictAnswer;
  /** Sol it was asked on. It is scored at the end of the next sol. */
  sol: number;
}

// ---- Events ----

export type LossCause = 'air' | 'food' | 'health';
export type HealthCause = 'unpowered_habitat' | 'radiation' | 'recovery';

export type SimEvent =
  | { type: 'power'; supply: number; demand: number; used: number; chargeBefore: number; chargeAfter: number; capacity: number }
  | { type: 'unpowered'; buildingId: number; building: BuildingType; need: number }
  | { type: 'produced'; buildingId: number; building: BuildingType; resource: ResourceId; amount: number }
  | { type: 'consumed'; buildingId: number; building: BuildingType; resource: ResourceId; amount: number }
  | { type: 'missing_input'; buildingId: number; building: BuildingType; resource: ResourceId }
  | { type: 'crew_used'; crew: number; air: number; food: number }
  | { type: 'health'; amount: number; cause: HealthCause; buildingId: number | null; level: number }
  | { type: 'repaired'; buildingId: number; building: BuildingType }
  | { type: 'panel_restored'; buildingId: number }
  | {
      type: 'storm';
      level: RadiationLevel;
      /** Buildings under a shelter, and not, when the storm hit. */
      sheltered: number;
      unsheltered: number;
      allHabitatsSheltered: boolean;
    }
  | { type: 'broken'; buildingId: number; building: BuildingType; days: number; daysLeft: number }
  | { type: 'damaged'; buildingId: number; building: BuildingType; days: number; daysLeft: number }
  | { type: 'rocket_landed'; parts: number }
  | { type: 'rocket_blocked'; buildingId: number; partsLost: number }
  | { type: 'goal_done'; goal: GoalInfo }
  | { type: 'unlocked'; building: PlaceableType }
  | { type: 'map_grew'; ring: number; size: number }
  | { type: 'prediction_scored'; buildingId: number; building: BuildingType; answer: PredictAnswer; broke: boolean; right: boolean; saved: boolean }
  | { type: 'lost'; cause: LossCause; sol: number }
  | { type: 'chapter_end'; chapterId: string; replay: number };

export interface Stocks {
  air: number;
  food: number;
  water: number;
  parts: number;
  soil: number;
  health: number;
  crew: number;
  charge: number;
}

/** One ended day in the event log. */
export interface DayLog {
  sol: number;
  chapterId: string;
  chapterDay: number;
  replay: number;
  date: string;
  events: SimEvent[];
  /** Stocks after the day ended. */
  after: Stocks;
}

// ---- State ----

/** The outpost at the start of the current chapter, for the report's "Your outpost grew". */
export interface ChapterStart {
  sol: number;
  crew: number;
  buildings: number;
  shelters: number;
  goalsCompleted: number;
  revealedSize: number;
  predictions: { right: number; answered: number };
}

export interface GameState extends Stocks {
  /** The outpost's age in sols, from 1. Never resets. */
  day: number;
  /** Row-major terrain, terrain[r][c]. */
  terrain: TerrainKind[][];
  /** Index into REVEAL_RINGS. */
  ring: number;
  buildings: Building[];
  shelters: Shelter[];
  nextId: number;
  unlocked: PlaceableType[];
  goals: {
    /** Starter goals completed, 0 to 4. */
    starterDone: number;
    /** Repeating goals completed (k of the current one). */
    repeatingDone: number;
  };
  /** The question asked this morning, until answered or skipped. */
  question: PredictQuestion | null;
  /** The answered question waiting to be scored. */
  prediction: PendingPrediction | null;
  predictions: { right: number; answered: number };
  lost: { cause: LossCause; sol: number } | null;
  /** Set by newRun and keepBuilding. */
  chapterStart: ChapterStart;
  log: DayLog[];
}

/** The saved outpost (SPEC 12). */
export interface Run {
  siteNumber: number;
  chapterId: string;
  replay: number;
  chapterDay: number;
  pendingReport: boolean;
  state: GameState;
}
