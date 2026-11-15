// HTML for each part of the play screen. Each function returns a string built only from
// strings.en.json, the chapter file and numbers. Buttons carry data-action for the controller.

import {
  config,
  currentGoal,
  isGoalDone,
  isUnlocked,
  type Chapter,
  type ChapterDay,
  type DayPreview,
  type GameState,
  type PlaceableType,
  type Run,
  storageLimit,
} from '../sim/index.ts';
import type { McMessage, Mood, NextAction } from './advice.ts';
import type { RecordView, TimelineCell } from './record.ts';
import type { SummaryIcon, SummaryLine } from './summary.ts';
import type { Card, SourceRow } from './content.ts';
import type { ChainPanel } from './failureChain.ts';
import { changeLine, chapterRange, datePair, esc, longDate, replayLine, shortDate } from './format.ts';
import { glossText } from './glossary.ts';
import {
  ART_FILE,
  BUILD_MENU,
  airLevel,
  buildingAbout,
  buildingName,
  costOf,
  foodLevel,
  goalHave,
  goalReward,
  goalText,
  powerLevel,
  stageView,
  unlockGoalNumber,
  weatherTile,
  type MeterLevel,
  type WeatherTile,
} from './info.ts';
import { t, type StringKey } from './strings.ts';

const ART = import.meta.env.BASE_URL + 'assets/art/';

export function icon(name: string, cls = 'icon'): string {
  return `<img class="${cls}" src="${ART}${name}.png" alt="" aria-hidden="true">`;
}

/** The calm-day fallback icon (SPEC 11.1): a simple sun and sky. */
const CALM_ICON =
  '<svg class="icon" viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="14" fill="#5b8fc9"/>' +
  '<circle cx="32" cy="32" r="13" fill="#ffd166"/><g stroke="#ffd166" stroke-width="4" stroke-linecap="round">' +
  '<path d="M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4 4M45 45l4 4M15 49l4-4M45 19l4-4"/></g></svg>';

/** The sources button: a circled "i", as in the Mars mockup. */
/** The sound button: a speaker with waves when on, crossed out when off (shape, not only colour). */
const SPEAKER_ON =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/>' +
  '<path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SPEAKER_OFF =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/>' +
  '<path d="M15.5 9.5l5 5M20.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

/** The mute button, in the top bar and in Settings (SPEC 10.2, 11.3). */
export function muteButtonHtml(muted: boolean): string {
  return `<button type="button" class="iconbtn${muted ? ' is-muted' : ''}" data-action="toggle-mute" aria-pressed="${muted}" aria-label="${esc(t('sound.mute'))}" title="${esc(t(muted ? 'sound.turnOn' : 'sound.turnOff'))}">${muted ? SPEAKER_OFF : SPEAKER_ON}</button>`;
}

const INFO_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>' +
  '<path d="M12 10.5v6.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="7.2" r="1.5" fill="currentColor"/></svg>';

// ---- Top bar ----

export interface DateView {
  sol: number;
  chapterDay: number;
}

/** The day to show. While the chapter-end panel is open the counters sit one day past the chapter. */
export function shownDay(run: Run, chapter: Chapter): DateView {
  const last = chapter.days.length;
  if (run.chapterDay <= last) return { sol: run.state.day, chapterDay: run.chapterDay };
  return { sol: run.state.day - (run.chapterDay - last), chapterDay: last };
}

function levelClass(level: MeterLevel): string {
  return level === 'ok' ? '' : ` is-${level}`;
}

function levelTag(level: MeterLevel, warnKey: 'meter.low' | 'meter.short', dangerKey: 'meter.veryLow' | 'meter.short'): string {
  if (level === 'ok') return '';
  const text = t(level === 'danger' ? dangerKey : warnKey);
  return `<span class="tag"><span class="tag__mark" aria-hidden="true">!</span><span class="tag__word">${esc(text)}</span></span>`;
}

function meter(name: string, iconName: string, label: string, value: number, lineHtml: string, level: MeterLevel, tag: string): string {
  // The number and its warning mark share one row, so the mark never covers the number.
  const line = lineHtml ? `<span class="meter__line">${lineHtml}</span>` : '';
  return `<div class="meter meter--${name}${levelClass(level)}">
    ${icon(iconName, 'meter__icon')}
    <div class="meter__body">
      <span class="meter__label">${esc(label)}</span>
      <span class="meter__row"><span class="meter__num">${value}</span>${tag}</span>
      ${line}
    </div>
  </div>`;
}

