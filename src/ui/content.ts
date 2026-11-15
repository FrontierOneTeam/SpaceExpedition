// Science and source text, read only from the data files and never reworded (SPEC 0.2, 10.8):
// "This was real" cards, the resource register and the glossary. Pure: no DOM.

import cardsJson from '../data/cards.json';
import glossaryJson from '../data/glossary.json';
import registerJson from '../data/register.json';
import type { Chapter, Run } from '../sim/index.ts';

export interface Card {
  id: string;
  date: string;
  text: string;
  sourceIds: string[];
}

export interface SourceRow {
  id: string;
  name: string;
  url: string;
  group: 'listed' | 'additional';
  kind: string;
  usedFor: string;
  status: 'used' | 'planned' | 'not used';
}

export const CARDS = cardsJson as Card[];
export const REGISTER = registerJson as SourceRow[];
export const GLOSSARY = glossaryJson as Record<string, string>;

export function cardById(id: string): Card | null {
  return CARDS.find((c) => c.id === id) ?? null;
}

/** The register rows a card names. A card whose sources do not all resolve is never shown. */
export function cardSources(card: Card): SourceRow[] | null {
  const rows = card.sourceIds.map((id) => REGISTER.find((r) => r.id === id && r.status === 'used'));
  return rows.every((r) => r !== undefined) ? (rows as SourceRow[]) : null;
}

/** The rows the game shows: only `used` ones (SPEC 9.5). */
export function usedSources(): SourceRow[] {
  return REGISTER.filter((r) => r.status === 'used');
}

export function sourceGroups(): { listed: SourceRow[]; additional: SourceRow[] } {
  const used = usedSources();
  return { listed: used.filter((r) => r.group === 'listed'), additional: used.filter((r) => r.group === 'additional') };
}

/**
 * The card due this morning (SPEC 8.1): the morning after a day whose chapter entry has a cardId.
 * It never depends on the radio. Null while a report is pending or the run has stopped.
 */
export function cardDue(run: Run, chapter: Chapter): Card | null {
  if (run.pendingReport || run.state.lost) return null;
  const id = chapter.days[run.chapterDay - 2]?.cardId;
  if (!id) return null;
  const card = cardById(id);
  return card && cardSources(card) ? card : null;
}
