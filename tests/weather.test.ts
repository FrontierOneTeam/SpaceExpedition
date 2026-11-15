import { describe, expect, it } from 'vitest';
import { endDay, newRun } from '../src/sim/day.ts';
import { chapterDate, chapterDayData, forecast, radioBlocked, validateChapter } from '../src/sim/weather.ts';
import type { RadiationLevel, SimEvent } from '../src/sim/types.ts';
import { addBuilding, addShelter, book, byId, lab, sep2017, testBook } from './helpers.ts';

function calmThen(levels: RadiationLevel[], total = 30): RadiationLevel[] {
  return [...levels, ...Array<RadiationLevel>(total - levels.length).fill(0)];
}

/** A lab run with an unsheltered and a sheltered oxygen maker. Air and food kept high. */
function stormLab(levels: RadiationLevel[]) {
  const { run, book } = lab(30, calmThen(levels));
  const s = run.state;
  s.air = 30;
  s.food = 30;
  addShelter(s, 3, 3); // (3,3) (3,4) (4,3) (4,4)
  const sheltered = addBuilding(s, 'o2', 4, 4);
  const open = addBuilding(s, 'o2', 4, 6);
  return { run, book, s, sheltered, open };
}

describe('chapter loader', () => {
  it('validates and maps chapter days to real dates', () => {
    expect(validateChapter(sep2017)).toEqual([]);
    expect(sep2017.days).toHaveLength(14);
    expect(chapterDate(sep2017, 1)).toBe('2017-09-02');
    expect(chapterDate(sep2017, 5)).toBe('2017-09-06');
    expect(chapterDayData(sep2017, 5)?.date).toBe('2017-09-06');
    expect(chapterDate(sep2017, 14)).toBe('2017-09-15');
  });

  it('has radiation 3, 2, 1 on 11, 12, 13 September and 0 elsewhere', () => {
    const byDate = Object.fromEntries(sep2017.days.map((d) => [d.date, d.radiation]));
    expect([byDate['2017-09-11'], byDate['2017-09-12'], byDate['2017-09-13']]).toEqual([3, 2, 1]);
    const others = sep2017.days.filter((d) => !['2017-09-11', '2017-09-12', '2017-09-13'].includes(d.date));
    for (const d of others) expect(d.radiation, d.date).toBe(0);
  });

  it('flags a broken chapter', () => {
    const bad = { ...sep2017, days: sep2017.days.slice().reverse() };
    expect(validateChapter(bad).length).toBeGreaterThan(0);
  });
});

describe('forecast and radio (SPEC 4.9)', () => {
  it('shows today and tomorrow inside the chapter; no tomorrow on the last day', () => {
    const f = forecast(sep2017, 9);
    expect(f.today?.date).toBe('2017-09-10');
    expect(f.tomorrow?.radiation).toBe(3);
    const last = forecast(sep2017, 14);
    expect(last.today?.date).toBe('2017-09-15');
    expect(last.tomorrow).toBeNull();
  });

  it('blocks the radio on the mornings of 7, 8 and 11 September only', () => {
    const blocked = sep2017.days.filter((_, i) => radioBlocked(sep2017, i + 1)).map((d) => d.date);
    expect(blocked).toEqual(['2017-09-07', '2017-09-08', '2017-09-11']);
  });

  it('still gives the forecast on blackout mornings', () => {
    for (const day of [6, 7, 10]) {
      expect(radioBlocked(sep2017, day)).toBe(true);
      const f = forecast(sep2017, day);
      expect(f.today).not.toBeNull();
      expect(f.tomorrow).not.toBeNull();
    }
  });

  it('still asks the predict question on a blackout morning', () => {
    // Major flare on day 1, storm on day 3: day 2 is both a blackout and the warning day.
    const b = testBook(calmThen([0, 0, 2], 6));
    const ch = b.chapters.test;
    ch.days[0].flare = 'major';
    const r = newRun(1, b);
    r.state.air = 30;
    r.state.food = 30;
    addBuilding(r.state, 'o2', 4, 4);
    endDay(r, b);
    expect(r.chapterDay).toBe(2);
    expect(radioBlocked(ch, 2)).toBe(true);
    expect(r.state.question).not.toBeNull();
  });
});