/** "+1 tomorrow". On phones the word is hidden visually, as in the phone mockup. */
function changeHtml(change: number): string {
  return `${esc(changeLine(change))} <span class="meter__word">${esc(t('meter.tomorrow'))}</span>`;
}

export function topBarHtml(run: Run, chapter: Chapter, preview: DayPreview, muted = false): string {
  const state = run.state;
  const day = shownDay(run, chapter);
  const date = chapter.days[day.chapterDay - 1]?.date ?? chapter.startDate;
  const power = powerLevel(preview, state.charge);
  const air = airLevel(state, preview.change.air);
  const food = foodLevel(state, preview.change.food);
  // After a lost run there is no tomorrow: no change line.
  const ended = state.lost !== null;
  const marks = Array.from({ length: config.UI.healthMarks }, (_, i) => `<span class="mark${i < state.health ? ' is-on' : ''}"></span>`).join('');
  const replay = run.replay > 1 ? `<span class="date__replay">${esc(replayLine(chapter, run.replay))}</span>` : '';
  return `
  <div class="brand">
    <img class="brand__logo" src="${ART}logo.png" alt="${esc(t('home.logoAlt'))}">
    <div class="brand__text">
      <span class="brand__name">${esc(t('home.title'))}</span>
      <span class="brand__site">${esc(t('top.site', { n: run.siteNumber }))}</span>
    </div>
  </div>
  <div class="tools">
    ${muteButtonHtml(muted)}
    <button type="button" class="iconbtn" data-action="open-sources" aria-label="${esc(t('top.sources'))}" title="${esc(t('top.sources'))}">${INFO_ICON}</button>
  </div>
  <div class="date">
    <span class="date__main"><b class="date__sol">${glossText(t('top.sol', { n: day.sol }))}</b> · <span class="date__real">${esc(shortDate(date))}</span></span>
    <span class="date__line">${esc(t('top.chapterDay', { n: day.chapterDay, total: chapter.days.length }))}</span>
    <span class="date__line date__honesty">${esc(t('top.honesty'))}</span>
    ${replay}
  </div>
  <div class="meters">
    ${meter('power', 'icon_power', t('meter.power'), preview.power.supply, esc(t('meter.needs', { n: preview.power.demand })), power, levelTag(power, 'meter.short', 'meter.short'))}
    ${meter('air', 'icon_air', t('meter.air'), state.air, ended ? '' : changeHtml(preview.change.air), air, levelTag(air, 'meter.low', 'meter.veryLow'))}
    ${meter('food', 'icon_food', t('meter.food'), state.food, ended ? '' : changeHtml(preview.change.food), food, levelTag(food, 'meter.low', 'meter.veryLow'))}
  </div>
  <div class="health" role="img" aria-label="${esc(t('top.healthAria', { n: state.health, max: config.UI.healthMarks, crew: state.crew }))}">
    <span class="health__label">${esc(t('top.health', { crew: state.crew }))}</span>
    <span class="health__marks">${marks}</span>
  </div>`;
}

// ---- Goal card ----

export function goalCardHtml(state: GameState): string {
  const goal = currentGoal(state);
  const done = isGoalDone(state, goal);
  const pct = Math.round((Math.min(goal.progress, goal.target) / Math.max(1, goal.target)) * 100);
  const status = done ? t('goal.ready') : t('goal.progress', { n: goal.progress, target: goal.target });
  const have = goalHave(goal, state);
  const line = have ? `${have} ${goalReward(goal, state)}` : goalReward(goal, state);
  return `<div class="goal">
    <span class="goal__top"><span class="goal__label">${esc(t('goal.label'))}</span><span class="goal__status">${esc(status)}</span></span>
    <span class="goal__text">${esc(goalText(goal))}</span>
    <span class="goal__bar" role="progressbar" aria-valuemin="0" aria-valuemax="${goal.target}" aria-valuenow="${goal.progress}"><span style="width:${pct}%"></span></span>
    <span class="goal__line">${esc(line)}</span>
  </div>`;
}

// ---- "This was real" card (SPEC 8.1) ----

/** External links open in a new tab and never pass on the page. */
export function sourceLink(row: SourceRow): string {
  return `<a class="extlink" href="${esc(row.url)}" target="_blank" rel="noopener noreferrer">${esc(row.name)}<span class="sr-only"> ${esc(t('link.newTab'))}</span></a>`;
}

