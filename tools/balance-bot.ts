import {pathToFileURL} from 'node:url';
import {requestAid,repairBuilding} from '../src/sim/emergency.ts';
import {buyResearch} from '../src/sim/research.ts';
// Balance bot (SPEC 13.3, 16.1). Plays chapter one headless through the public sim API
// and prints one table. Bots only do what a player could do: valid placements, real costs.
//
// Run with: npm run bot

import archive from '../src/data/archive.json';
import sep2017Json from '../src/data/chapters/sep2017.json';
import {
  answerQuestion,
  buildingAt,
  chosenProgress,
  goalsCompleted,
  isGoalDone,
  stageOf,
  canPlace,
  config,
  createRng,
  currentGoal,
  endDay,
  forecast,
  getChapter,
  isSheltered,
  keepBuilding,
  newRun,
  place,
  previewDay,
  shelterTiles,
  validTiles,
  type BuildingType,
  type Chapter,
  type ChapterBook,
  type GameState,
  type PlaceableType,
  type Rng,
  type Run,
  type Tile,
} from '../src/sim/index.ts';

let book: ChapterBook = {
  archive: ['sep2017'],
  chapters: { sep2017: sep2017Json as unknown as Chapter },
};

const RUNS = 300;
const HOME: Tile = { r: 5, c: 5 };

// ---------------------------------------------------------------- helpers

const count = (s: GameState, t: BuildingType) => s.buildings.filter((b) => b.type === t).length;
const terrainAt = (s: GameState, t: Tile) => s.terrain[t.r][t.c];
const isDeposit = (s: GameState, t: Tile) => terrainAt(s, t) === 'ice' || terrainAt(s, t) === 'rock';
const dist = (a: Tile, b: Tile) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c);

function cost(type: PlaceableType): { parts: number; soil: number } {
  return type === 'shelter' ? config.SHELTER.cost : config.BUILDINGS[type].cost;
}

/** The only 2x2 block that can shelter the starting habitat (panels and pad block the rest). */
function habitatShelterTiles(s: GameState): Tile[] {
  const home=s.buildings.find(b=>b.type==='home')!;return [{r:home.r,c:home.c}];
}

/** Score a tile for a building; higher is better. */
function tileScore(s: GameState, type: BuildingType, t: Tile): number {
  let score = 0;
  if (type === 'sun') {
    if (isDeposit(s, t)) score -= 100;
    if (habitatShelterTiles(s).some((x) => x.r === t.r && x.c === t.c)) return -Infinity; // never block the habitat's shelter
    score += dist(t, HOME) * 2 + (t.r + t.c); // keep panels out of the machine cluster
    return score;
  }
  if (type !== 'mine' && type !== 'dig' && isDeposit(s, t)) score -= 100;
  if (isSheltered(s, t.r, t.c)) score += 60;
  score -= dist(t, HOME) * 3;
  score -= t.r + t.c; // machines to the north-west, panels to the south-east
  return score;
}

function bestTile(s: GameState, type: Exclude<PlaceableType, 'shelter'>): Tile | null {
  let best: Tile | null = null;
  let bestScore = -Infinity;
  for (const t of validTiles(s, type)) {
    const sc = tileScore(s, type, t);
    if (sc > bestScore) {
      bestScore = sc;
      best = t;
    }
  }
  return best;
}

function build(s: GameState, type: Exclude<PlaceableType, 'shelter'>): boolean {
  const t = bestTile(s, type);
  return t !== null && place(s, type, t.r, t.c).ok;
}

