// Sound (SPEC 11.3). Which sound plays when, and the rules around it: only approved entries of
// audio.json are ever loaded or played, nothing plays before the first tap, a missing file is
// silent, and nothing here ever throws. No Phaser: the map supplies a backend that plays sounds.

import audioJson from '../data/audio.json';
import { config, type SimEvent } from '../sim/index.ts';
import { t } from './strings.ts';

const { AUDIO } = config;

export interface AudioEntry {
  name: string;
  approved: boolean;
  realRecording: boolean;
  source: string;
  sourceUrl: string;
  edits: string;
}

export const AUDIO_ENTRIES = audioJson as AudioEntry[];

/** Every moment in the game that has a sound, by name (the list at the end of SPEC 11.3). */
export const SOUND = {
  tap: 'ui_tap',
  select: 'ui_select',
  cant: 'ui_cant',
  openPanel: 'ui_open_panel',
  endDay: 'ui_end_day',
  place: 'bld_place',
  remove: 'bld_remove',
  powerDown: 'bld_power_down',
  powerUp: 'bld_power_up',
  broken: 'bld_broken',
  repaired: 'bld_repaired',
  stormWarning: 'evt_storm_warning',
  stormHit: 'evt_storm_hit',
  rocketLand: 'evt_rocket_land',
  surveyExpand: 'evt_survey_expand',
  requestDone: 'evt_request_done',
  chapterComplete: 'evt_chapter_complete',
  runOver: 'evt_run_over',
  question: 'prd_question',
  right: 'prd_right',
  wrong: 'prd_wrong',
  radioOpen: 'mc_radio_open',
  radioClose: 'mc_radio_close',
  typing: 'mc_typing',
  realEvent: 'mc_real_event',
  dance: 'astro_dance',
  shiver: 'astro_shiver',
  windMars: 'amb_mars_wind',
  solarStorm: 'amb_solar_storm',
  moonBase: 'amb_moon_base',
  calm: 'mus_calm_loop',
  report: 'mus_report',
} as const;

export type SoundName = (typeof SOUND)[keyof typeof SOUND];

/** Named in SPEC 11.3 for later phases. No moment of this phase plays them. */
export const LATER_PHASE_SOUNDS = ['evt_dust_arrive', 'evt_night_fall', 'evt_research_done', 'evt_notebook_page', 'amb_mars_dust_storm'] as const;

/** Mission Control sounds: ambience and music are lowered while one plays. */
export const MESSAGE_WRAP: SoundName[] = [SOUND.radioOpen, SOUND.typing, SOUND.radioClose];

export type SoundGroup = 'ambience' | 'effects' | 'music';

export function groupOf(name: string): SoundGroup {
  if (name.startsWith('amb_')) return 'ambience';
  if (name.startsWith('mus_')) return 'music';
  return 'effects';
}

/** The names the game may load: approved entries only. */
export function approvedSounds(entries: readonly AudioEntry[] = AUDIO_ENTRIES): string[] {
  return entries.filter((e) => e.approved === true).map((e) => e.name);
}

/**
 * The "Now playing" line (SPEC 9.4, 11.3): only for an approved entry marked as a checked real
 * recording with the exact original clip's link, and only when the line has approved words.
 */
export function nowPlaying(name: string | null, entries: readonly AudioEntry[] = AUDIO_ENTRIES): { text: string; url: string } | null {
  if (!name) return null;
  const e = entries.find((x) => x.name === name);
  if (!e || !e.approved || e.realRecording !== true || typeof e.sourceUrl !== 'string' || e.sourceUrl.trim() === '') return null;
  // Only the Mars wind has approved words (SPEC 11.3).
  if (name !== SOUND.windMars) return null;
  return { text: t('sound.nowPlayingWind'), url: e.sourceUrl.trim() };
}

/** The ambience loops wanted, best first: the first one that can play is used (one at a time). */
export function ambienceFor(site: string, radiationToday: number): SoundName[] {
  const base: SoundName = site === 'moon' ? SOUND.moonBase : SOUND.windMars;
  return radiationToday > 0 ? [SOUND.solarStorm, base] : [base];
}

/**
 * The event sounds for an ended day, most important first, at most AUDIO.maxDaySounds.
 * `stormTomorrow`: tomorrow's radiation is 2 or more. `question`: a predict question was asked this morning.
 */
export function daySounds(events: readonly SimEvent[], stormTomorrow: boolean, question: boolean): SoundName[] {
  const has = (type: SimEvent['type']) => events.some((e) => e.type === type);
  const out: SoundName[] = [];
  if (has('lost')) out.push(SOUND.runOver);
  if (has('chapter_end')) out.push(SOUND.chapterComplete);
  if (events.some((e) => e.type === 'storm' && e.level >= AUDIO.stormHitLevel)) out.push(SOUND.stormHit);
  if (has('broken')) out.push(SOUND.broken);
  const scored = events.find((e) => e.type === 'prediction_scored');
  if (scored && scored.type === 'prediction_scored') out.push(scored.right ? SOUND.right : SOUND.wrong);
  if (has('goal_done')) out.push(SOUND.requestDone);
  if (has('map_grew')) out.push(SOUND.surveyExpand);
  if (has('rocket_landed')) out.push(SOUND.rocketLand);
  if (has('repaired')) out.push(SOUND.repaired);
  if (stormTomorrow && !has('lost')) out.push(SOUND.stormWarning);
  if (question) out.push(SOUND.question);
  return out.slice(0, AUDIO.maxDaySounds);
}

