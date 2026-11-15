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
} from '../sim/index.ts';
import type { McMessage, Mood } from './advice.ts';
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
    <span class="date__line">${esc(t('top.honesty'))}</span>
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
  const line = have ? `${have} ${goalReward(goal)}` : goalReward(goal);
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

export function realCardHtml(card: Card, sources: SourceRow[]): string {
  return `<aside class="realcard" aria-labelledby="realcard-title">
    <div class="realcard__body">
      <p class="realcard__head"><b id="realcard-title" class="realcard__title">${esc(t('card.title'))}</b> <span class="realcard__date">${esc(longDate(card.date))}</span></p>
      <p class="realcard__text">${glossText(card.text)}</p>
      <p class="realcard__src">${esc(t('card.sources'))} ${sources.map(sourceLink).join(t('list.separator'))}</p>
    </div>
    <button type="button" class="notice__close" data-action="close-card" aria-label="${esc(t('notice.close'))}">×</button>
  </aside>`;
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

export function weatherHtml(today: ChapterDay | null, tomorrow: ChapterDay | null, compact: boolean): string {
  if (!today) return '';
  const tiles =
    tileHtml(t('weather.today'), weatherTile(today, false), compact) +
    (tomorrow ? tileHtml(t('weather.tomorrow'), weatherTile(tomorrow, true), compact) : endTileHtml());
  if (compact) return `<div class="wx-row">${tiles}</div>`;
  return `<h2 class="panel__title">${esc(t('weather.title'))}</h2>
    <div class="wx-row">${tiles}</div>
    <p class="panel__note">${esc(t('weather.source', { dates: datePair(today.date, tomorrow ? tomorrow.date : null) }))}</p>`;
}

// ---- Build ----

export function countsHtml(state: GameState): string {
  return `<span class="count">${icon('icon_parts', 'count__icon')}<span>${esc(t('count.parts'))}</span> <b>${state.parts}</b></span>
    <span class="count">${icon('icon_soil', 'count__icon')}<span>${esc(t('count.soil'))}</span> <b>${state.soil}</b></span>
    <span class="count">${icon('icon_water', 'count__icon')}<span>${esc(t('count.water'))}</span> <b>${state.water}</b></span>`;
}

export function buildHtml(state: GameState, selected: PlaceableType | null, hintType: PlaceableType | null, disabled: boolean): string {
  const buttons = BUILD_MENU.map((type) => {
    const unlocked = isUnlocked(state, type);
    const cost = costOf(type);
    const costIcon = cost.soil > 0 ? 'icon_soil' : 'icon_parts';
    const costNum = cost.soil > 0 ? cost.soil : cost.parts;
    const goalN = unlockGoalNumber(type);
    const lockLine = !unlocked && goalN !== null ? `<span class="bb__lock">${esc(t('build.lockedAfter', { n: goalN }))}</span>` : '';
    const classes = ['bb', selected === type ? 'is-selected' : '', unlocked ? '' : 'is-locked', hintType === type ? 'is-hint' : ''].filter(Boolean).join(' ');
    const hint = hintType === type ? `<span class="bb__hint">${esc(t('hint.start'))}</span>` : '';
    return `<button type="button" class="${classes}" data-action="select" data-type="${type}" aria-pressed="${selected === type}"${disabled ? ' disabled' : ''}>
      ${hint}
      <img class="bb__img" src="${ART}${ART_FILE[type]}.png" alt="" aria-hidden="true">
      <span class="bb__name">${esc(buildingName(type))}</span>
      ${unlocked ? `<span class="bb__cost">${icon(costIcon, 'bb__costicon')}<span>${costNum}</span></span>` : lockLine}
    </button>`;
  }).join('');
  const about = selected
    ? `<p class="build__about"><b>${esc(buildingName(selected))}.</b> ${glossText(buildingAbout(selected))}
        <button type="button" class="link" data-action="cancel">${esc(t('build.cancel'))}</button></p>`
    : `<p class="build__about build__about--idle">${esc(t('build.howTo'))}</p>`;
  return `<div class="build__head">
      <h2 class="panel__title">${esc(t('build.title'))}</h2>
      <div class="counts counts--head">${countsHtml(state)}</div>
    </div>
    <div class="build__grid" data-part="buildgrid">${buttons}</div>
    ${about}`;
}

export function endRowHtml(state: GameState, disabled: boolean): string {
  return `<div class="counts counts--row">${countsHtml(state)}</div>
    <button type="button" class="button endday" data-action="end-day"${disabled ? ' disabled' : ''}>${esc(t('endDay.button'))}</button>`;
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