/**
 * The "This was real" card (SPEC 8.1, 16.4.4): the real date large, the card text exactly as in
 * cards.json, its sources, and apart from it, one line about the player's own base that game day.
 */
export function realCardBodyHtml(card: Card, sources: SourceRow[], base: { title: string; line: string } | null): string {
  const baseHtml = base
    ? `<div class="realcard__base"><span class="realcard__baselabel">${esc(base.title)}</span><p>${glossText(base.line)}</p></div>`
    : '';
  return `<div class="realcard">
      <p class="realcard__date">${esc(longDate(card.date))}</p>
      <p class="realcard__text">${glossText(card.text)}</p>
      <p class="realcard__src">${esc(t('card.sources'))} ${sources.map(sourceLink).join(t('list.separator'))}</p>
    </div>${baseHtml}`;
}

// ---- Space weather ----

function tileHtml(label: string, tile: WeatherTile, compact: boolean): string {
  const img = tile.icon === 'calm' ? CALM_ICON : icon('icon_storm');
  const line = tile.line && !compact ? `<span class="wx__line">${glossText(tile.line)}</span>` : '';
  return `<div class="wx${tile.danger ? ' is-danger' : ''}">
    ${img}
    <div class="wx__body">
      <span class="wx__when">${esc(label)}</span>
      <span class="wx__name">${tile.danger ? '<span class="tag__mark" aria-hidden="true">!</span>' : ''}${glossText(tile.name)}</span>
      ${line}
    </div>
  </div>`;
}

function endTileHtml(): string {
  return `<div class="wx wx--end">
    <div class="wx__body">
      <span class="wx__when">${esc(t('weather.tomorrow'))}</span>
      <span class="wx__name">${esc(t('weather.end'))}</span>
    </div>
  </div>`;
}

export function weatherHtml(today: ChapterDay | null, tomorrow: ChapterDay | null, compact: boolean, chapterDay = 1): string {
  if (!today) return '';
  const tiles =
    tileHtml(t('weather.today'), weatherTile(today, false), compact) +
    (tomorrow ? tileHtml(t('weather.tomorrow'), weatherTile(tomorrow, true), compact) : endTileHtml());
  if (compact) return `<div class="wx-row">${tiles}</div>`;
  return `<h2 class="panel__title">${esc(t('weather.title'))}</h2>
    <div class="wx-row">${tiles}</div>
    <button type="button" class="panel__note panel__note--btn" data-action="open-record" data-day="${chapterDay}">${esc(t('weather.source', { dates: datePair(today.date, tomorrow ? tomorrow.date : null) }))}</button>`;
}

// ---- Build ----

/** One stock with its store limit ("Parts 12 of 20"), marked full in words and colour when no more fits. */
function storedCount(state: GameState, res: 'parts' | 'soil', iconName: string, label: string): string {
  const limit = storageLimit(state, res);
  const full = state[res] >= limit;
  const tag = full ? ` <span class="count__full">${esc(t('count.full'))}</span>` : '';
  return `<span class="count${full ? ' is-full' : ''}" aria-label="${esc(t('count.ofAria', { name: label, n: state[res], max: limit }))}${full ? ` ${esc(t('count.full'))}` : ''}">${icon(iconName, 'count__icon')}<span aria-hidden="true">${esc(label)}</span> <b aria-hidden="true">${state[res]}</b><span class="count__max" aria-hidden="true">${esc(t('count.of', { max: limit }))}</span>${tag}</span>`;
}

export function countsHtml(state: GameState): string {
  return `${storedCount(state, 'parts', 'icon_parts', t('count.parts'))}
    ${storedCount(state, 'soil', 'icon_soil', t('count.soil'))}
    <span class="count">${icon('icon_water', 'count__icon')}<span>${esc(t('count.water'))}</span> <b>${state.water}</b></span>`;
}

/** The amber ring that marks the control to use next (SPEC 16.4.2). Also named in words for screen readers. */
function nextMark(): string {
  return `<span class="sr-only"> (${esc(t('next.label'))})</span>`;
}

