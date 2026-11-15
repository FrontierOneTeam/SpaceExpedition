import {stockCapacity,resolveIncident} from './emergency.ts';
import {LONG_RUN} from './config.ts';
// A run: start, the 12-step end of day (SPEC 4.7), today's preview, and Keep building (9.6).

import { BUILDINGS, CREW_USE, HEALTH_RECOVERY, LIMITS, PRODUCTION_ORDER, ROCKET, START_RING, START_STOCKS, START_UNLOCKED } from './config.ts';
import { checkGoals } from './goals.ts';
import { capStocks, storageLimit } from './storage.ts';
import { resolvePower, isWorking, type PowerResult } from './power.ts';
import { dueQuestion, scorePrediction } from './predict.ts';
import { generateTerrain, revealedSize, startingBase } from './terrain.ts';
import { applyRadiation, chapterDate, chapterDayData, clampHealth, getChapter, isLastChapterDay, stormSourceOf } from './weather.ts';
import type { Building, BuildingType, ChapterBook, ChapterStart, GameState, ResourceId, Run, SimEvent, Stocks } from './types.ts';

export function stocksOf(state: GameState): Stocks {
  const { air, food, water, parts, soil, health, crew, charge } = state;
  return { air, food, water, parts, soil, health, crew, charge };
}

/** A deep copy through JSON, the same path a save takes. */
export function cloneRun(run: Run): Run {
  return JSON.parse(JSON.stringify(run)) as Run;
}

/** The outpost now, as stored at the start of a chapter. */
export function chapterSnapshot(
  state: Pick<GameState, 'day' | 'crew' | 'buildings' | 'shelters' | 'goals' | 'ring' | 'predictions'>,
): ChapterStart {
  return {
    sol: state.day,
    crew: state.crew,
    buildings: state.buildings.length,
    shelters: state.shelters.length,
    goalsCompleted: state.goals.starterDone + state.goals.repeatingDone,
    revealedSize: revealedSize(state.ring),
    predictions: { ...state.predictions },
  };
}

/** Start a new outpost on a site, at chapter day 1 of the first chapter in the archive (or the one given). */
export function newRun(siteNumber: number, book: ChapterBook, chapterId: string = book.archive[0]): Run {
  const buildings = startingBase();
  const start = {
    day: 1,
    ...START_STOCKS,
    terrain: generateTerrain(siteNumber),
    terrainSeed: siteNumber,
    ring: START_RING,
    buildings,
    shelters: [],
    nextId: buildings.length + 1,
    unlocked: START_UNLOCKED.slice(),
    goals: { starterDone: 0, repeatingDone: 0 },
    stage: 0,
    question: null,
    prediction: null,
    predictions: { right: 0, answered: 0 },
    lost: null,
  };
  const state: GameState = { ...start, chapterStart: chapterSnapshot(start), log: [] };
  const run: Run = { siteNumber, chapterId, replay: 1, chapterDay: 1, pendingReport: false, state };
  startMorning(run, book);
  return run;
}

/** Set up this morning's predict question. */
// ASSUMPTION: the question is fixed at the start of the day and is not re-chosen if the player builds or shelters before answering.
function startMorning(run: Run, book: ChapterBook): void {
  const chapter = getChapter(book, run.chapterId);
  run.state.question = dueQuestion(run.state, chapter, run.chapterDay);
}

/** True when End the day can run now. */
export function canEndDay(run: Run, book: ChapterBook): boolean {
  if (run.pendingReport || run.state.lost) return false;
  return chapterDayData(getChapter(book, run.chapterId), run.chapterDay) !== null;
}

function addStock(state: GameState, resource: ResourceId, amount: number): void {
  state[resource] += amount;
}

