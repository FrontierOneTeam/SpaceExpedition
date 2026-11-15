// Starter and repeating goals, unlocks and map growth (SPEC 7, 16.2).

import {
  GOAL_REWARD_PARTS,
  MAX_GOALS_PER_DAY,
  REPEATING_GOALS,
  REPEATING_GOALS_PER_RING,
  REVEAL_RINGS,
  STARTER_GOALS,
} from './config.ts';
import { isSheltered } from './placement.ts';
import { revealedSize } from './terrain.ts';
import type { BuildingType, GameState, GoalInfo, SimEvent } from './types.ts';

function count(state: GameState, type: BuildingType): number {
  return state.buildings.filter((b) => b.type === type).length;
}

function firstHabitatSheltered(state: GameState): boolean {
  const homes = state.buildings.filter((b) => b.type === 'home').sort((a, b) => a.id - b.id);
  return homes.length > 0 && isSheltered(state, homes[0].r, homes[0].c);
}

/** Whether completing repeating goal k grows the map. */
function repeatingGrowsMap(state: GameState, k: number): boolean {
  return (k + 1) % REPEATING_GOALS_PER_RING === 0 && state.ring < REVEAL_RINGS.length - 1;
}

/** The goal on screen now, with its target and progress for the progress bar. */
export function currentGoal(state: GameState): GoalInfo {
  const s = state.goals.starterDone;
  if (s < STARTER_GOALS.length) {
    const def = STARTER_GOALS[s];
    const base = { kind: 'starter' as const, index: s, level: 0, rewardParts: GOAL_REWARD_PARTS, growsMap: false, unlocks: def.unlocks.slice() };
    switch (def.id) {
      case 'starter_air':
        return { ...base, id: def.id, target: 1, progress: Math.min(1, count(state, 'o2')) };
      case 'starter_food':
        return { ...base, id: def.id, target: 2, progress: Math.min(1, count(state, 'mine')) + Math.min(1, count(state, 'farm')) };
      case 'starter_soil':
        return { ...base, id: def.id, target: 1, progress: Math.min(1, count(state, 'dig')) };
      case 'starter_cover':
        return { ...base, id: def.id, target: 1, progress: firstHabitatSheltered(state) ? 1 : 0 };
    }
  }
  const k = state.goals.repeatingDone;
  const level = Math.floor(k / REPEATING_GOALS.cycle);
  const base = { kind: 'repeating' as const, index: k, level, rewardParts: GOAL_REWARD_PARTS, growsMap: repeatingGrowsMap(state, k), unlocks: [] };
  switch (k % REPEATING_GOALS.cycle) {
    case 0: {
      const target = REPEATING_GOALS.crewBase + REPEATING_GOALS.crewPerLevel * level;
      return { ...base, id: 'house_crew', target, progress: Math.min(state.crew, target) };
    }
    case 1: {
      const target = Math.min(REPEATING_GOALS.storesAir, REPEATING_GOALS.storesFood);
      // ASSUMPTION: progress for "fill your stores" is the lower of the two stocks, capped at the target.
      return { ...base, id: 'fill_stores', target, progress: Math.min(state.air, state.food, target) };
    }
    default: {
      const target = REPEATING_GOALS.partsBase + REPEATING_GOALS.partsPerLevel * level;
      return { ...base, id: 'stockpile_parts', target, progress: Math.min(state.parts, target) };
    }
  }
}

export function isGoalDone(state: GameState, goal: GoalInfo): boolean {
  if (goal.id === 'fill_stores') return state.air >= REPEATING_GOALS.storesAir && state.food >= REPEATING_GOALS.storesFood;
  return goal.progress >= goal.target;
}

/** Step 8: check goals, pay rewards, unlock buildings and grow the map. Changes the state. */
export function checkGoals(state: GameState): SimEvent[] {
  const events: SimEvent[] = [];
  for (let n = 0; n < MAX_GOALS_PER_DAY; n++) {
    const goal = currentGoal(state);
    if (!isGoalDone(state, goal)) break;
    state.parts += goal.rewardParts;
    events.push({ type: 'goal_done', goal });
    if (goal.kind === 'starter') {
      state.goals.starterDone++;
      for (const u of goal.unlocks) {
        if (!state.unlocked.includes(u)) {
          state.unlocked.push(u);
          events.push({ type: 'unlocked', building: u });
        }
      }
    } else {
      state.goals.repeatingDone++;
      if (goal.growsMap) {
        state.ring++;
        events.push({ type: 'map_grew', ring: state.ring, size: revealedSize(state.ring) });
      }
    }
  }
  return events;
}

export function goalsCompleted(state: GameState): number {
  return state.goals.starterDone + state.goals.repeatingDone;
}
