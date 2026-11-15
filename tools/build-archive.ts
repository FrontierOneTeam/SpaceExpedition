/**
 * Builds the 36 monthly archive chapters (Jan 2022 to Dec 2024) and src/data/archive.json
 * from the committed raw DONKI files. SPEC 18.1: the chapter files are exactly this output.
 * Run: npx tsx tools/build-archive.ts   (no network needed)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addDays,
  CHAPTERS,
  classRank,
  isStrong,
  isX,
  NO_RECORD_NOTE,
  strongestFlare,
  type Chapter,
  type ChapterDay,
  type RawFlare,
} from './build-chapter';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolsDir, '..');
const rawDir = join(root, 'src', 'data', 'raw');
const outDir = join(root, 'src', 'data', 'chapters');

export const GAME_STORM_NOTE =
  "Game storm. In the game, a big flare is followed by a storm at your base the next day. NASA's flare list does not say what happened at Mars on this date.";
export const REAL_STORM_DATE = '2024-05-20';
export const REAL_STORM_ARCHIVE_ID = 'archive-2024-05';

const SIMPLIFIED = [
  'Storms this month are part of the game. A big flare is followed by a game storm the next day.',
  "NASA's flare list does not say what happened at Mars.",
  'What breaks and how much health is lost are part of the game.',
  'Sunlight is steady in this chapter.',
  'One sol is shown as one Earth date.',
  'The outpost and its site are made up.',
];
const REAL_STORM_LINE =
  'The storm on 20 May 2024 is real. NASA reported it. Every other storm this month is part of the game.';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface MonthSpec {
  year: number;
  month: number; // 1 to 12
}

export function monthId({ year, month }: MonthSpec): string {
  return `archive-${year}-${String(month).padStart(2, '0')}`;
}

export function monthStart({ year, month }: MonthSpec): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function monthEnd({ year, month }: MonthSpec): string {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

export function rawFileName(spec: MonthSpec): string {
  return `donki-flr-${monthStart(spec)}_${monthEnd(spec)}.json`;
}

export function previousMonth({ year, month }: MonthSpec): MonthSpec {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** All 36 archive months in calendar order. */
export const MONTHS: MonthSpec[] = [2022, 2023, 2024].flatMap((year) =>
  Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1 })),
);

/** The game storm level that follows a day whose strongest flare is `classType` (SPEC 18.1 point 3). */
export function gameStormLevel(classType: string | undefined): 0 | 1 | 2 | 3 {
  if (!classType) return 0;
  const n = Number(classType.slice(1));
  if (isX(classType)) return n >= 5 ? 3 : 2;
  if (classType.startsWith('M') && n >= 5) return 1;
  return 0;
}

export interface BuildArchiveInput {
  spec: MonthSpec;
  /** The raw DONKI records of this month. */
  raw: RawFlare[];
  /** The raw records of the month before, or null when none is committed. */
  previousRaw: RawFlare[] | null;
  /** date to cardId, only the dates that have a card. */
  cardIds: Record<string, string>;
  /** Note for the real storm date, from the curated May 2024 chapter. */
  realStormNote: string;
}

function strongestOn(raw: RawFlare[] | null, date: string): string | undefined {
  if (!raw) return undefined;
  return strongestFlare(raw.filter((f) => f.peakTime.slice(0, 10) === date))?.classType;
}

