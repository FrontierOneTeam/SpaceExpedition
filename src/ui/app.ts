// The app controller: owns the run, calls the sim, saves, renders the HTML and tells the
// map to redraw from the state. No framework: one class, plain DOM.

import {
  answerQuestion,
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
  type GameState,
  type PlaceableType,
  type PredictAnswer,
  type Run,
  type SimEvent,
} from '../sim/index.ts';
import { astroWorld } from '../game/astronauts.ts';
import { emptySave, loadSave, writeSave, type SaveFile, type SaveStorage } from '../save/save.ts';
import { guidedHint, missionControlMessage, shelterHintTop, type Hint } from './advice.ts';
import { cardDue, cardSources } from './content.ts';
import { failureChain } from './failureChain.ts';
import { esc, replayLine } from './format.ts';
import { glossSentence, glossText } from './glossary.ts';
import { homeHtml } from './home.ts';
import { buildingAbout, buildingLower, buildingName, costOf, reasonText, starterGoalText, unlockGoalNumber } from './info.ts';
import type { CreateMap, MapView } from './mapView.ts';
import { buildReport, looksLikeReport, reportView, type ReportEntry } from './report.ts';
import {
  pageHtml,
  reportBodyHtml,
  reportModalHtml,
  reportsListHtml,
  settingsBodyHtml,
  sourcesBodyHtml,
  sourcesModalHtml,
} from './screens.ts';
import { MESSAGE_WRAP, SOUND, SoundBoard, ambienceFor, daySounds, nowPlaying } from './sound.ts';
import { t, type StringKey } from './strings.ts';
import {
  buildHtml,
  confirmNewSiteHtml,
  endRowHtml,
  goalCardHtml,
  icon,
  lostHtml,
  missionControlHtml,
  realCardHtml,
  titleCardHtml,
  topBarHtml,
  weatherHtml,
} from './views.ts';

const { BUILDINGS, RENDER, UI, CAMERA } = config;

export interface AppDeps {
  book: ChapterBook;
  storage: SaveStorage | null;
  createMap: CreateMap;
  /** A new site number. Chosen here, never in the sim. */
  randomSite: () => number;
  now: () => number;
  reducedMotion: () => boolean;
  /** Sound player; a silent one is made when left out. */
  sound?: SoundBoard;
}

type Notice =
  | { kind: 'text'; text: string; tone: 'info' | 'warn' }
  | { kind: 'notes'; sol: number; lines: string[] }
  | { kind: 'building'; id: number; confirm: boolean }
  | { kind: 'shelter'; id: number; confirm: boolean };

/** Panels over the play screen. The report itself shows whenever a report is pending. */
type Overlay = 'title' | 'confirmNewSite' | 'sources' | 'lostReport' | null;

/** Screens reached from Home. */
type Screen = 'home' | 'sources' | 'reports' | 'report' | 'settings' | 'play';

export class App {
  private save: SaveFile = emptySave();
  private run: Run | null = null;
  private screen: Screen = 'home';
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
  /** The morning whose "This was real" card was closed. */
  private cardClosedFor: string | null = null;
  /** The report's New site button was pressed: show its confirmation inside the report. */
  private reportConfirm = false;
  private settingsConfirm = false;
  private settingsCleared = false;
  /** Which stored report Past reports opened. */
  private pastIndex = -1;
  /** The open tap-to-explain bubble. */
  private glossOpen: { word: string; x: number; y: number; below: boolean } | null = null;
  readonly sound: SoundBoard;
  /** The Mission Control message and "This was real" card last announced with a sound. */
  private lastMc: string | null = null;
  private lastCard: string | null = null;
  /** Buildings without power at the last render, for the power up and down sounds. Null: just record. */
  private lastUnpowered: Set<number> | null = null;
  /** False while the chapter-complete sound plays; the report music starts after it. */
  private reportMusicReady = true;
  /** A new version of the game is ready: reload once the player is off the play screen. */
  private pendingReload: (() => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly deps: AppDeps,
  ) {
    this.sound = deps.sound ?? new SoundBoard();
    // No sound before the first tap (SPEC 11.3).
    const unlock = () => this.sound.unlock();
    root.addEventListener('pointerdown', unlock, true);
    root.addEventListener('keydown', unlock, true);
    root.addEventListener('click', (e) => this.onClick(e));
    // Glossary words are spans with role="button": Enter and Space open them too.
    root.addEventListener('keydown', (e) => {
      const el = e.target as HTMLElement | null;
      if (el && el.classList?.contains('gloss') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        el.click();
      }
    });
  }

