// The one saved value (SPEC 12). Every storage access is wrapped: the game runs without storage.

import type { Run } from '../sim/index.ts';

export const SAVE_KEY = 'outpost-builder-save-v1';
export const SAVE_VERSION = 1;

export interface SaveFile {
  version: number;
  muted: boolean;
  reports: unknown[];
  notebook: unknown[];
  outpost: Run | null;
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
function looksLikeRun(value: unknown): value is Run {
  if (!isObject(value)) return false;
  const s = value.state;
  return (
    typeof value.siteNumber === 'number' &&
    typeof value.chapterId === 'string' &&
    typeof value.replay === 'number' &&
    typeof value.chapterDay === 'number' &&
    typeof value.pendingReport === 'boolean' &&
    isObject(s) &&
    typeof s.day === 'number' &&
    Array.isArray(s.terrain) &&
    Array.isArray(s.buildings) &&
    Array.isArray(s.shelters) &&
    Array.isArray(s.unlocked) &&
    Array.isArray(s.log) &&
    isObject(s.goals)
  );
}

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
  if (looksLikeRun(data.outpost)) file.outpost = data.outpost;
  return file;
}

/** Write the save. Returns false when storage is missing or refuses. Never throws. */
export function writeSave(storage: SaveStorage | null, file: SaveFile): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ ...file, version: SAVE_VERSION }));
    return true;
  } catch {
    return false;
  }
}