/** Step 2: production by powered, working buildings, in the fixed order. Changes the state. */
function produce(state: GameState, powered: number[]): SimEvent[] {
  const events: SimEvent[] = [];
  const byType = (type: BuildingType): Building[] =>
    state.buildings.filter((b) => b.type === type && isWorking(b) && powered.includes(b.id)).sort((a, b) => a.id - b.id);
  for (const type of PRODUCTION_ORDER) {
    const spec = BUILDINGS[type];
    const adjustedUses=type==='farm'&&state.research?.includes('rec')?{water:0.5}:spec.uses;
    const uses = Object.entries(adjustedUses) as [ResourceId, number][];
    const makes = Object.entries(spec.makes) as [ResourceId, number][];
    for (const b of byType(type)) {
      let runs = spec.maxRuns;
      for (const [res, n] of uses) runs = Math.min(runs, Math.floor(state[res] / n));
      // A machine only makes parts or soil that fit in the store: a full store stops it (SPEC 18.2).
      for (const [res, n] of makes) if (res === 'parts' || res === 'soil') runs = Math.min(runs, Math.floor(Math.max(0, storageLimit(state, res) - state[res]) / n));
      if (runs <= 0 && makes.some(([res]) => (res === 'parts' || res === 'soil') && state[res] >= storageLimit(state, res))) continue;
      if (runs <= 0) {
        const missing = uses.find(([res, n]) => state[res] < n);
        if (missing) events.push({ type: 'missing_input', buildingId: b.id, building: b.type, resource: missing[0] });
        continue;
      }
      for (const [res, n] of uses) {
        addStock(state, res, -n * runs);
        events.push({ type: 'consumed', buildingId: b.id, building: b.type, resource: res, amount: n * runs });
      }
      for (const [res, n] of makes) {
        addStock(state, res, n * runs);
        events.push({ type: 'produced', buildingId: b.id, building: b.type, resource: res, amount: n * runs });
      }
    }
  }
  state.researchPoints=(state.researchPoints??0)+state.buildings.filter(b=>b.type==='lab'&&isWorking(b)&&powered.includes(b.id)).length;
  if(state.research?.includes('split')) for(const b of byType('mine')) {state.air++;events.push({type:'produced',buildingId:b.id,building:b.type,resource:'air',amount:1});}
  const discoveries=[...state.buildings.map(b=>b.type),...(state.shelters.length?['shelter']:[])];
  state.notebook=[...new Set([...(state.notebook??[]),...discoveries])];
  return events;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Step 3: crew use air and food, then clamp. Changes the state. */
function crewUse(state: GameState): SimEvent {
  const air = state.crew * CREW_USE.air;
  const food = state.crew * CREW_USE.food;
  state.air = clamp(state.air - air, LIMITS.air.min, stockCapacity(state));
  state.food = clamp(state.food - food, LIMITS.food.min, stockCapacity(state));
  state.water = clamp(state.water, LIMITS.water.min, LIMITS.water.max);
  return { type: 'crew_used', crew: state.crew, air, food };
}

/**
 * The day's events as kept in the save. What each building made and used is summed by building
 * type and resource, keeping the first building's id, so a big outpost's save stays small.
 * Every other event is kept as it is. The day's full list is still returned by endDay.
 */
export function compactLog(events: SimEvent[]): SimEvent[] {
  const out: SimEvent[] = [];
  const merged = new Map<string, Extract<SimEvent, { type: 'produced' | 'consumed' }>>();
  for (const e of events) {
    if (e.type === 'produced' || e.type === 'consumed') {
      const key = `${e.type}:${e.building}:${e.resource}`;
      const m = merged.get(key);
      if (m) m.amount += e.amount;
      else {
        const copy = { ...e };
        merged.set(key, copy);
        out.push(copy);
      }
    } else out.push(e);
  }
  return out;
}

export interface DayPreview {
  power: PowerResult;
  /** How air and food (and other stocks) will change at the end of today, from power, production and crew use. */
  change: { air: number; food: number; water: number; soil: number; parts: number };
  /** Habitats that would cost health tonight. */
  unpoweredHabitats: number[];
}

/** What today will bring, for the meters. Changes nothing. */
export function previewDay(run: Run, book: ChapterBook): DayPreview {
  const chapter = getChapter(book, run.chapterId);
  const today = chapterDayData(chapter, run.chapterDay);
  // Copy the state without its event log, which the preview does not need.
  const sim = JSON.parse(JSON.stringify({ ...run.state, log: [] })) as GameState;
  const power = resolvePower(sim, today ? today.sunlight : 0);
  produce(sim, power.powered);
  crewUse(sim);
  const s = run.state;
  return {
    power,
    change: {
      air: sim.air - s.air,
      food: sim.food - s.food,
      water: sim.water - s.water,
      soil: sim.soil - s.soil,
      parts: sim.parts - s.parts,
    },
    unpoweredHabitats: power.unpowered.filter((u) => u.building === 'home').map((u) => u.buildingId),
  };
}

export interface EndDayResult {
  /** False when no day could run (report pending, run lost, or past the chapter). */
  ran: boolean;
  events: SimEvent[];
}

/** End the day: the 12 steps of SPEC 4.7, in order. Changes the run. */
export function endDay(run: Run, book: ChapterBook): EndDayResult {
  if (!canEndDay(run, book)) return { ran: false, events: [] };
  const chapter = getChapter(book, run.chapterId);
  const today = chapterDayData(chapter, run.chapterDay)!;
  const state = run.state;
  const events: SimEvent[] = [];
  let healthLost = 0;

  // 1. Power.
  const power = resolvePower(state, today.sunlight);
  state.charge = power.chargeAfter;
  events.push({
    type: 'power',
    supply: power.supply,
    demand: power.demand,
    used: power.used,
    chargeBefore: power.chargeBefore,
    chargeAfter: power.chargeAfter,
    capacity: power.capacity,
  });
  for (const u of power.unpowered) events.push({ type: 'unpowered', buildingId: u.buildingId, building: u.building, need: u.need });

  // 2. Production.
  events.push(...produce(state, power.powered));

  // 3. Crew use air and food.
  events.push(crewUse(state));

  // 4. Unpowered habitats. A habitat never breaks (SPEC 16.1).
  for (const u of power.unpowered) {
    const loss = BUILDINGS[u.building].unpoweredHealthLoss;
    if (loss <= 0) continue;
    const before = state.health;
    state.health = clampHealth(state.health - loss);
    healthLost += loss;
    events.push({ type: 'health', amount: state.health - before, cause: 'unpowered_habitat', buildingId: u.buildingId, level: 0 });
  }

  // 5. Repairs.
  for (const b of state.buildings) {
    if (b.brokenDays > 0 && !b.manualRepair) {
      b.brokenDays--;
      if (b.brokenDays === 0) events.push({ type: 'repaired', buildingId: b.id, building: b.type });
    }
    if (b.damagedDays > 0) {
      b.damagedDays--;
      if (b.damagedDays === 0) events.push({ type: 'panel_restored', buildingId: b.id });
    }
  }

  // 6. Weather.
  const weather = applyRadiation(state, today.radiation, stormSourceOf(today));
  events.push(...weather.events);
  healthLost += weather.healthLost;
  const brokenToday = weather.events.flatMap((e) => (e.type === 'broken' ? [e.buildingId] : []));

  // 7. Supply rocket, after today's storm (SPEC 16.1).
  if (state.day % ROCKET.interval === 0) {
    const pad = state.buildings.find((b) => b.type === 'pad');
    if (pad && !isWorking(pad)) {
      events.push({ type: 'rocket_blocked', buildingId: pad.id, partsLost: ROCKET.parts });
    } else {
      state.parts += ROCKET.parts;
      events.push({ type: 'rocket_landed', parts: ROCKET.parts });
    }
  }

  // 8. Goals, map growth and stages. The next goal sees the weather of the next morning: that day and the one after.
  const ahead = (n: number) => chapterDayData(chapter, run.chapterDay + n)?.radiation ?? 0;
  events.push(...checkGoals(state, { today: ahead(1), tomorrow: ahead(2) }));
  // What does not fit in the stores is not kept (SPEC 18.2).
  events.push(...capStocks(state));

  // 9. Yesterday's prediction.
  events.push(...scorePrediction(state, brokenToday));

  // 10. Recovery.
  if (healthLost === 0 && state.health < LIMITS.health.max) {
    const before = state.health;
    state.health = clampHealth(state.health + HEALTH_RECOVERY);
    events.push({ type: 'health', amount: state.health - before, cause: 'recovery', buildingId: null, level: 0 });
  }

  resolveIncident(state);
  state.criticalDays = state.air <= 0 || state.food <= 0 ? (state.criticalDays ?? 0) + 1 : 0;
  // 11. Two-turn rescue period before a supply shortage ends the run.
  const cause = state.health <= 0 ? 'health' : (state.criticalDays ?? 0) > LONG_RUN.rescueTurns ? (state.air <= 0 ? 'air' : 'food') : null;
  if (cause) {
    state.lost = { cause, sol: state.day };
    events.push({ type: 'lost', cause, sol: state.day });
  } else if (isLastChapterDay(chapter, run.chapterDay)) {
    run.pendingReport = true;
    events.push({ type: 'chapter_end', chapterId: run.chapterId, replay: run.replay });
  }

  state.log.push({
    sol: state.day,
    chapterId: run.chapterId,
    chapterDay: run.chapterDay,
    replay: run.replay,
    date: chapterDate(chapter, run.chapterDay),
    events: compactLog(events),
    after: stocksOf(state),
  });
  if(state.log.length>LONG_RUN.logDays)state.log.splice(0,state.log.length-LONG_RUN.logDays);
  state.question = null;

  // 12. Advance. A lost run does not advance.
  // ASSUMPTION: on a chapter end both counters still advance (step 12 as written), so chapterDay is days.length + 1 while the report is pending.
  if (!state.lost) {
    state.day += 1;
    run.chapterDay += 1;
    if (!run.pendingReport) startMorning(run, book);
  }
  return { ran: true, events };
}

/**
 * Keep building after a report (SPEC 9.6). Keeps the base and state.day, moves to the next
 * chapter in the archive (or back to the first with replay + 1). Never uses a day or gives parts.
 * A chapter id missing from the archive counts as the last chapter.
 * Returns false when there is no report pending.
 */
function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

export function nextArchiveChapterId(run: Run, book: ChapterBook): { chapterId: string; replayDelta: number } {
  const archive = book.archive;
  const i = archive.indexOf(run.chapterId);
  if (archive.length <= 2 || i < 0) {
    const next = i + 1;
    if (i < 0 || next >= archive.length) return { chapterId: archive[0], replayDelta: 1 };
    return { chapterId: archive[next], replayDelta: 0 };
  }
  const pool = archive.slice(1);
  const m = pool.length;
  const site = Math.abs(run.siteNumber || 1);
  const topSpan = Math.min(m, Math.max(1, Math.ceil(m / 3)));
  const firstIdx = site % topSpan;
  if (i === 0) return { chapterId: pool[firstIdx], replayDelta: 0 };
  let step = m <= 2 ? 1 : Math.max(2, Math.floor(m / 3) + (site % Math.max(2, Math.floor(m / 2))));
  if (step >= m) step = (step % (m - 1)) + 1;
  while (gcd(step, m) !== 1) {
    step = step + 1 >= m ? 1 : step + 1;
  }
  const nextP = (i - 1 + step) % m;
  if (nextP === firstIdx) return { chapterId: archive[0], replayDelta: 1 };
  return { chapterId: pool[nextP], replayDelta: 0 };
}

export function keepBuilding(run: Run, book: ChapterBook): boolean {
  if (!run.pendingReport || run.state.lost) return false;
  const next = nextArchiveChapterId(run, book);
  run.chapterId = next.chapterId;
  run.replay += next.replayDelta;
  run.chapterDay = 1;
  run.pendingReport = false;
  run.state.chapterStart = chapterSnapshot(run.state);
  startMorning(run, book);
  return true;
}
