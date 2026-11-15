// Dates and other small text helpers. All words come from strings.en.json.

import type { Chapter } from '../sim/index.ts';
import { t, type StringKey } from './strings.ts';

const MONTH_SHORT: StringKey[] = [
  'month.short.1', 'month.short.2', 'month.short.3', 'month.short.4', 'month.short.5', 'month.short.6',
  'month.short.7', 'month.short.8', 'month.short.9', 'month.short.10', 'month.short.11', 'month.short.12',
];
const MONTH_LONG: StringKey[] = [
  'month.long.1', 'month.long.2', 'month.long.3', 'month.long.4', 'month.long.5', 'month.long.6',
  'month.long.7', 'month.long.8', 'month.long.9', 'month.long.10', 'month.long.11', 'month.long.12',
];

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function parse(iso: string): Ymd {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/** "10 Sep 2017" */
export function shortDate(iso: string): string {
  const { y, m, d } = parse(iso);
  return t('date.short', { d, month: t(MONTH_SHORT[m - 1]), y });
}

/** "10 September 2017" */
export function longDate(iso: string): string {
  const { y, m, d } = parse(iso);
  return t('date.long', { d, month: t(MONTH_LONG[m - 1]), y });
}

/** "2 to 15 September 2017", or two long dates when the months differ. */
export function dateRange(first: string, last: string): string {
  const a = parse(first);
  const b = parse(last);
  if (first === last) return longDate(first);
  if (a.y === b.y && a.m === b.m) return t('date.rangeSameMonth', { d1: a.d, d2: b.d, month: t(MONTH_LONG[a.m - 1]), y: a.y });
  return t('date.range', { first: longDate(first), last: longDate(last) });
}

/** "10 and 11 September 2017" for the weather panel's source line. */
export function datePair(first: string, second: string | null): string {
  if (!second) return longDate(first);
  const a = parse(first);
  const b = parse(second);
  if (a.y === b.y && a.m === b.m) return t('date.pairSameMonth', { d1: a.d, d2: b.d, month: t(MONTH_LONG[a.m - 1]), y: a.y });
  return t('date.pair', { first: longDate(first), second: longDate(second) });
}

/** The real dates a chapter covers. */
export function chapterRange(chapter: Chapter): string {
  return dateRange(chapter.days[0].date, chapter.days[chapter.days.length - 1].date);
}

/** "Replay 2 of the September 2017 records" (SPEC 9.6). */
export function replayLine(chapter: Chapter, replay: number): string {
  const { y, m } = parse(chapter.startDate);
  return t('chapter.replay', { n: replay, month: t(MONTH_LONG[m - 1]), y });
}

/** "+1", "−2" or "0": tomorrow's change, shown with the word "tomorrow" beside it. */
export function changeLine(change: number): string {
  if (change > 0) return t('meter.changeUp', { n: change });
  if (change < 0) return t('meter.changeDown', { n: -change });
  return t('meter.changeNone');
}

/** Escape text for use inside HTML. */
export function esc(text: string | number): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