/** Build a mine or digger, placing one cheap connecting panel first when the deposit is one step away. */
function buildOnDeposit(s: GameState, type: 'mine' | 'dig'): boolean {
  if (build(s, type)) return true;
  const kind = type === 'mine' ? 'ice' : 'rock';
  const deposits: Tile[] = [];
  for (let r = 0; r < s.terrain.length; r++) {
    for (let c = 0; c < s.terrain.length; c++) {
      if (s.terrain[r][c] === kind && !buildingAt(s, r, c)) deposits.push({ r, c });
    }
  }
  deposits.sort((a, b) => dist(a, HOME) - dist(b, HOME));
  // Never put a panel where the habitat's shelter must go; use an oxygen maker there instead.
  const reserved = habitatShelterTiles(s);
  const isReserved = (t: Tile) => reserved.some((x) => x.r === t.r && x.c === t.c);
  for (const linkType of ['sun', 'o2'] as const) {
    if (s.parts < cost(linkType).parts + cost(type).parts) return false;
    for (const d of deposits) {
      const links = [[-1, 0], [1, 0], [0, -1], [0, 1]]
        .map(([dr, dc]) => ({ r: d.r + dr, c: d.c + dc }))
        .filter((t) => canPlace(s, linkType, t.r, t.c).ok && (linkType !== 'sun' || !isReserved(t)))
        .sort((a, b) => tileScore(s, linkType, b) - tileScore(s, linkType, a));
      if (links.length === 0) continue;
      place(s, linkType, links[0].r, links[0].c);
      return place(s, type, d.r, d.c).ok;
    }
  }
  return false;
}

/** Add panels until today has no unpowered building and supply covers demand. */
function keepPowered(run: Run, maxPanels = 6): void {
  for (let i = 0; i < maxPanels; i++) {
    const p = previewDay(run, book).power;
    if (p.unpowered.length === 0 && p.supply >= p.demand) return;
    if (run.state.parts < cost('sun').parts || !build(run.state, 'sun')) return;
  }
}

const SHELTER_WEIGHT: Partial<Record<BuildingType, number>> = { home: 10, farm: 4, o2: 4, mine: 3, dig: 3, fab: 2, batt: 1 };

function shelterScore(s: GameState, top: Tile): number {
  let score = 0;
  for (const t of shelterTiles(top)) {
    const b = buildingAt(s, t.r, t.c);
    score += b ? SHELTER_WEIGHT[b.type] ?? 0 : isDeposit(s, t) ? 0.75 : 0.5;
  }
  return score;
}

function buildShelter(s: GameState, minScore: number): boolean {
  let best: Tile | null = null;
  let bestScore = minScore;
  for (const t of validTiles(s, 'shelter')) {
    const sc = shelterScore(s, t);
    if (sc > bestScore || sc === bestScore && best === null) {
      bestScore = sc;
      best = t;
    }
  }
  return best !== null && place(s, 'shelter', best.r, best.c).ok;
}

function stormComing(run: Run): boolean {
  const f = forecast(getChapter(book, run.chapterId), run.chapterDay);
  return (f.tomorrow?.radiation ?? 0) >= 2 || (f.today?.radiation ?? 0) >= 2;
}

// ---------------------------------------------------------------- bots

type Bot = (run: Run, rng: Rng) => void;

const idle: Bot = () => {};

/** Starter goals 1 to 3 only. */
function starterThree(run: Run): void {
  const s = run.state;
  const g = currentGoal(s);
  if (g.id === 'starter_air' && count(s, 'o2') === 0) build(s, 'o2');
  if (g.id === 'starter_food') {
    if (count(s, 'mine') === 0) buildOnDeposit(s, 'mine');
    if (count(s, 'farm') === 0) build(s, 'farm');
  }
  if (g.id === 'starter_soil' && count(s, 'dig') === 0) buildOnDeposit(s, 'dig');
}

const noShelter: Bot = (run) => {
  if (run.state.question) answerQuestion(run.state, 'break');
  starterThree(run);
  keepPowered(run);
};

/** Machines needed to feed a crew of `crew` with a small surplus. */
function machineTargets(crew: number): { farm: number; o2: number; mine: number } {
  const farm = Math.ceil((crew + 1) / 3);
  const o2 = Math.max(1, Math.ceil((crew + 1 - farm) / 3));
  const mine = Math.ceil(farm / 2);
  return { farm, o2, mine };
}

