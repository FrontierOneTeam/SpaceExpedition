// Astronauts (SPEC 11.2): decoration that mirrors the base. Never part of the simulation, never
// player-controlled. Pure: no Phaser, no DOM. Wandering uses a random function passed in
// (Math.random in the game), never the simulation's seeded generator, and never changes the state.

import { config, forecast, isRevealed, type Chapter, type GameState, type Run } from '../sim/index.ts';

const { ASTRONAUT, SITE_SIZE } = config;

export type AstroMode = 'idle' | 'shelter' | 'shiver' | 'dance';
export type AstroAnim = 'idle' | 'walk' | 'run' | 'dance' | 'shiver';

export interface ModeInput {
  /** Tomorrow's radiation level, 0 when there is no tomorrow in this chapter. */
  tomorrowRadiation: number;
  /** A habitat had no power yesterday. */
  habitatColdYesterday: boolean;
  /** A goal or chapter was just completed: everyone dances. */
  celebrating: boolean;
  /** This astronaut was tapped and is dancing once. */
  tapped: boolean;
}

/** What an astronaut does now. Dancing wins, then running to shelter, then shivering, then idling. */
export function chooseMode(i: ModeInput): AstroMode {
  if (i.celebrating || i.tapped) return 'dance';
  if (i.tomorrowRadiation >= ASTRONAUT.shelterRadiation) return 'shelter';
  if (i.habitatColdYesterday) return 'shiver';
  return 'idle';
}

/** What the astronauts need to know about the base, read from the run without changing it. */
export interface AstroWorld {
  tomorrowRadiation: number;
  /** Ids of habitats that had no power yesterday. */
  coldHabitats: number[];
}

export function astroWorld(run: Run, chapter: Chapter): AstroWorld {
  const { tomorrow } = forecast(chapter, run.chapterDay);
  const state = run.state;
  const last = state.log[state.log.length - 1];
  const yesterday = last && last.sol === state.day - 1 ? last : null;
  const cold = yesterday ? yesterday.events.flatMap((e) => (e.type === 'unpowered' && e.building === 'home' ? [e.buildingId] : [])) : [];
  return { tomorrowRadiation: tomorrow ? tomorrow.radiation : 0, coldHabitats: cold };
}

/** How many astronauts to show: one per crew member, up to 8. */
export function astronautCount(state: GameState): number {
  return Math.max(0, Math.min(state.crew, ASTRONAUT.max));
}

export interface Tile {
  r: number;
  c: number;
}

export interface Agent {
  id: number;
  /** Position in tile units; whole numbers are tile centres. */
  r: number;
  c: number;
  /** Tile centres still to walk through, the last one is the goal. */
  path: Tile[];
  /** Idle pause left, in milliseconds. */
  waitMs: number;
  /** Tapped: dancing once, milliseconds left. */
  tapMs: number;
  mode: AstroMode;
  anim: AstroAnim;
  /** Facing left on screen (the sprite is mirrored). */
  left: boolean;
}

/** A step along tile centres: columns first, then rows. */
export function pathBetween(from: Tile, to: Tile): Tile[] {
  const out: Tile[] = [];
  let { r, c } = from;
  while (c !== to.c) {
    c += Math.sign(to.c - c);
    out.push({ r, c });
  }
  while (r !== to.r) {
    r += Math.sign(to.r - r);
    out.push({ r, c });
  }
  return out;
}

