// The outpost tools (SPEC 18.3 point 1): five buttons, each with its own icon and a one- or two-word
// name. Each opens a sheet with one short sentence about what it does and what it costs.

import { config, type GameState } from '../sim/index.ts';
import { esc } from './format.ts';
import { learningBodyHtml, notebookTotal } from './learning.ts';
import { t, type StringKey } from './strings.ts';

export type ToolKind = 'sound' | 'research' | 'notebook' | 'aid' | 'save' | 'load';

const ART = import.meta.env.BASE_URL + 'assets/art/';

const svg = (body: string) => `<svg class="toolbtn__icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

const ICON: Record<ToolKind, string> = {
  sound: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  research: `<img class="toolbtn__icon" src="${ART}icon_research.png" alt="" aria-hidden="true">`,
  notebook: svg('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  aid: svg('<rect x="3" y="6" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 6V4h6v2M12 10v6M9 13h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  save: svg('<path d="M5 3h11l3 3v15H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 3v5h7V3M8 21v-7h8v7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'),
  load: svg('<path d="M3 7h6l2 2h10v11H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 18v-6M9 14.5 12 11.5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
};

const NAME: Record<ToolKind, StringKey> = {
  sound: 'tool.sound',
  research: 'tool.research',
  notebook: 'tool.notebook',
  aid: 'tool.aid',
  save: 'tool.save',
  load: 'tool.load',
};

export const TOOL_KINDS: readonly ToolKind[] = ['sound', 'research', 'notebook', 'aid', 'save', 'load'];

/** The row of tool buttons. A small number shows research points and notebook pages. */
export function toolRowHtml(state: GameState, open: ToolKind | null, disabled: boolean): string {
  const extra: Partial<Record<ToolKind, string>> = {
    research: String(state.researchPoints ?? 0),
    notebook: `${(state.notebook ?? []).length}/${notebookTotal()}`,
  };
  return TOOL_KINDS.map((k) => {
    const badge = extra[k] ? `<span class="toolbtn__num" aria-hidden="true">${esc(extra[k]!)}</span>` : '';
    const aria = k === 'research' ? t('tool.researchAria', { n: state.researchPoints ?? 0 }) : t(NAME[k]);
    return `<button type="button" class="toolbtn${open === k ? ' is-open' : ''}" data-action="tool" data-tool="${k}" aria-label="${esc(aria)}" aria-expanded="${open === k}"${disabled ? ' disabled' : ''}>${ICON[k]}<span class="toolbtn__name" aria-hidden="true">${esc(t(NAME[k]))}</span>${badge}</button>`;
  }).join('');
}

/** One save slot as the Save and Load sheets show it. */
export interface SlotView {
  index: number;
  kind: 'empty' | 'damaged' | 'unavailable' | 'ok';
  /** "Site 4821 · Sol 70 · 14 Sep 2017 · Busy outpost · 10 crew" for a used slot. */
  line: string;
}

export interface ToolState {
  slots: SlotView[];
  /** A slot waiting for "yes": saving over it, or loading it. */
  confirm: { mode: 'save' | 'load'; index: number } | null;
  muted: boolean;
  musicOff: boolean;
  effectsOff: boolean;
  status: { text: string; tone: 'info' | 'warn' } | null;
}

function sheet(kind: ToolKind, about: string, body: string, status: ToolState['status']): string {
  const statusHtml = status ? `<p class="tools__status${status.tone === 'warn' ? ' tools__status--warn' : ''}" role="status">${esc(status.text)}</p>` : '';
  return `<div class="modal modal--sheet">
    <div class="modal__panel sheet toolsheet" role="dialog" aria-modal="true" aria-labelledby="tool-title">
      <div class="sheet__head">
        <h2 id="tool-title" class="modal__title">${ICON[kind]} ${esc(t(NAME[kind]))}</h2>
        <button type="button" class="notice__close" data-action="close-overlay" aria-label="${esc(t('sheet.close'))}">×</button>
      </div>
      <p class="tools__about">${esc(about)}</p>
      ${statusHtml}
      ${body}
    </div>
  </div>`;
}

/** The sheet for one tool. */
export function toolSheetHtml(kind: ToolKind, state: GameState, ts: ToolState): string {
  const L = config.LONG_RUN;
  if (kind === 'research' || kind === 'notebook') {
    // The research and notebook lists, under the tool's own sentence.
    const inner = learningBodyHtml(state, kind);
    return sheet(kind, t(kind === 'research' ? 'tool.researchAbout' : 'tool.notebookAbout'), `<div class="learning">${inner}</div>`, ts.status);
  }
  if (kind === 'sound') {
    const musicOn = !ts.muted && !ts.musicOff;
    const effectsOn = !ts.muted && !ts.effectsOff;
    const body = `<div class="tools__row">
        <button type="button" class="button button--small button--quiet" data-action="music-toggle" aria-pressed="${musicOn}">${esc(t(musicOn ? 'tools.musicOn' : 'tools.musicOff'))}</button>
        <button type="button" class="button button--small button--quiet" data-action="effects-toggle" aria-pressed="${effectsOn}">${esc(t(effectsOn ? 'tools.effectsOn' : 'tools.effectsOff'))}</button>
      </div>`;
    return sheet(kind, t('tool.soundAbout'), body, ts.status);
  }
  if (kind === 'aid') {
    const aid = state.aid ?? { used: 0, lastSol: -L.aidCooldown };
    const free = Math.max(0, L.freeAid - aid.used);
    const body = `<div class="tools__row">
        <button type="button" class="button button--small" data-action="aid">${esc(t('tools.aidFree', { free }))}</button>
        <button type="button" class="button button--small button--quiet" data-action="paid-aid">${esc(t('aid.paid', { n: L.paidAidCost }))}</button>
      </div>`;
    return sheet(kind, t('tool.aidAbout', { free, parts: L.paidAidCost, days: L.aidCooldown }), body, ts.status);
  }
  if (kind === 'load') return sheet(kind, t('tool.loadAbout'), slotsHtml(kind, ts), ts.status);
  const restart = `<div class="tools__row"><button type="button" class="button button--small button--danger" data-action="restart">${esc(t('run.restart'))}</button></div>
    <p class="tools__help">${esc(t('tool.saveHelp'))}</p>`;
  return sheet(kind, t('tool.saveAbout'), slotsHtml(kind, ts) + restart, ts.status);
}

/** The three slots: each a button with its number and what it holds, and the question inside the page. */
function slotsHtml(kind: 'save' | 'load', ts: ToolState): string {
  const items = ts.slots
    .map((sl) => {
      const name = t('slot.name', { n: sl.index + 1 });
      const what = sl.kind === 'ok' ? sl.line : t(sl.kind === 'empty' ? 'slot.empty' : sl.kind === 'damaged' ? 'slot.damaged' : 'slot.unavailable');
      // Loading needs a good save; saving works on any slot while storage works.
      const off = kind === 'load' ? sl.kind !== 'ok' : sl.kind === 'unavailable';
      const action = kind === 'save' ? 'slot-save' : 'slot-load';
      const c = ts.confirm;
      const ask =
        c && c.index === sl.index && c.mode === kind
          ? `<div class="slot__ask" role="group" aria-label="${esc(name)}">
              <p>${esc(t(kind === 'save' ? 'slot.askSave' : 'slot.askLoad', { n: sl.index + 1 }))}</p>
              <div class="tools__row">
                <button type="button" class="button button--small${kind === 'load' ? ' button--danger' : ''}" data-action="${action}-yes" data-slot="${sl.index}">${esc(t(kind === 'save' ? 'slot.yesSave' : 'slot.yesLoad'))}</button>
                <button type="button" class="button button--small button--quiet" data-action="slot-no">${esc(t('confirm.back'))}</button>
              </div>
            </div>`
          : '';
      return `<li class="slot"><button type="button" class="slot__btn" data-action="${action}" data-slot="${sl.index}"${off ? ' disabled' : ''}>
          <span class="slot__name">${esc(name)}</span><span class="slot__what">${esc(what)}</span>
        </button>${ask}</li>`;
    })
    .join('');
  return `<ul class="slots">${items}</ul>`;
}