/** Pure: one month's chapter from the committed raw records. */
export function buildArchiveMonth(input: BuildArchiveInput): Chapter {
  const { spec, raw, previousRaw, cardIds, realStormNote } = input;
  const id = monthId(spec);
  const start = monthStart(spec);
  const end = monthEnd(spec);
  const dayCount = Number(end.slice(8, 10));
  const days: ChapterDay[] = [];
  for (let i = 0; i < dayCount; i++) {
    const date = addDays(start, i);
    const onDay = raw.filter((f) => f.peakTime.slice(0, 10) === date);
    const flares = onDay
      .filter((f) => isStrong(f.classType))
      .sort((a, b) => (a.peakTime < b.peakTime ? -1 : a.peakTime > b.peakTime ? 1 : 0))
      .map((f) => ({ peakTime: f.peakTime, classType: f.classType }));
    const flare = flares.some((f) => isX(f.classType)) ? 'major' : flares.length > 0 ? 'strong' : 'none';

    // The strongest flare on the previous calendar day (SPEC 18.1 point 3).
    const prevDate = addDays(date, -1);
    const prevClass = prevDate.slice(0, 7) === date.slice(0, 7) ? strongestOn(raw, prevDate) : strongestOn(previousRaw, prevDate);
    let radiation: 0 | 1 | 2 | 3 = gameStormLevel(prevClass);
    let stormSource: 'nasa-report' | 'game-rule' | undefined = radiation > 0 ? 'game-rule' : undefined;
    const realStorm = id === REAL_STORM_ARCHIVE_ID && date === REAL_STORM_DATE;
    if (realStorm) {
      radiation = 3;
      stormSource = 'nasa-report';
    }

    const day: ChapterDay = { date, sunlight: 1, radiation, flare, flares, flareCount: onDay.length };
    if (stormSource) day.stormSource = stormSource;
    const strongest = strongestFlare(onDay);
    if (strongest) day.strongest = strongest;
    if (id === REAL_STORM_ARCHIVE_ID && cardIds[date]) day.cardId = cardIds[date];
    if (realStorm) day.notes = realStormNote;
    else if (stormSource === 'game-rule') day.notes = GAME_STORM_NOTE;
    else if (onDay.length === 0) day.notes = NO_RECORD_NOTE;
    days.push(day);
  }
  return {
    id,
    title: `${MONTH_NAMES[spec.month - 1]} ${spec.year} records`,
    site: 'mars',
    startDate: start,
    setup: 'Here is what the Sun did this month.',
    days,
    simplified: id === REAL_STORM_ARCHIVE_ID ? [REAL_STORM_LINE, ...SIMPLIFIED] : [...SIMPLIFIED],
  };
}

// ---- Month order (SPEC 18.1 point 6) ----

export interface MonthStats {
  id: string;
  days: number;
  events: number;
  storms: [number, number, number]; // levels 1, 2, 3
  /** Quiet days at the start, longest quiet run inside, quiet days at the end. */
  lead: number;
  longest: number;
  trail: number;
}

export const isEventDay = (d: ChapterDay): boolean => d.flare !== 'none' || d.radiation > 0;

export function monthStats(ch: Chapter): MonthStats {
  let events = 0;
  const storms: [number, number, number] = [0, 0, 0];
  let run = 0;
  let longest = 0;
  let lead = -1;
  for (const d of ch.days) {
    if (d.radiation > 0) storms[d.radiation - 1]++;
    if (isEventDay(d)) {
      events++;
      if (lead < 0) lead = run;
      run = 0;
    } else {
      run++;
      longest = Math.max(longest, run);
    }
  }
  if (lead < 0) lead = ch.days.length;
  return { id: ch.id, days: ch.days.length, events, storms, lead, longest, trail: run };
}

