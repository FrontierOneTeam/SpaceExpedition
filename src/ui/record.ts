// The daily NASA record and the real timeline (SPEC 16.4.4, 16.4.5). Pure: no DOM.
//
// Every sentence here is a fixed template from strings.en.json that only inserts values from the
// chapter file: the flare count, classes and peak times. A day with no record is never called
// quiet or calm (SPEC 9.1, 16.2).

import type { Chapter, ChapterDay } from '../sim/index.ts';
import { cardById, cardSources, REGISTER, type Card, type SourceRow } from './content.ts';
import { shortDate } from './format.ts';
import { isNasaStorm, stormName, strongestClass } from './info.ts';
import { t } from './strings.ts';

/** "09:10" from a DONKI peak time such as "2017-09-06T09:10Z". */
export function peakClock(peakTime: string): string {
  return peakTime.slice(11, 16);
}

/** How many DONKI records peak on this date. Falls back to the strong-flare list for older data. */
export function flareCountOf(day: ChapterDay): number {
  return typeof day.flareCount === 'number' ? day.flareCount : day.flares.length;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(t('list.separator')) + t('record.and') + items[items.length - 1];
}

/**
 * The real record of one day in words. `flares` holds the M5.0-and-above records, so when it has
 * k entries they are exactly the k strongest of the day.
 */
export function recordText(day: ChapterDay): string {
  const n = flareCountOf(day);
  const top = strongestClass(day);
  const best = day.strongest ?? day.flares.find((f) => f.classType === top) ?? null;
  if (n === 0 || !best) return t('record.none');
  const strong = day.flares;
  if (strong.length >= 2) {
    const list = joinList(strong.map((f) => t('record.flareAt', { cls: f.classType, time: peakClock(f.peakTime) })));
    return t('record.manyTop', { n, k: strong.length, list });
  }
  if (strong.length === 1) {
    return n === 1
      ? t('record.oneAt', { cls: best.classType, time: peakClock(best.peakTime) })
      : t('record.manyAt', { n, cls: best.classType, time: peakClock(best.peakTime) });
  }
  return n === 1 ? t('record.one', { cls: best.classType }) : t('record.many', { n, cls: best.classType });
}

/** The game's storm on that day, kept apart from the real record. Null on a day with radiation 0. */
export function stormText(day: ChapterDay): string | null {
  if (day.radiation <= 0) return null;
  return t(isNasaStorm(day) ? 'record.nasaStorm' : 'record.gameStorm', { name: stormName(day) });
}

/** The timeline word for a storm day: a game storm says so (SPEC 18.1 point 5). */
function stormWord(day: ChapterDay): string {
  return t(isNasaStorm(day) ? 'timeline.storm' : 'timeline.gameStorm');
}

/** The register row of the flare records (`donki`), when it is shown in the game. */
export function recordSource(): SourceRow | null {
  return REGISTER.find((r) => r.id === 'donki' && r.status === 'used') ?? null;
}

export interface RecordView {
  /** chapter day, from 1 */
  chapterDay: number;
  date: string;
  title: string;
  text: string;
  storm: string | null;
  notes: string | null;
  /** The "This was real" card of that day, once its morning has come. */
  card: { card: Card; sources: SourceRow[] } | null;
}

/** The record of chapter day `n`, as seen on the morning of `currentDay`. */
export function recordView(chapter: Chapter, n: number, currentDay: number): RecordView | null {
  const day = chapter.days[n - 1];
  if (!day) return null;
  let card: RecordView['card'] = null;
  // A day's card is shown the morning after it (SPEC 8.1), so only days already played reveal it.
  if (day.cardId && n < currentDay) {
    const c = cardById(day.cardId);
    const sources = c ? cardSources(c) : null;
    if (c && sources) card = { card: c, sources };
  }
  return {
    chapterDay: n,
    date: day.date,
    title: t('record.titleDate', { date: shortDate(day.date) }),
    text: recordText(day),
    storm: stormText(day),
    notes: day.notes ?? null,
    card,
  };
}

// ---- The timeline (SPEC 16.4.4) ----

export type CellState = 'past' | 'today' | 'tomorrow' | 'later';
export type CellMark = 'x' | 'm' | 'small' | 'none' | 'storm' | 'hidden';

export interface TimelineCell {
  chapterDay: number;
  date: string;
  state: CellState;
  word: string;
  mark: CellMark;
  /** Can be tapped to show its record. */
  open: boolean;
}

function markOf(cls: string): CellMark {
  if (cls.startsWith('X')) return 'x';
  if (cls.startsWith('M')) return 'm';
  return 'small';
}

/**
 * One cell per chapter day. Played days and today show their real record; tomorrow shows only
 * what the forecast shows (SPEC 4.9); later days stay hidden, so the one-day warning still works.
 */
export function timelineCells(chapter: Chapter, currentDay: number): TimelineCell[] {
  return chapter.days.map((day, i) => {
    const n = i + 1;
    const state: CellState = n < currentDay ? 'past' : n === currentDay ? 'today' : n === currentDay + 1 ? 'tomorrow' : 'later';
    if (state === 'later') return { chapterDay: n, date: day.date, state, word: t('timeline.hidden'), mark: 'hidden', open: false };
    if (state === 'tomorrow') {
      // The weather tile already names tomorrow's storm or its strong flare and class.
      if (day.radiation > 0) return { chapterDay: n, date: day.date, state, word: stormWord(day), mark: 'storm', open: false };
      const cls = day.flare !== 'none' ? strongestClass(day) : null;
      if (cls) return { chapterDay: n, date: day.date, state, word: cls, mark: markOf(cls), open: false };
      return { chapterDay: n, date: day.date, state, word: t('timeline.hidden'), mark: 'hidden', open: false };
    }
    if (day.radiation > 0) return { chapterDay: n, date: day.date, state, word: stormWord(day), mark: 'storm', open: true };
    const best = flareCountOf(day) > 0 ? (day.strongest?.classType ?? strongestClass(day)) : null;
    if (best) return { chapterDay: n, date: day.date, state, word: best, mark: markOf(best), open: true };
    return { chapterDay: n, date: day.date, state, word: t('timeline.none'), mark: 'none', open: true };
  });
}
