import { describe, expect, it } from 'vitest';
import { endDay } from '../src/sim/day.ts';
import { place, removeBuilding } from '../src/sim/placement.ts';
import { answerQuestion, dueQuestion } from '../src/sim/predict.ts';
import type { Run } from '../src/sim/types.ts';
import { addBuilding, addShelter, book, byId, flatTerrain, run, sep2017, unlockAll } from './helpers.ts';

/** A real-chapter run with a greenhouse, an oxygen maker and an ice mine, all unsheltered. */
function base(): { r: Run; farm: number; o2: number; mine: number } {
  const r = run(11);
  const s = r.state;
  flatTerrain(s, [[3, 5]]);
  unlockAll(s);
  s.air = 30;
  s.food = 30;
  s.parts = 50;
  s.soil = 20;
  const o2 = addBuilding(s, 'o2', 4, 6);
  const mine = addBuilding(s, 'mine', 3, 5);
  const farm = addBuilding(s, 'farm', 3, 6);
  return { r, farm, o2, mine };
}

function toChapterDay(r: Run, day: number): void {
  while (r.chapterDay < day) endDay(r, book);
}

describe('predict question (SPEC 8.2, 16.2)', () => {
  it('is asked once, on 10 September, and not again on 11 September', () => {
    const { r, farm } = base();
    const askedOn: string[] = [];
    for (let d = 1; d <= 14; d++) {
      expect(r.chapterDay).toBe(d);
      if (r.state.question) askedOn.push(sep2017.days[d - 1].date);
      if (d === 9) expect(r.state.question).toEqual({ buildingId: farm, building: 'farm', sol: 9 });
      endDay(r, book);
    }
    expect(askedOn).toEqual(['2017-09-10']);
  });

  it('scores "break" right the next day when the building broke', () => {
    const { r, farm } = base();
    toChapterDay(r, 9);
    expect(answerQuestion(r.state, 'break')).toBe(true);
    expect(r.state.question).toBeNull();
    expect(answerQuestion(r.state, 'fine')).toBe(false); // at most one a day
    let ev = endDay(r, book).events; // 10 Sep: not scored yet
    expect(ev.some((e) => e.type === 'prediction_scored')).toBe(false);
    ev = endDay(r, book).events; // 11 Sep: the storm day
    expect(ev).toContainEqual({ type: 'prediction_scored', buildingId: farm, building: 'farm', answer: 'break', broke: true, right: true, saved: false });
    expect(r.state.predictions).toEqual({ right: 1, answered: 1 });
  });

  it('scores "fine" wrong when the building broke', () => {
    const { r } = base();
    toChapterDay(r, 9);
    answerQuestion(r.state, 'fine');
    endDays2(r);
    expect(r.state.predictions).toEqual({ right: 0, answered: 1 });
  });

  it('counts "break" then sheltering it as right, with the saved flag', () => {
    const { r, farm } = base();
    toChapterDay(r, 9);
    answerQuestion(r.state, 'break');
    expect(place(r.state, 'shelter', 3, 6).ok).toBe(true); // (3,5) (3,6) (4,5) (4,6): covers the farm
    endDay(r, book);
    const ev = endDay(r, book).events;
    expect(ev).toContainEqual({ type: 'prediction_scored', buildingId: farm, building: 'farm', answer: 'break', broke: false, right: true, saved: true });
    expect(byId(r.state, farm).brokenDays).toBe(0);
    expect(r.state.predictions).toEqual({ right: 1, answered: 1 });
  });

  it('does not count a skipped question', () => {
    const { r } = base();
    toChapterDay(r, 9);
    expect(answerQuestion(r.state, 'skip')).toBe(true);
    expect(r.state.question).toBeNull();
    expect(r.state.prediction).toBeNull();
    endDays2(r);
    expect(r.state.predictions).toEqual({ right: 0, answered: 0 });
  });

  it('drops the question silently if the building was removed', () => {
    const { r, farm } = base();
    toChapterDay(r, 9);
    answerQuestion(r.state, 'break');
    expect(removeBuilding(r.state, farm).ok).toBe(true);
    endDay(r, book);
    const ev = endDay(r, book).events;
    expect(ev.some((e) => e.type === 'prediction_scored')).toBe(false);
    expect(r.state.predictions).toEqual({ right: 0, answered: 0 });
    expect(r.state.prediction).toBeNull();
  });

  it('prefers a greenhouse, then an oxygen maker, then the oldest other; never pad, habitat or panel', () => {
    const { r, farm, o2, mine } = base();
    toChapterDay(r, 9);
    const s = r.state;
    expect(dueQuestion(s, sep2017, 9)?.buildingId).toBe(farm);
    addShelter(s, 2, 6); // (2,6) (2,7) (3,6) (3,7): shelters the farm
    expect(dueQuestion(s, sep2017, 9)?.buildingId).toBe(o2);
    byId(s, o2).brokenDays = 1;
    // The battery (id 4) is older than the mine.
    expect(dueQuestion(s, sep2017, 9)?.buildingId).toBe(4);
    addShelter(s, 4, 4); // shelters the battery and habitat
    expect(dueQuestion(s, sep2017, 9)?.buildingId).toBe(mine);
    addShelter(s, 3, 4); // inserted directly (it overlaps): shelters the mine
    expect(dueQuestion(s, sep2017, 9)).toBeNull(); // only the pad and panels are left unsheltered
  });

  it('is not due when tomorrow is calm or today is already a storm', () => {
    const { r } = base();
    expect(dueQuestion(r.state, sep2017, 8)).toBeNull();
    expect(dueQuestion(r.state, sep2017, 10)).toBeNull(); // 11 Sep: today 3
    expect(dueQuestion(r.state, sep2017, 14)).toBeNull(); // no tomorrow
  });
});

function endDays2(r: Run): void {
  endDay(r, book);
  endDay(r, book);
}