export function buildHtml(state: GameState, selected: PlaceableType | null, nextType: PlaceableType | null, disabled: boolean): string {
  const buttons = BUILD_MENU.map((type) => {
    const unlocked = isUnlocked(state, type);
    const cost = costOf(type);
    const costIcon = cost.soil > 0 ? 'icon_soil' : 'icon_parts';
    const costNum = cost.soil > 0 ? cost.soil : cost.parts;
    const goalN = unlockGoalNumber(type);
    const lockLine = !unlocked && goalN !== null ? `<span class="bb__lock">${esc(t('build.lockedAfter', { n: goalN }))}</span>` : '';
    const classes = ['bb', selected === type ? 'is-selected' : '', unlocked ? '' : 'is-locked', nextType === type ? 'is-next' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${classes}" data-action="select" data-type="${type}" aria-pressed="${selected === type}"${disabled ? ' disabled' : ''}>
      <img class="bb__img" src="${ART}${ART_FILE[type]}.png" alt="" aria-hidden="true">
      <span class="bb__text">
        <span class="bb__name">${esc(buildingName(type))}</span>
        ${unlocked ? `<span class="bb__cost">${icon(costIcon, 'bb__costicon')}<span>${costNum}</span></span>` : lockLine}
      </span>${nextType === type ? nextMark() : ''}
    </button>`;
  }).join('');
  const about = selected
    ? `<p class="build__about"><b>${esc(buildingName(selected))}.</b> ${glossText(buildingAbout(selected))}</p>`
    : `<p class="build__about build__about--idle">${esc(t('build.howTo'))}</p>`;
  return `<div class="build__head">
      <h2 class="panel__title">${esc(t('build.title'))}</h2>
      <div class="counts counts--head">${countsHtml(state)}</div>
    </div>
    <div class="build__grid" data-part="buildgrid">${buttons}</div>
    ${about}`;
}

export function endRowHtml(state: GameState, disabled: boolean, isNext = false): string {
  return `<div class="counts counts--row">${countsHtml(state)}</div>
    <button type="button" class="button endday${isNext ? ' is-next' : ''}" data-action="end-day"${disabled ? ' disabled' : ''}>${esc(t('endDay.button'))}${isNext ? nextMark() : ''}</button>`;
}

// ---- Goal bar (SPEC 16.4.1): one line; tap opens the full goal card ----

export function goalBarHtml(state: GameState, disabled: boolean): string {
  const goal = currentGoal(state);
  const done = isGoalDone(state, goal);
  const pct = Math.round((Math.min(goal.progress, goal.target) / Math.max(1, goal.target)) * 100);
  const status = done ? t('goal.ready') : t('goal.progress', { n: goal.progress, target: goal.target });
  const have = goalHave(goal, state);
  const line = have ? `${have} ${goalReward(goal, state)}` : goalReward(goal, state);
  return `<button type="button" class="goalbar goal${done ? ' is-done' : ''}" data-action="open-goal" aria-label="${esc(t('goalbar.open'))}: ${esc(goalText(goal))} ${esc(status)}"${disabled ? ' disabled' : ''}>
    <span class="goal__top">
      <span class="goalbar__label goal__label"><span class="narrow-only">${esc(t('goalbar.label'))}</span><span class="wide-only">${esc(t('goal.label'))}</span></span>
      <span class="goalbar__status goal__status">${esc(status)}</span>
    </span>
    <span class="goalbar__text goal__text">${esc(goalText(goal))}</span>
    <span class="goalbar__bar goal__bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
    <span class="goal__line wide-only">${esc(line)}</span>
    ${stageLineHtml(state)}
  </button>`;
}

/** "Stage 2 of 6 · Small base" and a small bar toward the next stage (SPEC 18.2 point 3). */
export function stageLineHtml(state: GameState): string {
  const v = stageView(state);
  const name = t('stage.line', { n: v.n, total: v.total, name: v.name });
  const pct = v.next ? Math.round(v.next.share * 100) : 100;
  const next = v.next ? t('stage.nextShort', { name: v.next.name, pct }) : t('stage.freePlay');
  return `<span class="stage" role="img" aria-label="${esc(`${name}. ${next}`)}">
      <span class="stage__name" aria-hidden="true">${esc(name)}</span>
      <span class="stage__bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
      <span class="stage__next" aria-hidden="true">${esc(next)}</span>
    </span>`;
}

/** The stage section of the goal sheet: where the outpost is and exactly what the next stage needs. */
export function stageSheetHtml(state: GameState): string {
  const v = stageView(state);
  const head = `<h3 class="sheet__cardtitle">${esc(t('stage.line', { n: v.n, total: v.total, name: v.name }))}</h3>`;
  if (!v.next) return `<section class="stagebox">${head}<p>${esc(t('stage.freePlayLong'))}</p></section>`;
  const pct = Math.round(v.next.share * 100);
  return `<section class="stagebox">${head}
      <p>${esc(t('stage.needs', { name: v.next.name }))}</p>
      <ul class="stagebox__list">
        <li>${esc(t('stage.needGoals', { have: v.next.goals.have, need: v.next.goals.need }))}</li>
        <li>${esc(t('stage.needCrew', { have: v.next.crew.have, need: v.next.crew.need }))}</li>
      </ul>
      <span class="stage__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(t('stage.nextShort', { name: v.next.name, pct }))}"><span style="width:${pct}%"></span></span>
      <p class="panel__note">${esc(t('stage.gift'))}</p>
    </section>`;
}

// ---- The NASA record strip and the real timeline (SPEC 16.4.4) ----

/** The strip under the goal bar: the real record of today, apart from the game's storm. */
export function recordStripHtml(rec: RecordView, disabled: boolean): string {
  const storm = rec.storm ? `<span class="record__game"><span class="record__tag record__tag--game">${esc(t('record.gameTag'))}</span> ${esc(rec.storm)}</span>` : '';
  return `<button type="button" class="record" data-action="open-record" data-day="${rec.chapterDay}" aria-label="${esc(rec.title)}. ${esc(rec.text)} ${esc(t('record.open'))}"${disabled ? ' disabled' : ''}>
    <span class="record__title"><span class="record__tag">${esc(t('record.realTag'))}</span> ${esc(rec.title)}</span>
    <span class="record__text">${esc(rec.text)}</span>
    ${storm}
    <span class="record__more" aria-hidden="true">›</span>
  </button>`;
}

export function timelineHtml(cells: TimelineCell[], selectedDay: number | null): string {
  const items = cells
    .map((c) => {
      const date = shortDate(c.date);
      const d = Number(c.date.slice(8, 10));
      const tag = c.state === 'today' ? t('timeline.today') : c.state === 'tomorrow' ? t('timeline.tomorrow') : '';
      const cls = `tlc tlc--${c.state} tlc--${c.mark}${selectedDay === c.chapterDay ? ' is-selected' : ''}`;
      const mark = c.mark === 'storm' ? icon('icon_storm', 'tlc__icon') : `<span class="tlc__dot" aria-hidden="true"></span>`;
      const inner = `<span class="tlc__day">${d}</span>${mark}<span class="tlc__word">${esc(c.word)}</span>`;
      if (c.open) {
        const aria = c.mark === 'none' ? t('timeline.ariaNone', { date }) : t('timeline.ariaPast', { date, word: c.word });
        return `<li><button type="button" class="${cls}" data-action="open-day" data-day="${c.chapterDay}" aria-label="${esc(tag ? `${tag}, ${aria}` : aria)}"${selectedDay === c.chapterDay ? ' aria-current="true"' : ''}>${inner}</button></li>`;
      }
      const aria = c.state === 'tomorrow' ? t('timeline.ariaTomorrow', { date, word: c.word }) : t('timeline.ariaHidden', { date });
      return `<li><span class="${cls}" role="img" aria-label="${esc(aria)}">${inner}</span></li>`;
    })
    .join('');
  return `<h2 class="panel__title">${esc(t('timeline.title'))}</h2>
    <ol class="timeline-row">${items}</ol>
    <p class="panel__note">${esc(t('timeline.note'))}</p>`;
}

/** The sheet that opens from the record strip or a timeline day. */
export function recordSheetHtml(rec: RecordView, source: SourceRow | null, cells: TimelineCell[], dayLine: string): string {
  const storm = rec.storm ? `<p class="sheet__game"><span class="record__tag record__tag--game">${esc(t('record.gameTag'))}</span> ${esc(rec.storm)}</p>` : '';
  const notes = rec.notes ? `<p class="sheet__notes">${esc(rec.notes)}</p>` : '';
  const src = source ? `<p class="sheet__src">${esc(t('record.source'))} ${sourceLink(source)}</p>` : '';
  const card = rec.card
    ? `<section class="sheet__card"><h3 class="sheet__cardtitle">${esc(t('record.card'))}</h3><p>${glossText(rec.card.card.text)}</p>
        <p class="realcard__src">${esc(t('card.sources'))} ${rec.card.sources.map(sourceLink).join(t('list.separator'))}</p></section>`
    : '';
  return `<div class="modal modal--sheet">
    <div class="modal__panel sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet__head">
        <h2 id="sheet-title" class="modal__title"><span class="record__tag">${esc(t('record.realTag'))}</span> ${esc(rec.title)}</h2>
        <button type="button" class="notice__close" data-action="close-overlay" aria-label="${esc(t('sheet.close'))}">×</button>
      </div>
      <p class="sheet__text">${glossText(rec.text)}</p>
      <p class="sheet__small">${esc(t('record.timesNote'))}</p>
      ${notes}
      ${src}
      ${storm}
      ${card}
      <section class="sheet__timeline">${timelineHtml(cells, rec.chapterDay)}<p class="panel__note">${esc(dayLine)}</p></section>
      <div class="modal__buttons">
        <button type="button" class="button button--small" data-action="close-overlay">${esc(t('sheet.close'))}</button>
        <button type="button" class="button button--small button--quiet" data-action="open-sources">${esc(t('record.allSources'))}</button>
      </div>
    </div>
  </div>`;
}

export function goalSheetHtml(state: GameState): string {
  return `<div class="modal modal--sheet">
    <div class="modal__panel sheet" role="dialog" aria-modal="true" aria-label="${esc(t('goal.label'))}">
      ${goalCardHtml(state)}
      ${stageSheetHtml(state)}
      <div class="modal__buttons"><button type="button" class="button button--small" data-action="close-overlay">${esc(t('sheet.close'))}</button></div>
    </div>
  </div>`;
}

// ---- The message area (SPEC 16.4.1): one item at a time ----

const SUMMARY_ICON: Record<SummaryIcon, string | null> = {
  storm: 'icon_storm',
  broken: 'icon_broken',
  no_power: 'icon_no_power',
  air: 'icon_air',
  food: 'icon_food',
  parts: 'icon_parts',
  water: 'icon_water',
  soil: 'icon_soil',
  power: 'icon_power',
  mark: null,
};

export function summaryBodyHtml(lines: SummaryLine[]): string {
  const items = lines
    .map((l) => {
      const img = SUMMARY_ICON[l.icon];
      return `<li class="daysum__line">${img ? icon(img, 'daysum__icon') : '<span class="daysum__dot" aria-hidden="true"></span>'}<span>${glossText(l.text)}</span></li>`;
    })
    .join('');
  return `<ul class="daysum">${items}</ul>`;
}

/** The head of a queue item: its title, "1 of 3" while more wait, and Next. */
export function msgHeadHtml(title: string, pos: { n: number; total: number }, nextKey: StringKey | null, disabled: boolean): string {
  const count = pos.total > 1 && pos.n < pos.total ? `<span class="msg__count">${esc(t('msg.count', pos))}</span>` : '';
  const next = nextKey ? `<button type="button" class="button button--small msg__next" data-action="msg-next"${disabled ? ' disabled' : ''}>${esc(t(nextKey))}</button>` : '';
  return `<div class="msg__head"><span class="msg__title">${esc(title)}</span>${count}${next}</div>`;
}

/** The last item of the queue: the predict question or Mission Control's message. */
export function missionControlItemHtml(msg: McMessage, disabled: boolean): string {
  return `<div class="msg__item msg__item--mc mc">${missionControlHtml(msg, disabled)}</div>`;
}

export function stepsHtml(done: [boolean, boolean, boolean]): string {
  const current = done.indexOf(false);
  const keys: StringKey[] = ['steps.1', 'steps.2', 'steps.3'];
  const items = keys
    .map((k, i) => {
      const state = done[i] ? 'is-done' : i === current ? 'is-now' : '';
      const word = done[i] ? t('steps.done') : i === current ? t('steps.now') : '';
      return `<li class="steps__step ${state}"><span class="steps__num" aria-hidden="true">${done[i] ? '✓' : i + 1}</span>${esc(t(k))}${word ? `<span class="sr-only"> (${esc(word)})</span>` : ''}</li>`;
    })
    .join('');
  return `<ol class="steps" aria-label="${esc(t('steps.label'))}">${items}</ol>`;
}

/** The fixed "Do this now" line, with Cancel while a building is picked. */
export function nextLineHtml(next: NextAction | null, flash: { text: string; tone: 'info' | 'warn' } | null): string {
  const flashHtml = flash ? `<p class="flash flash--${flash.tone}" role="status">${glossText(flash.text)}</p>` : '';
  if (!next) return flashHtml;
  const cancel = next.cancel ? `<button type="button" class="button button--small button--quiet donow__cancel" data-action="cancel">${esc(t('build.cancel'))}</button>` : '';
  const rowCls = next.cancel ? 'donow__row donow__row--active' : 'donow__row donow__row--idle';
  return `${flashHtml}<div class="${rowCls}"><p class="donow__line"><span class="donow__label">${esc(t('next.label'))}</span> <span class="donow__text">${glossText(next.text)}</span></p>${cancel}</div>`;
}

// ---- Mission Control ----

const MOOD_KEY: Record<Mood, StringKey> = { calm: 'mc.mood.calm', worried: 'mc.mood.worried', cheering: 'mc.mood.cheering' };

export function missionControlHtml(msg: McMessage, disabled: boolean): string {
  const dis = disabled ? ' disabled' : '';
  const answers = msg.question
    ? `<div class="mc__answers">
        <button type="button" class="button button--small button--quiet" data-action="predict" data-answer="fine"${dis}>${esc(t('predict.fine'))}</button>
        <button type="button" class="button button--small button--quiet" data-action="predict" data-answer="break"${dis}>${esc(t('predict.break'))}</button>
        <button type="button" class="link" data-action="predict" data-answer="skip"${dis}>${esc(t('predict.skip'))}</button>
      </div>`
    : '';
  return `<div class="mc__portrait mc__portrait--${msg.mood}" style="background-image:url('${ART}mission_control.png')" role="img" aria-label="${esc(t(MOOD_KEY[msg.mood]))}"></div>
    <div class="mc__body">
      <span class="mc__from">${esc(t('mc.from', { n: config.UI.missionControlMinutes }))}</span>
      <p class="mc__text">${glossText(msg.text)}</p>
    </div>
    ${answers}`;
}

// ---- Overlays ----

export function titleCardHtml(chapter: Chapter, replay: number): string {
  const replayP = replay > 1 ? `<p class="title__replay">${esc(replayLine(chapter, replay))}</p>` : '';
  return `<div class="modal">
    <button type="button" class="modal__panel title" data-action="title-continue">
      <span class="title__name">${esc(chapter.title)}</span>
      <span class="title__dates">${esc(chapterRange(chapter))}</span>
      ${replayP}
      <span class="title__setup">${esc(chapter.setup)}</span>
      <span class="title__honesty">${esc(t('top.honesty'))}</span>
      <span class="title__tap">${esc(t('title.tap'))}</span>
    </button>
  </div>`;
}

const CHAIN_ICON: Record<ChainPanel['icon'], string> = {
  broken: 'icon_broken',
  no_power: 'icon_no_power',
  water: 'icon_water',
  storm: 'icon_storm',
  air: 'icon_air',
  food: 'icon_food',
  health: 'icon_storm',
};

export function lostHtml(chain: ChainPanel[]): string {
  const panels = chain
    .map((p, i) => `${i > 0 ? '<span class="chain__arrow" aria-hidden="true">↓</span>' : ''}
      <li class="chain__panel">${p.icon === 'health' ? '<span class="chain__health" aria-hidden="true">+</span>' : icon(CHAIN_ICON[p.icon], 'chain__icon')}<span>${esc(p.text)}</span></li>`)
    .join('');
  return `<div class="modal">
    <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="lost-title">
      <h2 id="lost-title" class="modal__title">${esc(t('lost.title'))}</h2>
      <ol class="chain">${panels}</ol>
      <p>${esc(t('lost.body'))}</p>
      <p><button type="button" class="link link--left" data-action="lost-report">${esc(t('lost.report'))}</button></p>
      <div class="modal__buttons">
        <button type="button" class="button" data-action="try-again">${esc(t('lost.tryAgain'))}</button>
        <button type="button" class="button button--quiet" data-action="new-site">${esc(t('lost.newSite'))}</button>
      </div>
    </div>
  </div>`;
}

export function confirmNewSiteHtml(): string {
  return `<div class="modal">
    <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h2 id="confirm-title" class="modal__title">${esc(t('confirm.newSiteTitle'))}</h2>
      <p>${esc(t('confirm.newSiteBody'))}</p>
      <div class="modal__buttons">
        <button type="button" class="button" data-action="new-site-yes">${esc(t('confirm.newSiteYes'))}</button>
        <button type="button" class="button button--quiet" data-action="new-site-no">${esc(t('confirm.back'))}</button>
      </div>
    </div>
  </div>`;
}
