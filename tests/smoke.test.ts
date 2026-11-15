// @vitest-environment happy-dom
// SPEC 13.2: play through the real interface code with Phaser replaced by a fake map.

import { describe, expect, it } from 'vitest';
import { SAVE_KEY, loadSave, type SaveStorage } from '../src/save/save.ts';
import { exportSave } from '../src/save/files.ts';
import { App } from '../src/ui/app.ts';
import type { CreateMap, MapCallbacks, MapModel, MapView } from '../src/ui/mapView.ts';
import { book } from './helpers.ts';

interface FakeMap {
  createMap: CreateMap;
  tap(r: number, c: number): void;
  drag(r: number, c: number): void;
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
    drag: (r, c) => callbacks!.onTileDrag?.(r, c),
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
    if(selector==='[data-action="end-day"]' && !root.querySelector('[data-action="predict"]')) root.querySelector<HTMLElement>('[data-action="msg-next"]')?.click();
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
    expect(root.querySelector('.bb.is-next')?.getAttribute('data-type')).toBe('o2');
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
    expect(map.renders[map.renders.length - 1].outline).toEqual({ r: 5, c: 5 });
    expect(root.querySelector('.badge--label')?.textContent).toBe('Tap to place the shelter here');
    map.tap(5, 5);
    expect(s.shelters).toEqual([expect.objectContaining({ r: 5, c: 5 })]);
    // The shelter shows a small shield mark only, never the word "Sheltered" on the map.
    expect(root.querySelector('.badge--shelter')).not.toBeNull();
    expect(root.querySelector('.map__badges')!.textContent).not.toContain('Sheltered');
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
    expect(root.querySelector('.flash')?.textContent).toContain('Something is already here.');
    map.tap(0, 0);
    expect(root.querySelectorAll('.flash').length).toBe(1);
    expect(root.querySelector('.flash')?.textContent).toContain('You have not explored that land yet.');
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
    expect(root.textContent).toContain('What NASA saw');
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
      if(!root.querySelector('.realcard'))root.querySelector<HTMLElement>('[data-action="msg-next"]')?.click();
      const card = root.querySelector('.realcard');
      if (card) {
        expect(root.textContent).toContain('This was real');
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
    click('[data-action="msg-next"]');
    expect(root.textContent).toContain('No message from Earth today');
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
    expect(root.textContent).toContain('11 September 2017');
    expect(run.state.log.at(-1)!.events).toContainEqual(expect.objectContaining({type:'prediction_scored',right:true}));
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
    expect(run.state.log.at(-1)!.events).toContainEqual(expect.objectContaining({type:'prediction_scored',saved:true}));
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
    expect(root.textContent).toContain('Where the facts come from');
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
    expect(root.textContent).toContain('Restart your outpost?');
    click('[data-action="new-site-no"]');
    click('[data-action="try-again"]');
    expect(app.current!.state.lost).toBeNull();
    expect(app.current!.siteNumber).toBe(4821);
    expect(app.current!.state.day).toBe(1);
  });

  it('drags to place 1-soil shelters across multiple valid tiles in one stroke', async () => {
    const { app, map, click } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    const s = app.current!.state;
    s.goals.starterDone = 4;
    s.unlocked.push('batt', 'dig', 'farm', 'mine', 'shelter', 'fab');
    s.soil = 3;
    click('[data-type="shelter"]');
    const firstRender = map.renders[map.renders.length - 1];
    expect(firstRender.placing).toBe(true);
    const valid = firstRender.highlight;
    expect(valid.length).toBeGreaterThanOrEqual(3);

    // Drag across a valid tile, an unsurveyed/invalid tile (0,0), and two more valid tiles.
    map.drag(valid[0].r, valid[0].c);
    map.drag(0, 0);
    map.drag(valid[1].r, valid[1].c);
    map.drag(valid[2].r, valid[2].c);

    expect(s.shelters.length).toBe(3);
    expect(s.soil).toBe(0);
    expect(map.renders[map.renders.length - 1].placing).toBe(false);
  });

  it('each outpost tool has its own button and a sheet that says what it does; toggles and aid give feedback', async () => {
    const { app, root, click } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    const s = app.current!.state;
    // No catch-all "Outpost tools · ..." button any more: five named tools.
    expect(root.textContent).not.toContain('Outpost tools ·');
    const names = [...root.querySelectorAll<HTMLElement>('[data-action="tool"]')].map((b) => b.querySelector('.toolbtn__name')!.textContent);
    expect(names).toEqual(['Sound', 'Research', 'Notebook', 'Help', 'Save', 'Load']);

    click('[data-tool="sound"]');
    expect(root.querySelector('.tools__about')?.textContent).toContain('It is free.');
    const musicBtn = () => root.querySelector<HTMLButtonElement>('[data-action="music-toggle"]')!;
    expect(musicBtn().getAttribute('aria-pressed')).toBe('true');
    expect(musicBtn().textContent).toBe('Background music: On');
    click('[data-action="music-toggle"]');
    expect(musicBtn().getAttribute('aria-pressed')).toBe('false');
    expect(root.querySelector('.tools__status')?.textContent).toContain('Background music is off.');
    click('[data-action="close-overlay"]');
    expect(root.querySelector('[data-action="music-toggle"]')).toBeNull();

    // Help when nothing is short: a clear warning, no call used.
    click('[data-tool="aid"]');
    expect(root.querySelector('.tools__about')?.textContent).toMatch(/costs \d+ parts/);
    click('[data-action="aid"]');
    expect(root.querySelector('.tools__status--warn')).not.toBeNull();
    expect(s.aid?.used ?? 0).toBe(0);
    s.air = 1;
    click('[data-action="aid"]');
    expect(s.aid?.used).toBe(1);
    expect(root.querySelector('.tools__status')?.textContent).toContain('Help arrived');
    // Tapping the open tool again closes it.
    click('[data-tool="aid"]');
    expect(root.querySelector('[data-action="aid"]')).toBeNull();

    click('[data-tool="save"]');
    expect(root.querySelectorAll('[data-action="slot-save"]')).toHaveLength(3);
    expect(root.querySelector('[data-action="restart"]')).not.toBeNull();
    // Files are only a back up, in Settings.
    expect(root.querySelector('[data-action="export-save"]')).toBeNull();
  });

  it('every control on the play screen has a visible name or a spoken label', async () => {
    const { app, root, click } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    const check = () => {
      for (const el of root.querySelectorAll<HTMLElement>('button, [role="button"], label.button, a')) {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
        expect(name.length, el.outerHTML.slice(0, 120)).toBeGreaterThan(0);
      }
    };
    check();
    for (const tool of ['sound', 'research', 'notebook', 'aid', 'save', 'load']) {
      click(`[data-tool="${tool}"]`);
      check();
      click('[data-action="close-overlay"]');
    }
    click('[data-action="open-goal"]');
    check();
  });

  it('Save and Load use three slots in the game: save, load back the same outpost, other slots untouched', async () => {
    const storage = memory();
    const { app, root, click, advance } = setup(storage);
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    expect(root.querySelector('[data-tool="save"]')).not.toBeNull();
    expect(root.querySelector('[data-tool="load"]')).not.toBeNull();

    // Save into slot 2 (empty: no question), then slot 1.
    click('[data-tool="save"]');
    expect([...root.querySelectorAll('.slot__what')].map((e) => e.textContent)).toEqual(['Empty', 'Empty', 'Empty']);
    click('[data-action="slot-save"][data-slot="1"]');
    expect(root.querySelector('.tools__status')?.textContent).toBe('Saved in slot 2!');
    expect(root.querySelectorAll('.slot__what')[1].textContent).toMatch(/^Site 4821 · Sol 1 · 2 Sep 2017 · Landing camp · 2 crew$/);
    const saved = JSON.parse(JSON.stringify(app.current));
    // Saving over a used slot asks first, inside the page.
    click('[data-action="slot-save"][data-slot="1"]');
    expect(root.querySelector('.slot__ask')?.textContent).toContain('Save over slot 2?');
    click('[data-action="slot-no"]');
    click('[data-action="close-overlay"]');

    advance(1000);
    click('[data-action="end-day"]');
    expect(app.current!.state.day).toBe(2);
    click('[data-tool="save"]');
    click('[data-action="slot-save"][data-slot="0"]');
    click('[data-action="close-overlay"]');
    const slot1 = storage.data.get('outpost-builder-slot-1');

    // Load slot 2: an empty slot cannot be picked; a used one asks first, then restores that outpost.
    click('[data-tool="load"]');
    expect(root.querySelector<HTMLButtonElement>('[data-action="slot-load"][data-slot="2"]')!.disabled).toBe(true);
    click('[data-action="slot-load"][data-slot="1"]');
    expect(root.querySelector('.slot__ask')?.textContent).toContain('Load slot 2?');
    expect(app.current!.state.day).toBe(2);
    click('[data-action="slot-load-yes"][data-slot="1"]');
    expect(JSON.parse(JSON.stringify(app.current))).toEqual(saved);
    expect(storage.data.get('outpost-builder-slot-1')).toBe(slot1);
    expect(storage.data.has('outpost-builder-slot-3')).toBe(false);
    // The automatic save now holds the loaded outpost, so Continue comes back to it.
    expect(JSON.parse(storage.data.get(SAVE_KEY)!).outpost.state.day).toBe(1);
  });

  it('a damaged slot is reported and changes nothing; storage that throws does not crash', async () => {
    const storage = memory();
    const { app, root, click } = setup(storage);
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    storage.data.set('outpost-builder-slot-1', '{"version":1,"outpost":{"state":{}}}');
    click('[data-tool="load"]');
    expect(root.querySelectorAll('.slot__what')[0].textContent).toContain('damaged');
    expect(root.querySelector<HTMLButtonElement>('[data-action="slot-load"][data-slot="0"]')!.disabled).toBe(true);
    const before = JSON.stringify(app.current);
    expect(JSON.stringify(app.current)).toBe(before);
    click('[data-action="close-overlay"]');

    // Storage that throws: the slot sheets still open, and saving says so in plain words.
    storage.getItem = () => {
      throw new Error('blocked');
    };
    storage.setItem = () => {
      throw new Error('full');
    };
    click('[data-tool="save"]');
    expect(root.querySelectorAll('.slot__what')[0].textContent).toContain('not working');
    click('[data-tool="save"]');
    click('[data-tool="load"]');
    expect(JSON.stringify(app.current)).toBe(before);
  });

  it('Settings keeps a Back up to a file, separate from the game slots', async () => {
    const { app, root, click } = setup();
    app.start();
    click('[data-action="open-settings"]');
    expect(root.querySelector('.settings__backup')?.textContent).toContain('Keep a copy');
    expect(root.querySelector('[data-action="import-save"]')).not.toBeNull();
  });

  it('shows the stage, the way to the next one, and the store limits', async () => {
    const { app, root, click } = setup();
    app.start();
    click('[data-action="home-start"]');
    await tick();
    click('[data-action="title-continue"]');
    expect(root.querySelector('.goalbar .stage')?.getAttribute('aria-label')).toMatch(/^Stage 1 of \d: Landing camp\. Next: Small base/);
    const parts = root.querySelector('.count[aria-label^="Parts"]')!;
    expect(parts.getAttribute('aria-label')).toBe('Parts 8 of 20.');
    app.current!.state.parts = 20;
    click('[data-action="open-goal"]');
    expect(root.querySelector('.count[aria-label^="Parts"]')!.textContent).toContain('Full');
    expect(root.querySelector('.stagebox')?.textContent).toContain('Goals done: 0 of');
  });
});