describe('radiation (SPEC 4.8, 16.1)', () => {
  const table: [RadiationLevel, number, number, number][] = [
    // level, health lost, broken days, damaged days
    [0, 0, 0, 0],
    [1, 1, 0, 0],
    [2, 2, 1, 1],
    [3, 3, 2, 2],
  ];
  for (const [level, health, broken, damaged] of table) {
    it(`level ${level}: health -${health}, unsheltered buildings broken ${broken}, panels damaged ${damaged}`, () => {
      const { run, book, s, sheltered, open } = stormLab([level]);
      endDay(run, book);
      expect(s.health).toBe(10 - health);
      expect(byId(s, open).brokenDays).toBe(broken);
      expect(byId(s, 4).brokenDays).toBe(broken); // battery
      expect(byId(s, 5).brokenDays).toBe(broken); // pad
      expect(byId(s, sheltered).brokenDays).toBe(0);
      expect(byId(s, 2).damagedDays).toBe(damaged);
      expect(byId(s, 3).damagedDays).toBe(damaged);
      expect(byId(s, 2).brokenDays).toBe(0); // panels are damaged, never broken
      expect(byId(s, 1).brokenDays).toBe(0); // habitats never break
    });
  }

  it('costs no health when every habitat is sheltered', () => {
    const { run, book, s } = stormLab([3]);
    s.shelters = [];
    addShelter(s, 4, 4); // (4,4) (4,5) (5,4) (5,5): habitat sheltered
    endDay(run, book);
    expect(s.health).toBe(10);
  });

  it('takes health once a day, not per habitat, if any habitat is unsheltered', () => {
    const { run, book, s } = stormLab([3]);
    s.shelters = [];
    addShelter(s, 4, 4); // first habitat sheltered
    addBuilding(s, 'home', 7, 6); // second habitat, unsheltered
    addBuilding(s, 'home', 7, 5); // third, unsheltered
    endDay(run, book);
    expect(s.health).toBe(7);
    expect(byId(s, 1).brokenDays).toBe(0);
  });

  it('adds repeat hits to the days left: down on 12, 13 and 14 September', () => {
    const { run, book, s, open } = stormLab([3, 2, 1]);
    const airMade: number[] = [];
    for (let i = 0; i < 5; i++) {
      const ev = endDay(run, book).events;
      airMade.push(ev.filter((e) => e.type === 'produced' && e.buildingId === open).length);
      if (i === 0) expect(byId(s, open).brokenDays).toBe(2);
      if (i === 1) expect(byId(s, open).brokenDays).toBe(2);
      if (i === 2) expect(byId(s, open).brokenDays).toBe(1);
    }
    expect(airMade).toEqual([1, 0, 0, 0, 1]);
    expect(byId(s, 2).damagedDays).toBe(0);
  });

  it('a broken pad blocks the supply rocket and that delivery is lost', () => {
    const { run, book, s } = stormLab(calmThen([0, 0, 0, 0, 0, 2], 12));
    s.buildings = s.buildings.filter((b) => b.type !== 'o2');
    s.parts = 5; // well under the parts store limit
    for (let i = 0; i < 5; i++) endDay(run, book);
    const parts = s.parts;
    const ev = endDay(run, book).events;
    expect(s.day).toBe(7);
    expect(ev).toContainEqual({ type: 'rocket_blocked', buildingId: 5, partsLost: 3 });
    expect(s.parts).toBe(parts);
    for (let i = 0; i < 6; i++) endDay(run, book);
    expect(s.day).toBe(13);
    expect(s.parts).toBe(parts + 3);
  });

  it('the rocket lands +3 parts on sol 6 and 12 when the pad works', () => {
    const { run, book, s } = stormLab([]);
    s.buildings = s.buildings.filter((b) => b.type !== 'o2'); // no goal rewards
    s.parts = 5; // well under the parts store limit
    const parts = s.parts;
    for (let i = 0; i < 5; i++) endDay(run, book);
    expect(s.parts).toBe(parts);
    expect(endDay(run, book).events).toContainEqual({ type: 'rocket_landed', parts: 3 });
    expect(s.parts).toBe(parts + 3);
  });

  it('health recovers +1 only on days with no loss, up to 10', () => {
    const { run, book, s } = stormLab([0, 1, 0, 0]);
    s.health = 5;
    endDay(run, book);
    expect(s.health).toBe(6);
    endDay(run, book); // level 1, unsheltered habitat
    expect(s.health).toBe(5);
    s.buildings = s.buildings.filter((b) => b.type !== 'sun');
    s.charge = 0;
    endDay(run, book); // unpowered habitat
    expect(s.health).toBe(3);
    s.health = 10;
    addBuilding(s, 'sun', 7, 6);
    const ev = endDay(run, book).events;
    expect(s.health).toBe(10);
    expect(ev.some((e) => e.type === 'health')).toBe(false);
  });

  it('the storm event records sheltered and unsheltered buildings; damage names the panel', () => {
    let { run, book, s } = stormLab([3]);
    let ev = endDay(run, book).events;
    expect(ev).toContainEqual({ type: 'storm', level: 3, sheltered: 1, unsheltered: 6, allHabitatsSheltered: false, source: 'game-rule' });
    expect(ev).toContainEqual({ type: 'damaged', buildingId: 2, building: 'sun', days: 2, daysLeft: 2 });
    ({ run, book, s } = stormLab([3]));
    s.shelters = [];
    addShelter(s, 4, 4); // o2 at (4,4), battery, habitat
    ev = endDay(run, book).events;
    expect(ev).toContainEqual({ type: 'storm', level: 3, sheltered: 3, unsheltered: 4, allHabitatsSheltered: true, source: 'game-rule' });
  });

  it('real chapter, no shelter: health 10, 7, 5, 4, 5, 6 over chapter days 10 to 14; the sol 12 rocket is blocked', () => {
    const r = newRun(1, book);
    r.state.air = 30;
    r.state.food = 30;
    while (r.chapterDay < 10) endDay(r, book);
    const health = [r.state.health];
    let rocket: SimEvent[] = [];
    while (!r.pendingReport) {
      const ev = endDay(r, book).events;
      health.push(r.state.health);
      if (r.state.log.at(-1)?.sol === 12) rocket = ev.filter((e) => e.type.startsWith('rocket'));
    }
    expect(r.state.lost).toBeNull();
    expect(health).toEqual([10, 7, 5, 4, 5, 6]);
    expect(rocket).toEqual([{ type: 'rocket_blocked', buildingId: 5, partsLost: 3 }]);
  });
});
