import {scienceNote} from './learning.ts';
import { TOOL_KINDS, toolRowHtml, toolSheetHtml, type SlotView, type ToolKind } from './tools.ts';
import { readSlot, SLOT_COUNT, writeSlot } from '../save/slots.ts';
import {buyResearch} from '../sim/research.ts';
import {requestAid,repairBuilding} from '../sim/emergency.ts';
import {moveBuilding} from '../sim/move.ts';
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
  nextArchiveChapterId,
  place,
  previewDay,
  removeBuilding,
  removeShelter,
  shelterAt,
  shelterTiles,
  stageOf,
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
import { exportSave, importSave } from '../save/files.ts';
import { emptySave, loadSave, writeSave, type SaveFile, type SaveStorage } from '../save/save.ts';
import { guidedHint, missionControlMessage, nextAction, shelterHintTop, type Hint, type NextAction } from './advice.ts';
import { cardDue, cardSources, type Card, type SourceRow } from './content.ts';
import { failureChain } from './failureChain.ts';
import { esc, replayLine, shortDate } from './format.ts';
import { glossSentence, glossText } from './glossary.ts';
import { homeHtml } from './home.ts';
import { buildingAbout, buildingLower, buildingName, costOf, reasonText, stageName, starterGoalText, unlockGoalNumber } from './info.ts';
import type { CreateMap, MapView } from './mapView.ts';
import { recordSource, recordView, timelineCells } from './record.ts';
import { baseFacts, baseLines, buildReport, looksLikeReport, reportView, type ReportEntry } from './report.ts';
import { daySummary, stormLine } from './summary.ts';
import {
  backupHtml,
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
  goalBarHtml,
  goalSheetHtml,
  icon,
  lostHtml,
  missionControlItemHtml,
  msgHeadHtml,
  nextLineHtml,
  realCardBodyHtml,
  recordSheetHtml,
  recordStripHtml,
  stepsHtml,
  summaryBodyHtml,
  timelineHtml,
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

/** A short reaction line (a reason, a warning, an answer received), or a tapped building's card. */
type Notice =
  | { kind: 'text'; text: string; tone: 'info' | 'warn' }
  | { kind: 'building'; id: number; confirm: boolean }
  | { kind: 'shelter'; id: number; confirm: boolean };

/**
 * Panels over the play screen. The report itself shows whenever a report is pending. 'goal' and
 * 'record' are the sheets that open from the goal bar and the NASA record strip (SPEC 16.4).
 */
type Overlay = 'title' | 'confirmNewSite' | 'sources' | 'lostReport' | 'goal' | 'record' | 'importSave' | ToolKind | null;

/** One item of the morning's message queue (SPEC 16.4.1). */
type MsgItem =
  | { kind: 'summary'; sol: number }
  | { kind: 'card'; card: Card; sources: SourceRow[] }
  | { kind: 'mc' };

/** Screens reached from Home. */
type Screen = 'home' | 'sources' | 'reports' | 'report' | 'settings' | 'play';

export class App {
  private save: SaveFile = emptySave();
  private run: Run | null = null;
  private screen: Screen = 'home';
  private selected: PlaceableType | null = null;
  private movingId:number|null=null;
  private pendingImport:SaveFile|null=null;
  /** A save slot waiting for "yes" in the Save or Load sheet. */
  private slotConfirm: { mode: 'save' | 'load'; index: number } | null = null;
  /** A message on the Settings page (back up and restore). */
  private settingsNotice: string | null = null;
  private saveFailed=false;
  private outline: { r: number; c: number } | null = null;
  private wasteWarned: { type: PlaceableType; r: number; c: number } | null = null;
  private notice: Notice | null = null;
  private toolsNotice: { text: string; tone: 'info' | 'warn' } | null = null;
  private overlay: Overlay = null;
  private map: MapView | null = null;
  private playRoot: HTMLElement | null = null;
  private lastEndDay = -Infinity;
  private hint: Hint = null;
  private next: NextAction | null = null;
  private lastNextType: PlaceableType | null = null;
  /** Where the player is in this morning's message queue. */
  private queue = { key: '', index: 0 };
  /** The chapter day the record sheet shows. */
  private sheetDay = 1;
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
    window.addEventListener('outpost-save-error',()=>{this.saveFailed=true;if(this.screen==='play')this.render();});
    root.addEventListener('change', async (e) => {
      const input=e.target as HTMLInputElement; if(input.dataset.action!=='import-save' || !input.files?.[0]) return;
      try { const incoming=importSave(await input.files[0].text()); if(incoming.outpost){const chapter=this.deps.book.chapters[incoming.outpost.chapterId];if(!chapter||incoming.outpost.chapterDay>chapter.days.length+1)throw new Error('Unknown archive position');}this.pendingImport=incoming;if(this.screen==='settings'){this.settingsNotice=null;this.showScreen('settings');}else{this.overlay='importSave';this.render();} }
      catch {
        // Nothing changes. Inside the Load sheet the message shows there; elsewhere under the map.
        if (this.screen === 'settings') {
          this.pendingImport = null;
          this.settingsNotice = t('save.invalid');
          this.showScreen('settings');
          return;
        }
        if (this.overlay === 'load') this.toolsNotice = { tone: 'warn', text: t('save.invalid') };
        else this.notice = { kind: 'text', tone: 'warn', text: t('save.invalid') };
        input.value = '';
        this.render();
      }
    });
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
    this.sound.setGroupMuted('music',this.save.musicOff??false);
    this.sound.setGroupMuted('effects',this.save.effectsOff??false);
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
      this.root.innerHTML = pageHtml(
        t('settings.title'),
        settingsBodyHtml(this.run !== null, this.settingsConfirm, this.settingsCleared, this.save.muted) +
          backupHtml(this.run !== null, this.pendingImport ? { site: this.pendingImport.outpost?.siteNumber ?? 0, sol: this.pendingImport.outpost?.state.day ?? 0 } : null, this.settingsNotice),
        'go-home',
      );
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
    this.saveFailed=!writeSave(this.deps.storage, this.save);
  }

  private blocked(): boolean {
    const run = this.run;
    return !run || run.pendingReport || run.state.lost !== null || this.overlay !== null;
  }

  private resetUi(): void {
    this.selected = null;
    this.movingId = null;
    this.outline = null;
    this.wasteWarned = null;
    this.notice = null;
    this.toolsNotice = null;
  }

  private startNewRun(siteNumber: number): void {
    this.run = newRun(siteNumber, this.deps.book);
    this.resetUi();
    this.reportConfirm = false;
    this.queue = { key: '', index: 0 };
    this.overlay = 'title';
    this.persist();
    this.render();
  }

  // ---- Play screen ----

  private enterPlay(): void {
    this.screen = 'play';
    this.glossOpen = null;
    // Stacked rows: nothing sits on the map except its badges and the zoom buttons (SPEC 16.4.1).
    this.root.innerHTML = `<div class="play">
      <header class="topbar" data-part="top"></header>
      <nav class="run-tools" data-part="tools" aria-label="${esc(t('tool.rowAria'))}"></nav>
      <div class="goalrow" data-part="goal"></div>
      <div class="recordrow" data-part="record"></div>
      <section class="map" aria-label="${esc(t('map.aria'))}">
        <div class="map__canvas" data-part="canvas"><p class="map__loading">${esc(t('boot.loading'))}</p></div>
        <div class="map__badges" data-part="badges"></div>
        <div class="zoom">
          <button type="button" class="zoom__btn" data-action="zoom-in" aria-label="${esc(t('map.zoomIn'))}">+</button>
          <button type="button" class="zoom__btn" data-action="zoom-out" aria-label="${esc(t('map.zoomOut'))}">−</button>
        </div>
      </section>
      <section class="msg">
        <div class="msg__slot" data-part="msg" aria-live="polite"></div>
        <div class="donow" data-part="donow" aria-live="polite"></div>
      </section>
      <aside class="side">
        <section class="panel weather" data-part="weather"></section>
        <section class="panel tline" data-part="timeline"></section>
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
          onTileDrag: (r, c) => this.onTileDrag(r, c),
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

  /** The three save slots, each with what a child needs to tell them apart. */
  private slotViews(): SlotView[] {
    return Array.from({ length: SLOT_COUNT }, (_, index) => {
      const slot = readSlot(this.deps.storage, index);
      if (slot.kind !== 'ok') return { index, kind: slot.kind, line: '' };
      const r = slot.run;
      const chapter = this.deps.book.chapters[r.chapterId];
      const date = chapter?.days[Math.min(r.chapterDay, chapter.days.length) - 1]?.date;
      const line = t('slot.line', { site: r.siteNumber, sol: r.state.day, date: date ? shortDate(date) : '', stage: stageName(stageOf(r.state)), crew: r.state.crew });
      return { index, kind: 'ok', line };
    });
  }

  /** The tool sheet open now, if any. */
  private openTool(): ToolKind | null {
    const o = this.overlay;
    return o && (TOOL_KINDS as readonly string[]).includes(o) ? (o as ToolKind) : null;
  }

  /** The tool sheets work while the outpost runs, even though their sheet covers the screen. */
  private toolsUsable(): boolean {
    const run = this.run;
    return !!run && !run.pendingReport && run.state.lost === null && (this.overlay === null || this.openTool() !== null);
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
    const n = this.notice;
    const openBuilding = n && n.kind === 'building' ? n.id : null;
    this.next = blocked ? null : nextAction(run, chapter, this.selected, preview, openBuilding);
    const target = this.next?.target ?? null;

    this.setHtml('top', topBarHtml(run, chapter, preview, this.save.muted));
    this.setHtml('goal', goalBarHtml(state, blocked));
    const day = Math.min(run.chapterDay, chapter.days.length);
    const rec = recordView(chapter, day, run.chapterDay);
    this.setHtml('record', rec ? recordStripHtml(rec, blocked) : '');
    const ahead = state.research?.includes('fore')
      ? chapter.days
          .slice(run.chapterDay + 1, run.chapterDay + 3)
          .map((d) => `<p class="panel__note">${esc(d.date)} · ${esc(t('research.forecastLevel', { n: d.radiation }))}</p>`)
          .join('')
      : '';
    this.setHtml('weather', weatherHtml(today, tomorrow, false, day) + ahead);
    this.setHtml('timeline', timelineHtml(timelineCells(chapter, run.chapterDay), null));
    this.setHtml('tools', toolRowHtml(state, this.openTool(), !this.toolsUsable()));

    const grid = this.part('buildgrid');
    const scroll = grid ? grid.scrollLeft : 0;
    const nextType = target?.kind === 'build' ? target.type : null;
    this.setHtml('build', buildHtml(state, this.selected, nextType, blocked));
    const newGrid = this.part('buildgrid');
    if (newGrid) newGrid.scrollLeft = scroll;
    // When the ring moves to a new button, bring it into view in the phone's scrolling build bar.
    if (nextType && nextType !== this.lastNextType) {
      const el = newGrid?.querySelector<HTMLElement>('.bb.is-next');
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    this.lastNextType = nextType;

    this.setHtml('endrow', endRowHtml(state, blocked, target?.kind === 'end'));
    const mc = missionControlMessage(run, chapter);
    const shown = this.renderMessages(run, chapter, preview, mc, blocked);
    this.setHtml('donow', this.donowHtml(run, blocked));
    this.setHtml('overlay', this.overlayHtml());
    this.renderSound(run, shown === 'mc' ? mc.text : null, shown === 'card', preview);

    if (this.map) {
      // The map's pointer: the next action's tile, else the guided start's tile hint while placing.
      const hintTile = target?.kind === 'tile' ? { r: target.r, c: target.c } : this.hint?.kind === 'tile' ? { r: this.hint.r, c: this.hint.c } : null;
      this.map.render({
        state,
        highlight: this.highlightTiles(),
        outline: this.selected === 'shelter' ? this.outline : null,
        hintTile,
        unpowered: preview.power.unpowered.map((u) => u.buildingId),
        reducedMotion: this.deps.reducedMotion(),
        astronauts: astroWorld(run, chapter),
        placing: this.selected !== null && !blocked,
      });
      const wide = typeof window !== 'undefined' && window.innerWidth >= 900;
      this.map.setInsets(wide ? { top: 16, bottom: 96 } : { top: 0, bottom: 0 });
    }
    this.placeBadges(preview);
    this.renderGloss();
  }

  // ---- Sound (SPEC 11.3) ----

  /** Loops for the screen, and sounds for what changed since the last render. */
  private renderSound(run: Run, mcText: string | null, cardShown: boolean, preview: DayPreview): void {
    this.updateLoops();
    // Each new Mission Control message is wrapped in the radio sounds, when it comes up in the queue.
    if (mcText !== null && mcText !== this.lastMc) {
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

  // ---- The message area: one item at a time (SPEC 16.4.1) ----

  /** This morning's queue: the day summary, the "This was real" card, then the question or Mission Control. */
  private msgItems(run: Run, chapter: Chapter): MsgItem[] {
    const items: MsgItem[] = [];
    const state = run.state;
    if (!state.lost && !run.pendingReport) {
      const last = state.log[state.log.length - 1];
      if (last && last.sol === state.day - 1) items.push({ kind: 'summary', sol: last.sol });
      // The card never depends on the radio (SPEC 4.9).
      const card = cardDue(run, chapter);
      const sources = card ? cardSources(card) : null;
      if (card && sources) items.push({ kind: 'card', card, sources });
    }
    if (state.question || forecast(chapter, run.chapterDay).tomorrow?.radiation! >= 2) items.unshift({ kind: 'mc' });
    else items.push({ kind: 'mc' });
    return items;
  }

  /** Where the queue stands this morning. A new morning starts it again. */
  private queueIndex(run: Run, total: number): number {
    const key = this.morningKey(run);
    if (this.queue.key !== key) this.queue = { key, index: 0 };
    return Math.min(this.queue.index, total - 1);
  }

  /** Render the shown item; returns its kind for the sounds. */
  private renderMessages(run: Run, chapter: Chapter, preview: DayPreview, mc: ReturnType<typeof missionControlMessage>, blocked: boolean): MsgItem['kind'] | 'building' {
    const n = this.notice;
    if (n && (n.kind === 'building' || n.kind === 'shelter')) {
      this.setHtml('msg', this.buildingItemHtml(preview));
      return 'building';
    }
    const items = this.msgItems(run, chapter);
    const index = this.queueIndex(run, items.length);
    const item = items[index];
    const pos = { n: index + 1, total: items.length };
    let html: string;
    if (item.kind === 'summary') {
      const log = run.state.log[run.state.log.length - 1];
      html = `<div class="msg__item msg__item--summary notice">${msgHeadHtml(t('notes.title', { n: item.sol }), pos, 'msg.next', blocked)}
        <div class="msg__body">${summaryBodyHtml(daySummary(log))}</div></div>`;
    } else if (item.kind === 'card') {
      html = `<div class="msg__item msg__item--card">${msgHeadHtml(t('card.title'), pos, index < items.length - 1 ? 'msg.next' : 'msg.ok', blocked)}
        <div class="msg__body">${realCardBodyHtml(item.card, item.sources, this.cardBaseLine(run))}</div></div>`;
    } else {
      html = (index<items.length-1?msgHeadHtml(t('msg.next'),pos,'msg.next',blocked):'')+missionControlItemHtml(mc, blocked);
    }
    this.setHtml('msg', html);
    return item.kind;
  }

  /** One line about the base on the game day of yesterday's card, from the report's templates. */
  private cardBaseLine(run: Run): { title: string; line: string } | null {
    const log = run.state.log[run.state.log.length - 1];
    if (!log || log.sol !== run.state.day - 1) return null;
    const lines = baseLines(baseFacts(log));
    return lines.length ? { title: t('msg.yourBase', { n: log.sol }), line: lines[0] } : null;
  }

  /** The first-day strip of three steps (SPEC 16.4.2), following the player's real progress. */
  private tutorialSteps(run: Run): [boolean, boolean, boolean] | null {
    const state = run.state;
    if (this.save.taught || state.day !== 1 || state.log.length > 0) return null;
    const placed = state.buildings.length > config.STARTING_BASE.length || state.shelters.length > 0;
    return [placed || this.selected !== null, placed, false];
  }

  private donowHtml(run: Run, blocked: boolean): string {
    const n = this.notice;
    let flash = n && n.kind === 'text' ? { text: n.text, tone: n.tone } : null;
    if (!flash && this.saveFailed) flash = { text: t('save.failed'), tone: 'warn' };
    if (!flash && run.state.criticalDays) {
      flash = { text: t('critical.warning', { n: Math.max(0, config.LONG_RUN.rescueTurns - run.state.criticalDays) }), tone: 'warn' };
    } else if (!flash && run.state.buildings.some((b) => b.manualRepair)) {
      flash = { text: t('incident.warning'), tone: 'warn' };
    }
    const steps = blocked ? null : this.tutorialSteps(run);
    return (steps ? stepsHtml(steps) : '') + nextLineHtml(this.next, flash);
  }

  /** What comes after Keep building, in one line (SPEC 10.7). */
  private nextLine(run: Run): string {
    const next = nextArchiveChapterId(run, this.deps.book);
    if (next.replayDelta === 0) return t('report.nextChapter', { title: getChapter(this.deps.book, next.chapterId).title });
    return t('report.nextReplay', { replay: replayLine(getChapter(this.deps.book, next.chapterId), run.replay + next.replayDelta) });
  }

  private overlayHtml(): string {
    const run = this.run!;
    const tool = this.openTool();
    if (tool) return toolSheetHtml(tool, run.state, { slots: tool === 'save' || tool === 'load' ? this.slotViews() : [], confirm: this.slotConfirm, muted: this.save.muted, musicOff: this.save.musicOff ?? false, effectsOff: this.save.effectsOff ?? false, status: this.toolsNotice });
    if(this.overlay==='importSave'&&this.pendingImport) return `<div class="modal"><div class="modal__panel" role="dialog" aria-modal="true"><h2>${esc(t('save.replace'))}</h2><p>${esc(t('save.preview',{site:this.pendingImport.outpost?.siteNumber??0,sol:this.pendingImport.outpost?.state.day??0}))}</p><button class="button" data-action="import-yes">${esc(t('save.accept'))}</button><button class="button button--quiet" data-action="close-overlay">${esc(t('confirm.back'))}</button></div></div>`;
    if (this.overlay === 'sources') return sourcesModalHtml(nowPlaying(this.sound.ambienceName()));
    if (this.overlay === 'confirmNewSite') return confirmNewSiteHtml().replace('</div>\n    </div>',`<button class="button button--small" data-action="restart-same">${esc(t('restart.same'))}</button></div>\n    </div>`);
    if (this.overlay === 'title') return titleCardHtml(this.chapter(), run.replay);
    if (this.overlay === 'goal') return goalSheetHtml(run.state);
    if (this.overlay === 'record') {
      const chapter = this.chapter();
      const rec = recordView(chapter, this.sheetDay, run.chapterDay);
      const shown = Math.min(run.chapterDay, chapter.days.length);
      if (rec) return recordSheetHtml(rec, recordSource(), timelineCells(chapter, run.chapterDay), t('record.dayOf', { n: shown, total: chapter.days.length }));
    }
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

  private highlightTiles(): { r: number; c: number }[] {
    const run = this.run!;
    if(this.movingId!==null&&!this.blocked())return this.run!.state.buildings.flatMap(b=>[{r:b.r-1,c:b.c},{r:b.r+1,c:b.c},{r:b.r,c:b.c-1},{r:b.r,c:b.c+1}]).filter(t=>!buildingAt(this.run!.state,t.r,t.c));
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
    // Status marks never overlap: each is placed in order of importance, with its short words when
    // there is room, as an icon alone when it is crowded, and left out when even the icon would
    // cover another mark. The full words are always in the building's own card when it is tapped.
    const marks: BadgeMark[] = [];
    for (const b of state.buildings) {
      if (b.brokenDays > 0) {
        const short = b.brokenDays === 1 ? t('badge.dayOne') : t('badge.days', { n: b.brokenDays });
        const long = b.brokenDays === 1 ? t('badge.backTomorrow') : t('badge.backIn', { n: b.brokenDays });
        marks.push({ r: b.r, c: b.c, cls: 'badge--broken', icon: icon('icon_broken', 'badge__icon'), words: short, label: `${t('badge.broken')}. ${long}` });
      } else if (unpowered.includes(b.id)) {
        marks.push({ r: b.r, c: b.c, cls: 'badge--nopower', icon: icon('icon_no_power', 'badge__icon'), words: t('badge.noPower'), label: t('badge.noPower') });
      } else if (b.damagedDays > 0) {
        const short = b.damagedDays === 1 ? t('badge.dayOne') : t('badge.days', { n: b.damagedDays });
        const long = b.damagedDays === 1 ? t('badge.weakTomorrow') : t('badge.weakFor', { n: b.damagedDays });
        marks.push({ r: b.r, c: b.c, cls: 'badge--damaged', icon: icon('icon_power', 'badge__icon'), words: short, label: long });
      }
    }
    type Box = { x0: number; y0: number; x1: number; y1: number };
    const placed: Box[] = [];
    const boxAt = (x: number, y: number, w: number, h: number): Box => ({ x0: x - w / 2, y0: y - h, x1: x + w / 2, y1: y });
    const hits = (box: Box, skip?: Box) => placed.some((p) => p !== skip && box.x0 < p.x1 && p.x0 < box.x1 && box.y0 < p.y1 && p.y0 < box.y1);
    const fits = (x: number, y: number, w: number, h: number) => {
      const box = boxAt(x, y, w, h);
      return hits(box) ? null : box;
    };
    const items: string[] = [];
    const pos = (x: number, y: number) => `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px`;
    // First every mark as an icon, most important first; then words where they still fit.
    const shown: { m: BadgeMark; x: number; y: number; box: Box }[] = [];
    for (const m of marks) {
      const p = map.tileToScreen(m.r, m.c, RENDER.badgeLift);
      const box = fits(p.x, p.y, BADGE.iconW, BADGE.h);
      if (!box) continue;
      placed.push(box);
      shown.push({ m, x: p.x, y: p.y, box });
    }
    for (const sh of shown) {
      const wide = boxAt(sh.x, sh.y, BADGE.iconW + sh.m.words.length * BADGE.charW, BADGE.h);
      const full = !hits(wide, sh.box);
      if (full) placed[placed.indexOf(sh.box)] = wide;
      const words = full ? `<span class="badge__words" aria-hidden="true">${esc(sh.m.words)}</span>` : '';
      items.push(`<div class="badge ${sh.m.cls}${full ? '' : ' badge--icon'}" role="img" aria-label="${esc(sh.m.label)}" style="${pos(sh.x, sh.y)}">${sh.m.icon}${words}</div>`);
    }
    // A small shield on each shelter, only where it covers no other mark. Never the word (SPEC 18 review).
    for (const sh of state.shelters) {
      const p = map.tileToScreen(sh.r, sh.c, RENDER.shelterBadgeLift);
      const box = fits(p.x, p.y, BADGE.shieldW, BADGE.shieldW);
      if (!box) continue;
      placed.push(box);
      items.push(`<div class="badge badge--shelter badge--icon" aria-hidden="true" style="${pos(p.x, p.y)}">${SHIELD}</div>`);
    }
    if (this.selected === 'shelter' && this.outline) {
      const p = map.tileToScreen(this.outline.r, this.outline.c, -RENDER.tileHeight / 2);
      items.push(`<div class="badge badge--label" style="${pos(p.x, p.y)}">${esc(t('place.shelterHere'))}</div>`);
    }
    const hint = this.hint;
    const target = this.next?.target;
    const label = (r: number, c: number, text: string) => {
      const p = map.tileToScreen(r, c, -RENDER.tileHeight / 2);
      items.push(`<div class="badge badge--label badge--hint" style="${pos(p.x, p.y)}">${esc(text)}</div>`);
    };
    if (hint && hint.kind === 'tile') label(hint.r, hint.c, hint.label);
    else if (target && target.kind === 'tile') label(target.r, target.c, t('hint.buildNear'));
    const html = items.join('');
    if (layer.innerHTML !== html) layer.innerHTML = html;
  }

  // ---- A tapped building's card, shown in the message area until it is closed ----

  private buildingItemHtml(preview: DayPreview): string {
    const n = this.notice;
    const run = this.run!;
    if (!n || n.kind === 'text') return '';
    const close = `<button type="button" class="notice__close" data-action="close-notice" aria-label="${esc(t('notice.close'))}">×</button>`;
    const state = run.state;
    if (n.kind === 'shelter') {
      const s = state.shelters.find((x) => x.id === n.id);
      if (!s) return '';
      const empty = true;
      return this.buildingCardHtml(buildingName('shelter'), buildingAbout('shelter'), [t('info.sheltered')], empty, n.confirm, close);
    }
    const b = state.buildings.find((x) => x.id === n.id);
    if (!b) return '';
    const status: string[] = [];
    if (b.brokenDays > 0) status.push(b.brokenDays === 1 ? t('info.brokenOne') : t('info.brokenMany', { n: b.brokenDays }));
    else if (preview.power.unpowered.some((u) => u.buildingId === b.id)) status.push(t('info.noPower'));
    if (b.damagedDays > 0) status.push(b.damagedDays === 1 ? t('badge.weakTomorrow') : t('badge.weakFor', { n: b.damagedDays }));
    if (isSheltered(state, b.r, b.c)) status.push(t('info.sheltered'));
    const repair =
      b.manualRepair || b.brokenDays > 0 || b.damagedDays > 0
        ? `<button type="button" class="button button--small" data-action="repair" data-id="${b.id}">${esc(t('repair.button', { n: config.LONG_RUN.repairParts }))}</button>`
        : '';
    const tools = b.type !== 'pad' ? `<button type="button" class="button button--small button--quiet" data-action="move-building" data-id="${b.id}">${esc(t('move.button'))}</button>` : '';
    const shield = shelterAt(state, b.r, b.c);
    const uncover = shield ? `<button type="button" class="button button--small button--quiet" data-action="uncover" data-id="${shield.id}">${esc(t('shield.remove'))}</button>` : '';
    const extraBtns = `${repair}${tools}${uncover}`;
    return this.buildingCardHtml(buildingName(b.type), buildingAbout(b.type), status, BUILDINGS[b.type].removable, n.confirm, close, extraBtns, scienceNote(b.type));
  }

  private buildingCardHtml(
    name: string,
    about: string,
    status: string[],
    removable: boolean,
    confirm: boolean,
    close: string,
    extraButtons = '',
    extraBody = '',
  ): string {
    const statusHtml = status.length ? `<p class="notice__status">${status.map(esc).join(' ')}</p>` : '';
    let actions = '';
    if (!this.blocked() && (removable || extraButtons)) {
      const ring = this.next?.target?.kind === 'remove' ? ' is-next' : '';
      const removeBtn = removable ? `<button type="button" class="button button--small button--quiet${ring}" data-action="remove">${esc(t('remove.button'))}</button>` : '';
      actions = confirm
        ? `<p class="notice__confirm">${esc(t('remove.ask'))}</p>
           <div class="notice__buttons">
             <button type="button" class="button button--small button--danger" data-action="remove-yes">${esc(t('remove.yes'))}</button>
             <button type="button" class="button button--small button--quiet" data-action="remove-no">${esc(t('remove.no'))}</button>
           </div>`
        : `<div class="notice__buttons">${extraButtons}${removeBtn}</div>`;
    }
    return `<div class="msg__item msg__item--building notice--card"><div class="msg__head"><span class="msg__title">${esc(name)}</span>${close}</div>
      <div class="msg__body"><p>${glossText(about)}</p>${statusHtml}${actions}${extraBody}</div></div>`;
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
    const rawTarget = e.target as HTMLElement | null;
    const target = rawTarget?.closest<HTMLElement>('[data-action]');
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
      case 'tool': {
        // Open one tool's sheet; tapping the open tool again closes it.
        const kind = target.dataset.tool as ToolKind;
        if (!TOOL_KINDS.includes(kind) || !this.toolsUsable()) break;
        this.toolsNotice = null;
        this.slotConfirm = null;
        this.overlay = this.overlay === kind ? null : kind;
        // The game saves itself every day; opening Save also saves now and says so.
        if (this.overlay === 'save') {
          this.persist();
          this.toolsNotice = this.saveFailed ? { tone: 'warn', text: t('save.failed') } : { tone: 'info', text: t('save.saved') };
        }
        this.render();
        break;
      }
      case 'restore-save':
        try {
          const raw = this.deps.storage?.getItem('recovery');
          if (!raw) throw new Error('No backup');
          this.pendingImport = importSave(raw);
          this.settingsNotice = null;
        } catch {
          this.settingsNotice = t('save.noBackup');
        }
        if (this.screen === 'settings') this.showScreen('settings');
        break;
      case 'music-toggle':
        if (this.save.muted) {
          this.save.muted = false;
          this.save.musicOff = false;
          this.save.effectsOff = true;
          this.sound.setMuted(false);
          this.sound.setGroupMuted('effects', true);
          this.sound.setGroupMuted('music', false);
        } else {
          this.save.musicOff = !(this.save.musicOff ?? false);
          this.sound.setGroupMuted('music', this.save.musicOff);
        }
        this.sound.unlock();
        this.updateLoops();
        this.toolsNotice = { tone: 'info', text: t(this.save.musicOff ? 'tools.musicTurnedOff' : 'tools.musicTurnedOn') };
        this.persist();
        this.render();
        break;
      case 'effects-toggle':
        if (this.save.muted) {
          this.save.muted = false;
          this.save.effectsOff = false;
          this.save.musicOff = true;
          this.sound.setMuted(false);
          this.sound.setGroupMuted('music', true);
          this.sound.setGroupMuted('effects', false);
        } else {
          this.save.effectsOff = !(this.save.effectsOff ?? false);
          this.sound.setGroupMuted('effects', this.save.effectsOff);
        }
        this.sound.unlock();
        if (!this.save.effectsOff) this.sound.effect(SOUND.tap);
        this.toolsNotice = { tone: 'info', text: t(this.save.effectsOff ? 'tools.effectsTurnedOff' : 'tools.effectsTurnedOn') };
        this.persist();
        this.render();
        break;
      case 'research':
      case 'notebook':
        if (this.toolsUsable()) {
          this.toolsNotice = null;
          this.overlay = action;
          this.render();
        }
        break;
      case 'research-buy':
        if (this.overlay === 'research' && this.toolsUsable()) {
          if (buyResearch(this.run!.state, target.dataset.id ?? '')) {
            this.sound.effect('evt_research_done');
            this.toolsNotice = { tone: 'info', text: t('research.bought') };
            this.persist();
          } else {
            this.sound.effect(SOUND.cant);
            this.toolsNotice = { tone: 'warn', text: t('research.cannot') };
          }
          this.render();
        }
        break;
      case 'import-yes':
        if (this.pendingImport) {
          this.save = this.pendingImport;
          this.pendingImport = null;
          this.run = this.save.outpost;
          this.sound.setMuted(this.save.muted);
          this.sound.setGroupMuted('music', this.save.musicOff ?? false);
          this.sound.setGroupMuted('effects', this.save.effectsOff ?? false);
          this.persist();
          this.overlay = null;
          this.onStart();
        }
        break;
      case 'repair':
        if (!this.blocked()) {
          const ok = repairBuilding(this.run!.state, Number(target.dataset.id));
          if (ok) {
            this.sound.effect(SOUND.place);
            this.notice = { kind: 'text', tone: 'info', text: t('repair.done') };
          } else this.notice = { kind: 'text', tone: 'warn', text: t('repair.failed', { n: config.LONG_RUN.repairParts }) };
          this.persist();
          this.render();
        }
        break;
      case 'aid':
      case 'paid-aid':
        if (this.toolsUsable()) {
          const paid = action === 'paid-aid';
          const res = requestAid(this.run!.state, paid);
          if (res.ok) {
            this.sound.effect(SOUND.requestDone);
            this.toolsNotice = { tone: 'info', text: t('aid.arrived') };
            this.persist();
          } else {
            this.sound.effect(SOUND.cant);
            const s = this.run!.state;
            const freeLeft = Math.max(0, config.LONG_RUN.freeAid - (s.aid?.used ?? 0));
            const msg = paid && s.parts < config.LONG_RUN.paidAidCost
              ? t('tools.paidNeedParts')
              : !paid && freeLeft <= 0
                ? t('aid.unavailable')
                : t('tools.aidWhen');
            this.toolsNotice = { tone: 'warn', text: msg };
          }
          this.render();
        }
        break;
      case 'move-building':
        if(!this.blocked()){this.movingId=Number(target.dataset.id);this.notice={kind:'text',tone:'info',text:t('move.hint')};this.render();}break;
      case 'uncover':
        if (!this.blocked() && removeShelter(this.run!.state, Number(target.dataset.id)).ok) {
          this.sound.effect(SOUND.remove);
          this.notice = { kind: 'text', tone: 'info', text: t('shield.removed') };
          this.persist();
          this.render();
        }
        break;
      case 'restart-same':
        if(this.overlay==='confirmNewSite')this.startNewRun(this.run!.siteNumber);break;
      case 'restart':
        this.overlay = 'confirmNewSite'; this.render(); break;
      case 'export-save': {
        this.persist();
        const url = URL.createObjectURL(new Blob([exportSave(this.save)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `outpost-sol-${this.run?.state.day ?? 0}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.settingsNotice = t('tools.exported');
        if (this.screen === 'settings') this.showScreen('settings');
        break;
      }
      case 'toggle-mute':
        this.save.muted = !this.save.muted;
        if (!this.save.muted && this.save.musicOff && this.save.effectsOff) {
          this.save.musicOff = false;
          this.save.effectsOff = false;
          this.sound.setGroupMuted('music', false);
          this.sound.setGroupMuted('effects', false);
        }
        this.sound.setMuted(this.save.muted);
        if (!this.save.muted) {
          this.sound.unlock();
          this.updateLoops();
        }
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
      case 'import-no':
        this.pendingImport = null;
        if (this.screen === 'settings') this.showScreen('settings');
        break;
      case 'go-home':
        this.pendingImport = null;
        this.settingsNotice = null;
        this.settingsConfirm = false;
        this.settingsCleared = false;
        this.showScreen('home');
        break;
      case 'open-sources':
        if (this.screen === 'play') {
          if (this.overlay === null || this.overlay === 'title' || this.overlay === 'goal' || this.overlay === 'record') {
            this.overlay = 'sources';
            this.render();
          }
        } else this.showScreen('sources');
        break;
      case 'slot-save':
      case 'slot-load': {
        const index = Number(target.dataset.slot);
        const mode = action === 'slot-save' ? 'save' : 'load';
        if (!this.toolsUsable() || this.overlay !== mode) break;
        this.toolsNotice = null;
        // Saving into an empty slot needs no question; saving over one, or loading, asks first.
        if (mode === 'save' && readSlot(this.deps.storage, index).kind === 'empty') this.saveToSlot(index);
        else this.slotConfirm = { mode, index };
        this.render();
        break;
      }
      case 'slot-save-yes':
        if (this.toolsUsable() && this.overlay === 'save') this.saveToSlot(Number(target.dataset.slot));
        this.render();
        break;
      case 'slot-load-yes': {
        const index = Number(target.dataset.slot);
        if (!this.toolsUsable() || this.overlay !== 'load') break;
        const slot = readSlot(this.deps.storage, index);
        this.slotConfirm = null;
        if (slot.kind !== 'ok') {
          this.sound.effect(SOUND.cant);
          this.toolsNotice = { tone: 'warn', text: t(slot.kind === 'unavailable' ? 'slot.unavailable' : 'slot.damaged') };
          this.render();
          break;
        }
        this.run = slot.run;
        this.resetUi();
        this.persist();
        this.overlay = null;
        this.onStart();
        this.notice = { kind: 'text', tone: 'info', text: t('slot.loaded', { n: index + 1 }) };
        this.render();
        break;
      }
      case 'slot-no':
        this.slotConfirm = null;
        this.render();
        break;
      case 'close-overlay':
        this.overlay = null;
        this.slotConfirm = null;
        this.toolsNotice = null;
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
      case 'msg-next':
        // Move on to the next waiting message. Uses no day.
        if (this.run && !this.blocked()) {
          this.queueIndex(this.run, Infinity);
          this.queue.index++;
          this.render();
        }
        break;
      case 'open-goal':
        if (this.run && this.overlay === null) {
          this.overlay = 'goal';
          this.render();
        }
        break;
      case 'open-record':
      case 'open-day':
        if (this.run && (this.overlay === null || this.overlay === 'record')) {
          this.sheetDay = Math.max(1, Number(target.dataset.day) || 1);
          this.overlay = 'record';
          this.render();
        }
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

  /** Save the outpost into a slot and say whether it worked, in plain words. */
  private saveToSlot(index: number): void {
    this.slotConfirm = null;
    if (this.run && writeSlot(this.deps.storage, index, this.run)) {
      this.sound.effect(SOUND.place);
      this.toolsNotice = { tone: 'info', text: t('slot.saved', { n: index + 1 }) };
    } else {
      this.sound.effect(SOUND.cant);
      this.toolsNotice = { tone: 'warn', text: t('slot.noRoom') };
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
    this.movingId=null;
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
    if(this.movingId!==null){if(moveBuilding(state,this.movingId,r,c).ok){this.resetUi();this.notice={kind:'text',tone:'info',text:t('move.done')};this.sound.effect(SOUND.place);this.persist();}else this.notice={kind:'text',tone:'warn',text:t('move.invalid')};this.render();return;}
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
    const check = canPlaceShelter(state, r, c);
    if (check.ok) {
      place(state, 'shelter', r, c);
      this.afterPlace('shelter');
      return;
    }
    this.sound.effect(SOUND.cant);
    this.notice = { kind: 'text', tone: 'warn', text: reasonText(check.reason) };
    this.render();
  }

  private onTileDrag(r: number, c: number): void {
    const run = this.run;
    if (!run || this.blocked() || this.movingId !== null) return;
    const type = this.selected;
    if (!type) return;
    const check = canPlace(run.state, type, r, c);
    if (!check.ok || check.wastesDeposit) return;
    place(run.state, type, r, c);
    this.afterPlace(type);
  }

  private onRemove(): void {
    const run = this.run;
    const n = this.notice;
    if (!run || this.blocked() || !n) return;
    const before = run.state.parts;
    if (n.kind === 'building') removeBuilding(run.state, n.id);
    else if (n.kind === 'shelter') removeShelter(run.state, n.id);
    else return;
    this.sound.effect(SOUND.remove);
    const back = run.state.parts - before;
    this.notice = { kind: 'text', tone: 'info', text: back > 0 ? t('remove.done', { n: back }) : t('remove.doneNone') };
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
    // The day summary is the first item of the next morning's queue (SPEC 16.4.3).
    // After the first day ever ends, the three-step strip is not shown again.
    this.save.taught = true;
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
    if (events.some((e) => e.type === 'goal_done' || e.type === 'chapter_end' || e.type === 'stage_up')) {
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
const PANEL_ACTIONS = new Set(['open-sources', 'open-reports', 'open-report', 'open-settings', 'lost-report', 'research', 'notebook', 'tool']);
/** Buttons whose sound is chosen where they are handled. */
const OWN_SOUND = new Set(['select', 'end-day', 'remove-yes', 'effects-toggle', 'aid', 'paid-aid']);

/** Widest a glossary bubble may be, in CSS pixels. */
const UI_GLOSS_WIDTH = 280;

function canAfford(state: GameState, type: PlaceableType): boolean {
  const cost = costOf(type);
  return state.parts >= cost.parts && state.soil >= cost.soil;
}

/** One status mark over the map: its icon, its short words when there is room, and its spoken label. */
interface BadgeMark {
  r: number;
  c: number;
  cls: string;
  icon: string;
  words: string;
  label: string;
}

/** Rough sizes of a mark in CSS pixels, for keeping marks apart. */
const BADGE = { iconW: 32, charW: 8, h: 28, shieldW: 20 } as const;

const SHIELD =
  '<svg class="badge__icon badge__icon--small" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
        lines.push(stormLine(e));
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
        lines.push(e.goal.rewardParts > 0 ? t('notes.goal', { n: e.goal.rewardParts }) : t('notes.goalNoParts'));
        break;
      case 'unlocked':
        unlocked.push(buildingName(e.building));
        break;
      case 'map_grew':
        lines.push(t('notes.mapGrew'));
        break;
      case 'stage_up':
        lines.push(t('notes.stageUp', { stage: stageName(e.stage) }));
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