/** A new habitat goes only on a free tile under a shelter, building that shelter first if needed. */
function buildShelteredHome(s: GameState): boolean {
  const spot = () => validTiles(s, 'home').filter((t) => isSheltered(s, t.r, t.c) && !isDeposit(s, t));
  if(spot().length===0&&s.soil>=2){const t=validTiles(s,'home').find(t=>!isDeposit(s,t)&&canPlace(s,'shelter',t.r,t.c).ok);if(t)place(s,'shelter',t.r,t.c);}
  const tiles = spot().sort((a, b) => tileScore(s, 'home', b) - tileScore(s, 'home', a));
  return tiles.length > 0 && place(s, 'home', tiles[0].r, tiles[0].c).ok;
}

export const sensible: Bot = (run) => {
  const s = run.state;
  for(const b of s.buildings)if(b.manualRepair)repairBuilding(s,b.id);
  if(s.air<s.crew||s.food<s.crew)requestAid(s);
  if (s.question) answerQuestion(s, 'break');

  // Starter goals, sheltering the habitat as soon as the shelter is unlocked.
  starterThree(run);
  const homesUnsheltered = () => s.buildings.some((b) => b.type === 'home' && !isSheltered(s, b.r, b.c));
  if (s.unlocked.includes('shelter') && s.soil >= 2 && homesUnsheltered()) buildShelter(s, 10);

  if (s.goals.starterDone >= 3) {
    // A storm is coming or here: cover machines.
    if (stormComing(run)) while (s.soil >= 2 && buildShelter(s, 3));
    // A second digger, so soil builds up for shelters.
    if (count(s, 'dig') < 2 && s.parts >= 3) buildOnDeposit(s, 'dig');

    // Work on the chosen goal (SPEC 18.2).
    const g = currentGoal(s);
    // Parts come first: a sensible player builds a parts factory once diggers can feed it, and more as the crew grows.
    if (s.goals.starterDone >= 4 && count(s, 'dig') >= 1 && count(s, 'fab') < 1 + Math.floor(s.crew / BOT.crewPerFactory) && s.parts >= cost('fab').parts) build(s, 'fab');
    pursueGoal(run);
    // Grow toward the crew goal or the next stage's crew: machines first, then one habitat at a time.
    const nextStage = config.STAGES[stageOf(s) + 1];
    const stageCrew = nextStage && goalsCompleted(s) >= nextStage.goals - BOT.stageCrewLead ? nextStage.crew : 0;
    const wantCrew = s.unlocked.includes('home') && (g.id === 'house_crew' || stageCrew > s.crew) ? s.crew + 2 : s.crew;
    const want = machineTargets(wantCrew);
    const order: ['mine' | 'farm' | 'o2', number][] = [
      ['mine', want.mine],
      ['farm', want.farm],
      ['o2', want.o2],
    ];
    // Machines count toward a bigger crew only when sheltered, so a storm cannot stop them.
    // (Also counting unsheltered mines grows the crew further but loses about 7% of runs in replay 4.)
    const countSafe = (t: 'mine' | 'farm' | 'o2') => s.buildings.filter((b) => b.type === t && isSheltered(s, b.r, b.c)).length;
    const freeShelteredTile = (t: 'farm' | 'o2') => validTiles(s, t).some((x) => isSheltered(s, x.r, x.c) && !isDeposit(s, x));
    for (const [type, n] of order) {
      if (s.parts < 3) break;
      if (type === 'mine') {
        // Replace an unshelterable mine with one on another ice tile, if any is free.
        if (countSafe('mine') < n) buildOnDeposit(s, 'mine');
      } else if (countSafe(type) < n) {
        if (!freeShelteredTile(type) && s.soil >= 2) buildShelter(s, 2);
        // Without a sheltered spot, only build when the plain count is short too.
        if (freeShelteredTile(type) || count(s, type) < n) build(s, type);
      }
      keepPowered(run);
    }
    // Grow the crew when the sheltered machines can feed it, or the stores could feed the
    // bigger crew through three days of broken machines.
    const safe = order.every(([t, n]) => countSafe(t) >= n);
    const stocked = s.air >= 3 * wantCrew && s.food >= 3 * wantCrew && order.every(([t, n]) => count(s, t) >= n);
    if ((safe || stocked) && wantCrew > s.crew && s.air >= 12 && s.food >= 12 && s.parts >= 4 && !stormComing(run)) {
      if (buildShelteredHome(s)) keepPowered(run);
    }
    // A factory, once the habitat is safe and two diggers feed it.
    if (s.goals.starterDone >= 4 && count(s, 'dig') >= 2 && count(s, 'fab') === 0 && s.parts >= 4) build(s, 'fab');

    // Shelters: new habitats first, then machines, then empty ground for future machines.
    if (s.goals.starterDone >= 4) {
      if (s.soil >= 2 && homesUnsheltered()) buildShelter(s, 10);
      while (s.soil >= 2 && buildShelter(s, 3));
      if (s.soil >= 4) buildShelter(s, 2);
    }
  }
  keepPowered(run);
};

