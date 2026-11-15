// Stages and storage limits (SPEC 18.2). Pure: reads and changes plain state only.

import { STAGES } from './config.ts';
import type { GameState, SimEvent } from './types.ts';

export type StoredResource = 'parts' | 'soil';

/** Goals finished in all, starter goals included. */
function goalsDone(state: Pick<GameState, 'goals'>): number {
  return state.goals.starterDone + state.goals.repeatingDone;
}

/** True when the outpost meets stage i's requirements. */
export function meetsStage(state: Pick<GameState, 'goals' | 'crew'>, i: number): boolean {
  const s = STAGES[i];
  return !!s && goalsDone(state) >= s.goals && state.crew >= s.crew;
}

/** The highest stage the outpost meets, stage by stage from the first. Used for old saves. */
export function stageReached(state: Pick<GameState, 'goals' | 'crew'>): number {
  let i = 0;
  while (i + 1 < STAGES.length && meetsStage(state, i + 1)) i++;
  return i;
}

/** The outpost's stage, from 0. */
export function stageOf(state: Pick<GameState, 'goals' | 'crew' | 'stage'>): number {
  const s = state.stage ?? stageReached(state);
  return Math.min(Math.max(0, Math.floor(s)), STAGES.length - 1);
}

/** How much of a resource the outpost can store at its stage. */
export function storageLimit(state: Pick<GameState, 'goals' | 'crew' | 'stage'>, resource: StoredResource): number {
  return STAGES[stageOf(state)][resource];
}

/** What does not fit is not stored. Changes the state; returns what was lost. */
export function capStocks(state: GameState): Extract<SimEvent, { type: 'stock_full' }>[] {
  const out: Extract<SimEvent, { type: 'stock_full' }>[] = [];
  for (const resource of ['parts', 'soil'] as const) {
    const limit = storageLimit(state, resource);
    if (state[resource] > limit) {
      out.push({ type: 'stock_full', resource, lost: state[resource] - limit });
      state[resource] = limit;
    }
  }
  return out;
}

/** Step 8, after the goals: reach at most one new stage. Changes the state. */
export function checkStage(state: GameState): SimEvent[] {
  const now = stageOf(state);
  state.stage = now;
  if (now + 1 < STAGES.length && meetsStage(state, now + 1)) {
    state.stage = now + 1;
    return [{ type: 'stage_up', stage: now + 1 }];
  }
  return [];
}
