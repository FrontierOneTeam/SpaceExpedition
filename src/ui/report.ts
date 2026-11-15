// The report "This really happened" (SPEC 10.7, 12). Pure: no DOM.
//
// A stored report holds facts, not sentences: the chapter id, replay, sol range, and one timeline
// row per card date with what the day log shows about the base. Sentences are made when it is
// shown: NASA text from cards.json, base text from fixed templates in strings.en.json.

import {
  goalsCompleted,
  revealedSize,
  type BuildingType,
  type Chapter,
  type DayLog,
  type Run,
} from '../sim/index.ts';
import { cardById, cardSources, usedSources, type SourceRow } from './content.ts';
import { dateRange, longDate, replayLine, shortDate } from './format.ts';
import { buildingLower } from './info.ts';
import { t, type StringKey } from './strings.ts';

/** What the day log shows about the base on one card date. */
export interface BaseFacts {
  /** Radiation level that hit that day, 0 when none. */
  storm: number;
  /** When a storm hit: was every habitat under a shelter. Null on a day with no storm. */
  habitatSheltered: boolean | null;
  /** Buildings the storm broke that day. */
  broken: BuildingType[];
  damagedPanels: number;
  /** Crew health lost that day, from any cause. */
  healthLost: number;
  goals: number;
  prediction: 'right' | 'wrong' | 'saved' | null;
}

export interface TimelineRow {
  date: string;
  cardId: string;
  sol: number;
  base: BaseFacts;
}

export interface Grew {
  crew: { from: number; to: number };
  /** Buildings and shelters standing. */
  buildings: { from: number; to: number };
  goals: number;
  /** Revealed land, as the side of the square (6 for 6x6). */
  land: { from: number; to: number };
  predictions: { right: number; answered: number };
}

export type TradedKey = 'shelterKept' | 'radiationHurt' | 'brokeOne' | 'brokeMany' | 'brokeNone' | 'noPowerDays';

export interface ReportEntry {
  chapterId: string;
  replay: number;
  sols: { first: number; last: number };
  dates: { first: string; last: string };
  /** True for a run that stopped before the chapter's last day. */
  partial: boolean;
  rows: TimelineRow[];
  grew: Grew;
  /** At most two "What you traded" lines, as template keys and their number. */
  traded: { key: TradedKey; n: number }[];
}

function chapterLogs(run: Run): DayLog[] {
  return run.state.log.filter((l) => l.chapterId === run.chapterId && l.replay === run.replay);
}

export function baseFacts(log: DayLog): BaseFacts {
  const facts: BaseFacts = { storm: 0, habitatSheltered: null, broken: [], damagedPanels: 0, healthLost: 0, goals: 0, prediction: null };
  for (const e of log.events) {
    if (e.type === 'storm') {
      facts.storm = e.level;
      facts.habitatSheltered = e.allHabitatsSheltered;
    } else if (e.type === 'broken') facts.broken.push(e.building);
    else if (e.type === 'damaged') facts.damagedPanels++;
    else if (e.type === 'health' && e.amount < 0) facts.healthLost -= e.amount;
    else if (e.type === 'goal_done') facts.goals++;
    else if (e.type === 'prediction_scored') facts.prediction = e.saved ? 'saved' : e.right ? 'right' : 'wrong';
  }
  return facts;
}

/** "What you traded": at most two lines, each only from what the log shows. */
function tradedLines(logs: DayLog[]): { key: TradedKey; n: number }[] {
  const out: { key: TradedKey; n: number }[] = [];
  const stormDays = logs.filter((l) => l.events.some((e) => e.type === 'storm'));
  if (stormDays.length > 0) {
    let radiation = 0;
    const broken = new Set<number>();
    for (const l of logs) {
      for (const e of l.events) {
        if (e.type === 'health' && e.cause === 'radiation') radiation -= e.amount;
        if (e.type === 'broken') broken.add(e.buildingId);
      }
    }
    // Any storm level hurts the crew when a habitat is unsheltered, so no radiation loss means
    // every habitat stood under a shelter, which cost soil.
    out.push(radiation > 0 ? { key: 'radiationHurt', n: radiation } : { key: 'shelterKept', n: 0 });
    if (broken.size === 0) out.push({ key: 'brokeNone', n: 0 });
    else out.push({ key: broken.size === 1 ? 'brokeOne' : 'brokeMany', n: broken.size });
  } else {
    const noPower = logs.filter((l) => l.events.some((e) => e.type === 'unpowered')).length;
    if (noPower > 0) out.push({ key: 'noPowerDays', n: noPower });
  }
  return out.slice(0, 2);
}

