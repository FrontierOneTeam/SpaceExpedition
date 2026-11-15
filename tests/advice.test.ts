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

  it('points goal 4 at the single tile shelter over the habitat', () => {
    const run = newRun(4821, book);
    run.state.goals.starterDone = 3;
    run.state.unlocked.push('shelter');
    run.state.soil = 4;
    expect(shelterHintTop(run.state)).toEqual({ r: 5, c: 5 });
    expect(canPlaceShelter(run.state, 5, 5).ok).toBe(true);
    expect(guidedHint(run.state, null)).toEqual({ kind: 'button', type: 'shelter' });
  });

  it('does not ask to remove a panel beside a single-tile shield',()=>{
    const r=newRun(4821,book);r.state.goals.starterDone=3;r.state.unlocked.push('shelter');r.state.soil=4;
    addBuilding(r.state,'sun',5,4);expect(canPlaceShelter(r.state,5,5).ok).toBe(true);
    expect(missionControlMessage(r,sep2017).text).not.toContain('in the way');
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

  it('gives smart kid-friendly advice for active storms, solar flares, research, and repeating goals', () => {
    const run = newRun(4821, book);
    const s = run.state;
    s.goals.starterDone = 4;
    s.unlocked.push('batt', 'dig', 'farm', 'mine', 'shelter', 'fab', 'home', 'lab');
    s.soil = 10;
    const calmDay = { date: '2024-05-01', sunlight: 1, radiation: 0 as const, flare: 'none' as const, flares: [], notes: '' };
    const stormDay = { ...calmDay, radiation: 2 as const };
    const stormChapter = { ...sep2017, days: [stormDay, calmDay] };

    // Active storm with unsheltered habitat warns cleanly with shelter count.
    const warn = missionControlMessage(run, stormChapter);
    expect(warn.mood).toBe('worried');
    expect(warn.text).toContain('Drag a 1-soil shelter');

    // When all habitats and breakables are sheltered, cheers during the storm.
    for (const b of s.buildings) {
      if (b.type === 'home' || b.type === 'batt' || b.type === 'o2' || b.type === 'farm' || b.type === 'mine' || b.type === 'dig' || b.type === 'fab' || b.type === 'pad') {
        if (b.type === 'home' || b.type === 'batt') place(s, 'shelter', b.r, b.c);
      }
    }
    const safe = missionControlMessage(run, stormChapter);
    expect(safe.mood).toBe('cheering');
    expect(safe.text).toContain('safe under their soil shelters');

    // Solar flare day mentions exact flare class.
    const flareChapter = {
      ...sep2017,
      days: [{ ...calmDay, flare: 'strong' as const, flares: [{ peakTime: '2024-05-01T06:19Z', classType: 'M9.1' }] }, calmDay],
    };
    const flareMsg = missionControlMessage(run, flareChapter);
    expect(flareMsg.text).toContain('M9.1');

    // Unspent research points prompt opening Research; repeating goal gives goal coaching when spent.
    const calmChapter = { ...sep2017, days: [calmDay, calmDay] };
    s.researchPoints = 2;
    expect(missionControlMessage(run, calmChapter).text).toContain('Research');
    s.researchPoints = 0;
    expect(missionControlMessage(run, calmChapter).text).toContain('Goal check:');
  });
});
