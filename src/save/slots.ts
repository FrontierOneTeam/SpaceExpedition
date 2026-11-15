// Three save slots kept in the browser, apart from the automatic save (team request, SPEC 18.3).
// Each slot holds one save file in the same shape as the main save, read back through the same
// validation and migration (loadSave). Every storage access is wrapped: nothing here throws.

import type { Run } from '../sim/index.ts';
import { emptySave, loadSave, SAVE_KEY, SAVE_VERSION, type SaveStorage } from './save.ts';

export const SLOT_COUNT = 3;

export function slotKey(index: number): string {
  return `outpost-builder-slot-${index + 1}`;
}

export type SlotRead =
  | { kind: 'empty' }
  | { kind: 'damaged' }
  | { kind: 'unavailable' }
  | { kind: 'ok'; run: Run };

/** Read one slot. A slot that cannot be read or does not pass the save checks is "damaged". */
export function readSlot(storage: SaveStorage | null, index: number): SlotRead {
  if (!storage) return { kind: 'unavailable' };
  let raw: string | null;
  try {
    raw = storage.getItem(slotKey(index));
  } catch {
    return { kind: 'unavailable' };
  }
  if (!raw) return { kind: 'empty' };
  // The same checks and migration as the main save, through a one-value storage.
  const file = loadSave({ getItem: (k) => (k === SAVE_KEY ? raw : null), setItem: () => undefined, removeItem: () => undefined });
  return file.outpost ? { kind: 'ok', run: file.outpost } : { kind: 'damaged' };
}

/** Write the outpost into a slot. False when storage is missing, full or refuses. Never throws. */
export function writeSlot(storage: SaveStorage | null, index: number, run: Run): boolean {
  if (!storage) return false;
  try {
    storage.setItem(slotKey(index), JSON.stringify({ ...emptySave(), version: SAVE_VERSION, outpost: run }));
    return true;
  } catch {
    return false;
  }
}
