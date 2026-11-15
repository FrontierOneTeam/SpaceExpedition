// The app controller: owns the run, calls the sim, saves, renders the HTML and tells the
// map to redraw from the state. No framework: one class, plain DOM.

import {
  buildingAt,
  canPlace,
  canPlaceShelter,
  config,
  currentGoal,
  endDay,
  forecast,
  getChapter,
  isSheltered,
  isUnlocked,
  keepBuilding,
  newRun,
  place,
  previewDay,
  removeBuilding,
  removeShelter,
  shelterAt,
  shelterTiles,
  validTiles,
  type Chapter,
  type ChapterBook,
  type DayPreview,
  type PlaceableType,
  type Run,
  type SimEvent,
} from '../sim/index.ts';
import { emptySave, loadSave, writeSave, type SaveFile, type SaveStorage } from '../save/save.ts';
import { guidedHint, missionControlMessage, shelterHintTop, type Hint } from './advice.ts';
import { failureChain } from './failureChain.ts';
import { esc } from './format.ts';
import { renderHome } from './home.ts';
import { buildingAbout, buildingName, reasonText, starterGoalText, unlockGoalNumber } from './info.ts';
import type { CreateMap, MapView } from './mapView.ts';
import { t, type StringKey } from './strings.ts';
import {
  buildHtml,
  chapterEndHtml,
  confirmNewSiteHtml,
  endRowHtml,
  goalCardHtml,
  icon,
  lostHtml,
  missionControlHtml,
  titleCardHtml,
  topBarHtml,
  weatherHtml,
} from './views.ts';

const { BUILDINGS, RENDER, UI } = config;

export interface AppDeps {
  book: ChapterBook;
  storage: SaveStorage | null;
  createMap: CreateMap;
  /** A new site number. Chosen here, never in the sim. */
  randomSite: () => number;
  now: () => number;
  reducedMotion: () => boolean;
}

type Notice =
  | { kind: 'text'; text: string; tone: 'info' | 'warn' }
  | { kind: 'notes'; sol: number; lines: string[] }
  | { kind: 'building'; id: number; confirm: boolean }
  | { kind: 'shelter'; id: number; confirm: boolean };

type Overlay = 'title' | 'confirmNewSite' | null;

