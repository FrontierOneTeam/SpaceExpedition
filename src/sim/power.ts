// Power (SPEC 4.6). Pure: computes the result without changing the state.
// Used for today's preview and for real at step 1 of the end of day.

import { BUILDINGS, DAMAGED_PANEL_PENALTY } from './config.ts';
import { isSheltered } from './placement.ts';
import type { Building, BuildingType, GameState } from './types.ts';

export interface PowerResult {
  supply: number;
  /** Total use of every working consumer. */
  demand: number;
  /** Power actually used by powered consumers. */
  used: number;
  capacity: number;
  chargeBefore: number;
  chargeAfter: number;
  powered: number[];
  unpowered: { buildingId: number; building: BuildingType; need: number }[];
}

export function isWorking(b: Building): boolean {
  return b.brokenDays <= 0 && !b.manualRepair;
}

/** Power a working panel makes under this sunlight. */
export function panelOutput(b: Building, sunlight: number): number {
  const base = Math.round(BUILDINGS[b.type].solarOutput * sunlight);
  return Math.max(0, base - (b.damagedDays > 0 ? DAMAGED_PANEL_PENALTY : 0));
}

/** Power use of one building today, taking its shelter into account. */
export function powerUse(state: GameState, b: Building): number {
  const s = BUILDINGS[b.type];
  return isSheltered(state, b.r, b.c) ? s.powerSheltered : s.power;
}

export function batteryCapacity(state: GameState): number {
  return state.buildings.filter(isWorking).reduce((sum, b) => sum + BUILDINGS[b.type].storage, 0);
}

export function resolvePower(state: GameState, sunlight: number): PowerResult {
  const working = state.buildings.filter(isWorking);
  const supply = working
    .filter((b) => BUILDINGS[b.type].solarOutput > 0)
    .reduce((sum, b) => sum + (b.type==='nuke'?6:panelOutput(b, sunlight)+(state.research?.includes('pan')&&b.type==='sun'?Math.round(sunlight):0)), 0);

  // Habitats first, then oldest first.
  const consumers = working
    .filter((b) => powerUse(state, b) > 0)
    .sort((a, b) => {
      const ha = a.type === 'home' ? 0 : 1;
      const hb = b.type === 'home' ? 0 : 1;
      return ha - hb || a.id - b.id;
    });

  // SPEC 16.3: a broken battery gives no power; only charge within the working capacity can be used.
  const capacity = batteryCapacity(state);
  const usableCharge = Math.min(state.charge, capacity);
  const available = supply + usableCharge;
  let used = 0;
  let demand = 0;
  const powered: number[] = [];
  const unpowered: PowerResult['unpowered'] = [];
  for (const b of consumers) {
    const need = powerUse(state, b);
    demand += need;
    if (used + need <= available) {
      used += need;
      powered.push(b.id);
    } else {
      unpowered.push({ buildingId: b.id, building: b.type, need });
    }
  }

  // Charge above the working capacity is lost (SPEC 16.3).
  const chargeAfter = Math.min(Math.max(usableCharge + supply - used, 0), capacity);
  return { supply, demand, used, capacity, chargeBefore: state.charge, chargeAfter, powered, unpowered };
}