/** Longest run of days without an event across chapters played in this order. */
export function longestQuietRun(chapters: Chapter[]): number {
  let run = 0;
  let best = 0;
  for (const ch of chapters) {
    for (const d of ch.days) {
      if (isEventDay(d)) run = 0;
      else best = Math.max(best, ++run);
    }
  }
  return best;
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/** Lengths of every run of days without an event, in play order. */
function quietRuns(chapters: Chapter[]): number[] {
  const runs: number[] = [];
  let run = 0;
  for (const ch of chapters)
    for (const d of ch.days) {
      if (isEventDay(d)) {
        if (run > 0) runs.push(run);
        run = 0;
      } else run++;
    }
  if (run > 0) runs.push(run);
  return runs;
}

/** Lower is better: the longest quiet run first, then the sum of squared runs (many short beats few long). */
function orderScore(chapters: Chapter[]): [number, number] {
  const runs = quietRuns(chapters);
  return [Math.max(0, ...runs), runs.reduce((t, r) => t + r * r, 0)];
}

/**
 * Deterministic order. `fixed` chapters come first, in the given order. The rest start in a
 * fixed order (most events first, ties by id) and then a hill climb swaps pairs of months,
 * scanning in index order and keeping the first swap that gives a better score, until none does.
 * No randomness, so the same files always give the same order.
 */
export function orderMonths(chapters: Chapter[], fixed: string[]): string[] {
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const stats = new Map(chapters.map((c) => [c.id, monthStats(c)]));
  const rest = chapters
    .map((c) => c.id)
    .filter((id) => !fixed.includes(id))
    .sort((a, b) => stats.get(b)!.events - stats.get(a)!.events || (a < b ? -1 : 1));
  const score = (r: string[]) => orderScore([...fixed, ...r].map((id) => byId.get(id)!));
  const less = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  let best = score(rest);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < rest.length; i++)
      for (let j = i + 1; j < rest.length; j++) {
        [rest[i], rest[j]] = [rest[j], rest[i]];
        const s = score(rest);
        if (less(s, best)) {
          best = s;
          improved = true;
        } else [rest[i], rest[j]] = [rest[j], rest[i]];
      }
  }
  return [...fixed, ...rest];
}

// ---- Script ----

function readRaw(spec: MonthSpec): RawFlare[] | null {
  const file = join(rawDir, rawFileName(spec));
  if (!existsSync(file)) return null;
  const meta = file.replace(/\.json$/, '.meta.json');
  if (!existsSync(meta)) throw new Error(`missing meta file for ${rawFileName(spec)}`);
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${rawFileName(spec)} is not a JSON array`);
  return parsed as RawFlare[];
}

export function loadCardIds(): Record<string, string> {
  const cards = JSON.parse(readFileSync(join(root, 'src', 'data', 'cards.json'), 'utf8')) as { id: string; date: string }[];
  return Object.fromEntries(cards.filter((c) => c.id.startsWith('may2024-')).map((c) => [c.date, c.id]));
}

export function realStormNote(): string {
  return CHAPTERS.find((c) => c.id === 'may2024')!.notes[REAL_STORM_DATE];
}

export function buildAllMonths(): Chapter[] {
  const cardIds = loadCardIds();
  const note = realStormNote();
  return MONTHS.map((spec) => {
    const raw = readRaw(spec);
    if (!raw) throw new Error(`missing raw file ${rawFileName(spec)}`);
    const previousRaw = spec.year === 2022 && spec.month === 1 ? null : readRaw(previousMonth(spec));
    return buildArchiveMonth({ spec, raw, previousRaw, cardIds, realStormNote: note });
  });
}

function main(): void {
  const chapters = buildAllMonths();
  for (const ch of chapters) writeFileSync(join(outDir, `${ch.id}.json`), JSON.stringify(ch, null, 2) + '\n');
  const fixed = ['sep2017', REAL_STORM_ARCHIVE_ID];
  const sep = JSON.parse(readFileSync(join(outDir, 'sep2017.json'), 'utf8')) as Chapter;
  const all = [sep, ...chapters];
  const order = orderMonths(all, fixed);
  writeFileSync(join(root, 'src', 'data', 'archive.json'), JSON.stringify(order, null, 2) + '\n');

  const byId = new Map(all.map((c) => [c.id, c]));
  console.log('order | events | storms L1/L2/L3 | quiet lead/longest/trail');
  for (const id of order) {
    const s = monthStats(byId.get(id)!);
    console.log(`${id} | ${s.events} | ${s.storms.join('/')} | ${s.lead}/${s.longest}/${s.trail}`);
  }
  console.log(`longest run without an event in this order: ${longestQuietRun(order.map((id) => byId.get(id)!))} days`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
