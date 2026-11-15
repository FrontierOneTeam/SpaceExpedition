import { describe, expect, it } from 'vitest';
import { endDay, newRun } from '../src/sim/day.ts';
import { place } from '../src/sim/placement.ts';
import { SAVE_KEY, emptySave, loadSave, writeSave, type SaveStorage } from '../src/save/save.ts';
import { book } from './helpers.ts';

function memory(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwing: SaveStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('save (SPEC 12)', () => {
  it('round trips a run under the one key', () => {
    const store = memory();
    const run = newRun(4821, book);
    place(run.state, 'o2', 3, 5);
    endDay(run, book);
    expect(writeSave(store, { ...emptySave(), outpost: run })).toBe(true);
    expect([...store.data.keys()]).toEqual([SAVE_KEY]);
    const back = loadSave(store);
    expect(back.version).toBe(1);
    expect(back.outpost).toEqual(run);
    const raw = JSON.parse(store.data.get(SAVE_KEY)!);
    expect(Object.keys(raw).sort()).toEqual(['muted', 'notebook', 'outpost', 'reports', 'version']);
    expect(Object.keys(raw.outpost).sort()).toEqual(['chapterDay', 'chapterId', 'pendingReport', 'replay', 'siteNumber', 'state']);
  });

  it('keeps a pending report on reload without running a day', () => {
    const store = memory();
    const run = newRun(7, book);
    for (let i = 0; i < 14 && !run.state.lost; i++) {
      run.state.air = 30;
      run.state.food = 30;
      run.state.health = 10;
      endDay(run, book);
    }
    expect(run.pendingReport).toBe(true);
    writeSave(store, { ...emptySave(), outpost: run });
    const back = loadSave(store).outpost!;
    expect(back.pendingReport).toBe(true);
    expect(back.state.day).toBe(run.state.day);
    expect(endDay(back, book).ran).toBe(false);
    expect(back.state.day).toBe(run.state.day);
  });

  it('on a version mismatch keeps reports and notebook and drops the outpost', () => {
    const store = memory();
    store.setItem(SAVE_KEY, JSON.stringify({ version: 0, muted: true, reports: [{ id: 'r' }], notebook: ['n'], outpost: newRun(1, book) }));
    const back = loadSave(store);
    expect(back.outpost).toBeNull();
    expect(back.reports).toEqual([{ id: 'r' }]);
    expect(back.notebook).toEqual(['n']);
    expect(back.version).toBe(1);
  });

  it('ignores broken JSON and a damaged outpost', () => {
    const store = memory();
    store.setItem(SAVE_KEY, '{not json');
    expect(loadSave(store)).toEqual(emptySave());
    store.setItem(SAVE_KEY, JSON.stringify({ version: 1, reports: [], notebook: [], outpost: { siteNumber: 'x' } }));
    expect(loadSave(store).outpost).toBeNull();
  });

  it('runs with storage that throws or is missing', () => {
    expect(loadSave(throwing)).toEqual(emptySave());
    expect(writeSave(throwing, emptySave())).toBe(false);
    expect(loadSave(null)).toEqual(emptySave());
    expect(writeSave(null, emptySave())).toBe(false);
  });
});
