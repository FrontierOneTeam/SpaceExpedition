// @vitest-environment happy-dom
// Phase 4 through the real interface code, with Phaser replaced by a fake map.

import { describe, expect, it } from 'vitest';
import { SAVE_KEY, loadSave, type SaveStorage } from '../src/save/save.ts';
import { App } from '../src/ui/app.ts';
import type { CreateMap, MapModel, MapView } from '../src/ui/mapView.ts';
import { baseFacts, baseLines } from '../src/ui/report.ts';
import { SoundBoard, type SoundBackend } from '../src/ui/sound.ts';
import type { DayLog } from '../src/sim/types.ts';
import { book } from './helpers.ts';

function memory(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

function setup(storage: SaveStorage = memory(), sound?: SoundBoard) {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const renders: MapModel[] = [];
  let celebrated = 0;
  const played: string[] = [];
  const backend: SoundBackend = {
    has: () => true,
    play: (name) => {
      played.push(name);
      return { setVolume: () => undefined, stop: () => undefined };
    },
    setMuted: () => undefined,
  };
  const view: MapView = {
    render: (m) => void renders.push(m),
    setInsets: () => undefined,
    tileToScreen: (r, c) => ({ x: (c - r) * 32, y: (c + r) * 16 }),
    scale: () => 0.5,
    zoomBy: () => undefined,
    celebrate: () => void celebrated++,
    sound: backend,
    destroy: () => undefined,
  };
  const createMap: CreateMap = () => Promise.resolve(view);
  let clock = 0;
  const app = new App(root, { book, storage, createMap, randomSite: () => 4821, now: () => (clock += 1000), reducedMotion: () => true, sound });
  const click = (selector: string): void => {
    const el = root.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`missing ${selector}`);
    el.click();
  };
  return { app, root, click, renders, played, celebrated: () => celebrated, storage };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function play(s: ReturnType<typeof setup>) {
  s.app.start();
  s.click('[data-action="home-start"]');
  await tick();
  s.click('[data-action="title-continue"]');
}

describe('phase 3 leftovers (Part A)', () => {
  it('the warning mark shares a row with the big number instead of covering it', async () => {
    const s = setup();
    await play(s);
    s.app.current!.state.air = 3;
    s.app.render();
    const air = s.root.querySelector('.meter--air')!;
    const row = air.querySelector('.meter__row')!;
    expect(row.querySelector('.meter__num')!.textContent).toBe('3');
    expect(row.querySelector('.tag__mark')).not.toBeNull();
  });

  it('shows no "tomorrow" change once the run is lost', async () => {
    const s = setup();
    await play(s);
    expect(s.root.querySelector('.meter--air .meter__line')!.textContent).toContain('tomorrow');
    const st = s.app.current!.state;
    st.air = 1;
    st.crew = 4;
    s.click('[data-action="end-day"]');
    expect(st.lost).not.toBeNull();
    expect(s.root.querySelector('.meter--air .meter__line')).toBeNull();
    expect(s.root.querySelector('.meter--food .meter__line')).toBeNull();
    expect(s.root.querySelector('.meter--power .meter__line')).not.toBeNull();
  });

  it('day notes wait while the "This was real" card is open', async () => {
    const s = setup();
    await play(s);
    const run = s.app.current!;
    // End days until a card shows (the morning after 6 September).
    for (let i = 0; i < 6 && !s.root.querySelector('.realcard'); i++) {
      run.state.air = 30;
      run.state.food = 30;
      s.click('[data-action="end-day"]');
    }
    const playEl = s.root.querySelector('.play')!;
    expect(s.root.querySelector('.realcard')).not.toBeNull();
    expect(playEl.classList.contains('has-card')).toBe(true);
    if (s.root.querySelector('.notice--notes')) expect(playEl.classList.contains('has-notes')).toBe(true);
    s.click('[data-action="close-card"]');
    expect(playEl.classList.contains('has-card')).toBe(false);
    // A tapped building's card hides the "This was real" card on phones; the class says so.
    const css = (await import('node:fs')).readFileSync('src/ui/styles.css', 'utf8');
    expect(css).toMatch(/\.has-card \.notice--notes,\s*\.has-bcard \.map-top__card\s*\{\s*display: none;/);
  });

  it('a storm on a building that was already broken keeps it broken longer', () => {
    const log = (events: DayLog['events']): DayLog => ({
      sol: 12, chapterId: 'sep2017', chapterDay: 11, replay: 1, date: '2017-09-12', events,
      after: { air: 1, food: 1, water: 1, parts: 1, soil: 1, health: 1, crew: 2, charge: 0 },
    });
    const storm = { type: 'storm' as const, level: 2 as const, sheltered: 0, unsheltered: 2, allHabitatsSheltered: true };
    const kept = baseFacts(log([storm, { type: 'broken', buildingId: 1, building: 'o2', days: 1, daysLeft: 2 }]));
    expect(kept.broken).toEqual([]);
    expect(kept.keptBroken).toEqual(['o2']);
    const lines = baseLines(kept);
    expect(lines).toContain('The storm kept your oxygen maker broken for longer.');
    expect(lines.join(' ')).not.toContain('broke your');
    const fresh = baseFacts(log([storm, { type: 'broken', buildingId: 1, building: 'o2', days: 1, daysLeft: 1 }]));
    expect(baseLines(fresh)).toContain('The storm broke your oxygen maker.');
    // A report stored before phase 4 has no keptBroken and still reads.
    const old = { ...fresh };
    delete old.keptBroken;
    expect(() => baseLines(old)).not.toThrow();
  });
});

describe('phase 4 in the interface', () => {
  it('passes the astronauts what they mirror, and celebrates a finished goal', async () => {
    const s = setup();
    await play(s);
    const last = s.renders[s.renders.length - 1];
    expect(last.astronauts).toEqual({ tomorrowRadiation: 0, coldHabitats: [] });
    s.app.current!.state.buildings.push({ id: 999, type: 'o2', r: 3, c: 3, brokenDays: 0, damagedDays: 0 });
    s.click('[data-action="end-day"]');
    expect(s.celebrated()).toBe(1);
  });

  it('the mute button saves its state in the save file and it survives a reload', async () => {
    const storage = memory();
    const s = setup(storage);
    await play(s);
    const btn = () => s.root.querySelector<HTMLElement>('.topbar [data-action="toggle-mute"]')!;
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    btn().click();
    expect(btn().getAttribute('aria-pressed')).toBe('true');
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).muted).toBe(true);
    expect(loadSave(storage).muted).toBe(true);

    const again = setup(storage);
    again.app.start();
    again.click('[data-action="open-settings"]');
    expect(again.root.textContent).toContain('Sound is off.');
    again.click('[data-action="toggle-mute"]');
    expect(again.root.textContent).toContain('Sound is on.');
    expect(loadSave(storage).muted).toBe(false);
  });

  it('plays the wind only after the first tap and only approved sounds', async () => {
    const s = setup(memory());
    s.app.start();
    expect(s.played).toEqual([]);
    s.click('[data-action="home-start"]');
    await tick();
    expect(s.played).toContain('amb_mars_wind');
    expect(s.played.every((n) => ['amb_mars_wind', 'mc_radio_open', 'mc_radio_close'].includes(n))).toBe(true);
  });

  it('without a tap nothing plays, even with the map open', async () => {
    const board = new SoundBoard();
    const s = setup(memory(), board);
    s.app.start();
    // Enter play without a click (no first tap).
    (s.app as unknown as { onStart(): void }).onStart();
    await tick();
    expect(board.isUnlocked()).toBe(false);
    expect(s.played).toEqual([]);
  });

  it('never shows the real-recording line today', async () => {
    const s = setup();
    await play(s);
    s.click('[data-action="open-sources"]');
    expect(s.root.querySelector('.nowplaying')).toBeNull();
    expect(s.root.textContent).not.toContain('Now playing');
  });
});