/** How the sensible bot plays the chosen goals. */
const BOT = {
  /** Start growing the crew for the next stage when this few goals are left before it. */
  stageCrewLead: 4,
  /** One more parts factory for every this many crew. */
  crewPerFactory: 12,
} as const;

/** Do what the chosen goal asks, the way a sensible player would. */
function pursueGoal(run: Run): void {
  const s = run.state;
  const g = currentGoal(s);
  if (g.kind !== 'repeating' || isGoalDone(s, g)) return;
  switch (g.id) {
    case 'more_air':
      if (s.parts >= cost('o2').parts) buildMachine(s, 'o2');
      break;
    case 'more_food':
      if (s.parts >= cost('farm').parts) buildMachine(s, 'farm');
      break;
    case 'new_mine':
      buildOnDeposit(s, 'mine');
      break;
    case 'new_digger':
      buildOnDeposit(s, 'dig');
      break;
    case 'more_power':
      for (let i = 0; i < 3 && chosenProgress(s, 'more_power') < g.target; i++) if (!build(s, 'sun')) break;
      break;
    case 'more_storage':
      build(s, 'batt');
      break;
    case 'research': {
      if (count(s, 'lab') === 0) {
        buildMachine(s, 'lab');
        break;
      }
      const ids = Object.entries(config.RESEARCH_COSTS).sort((a, b) => a[1] - b[1]).map(([id]) => id);
      for (const id of ids) if (buyResearch(s, id)) break;
      break;
    }
    case 'storm_cover':
    case 'shelter_machines':
    case 'cover_homes':
      while (s.soil >= cost('shelter').soil && chosenProgress(s, g.id) < g.target && buildShelter(s, 1));
      break;
  }
}

/** A machine goes under a shelter when it can, building the shelter first. */
function buildMachine(s: GameState, type: 'o2' | 'farm' | 'lab'): boolean {
  const shelteredSpot = () => validTiles(s, type).some((x) => isSheltered(s, x.r, x.c) && !isDeposit(s, x));
  if (!shelteredSpot() && s.soil >= cost('shelter').soil) {
    const t = validTiles(s, type).find((x) => !isDeposit(s, x) && canPlace(s, 'shelter', x.r, x.c).ok);
    if (t) place(s, 'shelter', t.r, t.c);
  }
  return build(s, type);
}

const careless: Bot = (run, rng) => {
  const s = run.state;
  if (s.question) answerQuestion(s, rng.int(3) === 0 ? 'skip' : rng.int(2) === 0 ? 'fine' : 'break');
  const tries = 1 + rng.int(3);
  for (let i = 0; i < tries; i++) {
    const options = s.unlocked.filter((t) => s.parts >= cost(t).parts && s.soil >= cost(t).soil);
    if (options.length === 0) return;
    const type = options[rng.int(options.length)];
    const tiles = validTiles(s, type);
    if (tiles.length === 0) continue;
    const t = tiles[rng.int(tiles.length)];
    place(s, type, t.r, t.c);
  }
};

// ---------------------------------------------------------------- runs and stats