  /** Show Home. */
  start(): void {
    this.save = loadSave(this.deps.storage);
    this.sound.setMuted(this.save.muted);
    this.run = this.save.outpost;
    this.showScreen('home');
  }

  /**
   * Run `reload` when it cannot interrupt play: now when off the play screen, otherwise the next
   * time the player leaves it. Used when a new version of the game has been installed.
   */
  whenSafe(reload: () => void): void {
    if (this.screen !== 'play') reload();
    else this.pendingReload = reload;
  }

  /** The current run, for tests. */
  get current(): Run | null {
    return this.run;
  }

  /** The stored reports that can still be shown, with their place in the save. */
  storedReports(): { entry: ReportEntry; chapter: Chapter; index: number }[] {
    const out: { entry: ReportEntry; chapter: Chapter; index: number }[] = [];
    this.save.reports.forEach((r, index) => {
      if (!looksLikeReport(r)) return;
      const chapter = this.deps.book.chapters[r.chapterId];
      if (chapter) out.push({ entry: r, chapter, index });
    });
    return out;
  }

  // ---- Screens reached from Home ----

  private showScreen(screen: Exclude<Screen, 'play'>): void {
    this.screen = screen;
    this.playRoot = null;
    this.glossOpen = null;
    this.sound.detach();
    this.map?.destroy();
    this.map = null;
    const reload = this.pendingReload;
    if (reload) {
      this.pendingReload = null;
      reload();
      return;
    }
    if (screen === 'home') {
      this.root.innerHTML = homeHtml(this.run !== null, this.storedReports().length > 0);
    } else if (screen === 'sources') {
      this.root.innerHTML = pageHtml(t('sources.title'), sourcesBodyHtml(), 'go-home');
    } else if (screen === 'reports') {
      this.root.innerHTML = pageHtml(t('reports.title'), reportsListHtml(this.storedReports()), 'go-home');
    } else if (screen === 'settings') {
      this.root.innerHTML = pageHtml(t('settings.title'), settingsBodyHtml(this.run !== null, this.settingsConfirm, this.settingsCleared, this.save.muted), 'go-home');
    } else {
      const found = this.storedReports().find((r) => r.index === this.pastIndex);
      if (!found) {
        this.showScreen('reports');
        return;
      }
      this.root.innerHTML = pageHtml(t('reports.title'), `<article class="report report--page">${reportBodyHtml(reportView(found.entry, found.chapter))}</article>`, 'open-reports');
    }
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
    this.reportConfirm = false;
    this.cardClosedFor = null;
    this.overlay = 'title';
    this.persist();
    this.render();
  }

  // ---- Play screen ----

