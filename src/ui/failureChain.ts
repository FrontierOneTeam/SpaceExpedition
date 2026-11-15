// The failure chain (SPEC 4.10, 10.6): walk the event log back from the resource that hit 0
// to its nearest cause. Fixed templates keyed by event type. Pure: no DOM.

import type { BuildingType, DayLog, GameState, LossCause, SimEvent } from '../sim/index.ts';
import { stockChange } from './advice.ts';
import { buildingLower } from './info.ts';
import { t, type StringKey } from './strings.ts';

export type ChainIcon = 'broken' | 'no_power' | 'water' | 'storm' | 'air' | 'food' | 'health';

export interface ChainPanel {
  icon: ChainIcon;
  text: string;
}

/** Buildings whose trouble explains a fall in each stock, most direct first. */
const MAKERS: Record<'air' | 'food', BuildingType[]> = {
  air: ['o2', 'farm'],
  food: ['farm'],
};

const RESOURCE: Record<LossCause, StringKey> = {
  air: 'resource.air',
  food: 'resource.food',
  health: 'resource.health',
};

const RAN_OUT: Record<LossCause, StringKey> = {
  air: 'chain.out.air',
  food: 'chain.out.food',
  health: 'chain.out.health',
};

function fell(cause: LossCause, n: number): ChainPanel {
  const key: StringKey = n === 1 ? 'chain.fellOne' : 'chain.fellMany';
  return { icon: cause, text: t(key, { res: t(RESOURCE[cause]), n }) };
}

/** A template for one event that can explain a fall in air or food, or null. */
function stockCause(e: SimEvent, makers: BuildingType[]): ChainPanel | null {
  if (e.type === 'broken' && makers.includes(e.building)) return { icon: 'broken', text: t('chain.broke', { name: buildingLower(e.building) }) };
  if (e.type === 'unpowered' && makers.includes(e.building)) return { icon: 'no_power', text: t('chain.noPower', { name: buildingLower(e.building) }) };
  if (e.type === 'missing_input' && makers.includes(e.building) && e.resource === 'water') {
    return { icon: 'water', text: t('chain.noWater', { name: buildingLower(e.building) }) };
  }
  return null;
}

const PRIORITY: Record<ChainIcon, number> = { broken: 0, storm: 1, no_power: 2, water: 3, air: 9, food: 9, health: 9 };

function bestOf(panels: ChainPanel[]): ChainPanel | null {
  return panels.sort((a, b) => PRIORITY[a.icon] - PRIORITY[b.icon])[0] ?? null;
}

function healthLoss(log: DayLog): SimEvent[] {
  return log.events.filter((e) => e.type === 'health' && e.amount < 0);
}

/**
 * Up to three linked panels, ending with the resource that hit 0.
 * When no cause can be found the direct cause stands alone.
 */
export function failureChain(state: GameState): ChainPanel[] {
  const lost = state.lost;
  if (!lost) return [];
  const log = state.log;
  const end = log.length - 1;
  const last: ChainPanel = { icon: lost.cause, text: t(RAN_OUT[lost.cause], { sol: lost.sol }) };
  if (end < 0) return [last];

  if (lost.cause === 'health') {
    let start = end;
    while (start >= 0 && healthLoss(log[start]).length > 0) start--;
    start++;
    if (start > end) return [last];
    // The nearest cause: the latest health loss.
    const losses = healthLoss(log[end]);
    const e = losses[losses.length - 1];
    if (!e || e.type !== 'health') return [last];
    const cause: ChainPanel =
      e.cause === 'radiation' ? { icon: 'storm', text: t('chain.radiation') } : { icon: 'no_power', text: t('chain.habitatNoPower') };
    return [cause, fell('health', end - start + 1), last];
  }

  const res = lost.cause;
  let start = end;
  while (start >= 0 && stockChange(log[start], res) < 0) start--;
  start++;
  if (start > end) return [last];
  // Search back from the loss to the day before the fall began.
  for (let i = end; i >= Math.max(0, start - 1); i--) {
    const found = bestOf(log[i].events.flatMap((e) => stockCause(e, MAKERS[res]) ?? []));
    if (found) return [found, fell(res, end - start + 1), last];
  }
  return [last];
}