interface ChapterResult {
  survived: boolean;
  lossSol: number | null;
  lossCause: string | null;
  lowestHealth: number;
  endHealth: number | null;
  stormBroken: number;
  goals: number;
  crew: number;
  /** Goals completed and crew at the start of this chapter (from state.chapterStart). */
  goalsAtStart: number;
  crewAtStart: number;
}

/** Play the current chapter to its end (or a loss). */
function playChapter(run: Run, bot: Bot, rng: Rng): ChapterResult {
  const replay = run.replay;
  let lowest = run.state.health;
  let guard = 0;
  while (!run.pendingReport && !run.state.lost && guard++ < 100) {
    bot(run, rng);
    endDay(run, book);
    lowest = Math.min(lowest, run.state.health);
  }
  const logs = run.state.log.filter((d) => d.replay === replay && d.chapterId === run.chapterId);
  const broken = new Set<number>();
  for (const d of logs) for (const e of d.events) if (e.type === 'broken') broken.add(e.buildingId);
  const lost = run.state.lost;
  return {
    survived: !lost && run.pendingReport,
    lossSol: lost ? lost.sol : null,
    lossCause: lost ? lost.cause : null,
    lowestHealth: lowest,
    endHealth: lost ? null : run.state.health,
    stormBroken: broken.size,
    goals: run.state.goals.starterDone + run.state.goals.repeatingDone,
    crew: run.state.crew,
    goalsAtStart: run.state.chapterStart.goalsCompleted,
    crewAtStart: run.state.chapterStart.crew,
  };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mode(xs: string[]): string | null {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of counts) if (v > n) [best, n] = [k, v];
  return best;
}

interface Summary {
  runs: number;
  survival: number;
  lossSol: number | null;
  lossCause: string | null;
  lowestHealth: number | null;
  endHealthMedian: number | null;
  endHealthMin: number | null;
  stormBroken: number | null;
  goals: number | null;
  crew: number | null;
}

function summarise(results: ChapterResult[]): Summary {
  const lost = results.filter((r) => !r.survived);
  const ends = results.flatMap((r) => (r.endHealth === null ? [] : [r.endHealth]));
  return {
    runs: results.length,
    survival: results.filter((r) => r.survived).length / results.length,
    lossSol: median(lost.flatMap((r) => (r.lossSol === null ? [] : [r.lossSol]))),
    lossCause: mode(lost.flatMap((r) => (r.lossCause ? [r.lossCause] : []))),
    lowestHealth: median(results.map((r) => r.lowestHealth)),
    endHealthMedian: median(ends),
    endHealthMin: ends.length ? Math.min(...ends) : null,
    stormBroken: median(results.map((r) => r.stormBroken)),
    goals: median(results.map((r) => r.goals)),
    crew: median(results.map((r) => r.crew)),
  };
}

function runBot(bot: Bot, botSeed: number): ChapterResult[] {
  const out: ChapterResult[] = [];
  for (let site = 1; site <= RUNS; site++) {
    const run = newRun(site, book);
    out.push(playChapter(run, bot, createRng(botSeed * 100_000 + site)));
  }
  return out;
}

// ---------------------------------------------------------------- targets

function judge(name: string, results: ChapterResult[], s: Summary): string {
  switch (name) {
    case 'Idle':
      // Air runs out on sol 6; the rescue window (SPEC 17) then gives LONG_RUN.rescueTurns more sols.
      return s.survival === 0 && results.every((r) => r.lossSol !== null && r.lossSol <= 6 + config.LONG_RUN.rescueTurns) ? 'MET' : 'MISSED';
    case 'No shelter':
      return s.survival > 0.5 && (s.lowestHealth ?? 99) <= 5 && (s.stormBroken ?? 0) >= 2 ? 'MET' : 'MISSED';
    case 'Sensible': {
      const good = results.filter((r) => r.survived && (r.endHealth ?? 0) >= 8).length / results.length;
      return good > 0.9 ? 'MET' : 'MISSED';
    }
    default:
      return 'no target';
  }
}

// ---------------------------------------------------------------- trace mode