const NEIGHBOURS: Tile[] = [
  { r: -1, c: 0 },
  { r: 0, c: 1 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
  { r: -1, c: 1 },
  { r: 1, c: 1 },
  { r: 1, c: -1 },
  { r: -1, c: -1 },
];

function occupied(state: GameState, r: number, c: number): boolean {
  return state.buildings.some((b) => b.r === r && b.c === c);
}

function open(state: GameState, r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < SITE_SIZE && c < SITE_SIZE && isRevealed(state.ring, r, c) && !occupied(state, r, c);
}

/** Empty revealed tiles next to a building: where idle astronauts wander. */
export function wanderSpots(state: GameState): Tile[] {
  const out: Tile[] = [];
  for (let r = 0; r < SITE_SIZE; r++) {
    for (let c = 0; c < SITE_SIZE; c++) {
      if (!open(state, r, c)) continue;
      if (NEIGHBOURS.slice(0, 4).some((d) => occupied(state, r + d.r, c + d.c))) out.push({ r, c });
    }
  }
  return out;
}

/** Free tiles around a habitat; the habitat's own tile when none is free. */
export function spotsAround(state: GameState, home: Tile): Tile[] {
  const out = NEIGHBOURS.map((d) => ({ r: home.r + d.r, c: home.c + d.c })).filter((p) => open(state, p.r, p.c));
  return out.length > 0 ? out : [{ r: home.r, c: home.c }];
}

function nearest(from: Tile, tiles: Tile[]): Tile | null {
  let best: Tile | null = null;
  let bestD = Infinity;
  for (const t of tiles) {
    const d = Math.abs(t.r - from.r) + Math.abs(t.c - from.c);
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

const round = (a: Agent): Tile => ({ r: Math.round(a.r), c: Math.round(a.c) });

/** Milliseconds one dance takes when an astronaut is tapped. */
export const TAP_DANCE_MS = (ASTRONAUT.anims.dance.frames / ASTRONAUT.anims.dance.fps) * 1000;

/**
 * The crowd: keeps each astronaut's place and plan between frames. Changes nothing outside itself.
 */
export class Crowd {
  agents: Agent[] = [];
  private nextId = 1;
  private celebrateUntil = -Infinity;
  private spots: Tile[] = [];

  constructor(private readonly random: () => number) {}

  /** Everyone dances for a while (goal or chapter completed). */
  celebrate(now: number): void {
    this.celebrateUntil = now + ASTRONAUT.celebrateMs;
  }

  /** One astronaut dances once. */
  tap(id: number): void {
    const a = this.agents.find((x) => x.id === id);
    if (a) a.tapMs = TAP_DANCE_MS;
  }

  private pick<T>(list: T[]): T {
    return list[Math.min(list.length - 1, Math.floor(this.random() * list.length))];
  }

  /** Match the crowd to the base: count, positions on revealed land, wander spots. */
  sync(state: GameState): void {
    this.spots = wanderSpots(state);
    const want = astronautCount(state);
    if (this.agents.length > want) this.agents.length = want;
    const homes = state.buildings.filter((b) => b.type === 'home');
    for (const a of this.agents) {
      const p = round(a);
      if (!isRevealed(state.ring, p.r, p.c)) Object.assign(a, this.spawnAt(state, homes));
    }
    while (this.agents.length < want) {
      this.agents.push({ id: this.nextId++, waitMs: 0, tapMs: 0, mode: 'idle', anim: 'idle', left: false, ...this.spawnAt(state, homes) });
    }
  }

  private spawnAt(state: GameState, homes: Tile[]): Tile & { path: Tile[] } {
    const home = homes.length > 0 ? this.pick(homes) : { r: 5, c: 5 };
    const p = this.pick(spotsAround(state, home));
    return { r: p.r, c: p.c, path: [] };
  }

  /**
   * Advance by dt milliseconds. With reduced motion nobody walks or animates: astronauts are
   * placed straight at their spot and stand still.
   */
  step(dt: number, now: number, state: GameState, world: AstroWorld, reducedMotion: boolean): void {
    const homes = state.buildings.filter((b) => b.type === 'home');
    const cold = homes.filter((h) => world.coldHabitats.includes(h.id));
    this.agents.forEach((a, index) => {
      a.tapMs = Math.max(0, a.tapMs - dt);
      const mode = chooseMode({
        tomorrowRadiation: world.tomorrowRadiation,
        habitatColdYesterday: cold.length > 0,
        celebrating: now < this.celebrateUntil,
        tapped: a.tapMs > 0,
      });
      if (mode !== a.mode) {
        a.mode = mode;
        a.path = [];
        a.waitMs = 0;
      }
      if (mode === 'dance') {
        a.anim = 'dance';
        return;
      }
      if (mode === 'shelter' || mode === 'shiver') {
        const targets = mode === 'shelter' ? homes : cold;
        const home = nearest(round(a), targets);
        if (home && a.path.length === 0) {
          const around = spotsAround(state, home);
          const goal = around[index % around.length];
          const here = round(a);
          if (here.r !== goal.r || here.c !== goal.c) a.path = pathBetween(here, goal);
        }
        const moving = this.move(a, dt, ASTRONAUT.runSpeed, reducedMotion);
        a.anim = moving ? 'run' : mode === 'shiver' ? 'shiver' : 'idle';
        return;
      }
      // Idle: walk to a spot between the buildings, pause 2 to 5 seconds, repeat.
      if (a.path.length === 0) {
        if (a.waitMs > 0) {
          a.waitMs -= dt;
        } else if (!reducedMotion && this.spots.length > 0) {
          a.path = pathBetween(round(a), this.pick(this.spots));
          a.waitMs = ASTRONAUT.pauseMinMs + this.random() * (ASTRONAUT.pauseMaxMs - ASTRONAUT.pauseMinMs);
        }
      }
      a.anim = this.move(a, dt, ASTRONAUT.walkSpeed, reducedMotion) ? 'walk' : 'idle';
    });
  }

  /** Move along the path. Returns true while walking. */
  private move(a: Agent, dt: number, speed: number, reducedMotion: boolean): boolean {
    if (a.path.length === 0) return false;
    if (reducedMotion) {
      const goal = a.path[a.path.length - 1];
      a.r = goal.r;
      a.c = goal.c;
      a.path = [];
      return false;
    }
    let budget = (speed * dt) / 1000;
    while (budget > 0 && a.path.length > 0) {
      const next = a.path[0];
      const dr = next.r - a.r;
      const dc = next.c - a.c;
      const dist = Math.hypot(dr, dc);
      // Screen x grows with c - r: face the way the astronaut walks on screen.
      const dx = dc - dr;
      if (dx !== 0) a.left = dx < 0;
      if (dist <= budget) {
        a.r = next.r;
        a.c = next.c;
        a.path.shift();
        budget -= dist;
      } else {
        a.r += (dr / dist) * budget;
        a.c += (dc / dist) * budget;
        budget = 0;
      }
    }
    return true;
  }
}

/** Depth in the sorted list of buildings, astronauts and shelters (SPEC 5.2): position r + c plus 0.2. */
export function astronautDepth(a: { r: number; c: number }): number {
  return Math.round(a.r) + Math.round(a.c) + 0.2;
}