/** Build the report for the run's current chapter from its day log and chapter start. */
export function buildReport(run: Run, chapter: Chapter, partial: boolean): ReportEntry {
  const state = run.state;
  const logs = chapterLogs(run);
  const start = state.chapterStart;
  const rows: TimelineRow[] = [];
  chapter.days.forEach((day, i) => {
    if (!day.cardId) return;
    const log = logs.find((l) => l.chapterDay === i + 1);
    if (!log) return;
    rows.push({ date: day.date, cardId: day.cardId, sol: log.sol, base: baseFacts(log) });
  });
  const first = logs[0];
  const last = logs[logs.length - 1];
  return {
    chapterId: run.chapterId,
    replay: run.replay,
    sols: { first: first ? first.sol : start.sol, last: last ? last.sol : start.sol },
    dates: { first: first ? first.date : chapter.days[0].date, last: last ? last.date : chapter.days[0].date },
    partial,
    rows,
    grew: {
      crew: { from: start.crew, to: state.crew },
      buildings: { from: start.buildings + start.shelters, to: state.buildings.length + state.shelters.length },
      goals: goalsCompleted(state) - start.goalsCompleted,
      land: { from: start.revealedSize, to: revealedSize(state.ring) },
      predictions: {
        right: state.predictions.right - start.predictions.right,
        answered: state.predictions.answered - start.predictions.answered,
      },
    },
    traded: tradedLines(logs),
  };
}

// ---- Stored reports (SPEC 12): read-only, checked on load ----

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function looksLikeReport(v: unknown): v is ReportEntry {
  if (!isObj(v)) return false;
  const sols = v.sols;
  const dates = v.dates;
  const grew = v.grew;
  return (
    typeof v.chapterId === 'string' &&
    typeof v.replay === 'number' &&
    isObj(sols) &&
    typeof sols.first === 'number' &&
    typeof sols.last === 'number' &&
    isObj(dates) &&
    typeof dates.first === 'string' &&
    typeof dates.last === 'string' &&
    Array.isArray(v.rows) &&
    v.rows.every((r) => isObj(r) && typeof r.date === 'string' && typeof r.cardId === 'string' && typeof r.sol === 'number' && isObj(r.base)) &&
    isObj(grew) &&
    Array.isArray(v.traded)
  );
}

// ---- What the report shows ----

export interface ReportRowView {
  date: string;
  /** What NASA observed: the card text, exactly as in cards.json. */
  nasa: string;
  sources: SourceRow[];
  /** What happened in your base: fixed templates over the day log. */
  baseTitle: string;
  base: string[];
}

export interface ReportView {
  period: string;
  replay: string | null;
  partial: string | null;
  rows: ReportRowView[];
  emptyTimeline: string | null;
  grew: { label: string; value: string }[];
  traded: string[];
  real: string[];
  simplified: string[];
  sources: SourceRow[];
}

const STORM_LINE: StringKey[] = ['base.storm1', 'base.storm1', 'base.storm2', 'base.storm3'];

function names(types: BuildingType[]): string {
  return [...new Set(types)].map((b) => buildingLower(b)).join(t('list.separator'));
}

