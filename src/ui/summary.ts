// What changed in an ended day (SPEC 16.4.3): a short list built only from that day's event log,
// one line each with its icon, most important first. Pure: no DOM.

import { config, type BuildingType, type DayLog, type SimEvent } from '../sim/index.ts';
import { buildingLower, buildingName, stageName } from './info.ts';
import { t, type StringKey } from './strings.ts';

export type SummaryIcon = 'storm' | 'broken' | 'no_power' | 'air' | 'food' | 'parts' | 'water' | 'soil' | 'power' | 'mark';

export interface SummaryLine {
  icon: SummaryIcon;
  text: string;
}

const STORM: StringKey[] = ['sum.storm1', 'sum.storm1', 'sum.storm2', 'sum.storm3'];
const GAME_STORM: StringKey[] = ['sum.gameStorm1', 'sum.gameStorm1', 'sum.gameStorm2', 'sum.gameStorm3'];

/** The day's storm line. A game storm is called one (SPEC 18.1). Old logs without a source keep the plain line. */
export function stormLine(e: Extract<SimEvent, { type: 'storm' }>): string {
  return t((e.source === 'game-rule' ? GAME_STORM : STORM)[e.level]);
}

function names(types: BuildingType[]): string {
  return [...new Set(types)].map((b) => buildingLower(b)).join(t('list.separator'));
}

/** The scored prediction, in a friendly line (SPEC 8.2). */
export function predictionLine(e: Extract<SimEvent, { type: 'prediction_scored' }>): string {
  const name = buildingLower(e.building);
  if (e.saved) return t('notes.predictSaved', { name });
  if (e.right) return t(e.broke ? 'notes.predictRightBroke' : 'notes.predictRightFine', { name });
  return t(e.broke ? 'notes.predictWrongBroke' : 'notes.predictWrongFine', { name });
}

/** Lines for buildings the storm broke, grouped by the days they stay broken. */
function brokenLines(events: SimEvent[]): string[] {
  const groups = new Map<string, { kept: boolean; days: number; types: BuildingType[] }>();
  for (const e of events) {
    if (e.type !== 'broken') continue;
    const kept = e.daysLeft > e.days;
    const key = `${kept}:${e.daysLeft}`;
    const g = groups.get(key) ?? { kept, days: e.daysLeft, types: [] };
    g.types.push(e.building);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const one = g.types.length === 1;
    const v = { names: names(g.types), count: g.types.length, n: g.days };
    if (g.kept) return t(one ? 'sum.keptOne' : 'sum.keptMany', v);
    if (g.days === 1) return t(one ? 'sum.brokeOneTomorrow' : 'sum.brokeManyTomorrow', v);
    return t(one ? 'sum.brokeOneDays' : 'sum.brokeManyDays', v);
  });
}

/**
 * The day summary: storm and what broke, the prediction, goals, crew health, the rocket, power,
 * air and food with the new totals, then map growth. At most `max` lines.
 */
export function daySummary(log: DayLog, max: number = config.VIEW.summaryMaxLines): SummaryLine[] {
  const ev = log.events;
  const out: { p: number; line: SummaryLine }[] = [];
  const add = (p: number, icon: SummaryIcon, text: string) => out.push({ p, line: { icon, text } });

  const made = { air: 0, food: 0 };
  let used = { air: 0, food: 0 };
  const noPower: BuildingType[] = [];
  let panels = 0;
  let panelDays = 0;
  for (const e of ev) {
    switch (e.type) {
      case 'storm':
        add(1, 'storm', stormLine(e));
        break;
      case 'health':
        if (e.amount < 0 && e.cause === 'radiation') add(2, 'storm', t('sum.radiationHealth', { n: -e.amount }));
        if (e.amount < 0 && e.cause === 'unpowered_habitat') add(7, 'no_power', t('sum.habitatHealth', { n: -e.amount }));
        break;
      case 'damaged':
        panels++;
        panelDays = Math.max(panelDays, e.daysLeft);
        break;
      case 'prediction_scored':
        add(4, 'mark', predictionLine(e));
        break;
      case 'goal_done':
        add(5, 'parts', e.goal.rewardParts > 0 ? t('notes.goal', { n: e.goal.rewardParts }) : t('notes.goalNoParts'));
        break;
      case 'stage_up':
        add(4.5, 'mark', t('notes.stageUp', { stage: stageName(e.stage) }));
        break;
      case 'stock_full':
        add(14, e.resource === 'soil' ? 'soil' : 'parts', t(e.resource === 'soil' ? 'sum.soilFull' : 'sum.partsFull', { n: e.lost }));
        break;
      case 'rocket_landed':
        add(8, 'parts', t('notes.rocket', { n: e.parts }));
        break;
      case 'rocket_blocked':
        add(8, 'broken', t('notes.rocketBlocked'));
        break;
      case 'unpowered':
        if (e.building !== 'home') noPower.push(e.building);
        break;
      case 'missing_input':
        add(10, e.resource === 'water' ? 'water' : 'soil', t(e.resource === 'water' ? 'sum.noWater' : 'sum.noSoil', { name: buildingLower(e.building) }));
        break;
      case 'produced':
        if (e.resource === 'air') made.air += e.amount;
        if (e.resource === 'food') made.food += e.amount;
        break;
      case 'crew_used':
        used = { air: used.air + e.air, food: used.food + e.food };
        break;
      case 'map_grew':
        add(15, 'mark', t('notes.mapGrew'));
        // The pan hint waits until the map is 8x8 (SPEC 5.6).
        if (e.ring === 1) add(16, 'mark', t('notes.panHint'));
        break;
      case 'repaired':
        add(17, 'mark', t('sum.repaired', { name: buildingLower(e.building) }));
        break;
    }
  }
  brokenLines(ev).forEach((text) => add(3, 'broken', text));
  if (panels > 0) add(3.5, 'power', panels === 1 ? t('sum.panelOne', { d: panelDays }) : t('sum.panels', { n: panels, d: panelDays }));
  const unlocked = ev.filter((e): e is Extract<SimEvent, { type: 'unlocked' }> => e.type === 'unlocked');
  if (unlocked.length > 0) {
    const list = unlocked.map((e) => buildingName(e.building));
    add(6, 'mark', t('notes.unlocked', { names: list.join(t('list.separator')) }));
  }
  if (noPower.length > 0) add(9, 'no_power', t('sum.noPower', { names: names(noPower) }));
  if (made.air > 0 && made.food > 0) add(11, 'air', t('sum.madeBoth', made));
  else if (made.air > 0) add(11, 'air', t('sum.madeAir', made));
  else if (made.food > 0) add(11, 'food', t('sum.madeFood', made));
  else add(11, 'air', t('sum.madeNone'));
  if (used.air > 0 || used.food > 0) add(12, 'food', t('sum.used', used));
  add(13, 'air', t('sum.totals', { air: log.after.air, food: log.after.food }));

  return out
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .slice(0, max)
    .map((x) => x.line);
}
