import { AIR_FOOD_DAYS_PER_CREW, LONG_RUN, LIMITS } from './config.ts';
import { capStocks } from './storage.ts';
import type { GameState } from './types.ts';

export function requestAid(state: GameState, paid = false): { ok: boolean } {
  const aid = state.aid ?? { used: 0, lastSol: -LONG_RUN.aidCooldown };
  const critical = state.air <= state.crew * 2 || state.food <= state.crew * 2 || state.parts < LONG_RUN.repairParts;
  if (state.lost || !critical || state.day - aid.lastSol < LONG_RUN.aidCooldown) return { ok: false };
  if (paid ? state.parts < LONG_RUN.paidAidCost : aid.used >= LONG_RUN.freeAid) return { ok: false };
  if (paid) state.parts -= LONG_RUN.paidAidCost;
  state.parts += LONG_RUN.aidParts;
  state.air = Math.min(stockCapacity(state), state.air + state.crew * 3);
  state.food = Math.min(stockCapacity(state), state.food + state.crew * 3);
  state.water = Math.min(LIMITS.water.max, state.water + 6);
  state.aid = { used: aid.used + (paid ? 0 : 1), lastSol: state.day };
  capStocks(state);
  return { ok: true };
}

export function repairBuilding(state: GameState, id: number): boolean {
  const b = state.buildings.find(b => b.id === id);
  if (state.lost || !b || (!b.manualRepair && b.brokenDays <= 0 && b.damagedDays <= 0) || state.parts < LONG_RUN.repairParts) return false;
  state.parts -= LONG_RUN.repairParts;
  b.manualRepair = false;
  b.brokenDays = 0;
  b.damagedDays = 0;
  return true;
}

export function stockCapacity(state: GameState): number {
  return Math.max(LIMITS.air.max, state.crew * AIR_FOOD_DAYS_PER_CREW);
}

/** A deterministic, explicitly fictional hardware fault. One unresolved fault at a time. */
export function resolveIncident(state: GameState): void {
  if (state.day < LONG_RUN.incidentStart || state.day % LONG_RUN.incidentInterval !== 0 || state.buildings.some(b => b.manualRepair)) return;
  const candidates = state.buildings.filter(b => ['o2', 'farm', 'mine', 'fab'].includes(b.type));
  if (!candidates.length) return;
  const index = ((state.terrainSeed ?? 1) + state.day) % candidates.length;
  const b = candidates[index];
  b.manualRepair = true;
  b.brokenDays = Math.max(1, b.brokenDays);
  state.incident = { sol: state.day, buildingId: b.id };
}