/** The base column: only what the day log shows, never stated as history. */
export function baseLines(f: BaseFacts): string[] {
  const lines: string[] = [];
  if (f.storm > 0) {
    lines.push(t(STORM_LINE[f.storm]));
    if (f.habitatSheltered !== null) lines.push(t(f.habitatSheltered ? 'base.habitatSheltered' : 'base.habitatOpen'));
    lines.push(f.broken.length > 0 ? t('base.broke', { names: names(f.broken) }) : t('base.nothingBroke'));
    if (f.damagedPanels > 0) lines.push(f.damagedPanels === 1 ? t('base.panelOne') : t('base.panelMany', { n: f.damagedPanels }));
  } else {
    lines.push(t('base.noStorm'));
  }
  if (f.healthLost > 0) lines.push(t('base.healthLost', { n: f.healthLost }));
  else if (f.storm > 0) lines.push(t('base.healthKept'));
  if (f.goals > 0) lines.push(f.goals === 1 ? t('base.goalOne') : t('base.goalMany', { n: f.goals }));
  if (f.prediction === 'saved') lines.push(t('predict.saved'));
  else if (f.prediction === 'right') lines.push(t('base.predictRight'));
  else if (f.prediction === 'wrong') lines.push(t('base.predictWrong'));
  return lines;
}

const TRADED: Record<TradedKey, StringKey> = {
  shelterKept: 'traded.shelterKept',
  radiationHurt: 'traded.radiationHurt',
  brokeOne: 'traded.brokeOne',
  brokeMany: 'traded.brokeMany',
  brokeNone: 'traded.brokeNone',
  noPowerDays: 'traded.noPowerDays',
};

/** The Real half of the Real / Simplified box (SPEC 9.4), from the chapter file, for the period shown. */
export function realLines(chapter: Chapter, first: string, last: string): string[] {
  const days = chapter.days.filter((d) => d.date >= first && d.date <= last);
  const lines = days.flatMap((d) =>
    d.flares.map((f) => t('real.flare', { date: shortDate(d.date), time: f.peakTime.slice(11, 16), cls: f.classType })),
  );
  // ASSUMPTION: the radiation storm at Mars is the chapter's first day with storm-level radiation (11 September 2017).
  const storm = days.find((d) => d.radiation >= 2);
  if (storm) lines.push(t('real.storm', { date: longDate(storm.date) }));
  return lines;
}

export function reportView(entry: ReportEntry, chapter: Chapter): ReportView {
  const rows: ReportRowView[] = [];
  for (const r of entry.rows) {
    const card = cardById(r.cardId);
    const sources = card ? cardSources(card) : null;
    // A row whose card or sources do not resolve is left out rather than shown unsourced.
    if (!card || !sources) continue;
    rows.push({ date: longDate(r.date), nasa: card.text, sources, baseTitle: t('report.baseSol', { n: r.sol }), base: baseLines(r.base) });
  }
  const g = entry.grew;
  const land = (n: number) => t('report.landSize', { n });
  return {
    period: dateRange(entry.dates.first, entry.dates.last),
    replay: entry.replay > 1 ? replayLine(chapter, entry.replay) : null,
    partial: entry.partial ? t('report.partial', { first: entry.sols.first, last: entry.sols.last }) : null,
    rows,
    emptyTimeline: rows.length === 0 ? t('report.noRows') : null,
    grew: [
      { label: t('report.grew.crew'), value: t('report.fromTo', { from: g.crew.from, to: g.crew.to }) },
      { label: t('report.grew.buildings'), value: t('report.fromTo', { from: g.buildings.from, to: g.buildings.to }) },
      { label: t('report.grew.goals'), value: String(g.goals) },
      { label: t('report.grew.land'), value: t('report.fromTo', { from: land(g.land.from), to: land(g.land.to) }) },
      {
        label: t('report.grew.predictions'),
        value: g.predictions.answered > 0 ? t('report.rightOf', { right: g.predictions.right, answered: g.predictions.answered }) : t('report.noneAnswered'),
      },
    ],
    traded: entry.traded.slice(0, 2).map((x) => t(TRADED[x.key], { n: x.n })),
    real: realLines(chapter, entry.dates.first, entry.dates.last),
    simplified: chapter.simplified.slice(),
    sources: usedSources(),
  };
}
