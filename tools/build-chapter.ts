import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolsDir, '..');
const rawDir = join(root, 'src', 'data', 'raw');
const outDir = join(root, 'src', 'data', 'chapters');

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

// Curated values that do not come from DONKI (SPEC 9.3, 9.4, 16.2), one definition per chapter.
export interface ChapterDef {
  id: string;
  title: string;
  startDate: string;
  dayCount: number;
  rawFile: string;
  setup: string;
  radiation: Record<string, number>;
  cardIds: Record<string, string>;
  notes: Record<string, string>; // overrides the default "no record" note on that date
  simplified: string[];
}

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

export const CHAPTERS: ChapterDef[] = [
  {
    id: 'sep2017',
    title: 'The September 2017 storms',
    startDate: '2017-09-02',
    dayCount: 14,
    rawFile: 'donki-flr-2017-09-02_2017-09-15.json',
    setup: 'A giant sunspot is turning to face you.',
    radiation: { '2017-09-11': 3, '2017-09-12': 2, '2017-09-13': 1 },
    cardIds: {
      '2017-09-06': 'sep2017-06',
      '2017-09-07': 'sep2017-07',
      '2017-09-10': 'sep2017-10',
      '2017-09-11': 'sep2017-11',
      '2017-09-12': 'sep2017-12',
    },
    notes: {},
    simplified: SIMPLIFIED,
  },
  {
    id: 'may2024',
    title: 'The May 2024 storms',
    startDate: '2024-05-11',
    dayCount: 14,
    rawFile: 'donki-flr-2024-05-08_2024-05-25.json',
    setup: 'The Sun has been firing big flares for days.',
    radiation: { '2024-05-20': 3 },
    cardIds: {
      '2024-05-11': 'may2024-11',
      '2024-05-14': 'may2024-14',
      '2024-05-19': 'may2024-19',
      '2024-05-20': 'may2024-20',
    },
    notes: {
      '2024-05-20':
        `${NO_RECORD_NOTE} NASA later estimated a class X12 flare on 20 May 2024 from Solar Orbiter data. ` +
        "Radiation level 3 is a game mapping of NASA's report that Curiosity measured its biggest radiation surge since landing. " +
        'No source says how long it lasted, so the game marks this one day only.',
    },
    simplified: [
      ...SIMPLIFIED,
      "The storm lasts one day in the game. NASA's report does not say how long it lasted.",
    ],
  },
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

export function buildChapter(rawFlares: RawFlare[], def: ChapterDef = CHAPTERS[0]): Chapter {
  const days: ChapterDay[] = [];
  for (let i = 0; i < def.dayCount; i++) {
    const date = addDays(def.startDate, i);
    const onDay = rawFlares.filter((f) => f.peakTime.slice(0, 10) === date);
    const flares = onDay
      .filter((f) => isStrong(f.classType))
      .sort((a, b) => (a.peakTime < b.peakTime ? -1 : a.peakTime > b.peakTime ? 1 : 0))
      .map((f) => ({ peakTime: f.peakTime, classType: f.classType }));
    const flare = flares.some((f) => isX(f.classType)) ? 'major' : flares.length > 0 ? 'strong' : 'none';
    const day: ChapterDay = {
      date,
      sunlight: 1,
      radiation: def.radiation[date] ?? 0,
      flare,
      flares,
    };
    if (def.cardIds[date]) day.cardId = def.cardIds[date];
    if (def.notes[date]) day.notes = def.notes[date];
    else if (onDay.length === 0) day.notes = NO_RECORD_NOTE;
    days.push(day);
  }
  return {
    id: def.id,
    title: def.title,
    site: 'mars',
    startDate: def.startDate,
    setup: def.setup,
    days,
    simplified: [...def.simplified],
  };
}

function main(): void {
  for (const def of CHAPTERS) {
    const raw = JSON.parse(readFileSync(join(rawDir, def.rawFile), 'utf8')) as RawFlare[];
    const outPath = join(outDir, `${def.id}.json`);
    writeFileSync(outPath, JSON.stringify(buildChapter(raw, def), null, 2) + '\n');
    console.log(`wrote ${outPath}`);
  }
}

// Run only when started directly (not when imported by a test).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
