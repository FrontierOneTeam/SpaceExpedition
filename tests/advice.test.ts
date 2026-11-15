import { describe, expect, it } from 'vitest';
import { endDay, newRun } from '../src/sim/day.ts';
import { canPlaceShelter, place } from '../src/sim/placement.ts';
import { guidedHint, missionControlMessage, shelterHintTop } from '../src/ui/advice.ts';
import { addBuilding, book, sep2017 } from './helpers.ts';

describe('guided start (SPEC 7.1)', () => {
  it('points at the oxygen maker button, then at a tile', () => {
    const run = newRun(4821, book);
    expect(guidedHint(run.state, null)).toEqual({ kind: 'button', type: 'o2' });
    const onMap = guidedHint(run.state, 'o2');
    expect(onMap?.kind).toBe('tile');
  });

  it('points goal 4 at the shelter whose top tile is (4,4)', () => {
    const run = newRun(4821, book);
    run.state.goals.starterDone = 3;
    run.state.unlocked.push('shelter');
    run.state.soil = 4;
    expect(shelterHintTop(run.state)).toEqual({ r: 4, c: 4 });
    expect(canPlaceShelter(run.state, 4, 4).ok).toBe(true);
    expect(guidedHint(run.state, null)).toEqual({ kind: 'button', type: 'shelter' });
  });

  it('asks the child to remove a solar panel standing in the shelter spot', () => {
    const run = newRun(4821, book);
    run.state.goals.starterDone = 3;
    addBuilding(run.state, 'sun', 5, 4);
    const hint = guidedHint(run.state, 'shelter');
    expect(hint).toMatchObject({ kind: 'tile', r: 5, c: 4 });
    // On a calm morning with no news from yesterday, Mission Control says it too.
    expect(missionControlMessage(run, sep2017).text).toBe('A solar panel is in the way of the shelter. Remove it first.');
  });
});

describe('Mission Control (SPEC 10.4, 4.9)', () => {
  function runTo(chapterDay: number) {
    const run = newRun(4821, book);
    while (run.chapterDay < chapterDay) {
      run.state.air = 30;
      run.state.food = 30;
      endDay(run, book);
    }
    return run;
  }

  it('shows the blackout line on the morning after a major flare', () => {
    const run = runTo(6); // 7 September
    expect(missionControlMessage(run, sep2017).text).toBe("No message from Earth today. Yesterday's solar flare blocked the radio.");
  });

  it('still warns about tomorrow\'s storm on a blackout morning', () => {
    const run = runTo(10); // 11 September, after the 10 September flare
    expect(missionControlMessage(run, sep2017).mood).toBe('worried');
    expect(missionControlMessage(run, sep2017).text).toContain('radiation storm reaches you tomorrow');
  });

  it('says a machine had no power yesterday and suggests a solar panel', () => {
    const run = newRun(4821, book);
    const s = run.state;
    s.parts = 30;
    // Starting supply is 6. Habitat 1 + three oxygen makers 6 = 7, so the last one gets no power.
    expect(place(s, 'o2', 3, 5).ok).toBe(true);
    expect(place(s, 'o2', 4, 4).ok).toBe(true);
    expect(place(s, 'o2', 4, 6).ok || place(s, 'o2', 5, 4).ok).toBe(true);
    endDay(run, book);
    const msg = missionControlMessage(run, sep2017);
    expect(msg.text).toBe('Your oxygen maker had no power yesterday. Build another solar panel.');
  });
});
