// Chapter lookups, the forecast and radio (SPEC 4.9), and radiation hits (4.8, 16.1).

import { BUILDINGS, LIMITS, RADIATION } from './config.ts';
import { isSheltered } from './placement.ts';
import type { Chapter, ChapterBook, ChapterDay, GameState, RadiationLevel, SimEvent, StormSource } from './types.ts';

const MS_PER_DAY = 86_400_000;

function parseDate(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function getChapter(book: ChapterBook, chapterId: string): Chapter {
  const chapter = book.chapters[chapterId];
  if (!chapter) throw new Error(`unknown chapter: ${chapterId}`);
  return chapter;
}

/** Real date of a chapter day: startDate + (chapterDay - 1) days, as YYYY-MM-DD (UTC). */
export function chapterDate(chapter: Chapter, chapterDay: number): string {
  return formatDate(parseDate(chapter.startDate) + (chapterDay - 1) * MS_PER_DAY);
}

/** The chapter's record for a chapter day, or null outside the chapter. */
export function chapterDayData(chapter: Chapter, chapterDay: number): ChapterDay | null {
  return chapter.days[chapterDay - 1] ?? null;
}

export function isLastChapterDay(chapter: Chapter, chapterDay: number): boolean {
  return chapterDay === chapter.days.length;
}

/** Today and tomorrow inside the current chapter. On the last day, tomorrow is null. */
export function forecast(chapter: Chapter, chapterDay: number): { today: ChapterDay | null; tomorrow: ChapterDay | null } {
  return { today: chapterDayData(chapter, chapterDay), tomorrow: chapterDayData(chapter, chapterDay + 1) };
}

/** The radio is blocked on a morning when the previous day in the same chapter had a major flare. */
export function radioBlocked(chapter: Chapter, chapterDay: number): boolean {
  const yesterday = chapterDayData(chapter, chapterDay - 1);
  return yesterday !== null && yesterday.flare === 'major';
}

/** Problem codes for a chapter file. Empty when the chapter is usable. */
export function validateChapter(chapter: Chapter): string[] {
  const problems: string[] = [];
  if (!chapter.id) problems.push('missing_id');
  if (Number.isNaN(parseDate(chapter.startDate))) problems.push('bad_start_date');
  if (!Array.isArray(chapter.days) || chapter.days.length === 0) {
    problems.push('no_days');
    return problems;
  }
  chapter.days.forEach((d, i) => {
    if (d.date !== chapterDate(chapter, i + 1)) problems.push(`date_out_of_order:${i + 1}`);
    if (!(d.sunlight >= 0 && d.sunlight <= 1)) problems.push(`bad_sunlight:${i + 1}`);
    if (![0, 1, 2, 3].includes(d.radiation)) problems.push(`bad_radiation:${i + 1}`);
    if (!['none', 'strong', 'major'].includes(d.flare)) problems.push(`bad_flare:${i + 1}`);
    if (!Array.isArray(d.flares)) problems.push(`bad_flares:${i + 1}`);
  });
  return problems;
}

/** Where a day's storm comes from. A storm without a recorded source counts as a game storm (SPEC 18.1). */
export function stormSourceOf(day: ChapterDay): StormSource {
  return day.stormSource === 'nasa-report' ? 'nasa-report' : 'game-rule';
}

export function clampHealth(value: number): number {
  return Math.min(Math.max(value, LIMITS.health.min), LIMITS.health.max);
}

/**
 * Step 6: today's radiation hits the base. Changes the state.
 * Returns the events and the health lost.
 */
export function applyRadiation(state: GameState, level: RadiationLevel, source: StormSource = 'game-rule'): { events: SimEvent[]; healthLost: number } {
  const events: SimEvent[] = [];
  const effect = RADIATION[level];
  if (level > 0) {
    const sheltered = state.buildings.filter((b) => isSheltered(state, b.r, b.c)).length;
    events.push({
      type: 'storm',
      level,
      sheltered,
      unsheltered: state.buildings.length - sheltered,
      allHabitatsSheltered: state.buildings.every((b) => b.type !== 'home' || isSheltered(state, b.r, b.c)),
      source,
    });
  }

  let healthLost = 0;
  const homes = state.buildings.filter((b) => b.type === 'home');
  if (effect.health > 0 && homes.some((h) => !isSheltered(state, h.r, h.c))) {
    const before = state.health;
    state.health = clampHealth(state.health - effect.health);
    healthLost = effect.health;
    events.push({ type: 'health', amount: state.health - before, cause: 'radiation', buildingId: null, level });
  }

  for (const b of state.buildings) {
    const spec = BUILDINGS[b.type];
    if (effect.breakDays > 0 && spec.stormBreakable && !isSheltered(state, b.r, b.c)) {
      b.brokenDays += effect.breakDays;
      events.push({ type: 'broken', buildingId: b.id, building: b.type, days: effect.breakDays, daysLeft: b.brokenDays });
    }
    if (effect.damageDays > 0 && spec.stormDamageable && !isSheltered(state, b.r, b.c)) {
      b.damagedDays += effect.damageDays;
      events.push({ type: 'damaged', buildingId: b.id, building: b.type, days: effect.damageDays, daysLeft: b.damagedDays });
    }
  }
  return { events, healthLost };
}
