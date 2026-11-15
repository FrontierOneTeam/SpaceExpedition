// @vitest-environment happy-dom
// SPEC 13.2: play through the real interface code with Phaser replaced by a fake map.

import { describe, expect, it } from 'vitest';
import { SAVE_KEY, type SaveStorage } from '../src/save/save.ts';
import { App } from '../src/ui/app.ts';
import type { CreateMap, MapCallbacks, MapModel, MapView } from '../src/ui/mapView.ts';
import { book } from './helpers.ts';

interface FakeMap {
  createMap: CreateMap;
  tap(r: number, c: number): void;
  renders: MapModel[];
}

function fakeMap(): FakeMap {
  let callbacks: MapCallbacks | null = null;
  const renders: MapModel[] = [];
  const view: MapView = {
    render: (model) => void renders.push(model),
    setInsets: () => undefined,
    tileToScreen: (r, c) => ({ x: (c - r) * 32, y: (c + r) * 16 }),
    scale: () => 0.5,
    destroy: () => undefined,
  };
  return {
    renders,
    createMap: (_container, cb) => {
      callbacks = cb;
      return Promise.resolve(view);
    },
    tap: (r, c) => callbacks!.onTileTap(r, c),
  };
}

function memory(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

function setup(storage: SaveStorage | null = memory()) {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const map = fakeMap();
  let clock = 0;
  const app = new App(root, {
    book,
    storage,
    createMap: map.createMap,
    randomSite: () => 4821,
    now: () => clock,
    reducedMotion: () => true,
  });
  const click = (selector: string): void => {
    const el = root.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`missing ${selector}`);
    el.click();
  };
  const advance = (ms: number) => {
    clock += ms;
  };
  return { app, root, map, click, advance, storage };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('smoke: Your Outpost through the interface', () => {
  it('starts, follows the first goal and plays 3 days without errors', async () => {
    const { app, root, map, click, advance } = setup();
    app.start();
    expect(root.textContent).toContain('Start Your Outpost');
    click('[data-action="home-start"]');
    await tick();
    // Title card, then one tap continues.
    expect(root.textContent).toContain('The September 2017 storms');
    expect(root.textContent).toContain('Real NASA records. Simple outpost model.');
    click('[data-action="title-continue"]');
    expect(root.querySelector('.overlay')!.innerHTML).toBe('');
    expect(root.textContent).toContain('Make air. Build an oxygen maker.');
    expect(root.textContent).toContain('Sol 1');
    expect(root.textContent).toContain('2 Sep 2017');
    expect(map.renders.length).toBeGreaterThan(0);

    // The hint points at the oxygen maker; choose it and tap the hinted tile.
    expect(root.querySelector('.bb.is-hint')?.getAttribute('data-type')).toBe('o2');
    click('[data-type="o2"]');
    const last = map.renders[map.renders.length - 1];
    expect(last.highlight.length).toBeGreaterThan(0);
    expect(last.hintTile).not.toBeNull();
    map.tap(last.hintTile!.r, last.hintTile!.c);
    expect(app.current!.state.buildings.some((b) => b.type === 'o2')).toBe(true);

    for (let i = 0; i < 3; i++) {
      advance(1000);
      click('[data-action="end-day"]');
    }
    expect(app.current!.state.day).toBe(4);
    expect(root.textContent).toContain('Sol 4');
    expect(root.textContent).toContain('Mission Control');
  });

  it('guides the shelter to the block whose top tile is (4,4)', async () => {
    const { app, root, map, click } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    const s = app.current!.state;
    s.goals.starterDone = 3;
    s.unlocked.push('batt', 'dig', 'farm', 'mine', 'shelter', 'fab');
    s.soil = 4;
    click('[data-type="shelter"]');
    expect(map.renders[map.renders.length - 1].outline).toEqual({ r: 4, c: 4 });
    expect(root.querySelector('.badge--label')?.textContent).toBe('Tap to place the shelter here');
    map.tap(5, 5);
    expect(s.shelters).toEqual([expect.objectContaining({ r: 4, c: 4 })]);
    expect(root.querySelector('.badge--shelter')?.textContent).toContain('Sheltered');
  });

  it('one tap on End the day cannot advance two days', async () => {
    const { app, click, advance } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    advance(1000);
    click('[data-action="end-day"]');
    click('[data-action="end-day"]');
    expect(app.current!.state.day).toBe(2);
    advance(1000);
    click('[data-action="end-day"]');
    expect(app.current!.state.day).toBe(3);
  });

  it('shows one reason for an invalid tap', async () => {
    const { app, root, map, click } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    click('[data-type="o2"]');
    map.tap(5, 5); // the habitat
    expect(root.querySelector('.notice')?.textContent).toContain('Something is already here.');
    map.tap(0, 0);
    expect(root.querySelectorAll('.notice').length).toBe(1);
    expect(root.querySelector('.notice')?.textContent).toContain('That land is not surveyed yet.');
  });

  it('saves after every change and reopens the chapter end without running a day', async () => {
    const storage = memory();
    const first = setup(storage);
    first.app.start();
    first.click('[data-action="home-start"]');
    await tick();
    first.click('[data-action="title-continue"]');
    const run = first.app.current!;
    // Jump to the last chapter day with a healthy base.
    while (!run.pendingReport) {
      run.state.air = 30;
      run.state.food = 30;
      run.state.health = 10;
      first.advance(1000);
      first.click('[data-action="end-day"]');
    }
    expect(first.root.textContent).toContain('Keep building');
    expect(first.root.textContent).toContain('Day 14 of 14');
    expect(first.root.textContent).not.toContain('16 Sep 2017');
    const saved = JSON.parse(storage.data.get(SAVE_KEY)!);
    expect(saved.outpost.pendingReport).toBe(true);

    // Reload: Continue, the panel is back, End the day does nothing.
    const second = setup(storage);
    second.app.start();
    expect(second.root.textContent).toContain('Continue Your Outpost');
    second.click('[data-action="home-start"]');
    await tick();
    const day = second.app.current!.state.day;
    expect(second.root.textContent).toContain('Keep building');
    second.advance(1000);
    second.click('[data-action="end-day"]');
    expect(second.app.current!.state.day).toBe(day);

    // Keep building: a replay, same base, no day used.
    const buildings = second.app.current!.state.buildings.length;
    second.click('[data-action="keep-building"]');
    expect(second.app.current!.replay).toBe(2);
    expect(second.app.current!.state.day).toBe(day);
    expect(second.app.current!.state.buildings.length).toBe(buildings);
    second.click('[data-action="title-continue"]');
    expect(second.root.textContent).toContain('Replay 2 of the September 2017 records');
    second.advance(1000);
    second.click('[data-action="end-day"]');
    expect(second.app.current!.state.day).toBe(day + 1);
  });

  it('runs with no storage and shows the failure chain with two buttons', async () => {
    const { app, root, click, advance } = setup(null);
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    for (let i = 0; i < 20 && !app.current!.state.lost; i++) {
      advance(1000);
      click('[data-action="end-day"]');
    }
    expect(app.current!.state.lost).not.toBeNull();
    expect(root.textContent!.toLowerCase()).not.toContain('game over');
    expect(root.textContent).toContain('Air ran out on sol');
    click('[data-action="new-site"]');
    expect(root.textContent).toContain('Start on a new site?');
    click('[data-action="new-site-no"]');
    click('[data-action="try-again"]');
    expect(app.current!.state.lost).toBeNull();
    expect(app.current!.siteNumber).toBe(4821);
    expect(app.current!.state.day).toBe(1);
  });
});
