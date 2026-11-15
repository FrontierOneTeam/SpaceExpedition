// Long run (SPEC 18.2): the sensible bot plays the real chapter order for 1,200 sols on several
// sites, saving and loading every 100 sols, and prints the pace table with each target MET or MISSED.
//
// Run with: npx tsx tools/long-run.ts            (writes docs/takeover/LONG_RUN.json)
//           npx tsx tools/long-run.ts --seeds 3  (fewer sites, faster)

import { readFileSync, writeFileSync } from 'node:fs';
import { sensible, setBotBook } from './balance-bot.ts';
import { config, createRng, endDay, goalsCompleted, keepBuilding, newRun, stageOf, storageLimit, type ChapterBook, type ChosenKind, type Run } from '../src/sim/index.ts';
import { emptySave } from '../src/save/save.ts';
import { exportSave, importSave } from '../src/save/files.ts';

const ids = JSON.parse(readFileSync('src/data/archive.json', 'utf8')) as string[];
const book: ChapterBook = {
  archive: ids,
  chapters: Object.fromEntries(ids.map((id) => [id, JSON.parse(readFileSync(`src/data/chapters/${id}.json`, 'utf8'))])),
};
setBotBook(book);

const SOLS = 1200;
const seedsAt = process.argv.indexOf('--seeds');
const SEED_COUNT = seedsAt >= 0 ? Number(process.argv[seedsAt + 1]) : 10;
/** `--trace 9` prints site 9 every 10 sols, for tuning. */
const traceAt = process.argv.indexOf('--trace');
const TRACE = traceAt >= 0 ? Number(process.argv[traceAt + 1]) : null;
const SEEDS = TRACE !== null ? [TRACE] : Array.from({ length: SEED_COUNT }, (_, i) => [1, 9, 42, 77, 123, 256, 404, 512, 777, 999][i] ?? 1000 + i);

interface SiteResult {
  seed: number;
  sols: number;
  loss: Run['state']['lost'];
  /** Sol each stage was reached (index 0 is the start). */
  stageSol: (number | null)[];
  crew160: number;
  crewMax160: number;
  crew1200: number;
  goals: number;
  kinds: ChosenKind[];
  repeatsInARow: number;
  land: number;
  overLimitDays: number;
  /** Days after the starter goals with no goal on screen. */
  noGoalDays: number;
  /** Bytes of the browser save (compact JSON) and of an exported file (indented). */
  saveBytes: number;
  exportBytes: number;
  logDays: number;
}

