// The predict question (SPEC 8.2, 16.2).

import { PREDICT } from './config.ts';
import { isSheltered } from './placement.ts';
import { chapterDayData } from './weather.ts';
import type { Chapter, GameState, PredictAnswer, PredictQuestion, SimEvent } from './types.ts';

/**
 * The question due at the start of a day, or null.
 * Due when tomorrow's radiation is a storm, today's is not, and an unsheltered,
 * unbroken building would break. Prefers a greenhouse, then an oxygen maker, then the oldest.
 */
export function dueQuestion(state: GameState, chapter: Chapter, chapterDay: number): PredictQuestion | null {
  const today = chapterDayData(chapter, chapterDay);
  const tomorrow = chapterDayData(chapter, chapterDay + 1);
  if (!today || !tomorrow) return null;
  if (!(tomorrow.radiation >= PREDICT.stormLevel && today.radiation < PREDICT.stormLevel)) return null;
  const candidates = state.buildings
    .filter((b) => PREDICT.candidates.includes(b.type) && b.brokenDays <= 0 && !isSheltered(state, b.r, b.c))
    .sort((a, b) => a.id - b.id);
  if (candidates.length === 0) return null;
  const pick = PREDICT.prefer.map((t) => candidates.find((b) => b.type === t)).find((b) => b !== undefined) ?? candidates[0];
  return { buildingId: pick.id, building: pick.type, sol: state.day };
}

/**
 * Answer (or skip) this morning's question. Changes the state.
 * Returns false when there is no question to answer.
 */
export function answerQuestion(state: GameState, answer: PredictAnswer | 'skip'): boolean {
  const q = state.question;
  if (!q || state.lost) return false;
  state.question = null;
  if (answer !== 'skip') state.prediction = { buildingId: q.buildingId, building: q.building, answer, sol: q.sol };
  return true;
}

/**
 * Step 9: score yesterday's prediction. `brokenToday` lists the buildings broken at step 6 today.
 * A removed building drops the question silently. Changes the state.
 */
export function scorePrediction(state: GameState, brokenToday: number[]): SimEvent[] {
  const p = state.prediction;
  if (!p || p.sol >= state.day) return [];
  state.prediction = null;
  if (p.sol !== state.day - 1) return [];
  const b = state.buildings.find((x) => x.id === p.buildingId);
  if (!b) return [];
  const broke = brokenToday.includes(b.id);
  const saved = p.answer === 'break' && !broke && isSheltered(state, b.r, b.c);
  const right = p.answer === 'break' ? broke || saved : !broke;
  // ASSUMPTION: the tally counts a question when it is scored, so a dropped question (building removed) is not counted.
  state.predictions.answered++;
  if (right) state.predictions.right++;
  return [{ type: 'prediction_scored', buildingId: b.id, building: b.type, answer: p.answer, broke, right, saved }];
}