/** `npm run bot -- --trace 12` prints one sensible run day by day, for debugging the bot. */
function trace(site: number, chapters: number): void {
  const run = newRun(site, book);
  const rng = createRng(site);
  for (let k = 0; k < chapters; k++) {
    while (!run.pendingReport && !run.state.lost) {
      sensible(run, rng);
      const s = run.state;
      const p = previewDay(run, book);
      const list = s.buildings
        .map((b) => `${b.type}@${b.r},${b.c}${isSheltered(s, b.r, b.c) ? 'S' : ''}${b.brokenDays ? 'x' + b.brokenDays : ''}`)
        .join(' ');
      const g = currentGoal(s);
      console.log(
        `r${run.replay} sol ${s.day} d${run.chapterDay} air ${s.air} food ${s.food} water ${s.water} parts ${s.parts} soil ${s.soil} hp ${s.health} crew ${s.crew}` +
          ` ring ${s.ring} | pow ${p.power.supply}/${p.power.demand} unp ${p.power.unpowered.length} | goal ${g.id} ${g.progress}/${g.target} | ${list}`,
      );
      endDay(run, book);
    }
    console.log(run.state.lost ?? `end of chapter, health ${run.state.health}`);
    const s = run.state;
    const want = machineTargets(s.crew + 2);
    const open = s.buildings.filter((b) => ['farm', 'o2', 'mine'].includes(b.type) && !isSheltered(s, b.r, b.c));
    console.log(
      `  unsheltered food/air/water machines: ${open.map((b) => `${b.type}@${b.r},${b.c}`).join(' ') || 'none'}` +
        ` | have farm ${count(s, 'farm')}/${want.farm} o2 ${count(s, 'o2')}/${want.o2} mine ${count(s, 'mine')}/${want.mine}` +
        ` | free tiles: home ${validTiles(s, 'home').length} farm ${validTiles(s, 'farm').length} mine ${validTiles(s, 'mine').length} shelter ${validTiles(s, 'shelter').length}`,
    );
    if (!keepBuilding(run, book)) break;
  }
}