  private enterPlay(): void {
    this.screen = 'play';
    this.glossOpen = null;
    this.root.innerHTML = `<div class="play">
      <header class="topbar" data-part="top"></header>
      <section class="map" aria-label="${esc(t('map.aria'))}">
        <div class="map__canvas" data-part="canvas"><p class="map__loading">${esc(t('boot.loading'))}</p></div>
        <div class="map__badges" data-part="badges"></div>
        <div class="zoom">
          <button type="button" class="zoom__btn" data-action="zoom-in" aria-label="${esc(t('map.zoomIn'))}">+</button>
          <button type="button" class="zoom__btn" data-action="zoom-out" aria-label="${esc(t('map.zoomOut'))}">−</button>
        </div>
      </section>
      <div class="map-top">
        <div class="map-top__fixed" data-part="maptop"></div>
        <div class="map-top__card" data-part="card"></div>
      </div>
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
      <div class="gloss-layer"></div>
    </div>`;
    this.playRoot = this.root.querySelector('.play');
    this.sound.detach();
    this.map?.destroy();
    this.map = null;
    this.lastMc = null;
    this.lastCard = null;
    this.lastUnpowered = null;
    this.render();
    const canvas = this.part('canvas');
    if (canvas) {
      void this.deps
        .createMap(canvas, {
          onTileTap: (r, c) => this.onTileTap(r, c),
          onLayout: () => this.placeBadges(),
          onAstronautTap: () => this.sound.effect(SOUND.dance),
          onSoundsLoaded: () => this.sound.refresh(),
        })
        .then((view) => {
          canvas.querySelector('.map__loading')?.remove();
          this.map = view;
          if (view.sound) this.sound.attach(view.sound);
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

    this.setHtml('top', topBarHtml(run, chapter, preview, this.save.muted));
    // On phones the weather row shows only when today or tomorrow has a flare or radiation (phone mockup).
    // The last day stays visible so "End of these records" shows.
    const quiet = (d: typeof today) => d !== null && d.radiation === 0 && d.flare === 'none';
    const wxClass = quiet(today) && quiet(tomorrow) ? 'weather-compact is-quiet' : 'weather-compact';
    this.setHtml('maptop', goalCardHtml(state) + `<div class="${wxClass}">${weatherHtml(today, tomorrow, true)}</div>`);
    const card = this.cardHtml(run, chapter);
    this.setHtml('card', card);
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
    const mc = missionControlMessage(run, chapter);
    this.setHtml('mc', missionControlHtml(mc, blocked));
    this.setHtml('notice', this.noticeHtml(preview));
    this.setHtml('overlay', this.overlayHtml());
    // Phones: only one large panel over the map at a time (styles.css). Day notes wait while the
    // "This was real" card is open; a tapped building's card hides that card until it is closed.
    const n = this.notice;
    this.playRoot.classList.toggle('has-card', card !== '');
    this.playRoot.classList.toggle('has-notes', n?.kind === 'notes');
    this.playRoot.classList.toggle('has-bcard', n?.kind === 'building' || n?.kind === 'shelter');
    this.renderSound(run, mc.text, card !== '', preview);

    if (this.map) {
      this.map.render({
        state,
        highlight: this.highlightTiles(),
        outline: this.selected === 'shelter' ? this.outline : null,
        hintTile: this.hint?.kind === 'tile' ? { r: this.hint.r, c: this.hint.c } : null,
        unpowered: preview.power.unpowered.map((u) => u.buildingId),
        reducedMotion: this.deps.reducedMotion(),
        astronauts: astroWorld(run, chapter),
      });
      this.map.setInsets(this.measureInsets());
    }
    this.placeBadges(preview);
    this.renderGloss();
  }

  // ---- Sound (SPEC 11.3) ----

  /** Loops for the screen, and sounds for what changed since the last render. */
  private renderSound(run: Run, mcText: string, cardShown: boolean, preview: DayPreview): void {
    this.updateLoops();
    // Each new Mission Control message is wrapped in the radio sounds.
    if (mcText !== this.lastMc) {
      this.lastMc = mcText;
      this.sound.message(MESSAGE_WRAP);
    }
    const cardKey = cardShown ? this.morningKey(run) : null;
    if (cardKey && cardKey !== this.lastCard) this.sound.message([SOUND.realEvent]);
    this.lastCard = cardKey;
    // A building lost or got back its power because of something the player did.
    const now = new Set(preview.power.unpowered.map((u) => u.buildingId));
    const before = this.lastUnpowered;
    if (before) {
      const standing = new Set(run.state.buildings.map((b) => b.id));
      if ([...now].some((id) => !before.has(id))) this.sound.effect(SOUND.powerDown);
      else if ([...before].some((id) => !now.has(id) && standing.has(id))) this.sound.effect(SOUND.powerUp);
    }
    this.lastUnpowered = now;
  }

  /** One ambience loop and at most one music track. */
  private updateLoops(): void {
    const run = this.run;
    if (this.screen !== 'play' || !run) {
      this.sound.setAmbience([]);
      this.sound.setMusic(null);
      return;
    }
    const chapter = this.chapter();
    const { today } = forecast(chapter, run.chapterDay);
    this.sound.setAmbience(ambienceFor(chapter.site, today ? today.radiation : 0));
    const reportOpen = run.pendingReport || this.overlay === 'lostReport';
    if (reportOpen) this.sound.setMusic(this.reportMusicReady ? SOUND.report : null);
    else this.sound.setMusic(run.state.lost ? null : SOUND.calm);
  }

  /** The key of this morning, for remembering a closed card. */
  private morningKey(run: Run): string {
    return `${run.chapterId}:${run.replay}:${run.state.day}`;
  }

  /** The "This was real" card of this morning, unless it was closed. Never depends on the radio. */
  private cardHtml(run: Run, chapter: Chapter): string {
    const card = cardDue(run, chapter);
    if (!card || this.cardClosedFor === this.morningKey(run)) return '';
    const sources = cardSources(card);
    return sources ? realCardHtml(card, sources) : '';
  }

  /** What comes after Keep building, in one line (SPEC 10.7). */
  private nextLine(run: Run): string {
    const archive = this.deps.book.archive;
    const i = archive.indexOf(run.chapterId);
    if (i >= 0 && i + 1 < archive.length) return t('report.nextChapter', { title: getChapter(this.deps.book, archive[i + 1]).title });
    return t('report.nextReplay', { replay: replayLine(getChapter(this.deps.book, archive[0]), run.replay + 1) });
  }

  private overlayHtml(): string {
    const run = this.run!;
    if (this.overlay === 'sources') return sourcesModalHtml(nowPlaying(this.sound.ambienceName()));
    if (this.overlay === 'confirmNewSite') return confirmNewSiteHtml();
    if (this.overlay === 'title') return titleCardHtml(this.chapter(), run.replay);
    if (run.state.lost) {
      if (this.overlay === 'lostReport') return reportModalHtml(reportView(buildReport(run, this.chapter(), true), this.chapter()), { kind: 'lost' });
      return lostHtml(failureChain(run.state));
    }
    if (run.pendingReport) {
      const view = reportView(buildReport(run, this.chapter(), false), this.chapter());
      return reportModalHtml(view, { kind: 'chapter', next: this.nextLine(run), confirm: this.reportConfirm });
    }
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
    const html = items.join('');
    if (layer.innerHTML !== html) layer.innerHTML = html;
  }

  // ---- Notices: one short line, the day's notes, or a building's card ----

  private noticeHtml(preview: DayPreview): string {
    const n = this.notice;
    const run = this.run!;
    if (!n) return '';
    const close = `<button type="button" class="notice__close" data-action="close-notice" aria-label="${esc(t('notice.close'))}">×</button>`;
    if (n.kind === 'text') return `<div class="notice notice--${n.tone}" role="status"><p>${glossText(n.text)}</p>${close}</div>`;
    if (n.kind === 'notes') {
      const lines = n.lines.map((l) => `<li>${glossText(l)}</li>`).join('');
      return `<div class="notice notice--notes"><div><b>${glossText(t('notes.title', { n: n.sol }))}</b><ul>${lines}</ul></div>${close}</div>`;
    }
    const state = run.state;
    if (n.kind === 'shelter') {
      const s = state.shelters.find((x) => x.id === n.id);
      if (!s) return '';
      const empty = !shelterTiles(s).some((tile) => buildingAt(state, tile.r, tile.c));
      return this.buildingCardHtml(buildingName('shelter'), buildingAbout('shelter'), [t('info.sheltered')], empty, n.confirm, close);
    }
    const b = state.buildings.find((x) => x.id === n.id);
    if (!b) return '';
    const status: string[] = [];
    if (b.brokenDays > 0) status.push(b.brokenDays === 1 ? t('info.brokenOne') : t('info.brokenMany', { n: b.brokenDays }));
    else if (preview.power.unpowered.some((u) => u.buildingId === b.id)) status.push(t('info.noPower'));
    if (b.damagedDays > 0) status.push(b.damagedDays === 1 ? t('badge.weakTomorrow') : t('badge.weakFor', { n: b.damagedDays }));
    if (isSheltered(state, b.r, b.c)) status.push(t('info.sheltered'));
    return this.buildingCardHtml(buildingName(b.type), buildingAbout(b.type), status, BUILDINGS[b.type].removable, n.confirm, close);
  }

  private buildingCardHtml(name: string, about: string, status: string[], removable: boolean, confirm: boolean, close: string): string {
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
    return `<div class="notice notice--card"><div><p><b>${esc(name)}.</b> ${glossText(about)}</p>${statusHtml}${actions}</div>${close}</div>`;
  }

  // ---- Tap-to-explain bubble (SPEC 8.3) ----

  private renderGloss(): void {
    const layer = this.root.querySelector<HTMLElement>('.gloss-layer');
    if (!layer) return;
    const g = this.glossOpen;
    const sentence = g ? glossSentence(g.word) : null;
    if (!g || !sentence) {
      if (layer.innerHTML !== '') layer.innerHTML = '';
      return;
    }
    const pos = g.below ? `top:${g.y.toFixed(0)}px` : `bottom:${g.y.toFixed(0)}px`;
    layer.innerHTML = `<div class="gloss-bubble" role="tooltip" style="left:${g.x.toFixed(0)}px;${pos}"><b>${esc(g.word)}</b> ${esc(sentence)}</div>`;
  }

  private openGloss(el: HTMLElement): void {
    const word = el.dataset.word ?? '';
    if (this.glossOpen && this.glossOpen.word === word) {
      this.glossOpen = null;
    } else {
      const rect = el.getBoundingClientRect();
      const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 640;
      const width = Math.min(UI_GLOSS_WIDTH, vw - 16);
      const x = Math.max(8, Math.min(rect.left, vw - 8 - width));
      const below = rect.bottom + 140 < vh;
      this.glossOpen = { word, x, y: below ? rect.bottom + 6 : vh - rect.top + 6, below };
    }
    this.renderGloss();
  }

  // ---- Input ----

  private onClick(e: Event): void {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
    // Any tap closes an open glossary bubble; a tap on a glossary word opens its own.
    if (this.glossOpen && target?.dataset.action !== 'gloss') {
      this.glossOpen = null;
      this.renderGloss();
    }
    if (!target || !this.root.contains(target)) return;
    if (target instanceof HTMLButtonElement && target.disabled) return;
    this.sound.unlock();
    const action = target.dataset.action ?? '';
    if (PANEL_ACTIONS.has(action)) this.sound.effect(SOUND.openPanel);
    else if (!OWN_SOUND.has(action)) this.sound.effect(SOUND.tap);
    switch (action) {
      case 'toggle-mute':
        this.save.muted = !this.save.muted;
        this.sound.setMuted(this.save.muted);
        writeSave(this.deps.storage, this.save);
        if (this.screen === 'play') this.render();
        else if (this.screen === 'settings') this.showScreen('settings');
        break;
      case 'gloss':
        this.openGloss(target);
        break;
      case 'home-start':
        this.onStart();
        break;
      case 'go-home':
        this.settingsConfirm = false;
        this.settingsCleared = false;
        this.showScreen('home');
        break;
      case 'open-sources':
        if (this.screen === 'play') {
          if (this.overlay === null || this.overlay === 'title') {
            this.overlay = 'sources';
            this.render();
          }
        } else this.showScreen('sources');
        break;
      case 'close-overlay':
        this.overlay = null;
        this.render();
        break;
      case 'open-reports':
        this.showScreen('reports');
        break;
      case 'open-report':
        this.pastIndex = Number(target.dataset.index);
        this.showScreen('report');
        break;
      case 'open-settings':
        this.settingsConfirm = false;
        this.settingsCleared = false;
        this.showScreen('settings');
        break;
      case 'start-over':
        this.settingsConfirm = true;
        this.showScreen('settings');
        break;
      case 'start-over-no':
        this.settingsConfirm = false;
        this.showScreen('settings');
        break;
      case 'start-over-yes':
        this.onStartOver();
        break;
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
      case 'predict':
        this.onPredict(target.dataset.answer as PredictAnswer | 'skip');
        break;
      case 'close-card':
        if (this.run) this.cardClosedFor = this.morningKey(this.run);
        this.render();
        break;
      case 'zoom-in':
        this.map?.zoomBy(CAMERA.buttonStep);
        break;
      case 'zoom-out':
        this.map?.zoomBy(1 / CAMERA.buttonStep);
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
      case 'report-new-site':
        this.reportConfirm = true;
        this.render();
        break;
      case 'report-new-site-no':
        this.reportConfirm = false;
        this.render();
        break;
      case 'report-new-site-yes':
        if (this.run?.pendingReport) this.startNewRun(this.deps.randomSite());
        break;
      case 'lost-report':
        if (this.run?.state.lost) {
          this.overlay = 'lostReport';
          this.render();
        }
        break;
      case 'lost-report-back':
        this.overlay = null;
        this.render();
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

  private onStartOver(): void {
    this.run = null;
    this.save.outpost = null;
    writeSave(this.deps.storage, this.save);
    this.resetUi();
    this.overlay = null;
    this.settingsConfirm = false;
    this.settingsCleared = true;
    this.showScreen('settings');
  }

  private select(type: PlaceableType): void {
    const run = this.run;
    if (!run || this.blocked()) return;
    if (!isUnlocked(run.state, type)) {
      this.sound.effect(SOUND.cant);
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
    this.sound.effect(SOUND.select);
    if (type === 'shelter') {
      // Start the outline on the guided spot when it can go there.
      const top = shelterHintTop(run.state);
      if (top && currentGoal(run.state).id === 'starter_cover' && canPlaceShelter(run.state, top.r, top.c).ok) this.outline = top;
    }
    this.render();
  }

  /** After a building is placed, keep it chosen while another can be afforded, so several go in a row. */
  private afterPlace(type: PlaceableType): void {
    this.sound.effect(SOUND.place);
    this.resetUi();
    if (canAfford(this.run!.state, type)) this.selected = type;
    this.persist();
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
      if (this.notice) this.sound.effect(SOUND.openPanel);
      this.render();
      return;
    }
    if (type === 'shelter') {
      this.tapShelter(r, c);
      return;
    }
    const check = canPlace(state, type, r, c);
    if (!check.ok) {
      this.sound.effect(SOUND.cant);
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
    this.afterPlace(type);
  }

  private tapShelter(r: number, c: number): void {
    const state = this.run!.state;
    const o = this.outline;
    if (o && r >= o.r && r <= o.r + 1 && c >= o.c && c <= o.c + 1 && canPlaceShelter(state, o.r, o.c).ok) {
      place(state, 'shelter', o.r, o.c);
      this.afterPlace('shelter');
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
      this.sound.effect(SOUND.cant);
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
    this.sound.effect(SOUND.remove);
    this.notice = null;
    this.persist();
    this.render();
  }

  /** The predict question (SPEC 8.2): no reward, no penalty. Blocked only while a panel covers the screen. */
  private onPredict(answer: PredictAnswer | 'skip'): void {
    const run = this.run;
    if (!run || this.blocked()) return;
    const q = run.state.question;
    if (!q || !answerQuestion(run.state, answer)) return;
    this.notice = answer === 'skip' ? null : { kind: 'text', tone: 'info', text: t('predict.ack', { name: buildingLower(q.building) }) };
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
    const ringBefore = run.state.ring;
    const result = endDay(run, this.deps.book);
    if (!result.ran) return;
    this.sound.effect(SOUND.endDay);
    this.playDaySounds(result.events);
    this.resetUi();
    // The chapter ended: store its report once, now (SPEC 12). A reload never stores it again.
    if (result.events.some((e) => e.type === 'chapter_end')) {
      this.save.reports.push(buildReport(run, this.chapter(), false));
      this.reportConfirm = false;
    }
    const lines = dayNotes(result.events);
    // The pan hint waits until the map is 8x8 (SPEC 5.6).
    if (ringBefore === 0 && run.state.ring > 0) lines.push(t('notes.panHint'));
    if (lines.length > 0 && !run.state.lost && !run.pendingReport) this.notice = { kind: 'notes', sol, lines };
    this.persist();
    this.render();
  }

  /** Sounds and astronaut moments for an ended day (SPEC 11.2, 11.3). */
  private playDaySounds(events: SimEvent[]): void {
    const run = this.run!;
    const { tomorrow } = forecast(this.chapter(), run.chapterDay);
    const storm = tomorrow !== null && tomorrow.radiation >= 2 && !run.pendingReport;
    for (const name of daySounds(events, storm, run.state.question !== null)) {
      if (name === SOUND.chapterComplete) {
        this.reportMusicReady = false;
        this.sound.effect(name, () => {
          this.reportMusicReady = true;
          this.updateLoops();
        });
      } else this.sound.effect(name);
    }
    if (events.some((e) => e.type === 'goal_done' || e.type === 'chapter_end')) {
      this.map?.celebrate?.();
      this.sound.effect(SOUND.dance);
    }
    if (events.some((e) => e.type === 'unpowered' && e.building === 'home')) this.sound.effect(SOUND.shiver);
    // Power changes from the day itself are covered by the day's sounds.
    this.lastUnpowered = null;
  }

  private onKeepBuilding(): void {
    const run = this.run;
    if (!run || !keepBuilding(run, this.deps.book)) return;
    this.resetUi();
    this.reportConfirm = false;
    this.overlay = 'title';
    this.persist();
    this.render();
  }
}

/** Buttons that open a panel play the open-panel sound. */
const PANEL_ACTIONS = new Set(['open-sources', 'open-reports', 'open-report', 'open-settings', 'lost-report']);
/** Buttons whose sound is chosen where they are handled. */
const OWN_SOUND = new Set(['select', 'end-day', 'remove-yes']);

/** Widest a glossary bubble may be, in CSS pixels. */
const UI_GLOSS_WIDTH = 280;

function canAfford(state: GameState, type: PlaceableType): boolean {
  const cost = costOf(type);
  return state.parts >= cost.parts && state.soil >= cost.soil;
}

function isSame(a: { r: number; c: number }, b: { r: number; c: number } | null): boolean {
  return b !== null && a.r === b.r && a.c === b.c;
}

const SHIELD =
  '<svg class="badge__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const STORM_NOTE: StringKey[] = ['notes.storm1', 'notes.storm1', 'notes.storm2', 'notes.storm3'];

/** The scored prediction, in a friendly line (SPEC 8.2). */
export function predictionLine(e: Extract<SimEvent, { type: 'prediction_scored' }>): string {
  const name = buildingLower(e.building);
  if (e.saved) return t('notes.predictSaved', { name });
  if (e.right) return t(e.broke ? 'notes.predictRightBroke' : 'notes.predictRightFine', { name });
  return t(e.broke ? 'notes.predictWrongBroke' : 'notes.predictWrongFine', { name });
}

/** A short, calm list of what happened, from the day's events. The prediction result comes first. */
export function dayNotes(events: SimEvent[]): string[] {
  const lines: string[] = [];
  let broken = 0;
  const unlocked: string[] = [];
  let predicted: string | null = null;
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
      case 'prediction_scored':
        predicted = predictionLine(e);
        break;
    }
  }
  if (broken > 0) lines.splice(Math.min(1, lines.length), 0, broken === 1 ? t('notes.brokeOne') : t('notes.brokeMany', { n: broken }));
  if (unlocked.length > 0) lines.push(t('notes.unlocked', { names: unlocked.join(t('list.separator')) }));
  if (predicted) lines.unshift(predicted);
  return lines;
}
