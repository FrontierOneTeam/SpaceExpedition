import {validRun} from './validate.ts';
import { capStocks, chooseGoal, stageReached, type GameState } from '../sim/index.ts';
// The one saved value (SPEC 12). Every storage access is wrapped: the game runs without storage.

import type { Run } from '../sim/index.ts';

export const SAVE_KEY = 'outpost-builder-save-v1';
export const SAVE_VERSION = 1;

export interface SaveFile {
  version: number;
  muted: boolean;
  musicOff?:boolean;
  effectsOff?:boolean;
  reports: unknown[];
  notebook: unknown[];
  outpost: Run | null;
  /** The three-step "how to play" strip has been shown and a first day ended (SPEC 16.4.2). Optional: older saves lack it. */
  taught?: boolean;
}

/** The small part of the Storage interface the save needs. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function emptySave(): SaveFile {
  return { version: SAVE_VERSION, muted: false, reports: [], notebook: [], outpost: null };
}

/** The browser's localStorage, or null when it is missing or blocked. */
export function browserStorage(): SaveStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A light shape check, so a damaged save cannot crash the game. */
function looksLikeRun(value:unknown):value is Run { return validRun(value); }

/**
 * Read the save. Never throws. On a version mismatch the reports and notebook are kept
 * when they are readable, and the outpost is discarded.
 */
export function loadSave(storage: SaveStorage | null): SaveFile {
  const file = emptySave();
  if (!storage) return file;
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return file;
  }
  if (!raw) return file;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return file;
  }
  if (!isObject(data)) return file;
  if (Array.isArray(data.reports)) file.reports = data.reports;
  if (Array.isArray(data.notebook)) file.notebook = data.notebook;
  if (data.version !== SAVE_VERSION) return file;
  if (typeof data.muted === 'boolean') file.muted = data.muted;
  if(typeof data.musicOff==='boolean')file.musicOff=data.musicOff;
  if(typeof data.effectsOff==='boolean')file.effectsOff=data.effectsOff;
  if (data.taught === true) file.taught = true;
  if (looksLikeRun(data.outpost)) {
    file.outpost = data.outpost;
    for(const shield of file.outpost.state.shelters) shield.size ??= 2;
    file.outpost.state.terrainSeed ??= file.outpost.siteNumber;
    if(file.outpost.state.goals.starterDone>=4&&!file.outpost.state.unlocked.includes('lab'))file.outpost.state.unlocked.push('lab');
    migrateProgress(file.outpost.state);
  }
  return file;
}

/**
 * Bring an outpost saved before stages and the goal chooser up to date (SPEC 18.2): its stage is the
 * highest one it already meets, its next goal is chosen now, and stocks above the new limits are capped.
 */
export function migrateProgress(state: GameState): void {
  if (state.stage === undefined) state.stage = stageReached(state);
  if (state.goals.starterDone >= 4 && state.goals.current === undefined) state.goals.current = chooseGoal(state);
  capStocks(state);
}

/** Write the save. Returns false when storage is missing or refuses. Never throws. */
export function writeSave(storage: SaveStorage | null, file: SaveFile): boolean {
  if (!storage) return false;
  try {
    const previous=storage.getItem(SAVE_KEY);
    if(previous)storage.setItem('recovery',previous);
    storage.setItem(SAVE_KEY, JSON.stringify({ ...file, version: SAVE_VERSION }));
    return true;
  } catch {
    return false;
  }
}
