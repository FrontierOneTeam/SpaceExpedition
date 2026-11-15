// Public API of the simulation.

export * from './types.ts';
export * as config from './config.ts';
export { createRng, shuffle, type Rng } from './rng.ts';
export { generateTerrain, startingBase, ringOf, isRevealed, revealedSize, inBounds, manhattan, type Tile } from './terrain.ts';
export { resolvePower, panelOutput, powerUse, batteryCapacity, isWorking, type PowerResult } from './power.ts';
export {
  canPlace,
  canPlaceBuilding,
  canPlaceShelter,
  place,
  validTiles,
  removeBuilding,
  removeShelter,
  buildingAt,
  shelterAt,
  shelterTiles,
  isSheltered,
  isUnlocked,
  hasAdjacentBuilding,
  type PlaceCheck,
  type PlaceResult,
  type PlaceFailReason,
  type RemoveResult,
  type RemoveFailReason,
} from './placement.ts';
export {
  getChapter,
  chapterDate,
  chapterDayData,
  isLastChapterDay,
  forecast,
  radioBlocked,
  validateChapter,
  applyRadiation,
} from './weather.ts';
export { currentGoal, isGoalDone, checkGoals, goalsCompleted } from './goals.ts';
export { dueQuestion, answerQuestion, scorePrediction } from './predict.ts';
export {
  newRun,
  endDay,
  canEndDay,
  previewDay,
  keepBuilding,
  cloneRun,
  stocksOf,
  chapterSnapshot,
  type DayPreview,
  type EndDayResult,
} from './day.ts';
