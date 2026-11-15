// HTML for the report and the small screens reached from Home: sources, past reports, settings.
// Built only from strings.en.json and the data files. Buttons carry data-action for the controller.

import type { Chapter } from '../sim/index.ts';
import { sourceGroups, type SourceRow } from './content.ts';
import { dateRange, esc, replayLine } from './format.ts';
import { glossText } from './glossary.ts';
import type { ReportEntry, ReportView } from './report.ts';
import { t } from './strings.ts';
import { sourceLink } from './views.ts';

/** A full page, with a Back button at the top. */
export function pageHtml(title: string, body: string, backAction: string): string {
  return `<main class="page">
    <div class="page__inner">
      <div class="page__top"><button type="button" class="button button--small button--quiet" data-action="${backAction}">${esc(t('nav.back'))}</button></div>
      <h1 class="page__title">${esc(title)}</h1>
      ${body}
    </div>
    <div class="gloss-layer"></div>
  </main>`;
}

function sourceItem(row: SourceRow): string {
  return `<li class="source">${sourceLink(row)}<span class="source__used">${esc(t('sources.usedFor', { text: row.usedFor }))}</span></li>`;
}

/** "Where the data comes from" (SPEC 9.5): only used rows, in the two groups. */
export function sourcesBodyHtml(): string {
  const { listed, additional } = sourceGroups();
  const group = (title: string, rows: SourceRow[]) =>
    rows.length === 0 ? '' : `<h2 class="section__title">${esc(title)}</h2><ul class="sources">${rows.map(sourceItem).join('')}</ul>`;
  return `<p class="honesty">${esc(t('sources.honesty'))}</p>
    <p class="honesty">${esc(t('top.honesty'))}</p>
    ${group(t('sources.listed'), listed)}
    ${group(t('sources.additional'), additional)}`;
}

/** The sources screen over the play screen. */
export function sourcesModalHtml(): string {
  return `<div class="modal">
    <div class="modal__panel modal__panel--wide" role="dialog" aria-modal="true" aria-labelledby="sources-title">
      <h2 id="sources-title" class="modal__title">${esc(t('sources.title'))}</h2>
      ${sourcesBodyHtml()}
      <div class="modal__buttons"><button type="button" class="button" data-action="close-overlay">${esc(t('nav.back'))}</button></div>
    </div>
  </div>`;
}

export function reportsListHtml(entries: { entry: ReportEntry; chapter: Chapter }[]): string {
  const items = entries
    .map(({ entry, chapter }, i) => {
      const bits = [dateRange(entry.dates.first, entry.dates.last), t('report.sols', { first: entry.sols.first, last: entry.sols.last })];
      if (entry.replay > 1) bits.push(replayLine(chapter, entry.replay));
      if (entry.partial) bits.push(t('report.stoppedEarly'));
      return `<li><button type="button" class="reportitem" data-action="open-report" data-index="${i}">
        <span class="reportitem__title">${esc(chapter.title)}</span>
        <span class="reportitem__line">${esc(bits.join(t('report.sep')))}</span>
      </button></li>`;
    })
    .reverse()
    .join('');
  return `<ul class="reportlist">${items}</ul>`;
}

export function settingsBodyHtml(hasOutpost: boolean, confirm: boolean, cleared: boolean): string {
  if (cleared) return `<p role="status">${esc(t('settings.cleared'))}</p>`;
  if (!hasOutpost) return `<p>${esc(t('settings.none'))}</p>`;
  if (confirm) {
    return `<div class="confirm" role="group" aria-label="${esc(t('settings.startOver'))}">
      <p class="confirm__ask">${esc(t('settings.ask'))}</p>
      <div class="modal__buttons">
        <button type="button" class="button button--danger" data-action="start-over-yes">${esc(t('settings.yes'))}</button>
        <button type="button" class="button button--quiet" data-action="start-over-no">${esc(t('confirm.back'))}</button>
      </div>
    </div>`;
  }
  return `<div class="modal__buttons"><button type="button" class="button button--quiet" data-action="start-over">${esc(t('settings.startOver'))}</button></div>`;
}

// ---- The report (SPEC 10.7) ----

export type ReportMode =
  | { kind: 'chapter'; next: string; confirm: boolean }
  | { kind: 'lost' }
  | { kind: 'past' };