// ---- Playing ----

export interface SoundHandle {
  setVolume(volume: number): void;
  stop(): void;
}

/** What the map's audio engine offers. Every call may fail; the board catches. */
export interface SoundBackend {
  /** True when the sound finished loading and can play. */
  has(name: string): boolean;
  /** Start a sound. `onEnd` runs when a sound that does not loop finishes. */
  play(name: string, volume: number, loop: boolean, onEnd: () => void): SoundHandle | null;
  setMuted(muted: boolean): void;
}

interface Loop {
  name: string;
  group: SoundGroup;
  handle: SoundHandle;
}

/**
 * Plays sounds by name. Unapproved, unloaded and missing sounds are skipped silently.
 * One ambience loop and at most one music track play together; both are lowered while a
 * Mission Control sound plays.
 */
export class SoundBoard {
  private backend: SoundBackend | null = null;
  private unlocked = false;
  private muted = false;
  private readonly approved: Set<string>;
  private ambienceWanted: string[] = [];
  private musicWanted: string | null = null;
  private ambience: Loop | null = null;
  private music: Loop | null = null;
  private ducks = 0;

  constructor(entries: readonly AudioEntry[] = AUDIO_ENTRIES) {
    this.approved = new Set(approvedSounds(entries));
  }

  /** The names the map should load. */
  toLoad(): string[] {
    return [...this.approved];
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  /** The ambience loop playing now, for the "Now playing" line. */
  ambienceName(): string | null {
    return this.ambience ? this.ambience.name : null;
  }

  attach(backend: SoundBackend): void {
    this.backend = backend;
    this.safe(() => backend.setMuted(this.muted));
    this.refresh();
  }

  detach(): void {
    this.stopLoop('ambience');
    this.stopLoop('music');
    this.ducks = 0;
    this.backend = null;
  }

  /** The first tap: from now on sounds may play (SPEC 11.3). */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.refresh();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const b = this.backend;
    if (b) this.safe(() => b.setMuted(muted));
  }

  /** A one-shot effect. `onDone` runs when it ends, or at once when it cannot play. */
  effect(name: string, onDone?: () => void): void {
    if (this.muted || !this.start(name, false, () => onDone?.())) onDone?.();
  }

  /** A Mission Control sound sequence: each starts when the one before ends; loops are lowered meanwhile. */
  message(names: readonly string[]): void {
    if (this.muted) return;
    const queue = names.filter((n) => this.canPlay(n));
    if (queue.length === 0) return;
    this.ducks++;
    this.applyVolumes();
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      this.ducks = Math.max(0, this.ducks - 1);
      this.applyVolumes();
    };
    const next = (i: number): void => {
      if (i >= queue.length) return done();
      if (!this.start(queue[i], false, () => next(i + 1))) next(i + 1);
    };
    next(0);
  }

  /** The ambience wanted now, best first; the first that can play is used. */
  setAmbience(candidates: readonly string[]): void {
    this.ambienceWanted = [...candidates];
    this.refresh();
  }

  setMusic(name: string | null): void {
    this.musicWanted = name;
    this.refresh();
  }

  /** Start or switch the loops to match what is wanted. Call again once more sounds have loaded. */
  refresh(): void {
    const amb = this.ambienceWanted.find((n) => this.canPlay(n)) ?? null;
    this.setLoop('ambience', amb);
    const mus = this.musicWanted && this.canPlay(this.musicWanted) ? this.musicWanted : null;
    this.setLoop('music', mus);
  }

  private canPlay(name: string): boolean {
    const b = this.backend;
    if (!this.unlocked || !b || !this.approved.has(name)) return false;
    return this.safe(() => b.has(name)) === true;
  }

  private volumeOf(group: SoundGroup): number {
    const v = AUDIO.volume[group];
    return group === 'effects' || this.ducks === 0 ? v : v * AUDIO.duckShare;
  }

  /** Play once or loop. Returns false when the sound could not start. */
  private start(name: string, loop: boolean, onEnd: () => void): SoundHandle | null {
    const b = this.backend;
    if (!b || !this.canPlay(name)) return null;
    return this.safe(() => b.play(name, this.volumeOf(groupOf(name)), loop, onEnd)) ?? null;
  }

  private setLoop(group: 'ambience' | 'music', name: string | null): void {
    const current = group === 'ambience' ? this.ambience : this.music;
    if ((current ? current.name : null) === name) return;
    this.stopLoop(group);
    if (!name) return;
    const handle = this.start(name, true, () => undefined);
    const loop = handle ? { name, group, handle } : null;
    if (group === 'ambience') this.ambience = loop;
    else this.music = loop;
  }

  private stopLoop(group: 'ambience' | 'music'): void {
    const current = group === 'ambience' ? this.ambience : this.music;
    if (current) this.safe(() => current.handle.stop());
    if (group === 'ambience') this.ambience = null;
    else this.music = null;
  }

  private applyVolumes(): void {
    for (const loop of [this.ambience, this.music]) {
      if (loop) this.safe(() => loop.handle.setVolume(this.volumeOf(loop.group)));
    }
  }

  private safe<T>(fn: () => T): T | undefined {
    try {
      return fn();
    } catch {
      return undefined;
    }
  }
}