function play(seed: number): SiteResult {
  let run = newRun(seed, book);
  const rng = createRng(seed);
  const stageSol: (number | null)[] = config.STAGES.map((_, i) => (i === 0 ? 1 : null));
  const kinds: ChosenKind[] = [];
  let lastGoal = '';
  let crew160 = 0;
  let crewMax160 = 0;
  let overLimitDays = 0;
  let noGoalDays = 0;
  let sols = 0;
  while (sols < SOLS && !run.state.lost) {
    if (run.pendingReport) keepBuilding(run, book);
    sensible(run, rng);
    endDay(run, book);
    sols++;
    const s = run.state;
    const st = stageOf(s);
    for (let i = 1; i <= st; i++) if (stageSol[i] === null) stageSol[i] = s.day - 1;
    const cur = s.goals.current;
    const key = cur ? `${cur.kind}:${cur.target}:${s.goals.repeatingDone}` : '';
    if (key !== lastGoal) kinds.push(cur ? cur.kind : ('none' as ChosenKind));
    lastGoal = key;
    if (s.goals.starterDone >= 4 && !cur) noGoalDays++;
    if (s.parts > storageLimit(s, 'parts') || s.soil > storageLimit(s, 'soil')) overLimitDays++;
    if (s.day - 1 <= 160) crewMax160 = Math.max(crewMax160, s.crew);
    if (s.day - 1 === 160) crew160 = s.crew;
    if (TRACE !== null && sols % 10 === 0) {
      const count = (t: string) => s.buildings.filter((b) => b.type === t).length;
      console.log(
        `sol ${s.day - 1} stage ${st} goals ${goalsCompleted(s)} crew ${s.crew} parts ${s.parts} soil ${s.soil} water ${s.water} air ${s.air} food ${s.food} hp ${s.health}` +
          ` | goal ${cur ? `${cur.kind} ${cur.target}` : 'none'} | home ${count('home')} o2 ${count('o2')} farm ${count('farm')} mine ${count('mine')} dig ${count('dig')} fab ${count('fab')} sun ${count('sun')} batt ${count('batt')} lab ${count('lab')} shelters ${s.shelters.length} land ${s.terrain.length}`,
      );
    }
    // Save and load through the real file format every 100 sols.
    if (sols % 100 === 0) run = importSave(exportSave({ ...emptySave(), outpost: run })).outpost!;
  }
  let repeatsInARow = 0;
  for (let i = 1; i < kinds.length; i++) if (kinds[i] === kinds[i - 1] && (kinds[i] as string) !== 'none') repeatsInARow++;
  const save = { ...emptySave(), outpost: run };
  return {
    seed,
    sols,
    loss: run.state.lost,
    stageSol,
    crew160,
    crewMax160,
    crew1200: run.state.crew,
    goals: goalsCompleted(run.state),
    kinds,
    repeatsInARow,
    land: run.state.terrain.length,
    overLimitDays,
    noGoalDays,
    saveBytes: JSON.stringify({ ...save, version: 1 }).length,
    exportBytes: exportSave(save).length,
    logDays: run.state.log.length,
  };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const started = Date.now();
const results = SEEDS.map((seed) => {
  const r = play(seed);
  console.log(
    `site ${r.seed}: ${r.sols} sols, ${r.loss ? `LOST (${r.loss.cause}, sol ${r.loss.sol})` : 'alive'}, stages at sols ${r.stageSol.map((x) => x ?? '-').join(' / ')},` +
      ` crew ${r.crew160} at sol 160, ${r.crew1200} at the end, ${r.goals} goals, land ${r.land}x${r.land}, save ${(r.saveBytes / 1024).toFixed(0)} KB`,
  );
  return r;
});

// ---- The pace table (SPEC 18.2) ----

const n = config.STAGES.length;
const all = (f: (r: SiteResult) => boolean) => results.every(f);
const gaps = results.flatMap((r) => r.stageSol.slice(2).map((sol, i) => (sol !== null && r.stageSol[i + 1] !== null ? sol - r.stageSol[i + 1]! : null)).filter((x): x is number => x !== null));
const fmt = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  if (v.length === 0) return 'never';
  return `median ${median(v)}, range ${Math.min(...v)} to ${Math.max(...v)}${v.length < xs.length ? `, missing in ${xs.length - v.length}` : ''}`;
};
const allKinds = new Set(results.flatMap((r) => r.kinds).filter((k) => (k as string) !== 'none'));
const rows: [string, string, string, boolean][] = [
  ['Every site survives 1,200 sols', 'no loss', `${results.filter((r) => !r.loss).length} of ${results.length}`, all((r) => !r.loss)],
  ['Second stage', 'sol 10 to 20', fmt(results.map((r) => r.stageSol[1])), all((r) => r.stageSol[1] !== null && r.stageSol[1]! >= 10 && r.stageSol[1]! <= 20)],
  ['Each later stage after the one before', '30 to 80 sols', gaps.length ? `median ${median(gaps)}, range ${Math.min(...gaps)} to ${Math.max(...gaps)}` : '-', gaps.length > 0 && gaps.every((g) => g >= 30 && g <= 80)],
  ['Last stage', 'not before sol 250', fmt(results.map((r) => r.stageSol[n - 1])), all((r) => r.stageSol[n - 1] !== null && r.stageSol[n - 1]! >= 250)],
  ['Crew at sol 160', '14 to 30', fmt(results.map((r) => r.crew160)), all((r) => r.crew160 >= 14 && r.crew160 <= 30)],
  ['Crew up to sol 160', 'never above 40', `highest ${Math.max(...results.map((r) => r.crewMax160))}`, all((r) => r.crewMax160 <= 40)],
  ['Crew at sol 1,200', 'under 150', fmt(results.map((r) => r.crew1200)), all((r) => r.crew1200 < 150)],
  ['Parts and soil at or under their limits', 'every day', `${results.reduce((a, r) => a + r.overLimitDays, 0)} days over`, all((r) => r.overLimitDays === 0)],
  ['Same goal kind twice in a row', 'never', `${results.reduce((a, r) => a + r.repeatsInARow, 0)} times`, all((r) => r.repeatsInARow === 0)],
  ['Days with no goal on screen', 'few (no target)', `median ${median(results.map((r) => r.noGoalDays))} of ${SOLS}`, true],
  ['Goal kinds offered', 'at least 8', `${allKinds.size}: ${[...allKinds].sort().join(', ')}`, allKinds.size >= 8],
  ['Browser save at the end', 'under 1 MB', `largest ${(Math.max(...results.map((r) => r.saveBytes)) / 1024).toFixed(0)} KB`, all((r) => r.saveBytes < 1_000_000)],
];

console.log(`\nPace table: sensible bot, current chapter order, ${results.length} sites, ${SOLS} sols each (${((Date.now() - started) / 1000).toFixed(0)} s)\n`);
const table = [['Target', 'Aim', 'Result', 'Verdict'], ...rows.map(([a, b, c, ok]) => [a, b, c, ok ? 'MET' : 'MISSED'])];
const widths = table[0].map((_, c) => Math.max(...table.map((r) => r[c].length)));
const line = (r: string[]) => '| ' + r.map((v, c) => v.padEnd(widths[c])).join(' | ') + ' |';
console.log(line(table[0]));
console.log('|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|');
for (const r of table.slice(1)) console.log(line(r));

writeFileSync(
  'docs/takeover/LONG_RUN.json',
  JSON.stringify(
    results.map(({ kinds, ...r }) => ({ ...r, goalKinds: [...new Set(kinds)].sort() })),
    null,
    2,
  ) + '\n',
);
if (results.some((r) => r.sols < SOLS)) process.exitCode = 1;
