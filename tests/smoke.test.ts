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
    zoomBy: () => undefined,
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

  it('second run (SPEC 13.2): last day, report, reload, Keep building into a replay', async () => {
    const storage = memory();
    const first = setup(storage);
    first.app.start();
    first.click('[data-action="home-start"]');
    await tick();
    first.click('[data-action="title-continue"]');
    const run = first.app.current!;
    while (run.chapterDay < 14) {
      run.state.air = 30;
      run.state.food = 30;
      run.state.health = 10;
      first.advance(1000);
      first.click('[data-action="end-day"]');
      expect(first.root.textContent).not.toContain('TODO');
    }
    // The last chapter day: one click ends it and opens the report.
    first.advance(1000);
    first.click('[data-action="end-day"]');
    expect(run.pendingReport).toBe(true);
    const root = first.root;
    expect(root.querySelector('.report')).not.toBeNull();
    expect(root.textContent).toContain('This really happened');
    expect(root.textContent).toContain('2 to 15 September 2017');
    expect(root.querySelectorAll('.tl').length).toBe(5);
    expect(root.querySelectorAll('.tl__col--nasa').length).toBe(5);
    expect(root.querySelectorAll('.tl__col--base').length).toBe(5);
    expect(root.textContent).toContain('What NASA observed');
    expect(root.textContent).toContain('What happened in your base');
    expect(root.textContent).toContain('Your outpost grew');
    expect(root.textContent).toContain('6 Sep 2017, 12:02 UTC: a class X9.3 flare.');
    expect(root.textContent).toContain('The radiation storm at Mars on 11 September 2017.');
    expect(root.textContent).toContain('Next: Replay 2 of the September 2017 records.');
    expect(root.textContent).not.toContain('TODO');
    for (const a of root.querySelectorAll('a')) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
    // A second click in the same moment does not advance anything.
    const daySeen = run.state.day;
    first.advance(1000);
    first.click('[data-action="end-day"]');
    expect(run.state.day).toBe(daySeen);
    let saved = JSON.parse(storage.data.get(SAVE_KEY)!);
    expect(saved.reports.length).toBe(1);
    expect(saved.reports[0]).toMatchObject({ chapterId: 'sep2017', replay: 1, sols: { first: 1, last: 14 } });
    expect(saved.reports[0].rows.length).toBe(5);

    // New site asks inside the page, and Go back keeps the report.
    first.click('[data-action="report-new-site"]');
    expect(root.textContent).toContain('Start on a new site?');
    first.click('[data-action="report-new-site-no"]');
    expect(root.textContent).not.toContain('Start on a new site?');

    // Reload with the report pending: the base is intact, no day ran, nothing stored twice.
    const before = JSON.stringify(run.state);
    const second = setup(storage);
    second.app.start();
    second.click('[data-action="home-start"]');
    await tick();
    expect(second.root.textContent).toContain('This really happened');
    expect(JSON.stringify(second.app.current!.state)).toBe(before);
    saved = JSON.parse(storage.data.get(SAVE_KEY)!);
    expect(saved.reports.length).toBe(1);

    // Keep building: replay 2, same base, same parts, no day used, report still stored once.
    const parts = second.app.current!.state.parts;
    second.click('[data-action="keep-building"]');
    const next = second.app.current!;
    expect(next.replay).toBe(2);
    expect(next.chapterDay).toBe(1);
    expect(next.state.day).toBe(daySeen);
    expect(next.state.parts).toBe(parts);
    expect(second.root.textContent).toContain('Replay 2 of the September 2017 records');
    second.click('[data-action="title-continue"]');
    expect(second.root.querySelector('.date__replay')?.textContent).toBe('Replay 2 of the September 2017 records');
    saved = JSON.parse(storage.data.get(SAVE_KEY)!);
    expect(saved.reports.length).toBe(1);
    expect(saved.outpost.pendingReport).toBe(false);
    // One click cannot advance two days.
    second.advance(1000);
    second.click('[data-action="end-day"]');
    second.click('[data-action="end-day"]');
    expect(next.state.day).toBe(daySeen + 1);

    // Home now lists the report, and it opens read-only.
    const third = setup(storage);
    third.app.start();
    third.click('[data-action="open-reports"]');
    expect(third.root.textContent).toContain('The September 2017 storms');
    third.click('[data-action="open-report"]');
    expect(third.root.textContent).toContain('This really happened');
    expect(third.root.querySelectorAll('.tl').length).toBe(5);
    expect(third.root.querySelector('[data-action="keep-building"]')).toBeNull();
  });

  it('shows "This was real" only on the mornings after 6, 7, 10, 11 and 12 September', async () => {
    const { app, root, click, advance } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    const run = app.current!;
    const shown: string[] = [];
    while (!run.pendingReport) {
      const card = root.querySelector('.realcard');
      if (card) {
        expect(card.textContent).toContain('This was real');
        expect(card.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
        shown.push(card.querySelector('.realcard__date')!.textContent!);
      }
      run.state.air = 30;
      run.state.food = 30;
      run.state.health = 10;
      advance(1000);
      click('[data-action="end-day"]');
    }
    // 7, 8 and 11 September are blackout mornings, and the card still shows.
    expect(shown).toEqual(['6 September 2017', '7 September 2017', '10 September 2017', '11 September 2017', '12 September 2017']);
  });

  it('the card can be closed, and only one card shows at a time', async () => {
    const { app, root, click, advance } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    const run = app.current!;
    while (run.chapterDay < 6) {
      run.state.air = 30;
      run.state.food = 30;
      advance(1000);
      click('[data-action="end-day"]');
    }
    expect(root.querySelectorAll('.realcard').length).toBe(1);
    expect(root.textContent).toContain('No message from Earth today');
    click('[data-action="close-card"]');
    expect(root.querySelector('.realcard')).toBeNull();
    // Closing it used no day.
    expect(run.chapterDay).toBe(6);
  });

  it('asks the predict question on 10 September, scores it after the storm, and never asks on 11 September', async () => {
    const { app, root, click, advance } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    const run = app.current!;
    while (run.chapterDay < 9) {
      expect(root.querySelector('[data-action="predict"]')).toBeNull();
      run.state.air = 30;
      run.state.food = 30;
      run.state.health = 10;
      advance(1000);
      click('[data-action="end-day"]');
    }
    // Chapter day 9 is 10 September. The starting battery stands unsheltered.
    expect(root.querySelector('.mc')!.textContent).toContain('A storm reaches you tomorrow. What will happen to your battery?');
    expect(root.querySelectorAll('[data-action="predict"]').length).toBe(3);
    expect(root.querySelector('[data-answer="skip"]')?.textContent).toBe('Skip');
    click('[data-answer="break"]');
    expect(root.querySelector('[data-action="predict"]')).toBeNull();
    expect(root.querySelector('.mc')!.textContent).toContain('radiation storm reaches you tomorrow');
    advance(1000);
    click('[data-action="end-day"]');
    // Chapter day 10, 11 September: a blackout morning with no question.
    expect(run.chapterDay).toBe(10);
    expect(root.querySelector('[data-action="predict"]')).toBeNull();
    run.state.health = 10;
    advance(1000);
    click('[data-action="end-day"]');
    // The morning after the storm: the result, kindly.
    expect(root.querySelector('.notice')!.textContent).toContain('You were right. The storm broke your battery.');
    expect(run.state.predictions).toEqual({ right: 1, answered: 1 });
  });

  it('says "You saw it coming and fixed it." when the building was sheltered after answering', async () => {
    const { app, root, map, click, advance } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    const run = app.current!;
    while (run.chapterDay < 9) {
      run.state.air = 30;
      run.state.food = 30;
      advance(1000);
      click('[data-action="end-day"]');
    }
    click('[data-answer="break"]');
    run.state.unlocked.push('shelter');
    run.state.soil = 4;
    click('[data-type="shelter"]');
    map.tap(4, 5);
    map.tap(4, 5);
    expect(run.state.shelters.length).toBe(1);
    for (let i = 0; i < 2; i++) {
      run.state.health = 10;
      advance(1000);
      click('[data-action="end-day"]');
    }
    expect(root.querySelector('.notice')!.textContent).toContain('You saw it coming and fixed it.');
  });

  it('Skip removes the question with no reward and no penalty', async () => {
    const { app, root, click, advance } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    const run = app.current!;
    while (run.chapterDay < 9) {
      run.state.air = 30;
      run.state.food = 30;
      advance(1000);
      click('[data-action="end-day"]');
    }
    const parts = run.state.parts;
    click('[data-answer="skip"]');
    expect(root.querySelector('[data-action="predict"]')).toBeNull();
    expect(run.state.prediction).toBeNull();
    expect(run.state.parts).toBe(parts);
    advance(1000);
    click('[data-action="end-day"]');
    advance(1000);
    click('[data-action="end-day"]');
    expect(run.state.predictions).toEqual({ right: 0, answered: 0 });
  });

  it('keeps a building chosen after placing while another can be afforded', async () => {
    const { app, root, map, click } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    const s = app.current!.state;
    s.parts = 2;
    click('[data-type="sun"]');
    const tiles = map.renders[map.renders.length - 1].highlight;
    map.tap(tiles[0].r, tiles[0].c);
    expect(root.querySelector('[data-type="sun"]')?.getAttribute('aria-pressed')).toBe('true');
    const next = map.renders[map.renders.length - 1].highlight;
    map.tap(next[0].r, next[0].c);
    expect(s.buildings.filter((b) => b.type === 'sun').length).toBe(4);
    // No parts left: the choice clears.
    expect(root.querySelector('[data-type="sun"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('Home links: sources, settings with Start over inside the page', async () => {
    const storage = memory();
    const { app, root, click } = setup(storage);
    app.start();
    // No report yet, so no Past reports link.
    expect(root.querySelector('[data-action="open-reports"]')).toBeNull();
    click('[data-action="open-sources"]');
    expect(root.textContent).toContain('Where the data comes from');
    expect(root.textContent).toContain("From the challenge's resource list");
    expect(root.textContent).toContain('More sources');
    expect(root.textContent).toContain('DONKI space weather records');
    expect(root.textContent!.toLowerCase()).not.toMatch(/\blive\b/);
    click('[data-action="go-home"]');
    click('[data-action="home-start"]');
    await tick();
    // The sources button on the play screen opens the same list over the map.
    click('[data-action="title-continue"]');
    click('[data-action="open-sources"]');
    expect(root.querySelector('.overlay')!.textContent).toContain('DONKI space weather records');
    click('[data-action="close-overlay"]');
    expect(root.querySelector('.overlay')!.innerHTML).toBe('');

    const again = setup(storage);
    again.app.start();
    again.click('[data-action="open-settings"]');
    again.click('[data-action="start-over"]');
    expect(again.root.textContent).toContain('Start over? Your outpost will be gone.');
    again.click('[data-action="start-over-no"]');
    expect(again.app.current).not.toBeNull();
    again.click('[data-action="start-over"]');
    again.click('[data-action="start-over-yes"]');
    expect(again.app.current).toBeNull();
    expect(JSON.parse(storage.data.get(SAVE_KEY)!).outpost).toBeNull();
    again.click('[data-action="go-home"]');
    expect(again.root.textContent).toContain('Start Your Outpost');
  });

  it('opens a glossary word in a bubble and closes it on the next tap', async () => {
    const { app, root, click } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    const sol = root.querySelector<HTMLElement>('.gloss[data-word="sol"]');
    expect(sol).not.toBeNull();
    sol!.click();
    expect(root.querySelector('.gloss-bubble')?.textContent).toContain('A sol is one day on Mars.');
    click('[data-type="o2"]');
    expect(root.querySelector('.gloss-bubble')).toBeNull();
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
    // The failure screen links to a report of the days played, clearly partial.
    click('[data-action="lost-report"]');
    expect(root.textContent).toContain('This really happened');
    expect(root.textContent).toContain('the days you played');
    expect(root.querySelector('[data-action="keep-building"]')).toBeNull();
    click('[data-action="lost-report-back"]');
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
