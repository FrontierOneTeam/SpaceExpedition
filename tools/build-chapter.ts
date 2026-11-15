import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolsDir, '..');
const rawPath = join(root, 'src', 'data', 'raw', 'donki-flr-2017-09-02_2017-09-15.json');
const outPath = join(root, 'src', 'data', 'chapters', 'sep2017.json');

export interface RawFlare {
  peakTime: string;
  classType: string;
  [key: string]: unknown;
}

export interface ChapterFlare {
  peakTime: string;
  classType: string;
}

export interface ChapterDay {
  date: string;
  sunlight: number;
  radiation: number;
  flare: 'none' | 'strong' | 'major';
  flares: ChapterFlare[];
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

// Curated values that do not come from DONKI (SPEC 9.3, 9.4, 16.2).
const START_DATE = '2017-09-02';
const DAY_COUNT = 14;
const RADIATION: Record<string, number> = {
  '2017-09-11': 3,
  '2017-09-12': 2,
  '2017-09-13': 1,
};
const CARD_IDS: Record<string, string> = {
  '2017-09-06': 'sep2017-06',
  '2017-09-07': 'sep2017-07',
  '2017-09-10': 'sep2017-10',
  '2017-09-11': 'sep2017-11',
  '2017-09-12': 'sep2017-12',
};
const NO_RECORD_NOTE = 'The fetched DONKI response holds no flare record for this date.';
const SIMPLIFIED = [
  'Storm levels 1 to 3 are game levels, not measurements.',
  'What breaks and how much health is lost are part of the game.',
  'The one-day warning is part of the game.',
  'The radio blackout is part of the game.',
  'Sunlight is steady in this chapter.',
  'One sol is shown as one Earth date.',
  'The outpost and its site are made up.',
];

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isX(classType: string): boolean {
  return classType.startsWith('X');
}

// M5.0 or above: every X flare, and M flares with a number of 5.0 or more.
function isStrong(classType: string): boolean {
  if (isX(classType)) return true;
  return classType.startsWith('M') && Number(classType.slice(1)) >= 5;
}

export function buildChapter(rawFlares: RawFlare[]): Chapter {
  const days: ChapterDay[] = [];
  for (let i = 0; i < DAY_COUNT; i++) {
    const date = addDays(START_DATE, i);
    const onDay = rawFlares.filter((f) => f.peakTime.slice(0, 10) === date);
    const flares = onDay
      .filter((f) => isStrong(f.classType))
      .sort((a, b) => (a.peakTime < b.peakTime ? -1 : a.peakTime > b.peakTime ? 1 : 0))
      .map((f) => ({ peakTime: f.peakTime, classType: f.classType }));
    const flare = flares.some((f) => isX(f.classType)) ? 'major' : flares.length > 0 ? 'strong' : 'none';
    const day: ChapterDay = {
      date,
      sunlight: 1,
      radiation: RADIATION[date] ?? 0,
      flare,
      flares,
    };
    if (CARD_IDS[date]) day.cardId = CARD_IDS[date];
    if (onDay.length === 0) day.notes = NO_RECORD_NOTE;
    days.push(day);
  }
  return {
    id: 'sep2017',
    title: 'The September 2017 storms',
    site: 'mars',
    startDate: START_DATE,
    setup: 'A giant sunspot is turning to face you.',
    days,
    simplified: [...SIMPLIFIED],
  };
}

function main(): void {
  const raw = JSON.parse(readFileSync(rawPath, 'utf8')) as RawFlare[];
  writeFileSync(outPath, JSON.stringify(buildChapter(raw), null, 2) + '\n');
  console.log(`wrote ${outPath}`);
}

// Run only when started directly (not when imported by a test).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