function list(items: string[]): string {
  return `<ul class="report__list">${items.map((s) => `<li>${glossText(s)}</li>`).join('')}</ul>`;
}

/** The report's contents, in the order of SPEC 10.7. */
export function reportBodyHtml(view: ReportView): string {
  const rows = view.rows
    .map(
      (r) => `<li class="tl">
        <h3 class="tl__date">${esc(r.date)}</h3>
        <div class="tl__cols">
          <section class="tl__col tl__col--nasa">
            <h4 class="tl__label">${esc(t('report.nasaCol'))}</h4>
            <p>${glossText(r.nasa)}</p>
            <p class="tl__src">${esc(t('card.sources'))} ${r.sources.map(sourceLink).join(t('list.separator'))}</p>
          </section>
          <section class="tl__col tl__col--base">
            <h4 class="tl__label">${esc(t('report.baseCol'))}</h4>
            <p class="tl__sol">${esc(r.baseTitle)}</p>
            ${list(r.base)}
          </section>
        </div>
      </li>`,
    )
    .join('');
  const grew = view.grew.map((g) => `<div class="grew__item"><dt>${esc(g.label)}</dt><dd>${esc(g.value)}</dd></div>`).join('');
  const traded = view.traded.length > 0 ? `<h3 class="section__title">${esc(t('report.tradedTitle'))}</h3>${list(view.traded)}` : '';
  const sources = view.sources.map((s) => `<li class="source">${sourceLink(s)}</li>`).join('');
  return `<header class="report__head">
      <h2 id="report-title" class="report__title">${esc(t('report.title'))}</h2>
      <p class="report__period">${esc(view.period)}</p>
      ${view.replay ? `<p class="report__replay">${esc(view.replay)}</p>` : ''}
      ${view.partial ? `<p class="report__partial">${esc(view.partial)}</p>` : ''}
    </header>
    ${view.emptyTimeline ? `<p>${esc(view.emptyTimeline)}</p>` : `<ol class="timeline">${rows}</ol>`}
    <h3 class="section__title">${esc(t('report.grewTitle'))}</h3>
    <dl class="grew">${grew}</dl>
    ${traded}
    <div class="realbox">
      <section class="realbox__half"><h3 class="section__title">${esc(t('report.realTitle'))}</h3>${list(view.real)}</section>
      <section class="realbox__half"><h3 class="section__title">${esc(t('report.simplifiedTitle'))}</h3>${list(view.simplified)}</section>
    </div>
    <h3 class="section__title">${esc(t('report.sourcesTitle'))}</h3>
    <ul class="sources">${sources}</ul>`;
}

function actionsHtml(mode: ReportMode): string {
  if (mode.kind === 'lost') {
    return `<div class="report__actions"><button type="button" class="button" data-action="lost-report-back">${esc(t('nav.back'))}</button></div>`;
  }
  if (mode.kind === 'past') return '';
  const confirm = mode.confirm
    ? `<div class="confirm" role="group" aria-label="${esc(t('report.newSite'))}">
        <p class="confirm__ask">${esc(t('report.newSiteAsk'))}</p>
        <div class="modal__buttons">
          <button type="button" class="button button--small button--danger" data-action="report-new-site-yes">${esc(t('confirm.newSiteYes'))}</button>
          <button type="button" class="button button--small button--quiet" data-action="report-new-site-no">${esc(t('confirm.back'))}</button>
        </div>
      </div>`
    : '';
  return `<div class="report__actions">
      ${confirm}
      <div class="report__main">
        <button type="button" class="button" data-action="keep-building">${esc(t('report.keep'))}</button>
        ${mode.confirm ? '' : `<button type="button" class="button button--quiet" data-action="report-new-site">${esc(t('report.newSite'))}</button>`}
      </div>
      <p class="report__next">${esc(mode.next)}</p>
    </div>`;
}

/** The report over the play screen: at a chapter end, or for the days a stopped run played. */
export function reportModalHtml(view: ReportView, mode: ReportMode): string {
  return `<div class="modal modal--report">
    <div class="modal__panel report" role="dialog" aria-modal="true" aria-labelledby="report-title">
      ${reportBodyHtml(view)}
      ${actionsHtml(mode)}
    </div>
  </div>`;
}