export class App {
  private save: SaveFile = emptySave();
  private run: Run | null = null;
  private selected: PlaceableType | null = null;
  private outline: { r: number; c: number } | null = null;
  private wasteWarned: { type: PlaceableType; r: number; c: number } | null = null;
  private notice: Notice | null = null;
  private overlay: Overlay = null;
  private map: MapView | null = null;
  private playRoot: HTMLElement | null = null;
  private lastEndDay = -Infinity;
  private hint: Hint = null;
  private lastHintType: PlaceableType | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly deps: AppDeps,
  ) {
    root.addEventListener('click', (e) => this.onClick(e));
  }

  /** Show Home. */
  start(): void {
    this.save = loadSave(this.deps.storage);
    this.run = this.save.outpost;
    renderHome(this.root, this.run !== null, () => this.onStart());
  }

  /** The current run, for tests. */
  get current(): Run | null {
    return this.run;
  }

  // ---- Flow ----

  private chapter(): Chapter {
    return getChapter(this.deps.book, this.run!.chapterId);
  }

  private onStart(): void {
    if (!this.run) {
      this.run = newRun(this.deps.randomSite(), this.deps.book);
      this.overlay = 'title';
      this.persist();
    } else {
      this.overlay = null;
    }
    this.enterPlay();
  }

  private persist(): void {
    this.save.outpost = this.run;
    writeSave(this.deps.storage, this.save);
  }

  private blocked(): boolean {
    const run = this.run;
    return !run || run.pendingReport || run.state.lost !== null || this.overlay !== null;
  }

  private resetUi(): void {
    this.selected = null;
    this.outline = null;
    this.wasteWarned = null;
    this.notice = null;
  }

  private startNewRun(siteNumber: number): void {
    this.run = newRun(siteNumber, this.deps.book);
    this.resetUi();
    this.overlay = 'title';
    this.persist();
    this.render();
  }

  // ---- Play screen ----

  private enterPlay(): void {
    this.root.innerHTML = `<div class="play">
      <header class="topbar" data-part="top"></header>
      <section class="map" aria-label="${esc(t('map.aria'))}">
        <div class="map__canvas" data-part="canvas"><p class="map__loading">${esc(t('boot.loading'))}</p></div>
        <div class="map__badges" data-part="badges"></div>
      </section>
      <div class="map-top" data-part="maptop"></div>
      <div class="map-bottom" data-part="mapbottom">
        <div class="notice-slot" data-part="notice" aria-live="polite"></div>
        <div class="mc" data-part="mc" aria-live="polite"></div>
      </div>
      <aside class="side">
        <section class="panel weather" data-part="weather"></section>
        <section class="panel build" data-part="build"></section>
        <div class="endrow" data-part="endrow"></div>
      </aside>
      <div class="overlay" data-part="overlay"></div>
    </div>`;
    this.playRoot = this.root.querySelector('.play');
    this.render();
    const canvas = this.part('canvas');
    if (canvas && !this.map) {
      void this.deps
        .createMap(canvas, {
          onTileTap: (r, c) => this.onTileTap(r, c),
          onLayout: () => this.placeBadges(),
        })
        .then((view) => {
          canvas.querySelector('.map__loading')?.remove();
          this.map = view;
          this.render();
        });
    }
  }

  private part(name: string): HTMLElement | null {
    return this.playRoot ? this.playRoot.querySelector<HTMLElement>(`[data-part="${name}"]`) : null;
  }

  private setHtml(name: string, html: string): void {
    const el = this.part(name);
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }

  /** Re-render every part of the play screen and redraw the map from the state. */
  render(): void {
    const run = this.run;
    if (!run || !this.playRoot) return;
    const chapter = this.chapter();
    const state = run.state;
    const preview = previewDay(run, this.deps.book);
    const { today, tomorrow } = forecast(chapter, run.chapterDay);
    const blocked = this.blocked();
    this.hint = blocked ? null : guidedHint(state, this.selected);

    this.setHtml('top', topBarHtml(run, chapter, preview));
    // On phones the weather row shows only when today or tomorrow has a flare or radiation (phone mockup).
    // The last day stays visible so "End of these records" shows.
    const quiet = (d: typeof today) => d !== null && d.radiation === 0 && d.flare === 'none';
    const wxClass = quiet(today) && quiet(tomorrow) ? 'weather-compact is-quiet' : 'weather-compact';
    this.setHtml('maptop', goalCardHtml(state) + `<div class="${wxClass}">${weatherHtml(today, tomorrow, true)}</div>`);
    this.setHtml('weather', weatherHtml(today, tomorrow, false));

    const grid = this.part('buildgrid');
    const scroll = grid ? grid.scrollLeft : 0;
    this.setHtml('build', buildHtml(state, this.selected, this.hint?.kind === 'button' ? this.hint.type : null, blocked));
    const newGrid = this.part('buildgrid');
    if (newGrid) newGrid.scrollLeft = scroll;
    // When the hint moves to a new button, bring it into view in the phone's scrolling build bar.
    const hintType = this.hint?.kind === 'button' ? this.hint.type : null;
    if (hintType && hintType !== this.lastHintType) {
      const el = newGrid?.querySelector<HTMLElement>('.bb.is-hint');
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    this.lastHintType = hintType;

    this.setHtml('endrow', endRowHtml(state, blocked));
    this.setHtml('mc', missionControlHtml(missionControlMessage(run, chapter)));
    this.setHtml('notice', this.noticeHtml(preview));
    this.setHtml('overlay', this.overlayHtml());

    if (this.map) {
      this.map.render({
        state,
        highlight: this.highlightTiles(),
        outline: this.selected === 'shelter' ? this.outline : null,
        hintTile: this.hint?.kind === 'tile' ? { r: this.hint.r, c: this.hint.c } : null,
        unpowered: preview.power.unpowered.map((u) => u.buildingId),
        reducedMotion: this.deps.reducedMotion(),
      });
      this.map.setInsets(this.measureInsets());
    }
    this.placeBadges(preview);
  }

  private overlayHtml(): string {
    const run = this.run!;
    if (this.overlay === 'confirmNewSite') return confirmNewSiteHtml();
    if (this.overlay === 'title') return titleCardHtml(this.chapter(), run.replay);
    if (run.state.lost) return lostHtml(failureChain(run.state));
    if (run.pendingReport) return chapterEndHtml();
    return '';
  }

  /** The part of the map covered by the goal card above and Mission Control below. */
  private measureInsets(): { top: number; bottom: number } {
    const map = this.playRoot?.querySelector('.map');
    const top = this.part('maptop');
    const bottom = this.part('mc');
    if (!map || !top || !bottom) return { top: 0, bottom: 0 };
    const m = map.getBoundingClientRect();
    const a = top.getBoundingClientRect();
    const b = bottom.getBoundingClientRect();
    const insetTop = a.bottom > m.top && a.top < m.bottom ? a.bottom - m.top : 0;
    const insetBottom = b.top < m.bottom && b.bottom > m.top ? m.bottom - b.top : 0;
    return { top: Math.max(0, insetTop), bottom: Math.max(0, insetBottom) };
  }

  private highlightTiles(): { r: number; c: number }[] {
    const run = this.run!;
    if (!this.selected || this.blocked()) return [];
    const tiles = validTiles(run.state, this.selected);
    if (this.selected !== 'shelter') return tiles;
    // For a shelter, light every tile some valid block would cover.
    const seen = new Set<string>();
    const out: { r: number; c: number }[] = [];
    for (const top of tiles) {
      for (const tile of shelterTiles(top)) {
        const key = `${tile.r},${tile.c}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(tile);
        }
      }
    }
    return out;
  }

  // ---- Badges and labels over the map (draw order step 4) ----

  private placeBadges(preview?: DayPreview): void {
    const layer = this.part('badges');
    const run = this.run;
    if (!layer || !run) return;
    const map = this.map;
    if (!map) {
      layer.innerHTML = '';
      return;
    }
    const state = run.state;
    const unpowered = (preview ?? previewDay(run, this.deps.book)).power.unpowered.map((u) => u.buildingId);
    const items: string[] = [];
    const at = (r: number, c: number, lift: number, cls: string, html: string): void => {
      const p = map.tileToScreen(r, c, lift);
      items.push(`<div class="badge ${cls}" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px">${html}</div>`);
    };
    for (const s of state.shelters) {
      at(s.r + 0.5, s.c + 0.5, RENDER.shelterBadgeLift, 'badge--shelter', `${SHIELD}<span>${esc(t('badge.sheltered'))}</span>`);
    }
    for (const b of state.buildings) {
      if (b.brokenDays > 0) {
        const long = b.brokenDays === 1 ? t('badge.backTomorrow') : t('badge.backIn', { n: b.brokenDays });
        const short = b.brokenDays === 1 ? t('badge.dayOne') : t('badge.days', { n: b.brokenDays });
        at(b.r, b.c, RENDER.badgeLift, 'badge--broken', `${icon('icon_broken', 'badge__icon')}<span class="wide-only">${esc(long)}</span><span class="narrow-only">${esc(short)}</span>`);
      } else if (unpowered.includes(b.id)) {
        at(b.r, b.c, RENDER.badgeLift, 'badge--nopower', `${icon('icon_no_power', 'badge__icon')}<span class="wide-only">${esc(t('badge.noPower'))}</span>`);
      } else if (b.damagedDays > 0) {
        const long = b.damagedDays === 1 ? t('badge.weakTomorrow') : t('badge.weakFor', { n: b.damagedDays });
        const short = b.damagedDays === 1 ? t('badge.dayOne') : t('badge.days', { n: b.damagedDays });
        at(b.r, b.c, RENDER.badgeLift, 'badge--damaged', `<span class="wide-only">${esc(long)}</span><span class="narrow-only">${esc(short)}</span>`);
      }
    }
    if (this.selected === 'shelter' && this.outline) {
      at(this.outline.r + 1, this.outline.c + 1, -RENDER.tileHeight / 2, 'badge--label', esc(t('place.shelterHere')));
    }
    const hint = this.hint;
    if (hint && hint.kind === 'tile') at(hint.r, hint.c, -RENDER.tileHeight / 2, 'badge--label badge--hint', esc(hint.label));
    layer.innerHTML = items.join('');
  }

  // ---- Notices: one short line, the day's notes, or a building's card ----

  private noticeHtml(preview: DayPreview): string {
    const n = this.notice;
    const run = this.run!;
    if (!n) return '';
    const close = `<button type="button" class="notice__close" data-action="close-notice" aria-label="${esc(t('notice.close'))}">×</button>`;
    if (n.kind === 'text') return `<div class="notice notice--${n.tone}" role="status"><p>${esc(n.text)}</p>${close}</div>`;
    if (n.kind === 'notes') {
      const lines = n.lines.map((l) => `<li>${esc(l)}</li>`).join('');
      return `<div class="notice"><div><b>${esc(t('notes.title', { n: n.sol }))}</b><ul>${lines}</ul></div>${close}</div>`;
    }
    const state = run.state;
    if (n.kind === 'shelter') {
      const s = state.shelters.find((x) => x.id === n.id);
      if (!s) return '';
      const empty = !shelterTiles(s).some((tile) => buildingAt(state, tile.r, tile.c));
      return this.cardHtml(buildingName('shelter'), buildingAbout('shelter'), [t('info.sheltered')], empty, n.confirm, close);
    }
    const b = state.buildings.find((x) => x.id === n.id);
    if (!b) return '';
    const status: string[] = [];
    if (b.brokenDays > 0) status.push(b.brokenDays === 1 ? t('info.brokenOne') : t('info.brokenMany', { n: b.brokenDays }));
    else if (preview.power.unpowered.some((u) => u.buildingId === b.id)) status.push(t('info.noPower'));
    if (b.damagedDays > 0) status.push(b.damagedDays === 1 ? t('badge.weakTomorrow') : t('badge.weakFor', { n: b.damagedDays }));
    if (isSheltered(state, b.r, b.c)) status.push(t('info.sheltered'));
    return this.cardHtml(buildingName(b.type), buildingAbout(b.type), status, BUILDINGS[b.type].removable, n.confirm, close);
  }

  private cardHtml(name: string, about: string, status: string[], removable: boolean, confirm: boolean, close: string): string {
    const statusHtml = status.length ? `<p class="notice__status">${status.map(esc).join(' ')}</p>` : '';
    let actions = '';
    if (removable && !this.blocked()) {
      actions = confirm
        ? `<p class="notice__confirm">${esc(t('remove.ask'))}</p>
           <div class="notice__buttons">
             <button type="button" class="button button--small button--danger" data-action="remove-yes">${esc(t('remove.yes'))}</button>
             <button type="button" class="button button--small button--quiet" data-action="remove-no">${esc(t('remove.no'))}</button>
           </div>`
        : `<div class="notice__buttons"><button type="button" class="button button--small button--quiet" data-action="remove">${esc(t('remove.button'))}</button></div>`;
    }
    return `<div class="notice notice--card"><div><p><b>${esc(name)}.</b> ${esc(about)}</p>${statusHtml}${actions}</div>${close}</div>`;
  }

  // ---- Input ----

  private onClick(e: Event): void {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
    if (!target || !this.root.contains(target)) return;
    if (target instanceof HTMLButtonElement && target.disabled) return;
    switch (target.dataset.action) {
      case 'select':
        this.select(target.dataset.type as PlaceableType);
        break;
      case 'cancel':
        this.resetUi();
        this.render();
        break;
      case 'end-day':
        this.onEndDay();
        break;
      case 'close-notice':
        this.notice = null;
        this.render();
        break;
      case 'remove':
        if (this.notice && (this.notice.kind === 'building' || this.notice.kind === 'shelter')) this.notice = { ...this.notice, confirm: true };
        this.render();
        break;
      case 'remove-no':
        if (this.notice && (this.notice.kind === 'building' || this.notice.kind === 'shelter')) this.notice = { ...this.notice, confirm: false };
        this.render();
        break;
      case 'remove-yes':
        this.onRemove();
        break;
      case 'title-continue':
        this.overlay = null;
        this.render();
        break;
      case 'keep-building':
        this.onKeepBuilding();
        break;
      case 'try-again':
        if (this.run) this.startNewRun(this.run.siteNumber);
        break;
      case 'new-site':
        this.overlay = 'confirmNewSite';
        this.render();
        break;
      case 'new-site-yes':
        this.overlay = null;
        this.startNewRun(this.deps.randomSite());
        break;
      case 'new-site-no':
        this.overlay = null;
        this.render();
        break;
    }
  }

  private select(type: PlaceableType): void {
    const run = this.run;
    if (!run || this.blocked()) return;
    if (!isUnlocked(run.state, type)) {
      const n = unlockGoalNumber(type);
      this.notice = { kind: 'text', tone: 'info', text: n ? t('build.lockedTap', { goal: starterGoalText(n - 1) }) : reasonText('locked') };
      this.render();
      return;
    }
    if (this.selected === type) {
      this.resetUi();
      this.render();
      return;
    }
    this.resetUi();
    this.selected = type;
    if (type === 'shelter') {
      // Start the outline on the guided spot when it can go there.
      const top = shelterHintTop(run.state);
      if (top && currentGoal(run.state).id === 'starter_cover' && canPlaceShelter(run.state, top.r, top.c).ok) this.outline = top;
    }
    this.render();
  }

  private onTileTap(r: number, c: number): void {
    const run = this.run;
    if (!run || this.blocked()) return;
    const state = run.state;
    const type = this.selected;
    if (!type) {
      const b = buildingAt(state, r, c);
      const s = shelterAt(state, r, c);
      this.notice = b ? { kind: 'building', id: b.id, confirm: false } : s ? { kind: 'shelter', id: s.id, confirm: false } : null;
      this.render();
      return;
    }
    if (type === 'shelter') {
      this.tapShelter(r, c);
      return;
    }
    const check = canPlace(state, type, r, c);
    if (!check.ok) {
      this.notice = { kind: 'text', tone: 'warn', text: reasonText(check.reason) };
      this.render();
      return;
    }
    const w = this.wasteWarned;
    if (check.wastesDeposit && !(w && w.type === type && w.r === r && w.c === c)) {
      this.wasteWarned = { type, r, c };
      this.notice = { kind: 'text', tone: 'warn', text: t(check.wastesDeposit === 'ice' ? 'place.wasteIce' : 'place.wasteRock') };
      this.render();
      return;
    }
    place(state, type, r, c);
    this.resetUi();
    this.persist();
    this.render();
  }

  private tapShelter(r: number, c: number): void {
    const state = this.run!.state;
    const o = this.outline;
    if (o && r >= o.r && r <= o.r + 1 && c >= o.c && c <= o.c + 1 && canPlaceShelter(state, o.r, o.c).ok) {
      place(state, 'shelter', o.r, o.c);
      this.resetUi();
      this.persist();
      this.render();
      return;
    }
    // Move the outline to a valid block containing the tapped tile, preferring the guided spot.
    const guided = shelterHintTop(state);
    const tops = [
      { r, c },
      { r: r - 1, c },
      { r, c: c - 1 },
      { r: r - 1, c: c - 1 },
    ];
    tops.sort((a, b) => Number(isSame(b, guided)) - Number(isSame(a, guided)));
    const ok = tops.find((p) => canPlaceShelter(state, p.r, p.c).ok);
    if (ok) {
      this.outline = ok;
      this.notice = null;
    } else {
      const check = canPlaceShelter(state, r, c);
      this.notice = { kind: 'text', tone: 'warn', text: check.ok ? reasonText('occupied') : reasonText(check.reason) };
    }
    this.render();
  }

  private onRemove(): void {
    const run = this.run;
    const n = this.notice;
    if (!run || this.blocked() || !n) return;
    if (n.kind === 'building') removeBuilding(run.state, n.id);
    else if (n.kind === 'shelter') removeShelter(run.state, n.id);
    else return;
    this.notice = null;
    this.persist();
    this.render();
  }

  private onEndDay(): void {
    const run = this.run;
    if (!run || this.blocked()) return;
    // One tap advances one day, even if the tap arrives twice.
    const now = this.deps.now();
    if (now - this.lastEndDay < UI.endDayCooldownMs) return;
    this.lastEndDay = now;
    const sol = run.state.day;
    const result = endDay(run, this.deps.book);
    if (!result.ran) return;
    this.resetUi();
    const lines = dayNotes(result.events);
    if (lines.length > 0 && !run.state.lost) this.notice = { kind: 'notes', sol, lines };
    this.persist();
    this.render();
  }

  private onKeepBuilding(): void {
    const run = this.run;
    if (!run || !keepBuilding(run, this.deps.book)) return;
    this.resetUi();
    this.overlay = 'title';
    this.persist();
    this.render();
  }
}

function isSame(a: { r: number; c: number }, b: { r: number; c: number } | null): boolean {
  return b !== null && a.r === b.r && a.c === b.c;
}

const SHIELD =
  '<svg class="badge__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const STORM_NOTE: StringKey[] = ['notes.storm1', 'notes.storm1', 'notes.storm2', 'notes.storm3'];

/** A short, calm list of what happened, from the day's events. */
export function dayNotes(events: SimEvent[]): string[] {
  const lines: string[] = [];
  let broken = 0;
  const unlocked: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'storm':
        lines.push(t(STORM_NOTE[e.level]));
        break;
      case 'broken':
        broken++;
        break;
      case 'repaired':
        lines.push(t('notes.repaired', { name: buildingName(e.building) }));
        break;
      case 'rocket_landed':
        lines.push(t('notes.rocket', { n: e.parts }));
        break;
      case 'rocket_blocked':
        lines.push(t('notes.rocketBlocked'));
        break;
      case 'goal_done':
        lines.push(t('notes.goal', { n: e.goal.rewardParts }));
        break;
      case 'unlocked':
        unlocked.push(buildingName(e.building));
        break;
      case 'map_grew':
        lines.push(t('notes.mapGrew'));
        break;
    }
  }
  if (broken > 0) lines.splice(Math.min(1, lines.length), 0, broken === 1 ? t('notes.brokeOne') : t('notes.brokeMany', { n: broken }));
  if (unlocked.length > 0) lines.push(t('notes.unlocked', { names: unlocked.join(t('list.separator')) }));
  return lines;
}