export function setBotBook(value:ChapterBook):void {book=value;}
function main():void {
const traceAt = process.argv.indexOf('--trace');
if (traceAt >= 0) {
  const site = Number(process.argv[traceAt + 1]);
  const chapters = process.argv.includes('--replays') ? 4 : 1;
  if (site > 0) trace(site, chapters);
  else {
    const bad = runBot(sensible, 3).flatMap((r, i) => (r.survived && (r.endHealth ?? 0) >= 8 ? [] : [i + 1]));
    console.log(`sensible runs below target: ${bad.length}: ${bad.slice(0, 40).join(' ')}`);
  }
  process.exit(0);
}

const fmt = (v: number | string | null, digits = 0) => (v === null ? '-' : typeof v === 'number' ? v.toFixed(digits) : v);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const bots: [string, Bot][] = [
  ['Idle', idle],
  ['No shelter', noShelter],
  ['Sensible', sensible],
  ['Careless', careless],
];

const header = ['Bot', 'Runs', 'Survived', 'Loss sol (med)', 'Main cause', 'Lowest health (med)', 'End health med', 'End health min', 'Storm-broken (med)', 'Goals (med)', 'Crew (med)', 'Target'];
const rows: string[][] = [header];
bots.forEach(([name, bot], i) => {
  const results = runBot(bot, i + 1);
  const s = summarise(results);
  rows.push([
    name,
    String(s.runs),
    pct(s.survival),
    fmt(s.lossSol, 1),
    fmt(s.lossCause),
    fmt(s.lowestHealth, 1),
    fmt(s.endHealthMedian, 1),
    fmt(s.endHealthMin),
    fmt(s.stormBroken, 1),
    fmt(s.goals, 1),
    fmt(s.crew, 1),
    judge(name, results, s),
  ]);
});

function printTable(table: string[][]): void {
  const widths = table[0].map((_, c) => Math.max(...table.map((r) => r[c].length)));
  const line = (r: string[]) => '| ' + r.map((v, c) => v.padEnd(widths[c])).join(' | ') + ' |';
  console.log(line(table[0]));
  console.log('|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|');
  for (const r of table.slice(1)) console.log(line(r));
}

console.log(`Outpost Builder balance bot: chapter ${book.archive[0]}, ${RUNS} runs per bot, sites 1 to ${RUNS}\n`);
printTable(rows);

// Sensible bot through the chapter and three replays.
const REPLAYS = 4;
// perReplay[k] holds only the runs that started chapter play k + 1.
const perReplay: ChapterResult[][] = Array.from({ length: REPLAYS }, () => []);
for (let site = 1; site <= RUNS; site++) {
  const run = newRun(site, book);
  const rng = createRng(site);
  for (let k = 0; k < REPLAYS; k++) {
    const res = playChapter(run, sensible, rng);
    perReplay[k].push(res);
    if (!res.survived) break;
    keepBuilding(run, book);
  }
}
const replayRows: string[][] = [[
  'Sensible, play', 'Runs started', 'Survived', 'Loss sol (med)', 'Main cause', 'Lowest health (med)', 'End health med', 'End health min',
  'Storm-broken (med)', 'Goals this play (med)', 'Goals total (med)', 'Crew start (med)', 'Crew end (med)',
]];
const stallLines: string[] = [];
perReplay.forEach((results, k) => {
  const label = k === 0 ? 'first play' : `replay ${k + 1}`;
  if (results.length === 0) {
    replayRows.push([label, '0', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
    return;
  }
  const s = summarise(results);
  const gained = results.map((r) => r.goals - r.goalsAtStart);
  const stalled = gained.filter((g) => g < 2).length;
  replayRows.push([
    label,
    String(s.runs),
    pct(s.survival),
    fmt(s.lossSol, 1),
    fmt(s.lossCause),
    fmt(s.lowestHealth, 1),
    fmt(s.endHealthMedian, 1),
    fmt(s.endHealthMin),
    fmt(s.stormBroken, 1),
    fmt(median(gained), 1),
    fmt(s.goals, 1),
    fmt(median(results.map((r) => r.crewAtStart)), 1),
    fmt(s.crew, 1),
  ]);
  stallLines.push(
    `${label}: ${stalled} of ${results.length} runs completed fewer than 2 goals` + (median(gained)! < 2 ? '  <-- STALL' : ''),
  );
});
console.log('');
console.log('Sensible bot, first play and three replays (Keep building between them). Each row counts only the runs that started that play:');
console.log('');
printTable(replayRows);
console.log('');
console.log('Stall check (a play that completes fewer than 2 goals):');
for (const line of stallLines) console.log('  ' + line);

// Pace on chapter one and its replays (SPEC 18.2): the sol each sensible outpost reaches the second stage.
const secondStage: number[] = [];
let neverSecond = 0;
for (let site = 1; site <= RUNS; site++) {
  const run = newRun(site, book);
  const rng = createRng(site);
  let found: number | null = null;
  for (let i = 0; i < 60 && !run.state.lost && found === null; i++) {
    if (run.pendingReport) keepBuilding(run, book);
    sensible(run, rng);
    endDay(run, book);
    if (stageOf(run.state) >= 1) found = run.state.day - 1;
  }
  if (found === null) neverSecond++;
  else secondStage.push(found);
}
const med2 = median(secondStage);
const inRange = secondStage.filter((x) => x >= 10 && x <= 20).length;
console.log('');
console.log('Pace (sensible bot, chapter one and replays). The long-run tool checks the later stages:');
console.log('');
printTable([
  ['Target', 'Aim', 'Result', 'Verdict'],
  [
    'Second stage',
    'sol 10 to 20',
    `median ${fmt(med2)}, ${inRange} of ${RUNS} runs in range, range ${Math.min(...secondStage)} to ${Math.max(...secondStage)}, never in 60 sols: ${neverSecond}`,
    med2 !== null && med2 >= 10 && med2 <= 20 ? 'MET' : 'MISSED',
  ],
]);

}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();
