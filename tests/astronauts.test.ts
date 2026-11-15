import { describe, expect, it } from 'vitest';
import { Crowd, astroWorld, astronautCount, astronautDepth, chooseMode, pathBetween, wanderSpots } from '../src/game/astronauts.ts';
import { endDay, newRun } from '../src/sim/day.ts';
import { addBuilding, book, lab, sep2017 } from './helpers.ts';

const calm = { tomorrowRadiation: 0, habitatColdYesterday: false, celebrating: false, tapped: false };

/** A fixed sequence standing in for Math.random. */
function seq(): () => number {
  let i = 0;
  return () => ((i++ * 0.37) % 1);
}

describe('astronaut behaviour choice (SPEC 11.2)', () => {
  it('idles on a calm day', () => {
    expect(chooseMode(calm)).toBe('idle');
    expect(chooseMode({ ...calm, tomorrowRadiation: 1 })).toBe('idle');
  });

  it('runs to shelter when tomorrow brings radiation 2 or more', () => {
    expect(chooseMode({ ...calm, tomorrowRadiation: 2 })).toBe('shelter');
    expect(chooseMode({ ...calm, tomorrowRadiation: 3 })).toBe('shelter');
    expect(chooseMode({ ...calm, tomorrowRadiation: 3, habitatColdYesterday: true })).toBe('shelter');
  });

  it('shivers when a habitat had no power yesterday', () => {
    expect(chooseMode({ ...calm, habitatColdYesterday: true })).toBe('shiver');
  });

  it('dances for a completed goal or a tap, before anything else', () => {
    expect(chooseMode({ ...calm, celebrating: true, tomorrowRadiation: 3 })).toBe('dance');
    expect(chooseMode({ ...calm, tapped: true, habitatColdYesterday: true })).toBe('dance');
  });
});

describe('astronauts read the base without changing it', () => {
  it('reads tomorrow\'s radiation from the chapter', () => {
    const run = newRun(1, book);
    run.chapterDay = 9; // 10 September: tomorrow is 11 September, level 3.
    expect(astroWorld(run, sep2017).tomorrowRadiation).toBe(3);
    run.chapterDay = 1;
    expect(astroWorld(run, sep2017).tomorrowRadiation).toBe(0);
  });

  it('finds habitats that had no power yesterday', () => {
    const { run, book: b } = lab();
    const home = run.state.buildings.find((x) => x.type === 'home')!;
    for (const x of run.state.buildings) if (x.type === 'sun') x.brokenDays = 5;
    endDay(run, b);
    expect(astroWorld(run, b.chapters[run.chapterId]).coldHabitats).toEqual([home.id]);
  });

  it('shows one per crew member, up to 8', () => {
    const { run } = lab();
    expect(astronautCount(run.state)).toBe(2);
    run.state.crew = 20;
    expect(astronautCount(run.state)).toBe(8);
  });

  it('never touches the state or the sim\'s random numbers', () => {
    const { run } = lab();
    const before = JSON.stringify(run.state);
    const crowd = new Crowd(seq());
    crowd.sync(run.state);
    for (let i = 0; i < 400; i++) crowd.step(50, i * 50, run.state, { tomorrowRadiation: i > 200 ? 3 : 0, coldHabitats: [] }, false);
    expect(JSON.stringify(run.state)).toBe(before);
  });
});

describe('the crowd', () => {
  it('walks along tile centres, one step at a time', () => {
    expect(pathBetween({ r: 5, c: 5 }, { r: 7, c: 4 })).toEqual([
      { r: 5, c: 4 },
      { r: 6, c: 4 },
      { r: 7, c: 4 },
    ]);
  });

  it('wanders only to empty revealed tiles next to buildings', () => {
    const { run } = lab();
    const spots = wanderSpots(run.state);
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) {
      expect(run.state.buildings.some((b) => b.r === s.r && b.c === s.c)).toBe(false);
      expect(s.r).toBeGreaterThanOrEqual(3);
      expect(s.r).toBeLessThanOrEqual(8);
    }
  });

  it('runs to the nearest habitat before a storm and stays there', () => {
    const { run } = lab();
    const far = addBuilding(run.state, 'home', 8, 8);
    run.state.crew = 4;
    const crowd = new Crowd(seq());
    crowd.sync(run.state);
    for (let i = 0; i < 100; i++) crowd.step(100, i * 100, run.state, { tomorrowRadiation: 0, coldHabitats: [] }, false);
    for (let i = 0; i < 200; i++) crowd.step(100, 10_000 + i * 100, run.state, { tomorrowRadiation: 2, coldHabitats: [] }, false);
    const homes = run.state.buildings.filter((b) => b.type === 'home');
    expect(homes.map((h) => h.id)).toContain(far);
    for (const a of crowd.agents) {
      expect(a.mode).toBe('shelter');
      const d = Math.min(...homes.map((h) => Math.max(Math.abs(h.r - a.r), Math.abs(h.c - a.c))));
      expect(d).toBeLessThanOrEqual(1);
      expect(a.anim).toBe('idle');
    }
  });

  it('shivers next to the cold habitat', () => {
    const { run } = lab();
    const home = run.state.buildings.find((b) => b.type === 'home')!;
    const crowd = new Crowd(seq());
    crowd.sync(run.state);
    for (let i = 0; i < 100; i++) crowd.step(100, i * 100, run.state, { tomorrowRadiation: 0, coldHabitats: [home.id] }, false);
    for (const a of crowd.agents) {
      expect(a.anim).toBe('shiver');
      expect(Math.max(Math.abs(home.r - a.r), Math.abs(home.c - a.c))).toBeLessThanOrEqual(1);
    }
  });

  it('everyone dances for 3 seconds on a completed goal; a tap makes one dance once', () => {
    const { run } = lab();
    run.state.crew = 4;
    const crowd = new Crowd(seq());
    crowd.sync(run.state);
    const world = { tomorrowRadiation: 0, coldHabitats: [] };
    crowd.celebrate(1000);
    crowd.step(16, 1100, run.state, world, false);
    expect(crowd.agents.every((a) => a.anim === 'dance')).toBe(true);
    crowd.step(16, 4100, run.state, world, false);
    expect(crowd.agents.some((a) => a.anim === 'dance')).toBe(false);
    const one = crowd.agents[0];
    crowd.tap(one.id);
    crowd.step(16, 5000, run.state, world, false);
    expect(one.anim).toBe('dance');
    expect(crowd.agents.filter((a) => a.anim === 'dance')).toHaveLength(1);
    crowd.step(2000, 7000, run.state, world, false);
    expect(one.anim).not.toBe('dance');
  });

  it('with reduced motion nobody walks', () => {
    const { run } = lab();
    const crowd = new Crowd(seq());
    crowd.sync(run.state);
    const start = crowd.agents.map((a) => ({ r: a.r, c: a.c }));
    for (let i = 0; i < 100; i++) crowd.step(100, i * 100, run.state, { tomorrowRadiation: 0, coldHabitats: [] }, true);
    expect(crowd.agents.map((a) => ({ r: a.r, c: a.c }))).toEqual(start);
    expect(crowd.agents.every((a) => a.anim === 'idle')).toBe(true);
  });

  it('sorts at its position\'s r + c plus 0.2 (SPEC 5.2)', () => {
    expect(astronautDepth({ r: 5, c: 6 })).toBe(11.2);
    expect(astronautDepth({ r: 5.1, c: 6.4 })).toBe(11.2);
  });
});
