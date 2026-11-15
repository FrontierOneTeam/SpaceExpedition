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
  /** Seconds of silent start to skip, also on every loop (SPEC 11.3). */
  startAt?: number;
  /** Playback multiplier that levels this sound with the others (1 when missing). Measured with ffmpeg, see `edits`. */
  gain?: number;
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
  windMarsReal: 'amb_mars_wind_real',
  solarStorm: 'amb_solar_storm',
  moonBase: 'amb_moon_base',
  habitat: 'mus_habitat',
  groove: 'mus_groove',
  drone: 'mus_drone',
  theme: 'mus_theme',
  stormMusic: 'mus_storm',
} as const;

/** The building playlist: each track plays once to its end, then the next, then around again. */
export const PLAYLIST: readonly SoundName[] = [SOUND.habitat, SOUND.groove, SOUND.drone];

/** The music tracks of the first versions, replaced by the five above. Kept in audio.json as unapproved, never loaded. */
export const RETIRED_SOUNDS = ['mus_calm_loop', 'mus_report'] as const;

/** What the music is for: the playlist while building, the main theme on the report, the storm track on a storm day. */
export type MusicMode = 'build' | 'report' | 'storm';

/** The music mode for the screen now. Null: no music (the run is lost and no report is open). */
export function musicModeFor(reportOpen: boolean, lost: boolean, radiationToday: number): MusicMode | null {
  if (reportOpen) return 'report';
  if (lost) return null;
  return radiationToday >= AUDIO.stormMusicLevel ? 'storm' : 'build';
}

export type SoundName = (typeof SOUND)[keyof typeof SOUND];

/** Named in SPEC 11.3 for later phases. No moment of this phase plays them. */
export const LATER_PHASE_SOUNDS = ['evt_dust_arrive', 'evt_night_fall', 'evt_research_done', 'evt_notebook_page', 'amb_mars_dust_storm'] as const;

/** A sound that stands in for another when the other cannot load (SPEC 16.4 point 7). */
export const FALLBACK: Readonly<Record<string, string>> = { [SOUND.windMarsReal]: SOUND.windMars };

/** Mission Control sounds: ambience and music are lowered while one plays. */
export const MESSAGE_WRAP: SoundName[] = [SOUND.radioOpen, SOUND.typing, SOUND.radioClose];

export type SoundGroup = 'ambience' | 'effects' | 'music';

export function groupOf(name: string): SoundGroup {
  if (name.startsWith('amb_')) return 'ambience';
  if (name.startsWith('mus_')) return 'music';
  return 'effects';
}

/** Every approved entry, whether or not it is loaded at the start. */
export function allApprovedSounds(entries: readonly AudioEntry[] = AUDIO_ENTRIES): string[] {
  return entries.filter((e) => e.approved === true).map((e) => e.name);
}

/**
 * The music tracks, loaded only after the first tap so the first visit stays small. They are
 * approved entries that start with mus_.
 */
export function musicSounds(entries: readonly AudioEntry[] = AUDIO_ENTRIES): string[] {
  return allApprovedSounds(entries).filter((n) => groupOf(n) === 'music');
}

/**
 * The names the map loads when it opens: approved entries only, minus the music (loaded after the
 * first tap), minus sounds of later phases that nothing plays, minus a stand-in whose real sound
 * is approved (it is loaded only if the real one fails).
 */
export function approvedSounds(entries: readonly AudioEntry[] = AUDIO_ENTRIES): string[] {
  const all = allApprovedSounds(entries);
  const later = new Set<string>(LATER_PHASE_SOUNDS);
  const standIns = new Set(Object.entries(FALLBACK).filter(([real]) => all.includes(real)).map(([, stand]) => stand));
  return all.filter((n) => groupOf(n) !== 'music' && !later.has(n) && !standIns.has(n));
}

/** The playback multiplier of a sound: its `gain` in audio.json, 1 when missing or not a number above 0 and up to 2. */
export function gainOf(name: string, entries: readonly AudioEntry[] = AUDIO_ENTRIES): number {
  const v = entries.find((e) => e.name === name)?.gain;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 2 ? v : 1;
}

/** Seconds to skip at the start of a sound: 0 unless the entry has a positive startAt. */
export function startAtOf(name: string, entries: readonly AudioEntry[] = AUDIO_ENTRIES): number {
  const v = entries.find((e) => e.name === name)?.startAt;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * The "Now playing" line (SPEC 9.4, 11.3): only for an approved entry marked as a checked real
 * recording with the exact original clip's link, and only when the line has approved words.
 */
export function nowPlaying(name: string | null, entries: readonly AudioEntry[] = AUDIO_ENTRIES): { text: string; url: string } | null {
  if (!name) return null;
  const e = entries.find((x) => x.name === name);
  if (!e || !e.approved || e.realRecording !== true || typeof e.sourceUrl !== 'string' || e.sourceUrl.trim() === '') return null;
  // Only NASA's Mars wind has approved words (SPEC 11.3, 16.4).
  if (name !== SOUND.windMarsReal) return null;
  return { text: t('sound.nowPlayingWind'), url: e.sourceUrl.trim() };
}

/** The ambience loops wanted, best first: the first one that can play is used (one at a time). */
export function ambienceFor(site: string, radiationToday: number): SoundName[] {
  const base: SoundName[] = site === 'moon' ? [SOUND.moonBase] : [SOUND.windMarsReal, SOUND.windMars];
  return radiationToday > 0 ? [SOUND.solarStorm, ...base] : base;
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
  /** Start a sound, skipping `startAt` seconds at the start (and on every loop). `onEnd` runs when a sound that does not loop finishes. */
  play(name: string, volume: number, loop: boolean, onEnd: () => void, startAt?: number): SoundHandle | null;
  setMuted(muted: boolean): void;
  /** Start loading more sounds. Each calls `has` true once loaded. */
  load?(names: string[]): void;
  /** Call `cb` with the name of every sound whose file failed to load (also ones that failed already). */
  onLoadFailed?(cb: (name: string) => void): void;
  /** Call `cb` whenever a stand-in way of playing a sound that failed to load becomes ready (`has` is now true). */
  onFallbackReady?(cb: () => void): void;
}

interface Loop {
  name: string;
  group: SoundGroup;
  handle: SoundHandle;
}

let sharedCtx: AudioContext | null = null;

/** Shared WebAudio context warmed up during the first user gesture so async Phaser boot has unlocked audio. */
export function sharedAudioContext(): AudioContext | null {
  return sharedCtx;
}

function warmAudioContext(): void {
  try {
    const Ctx = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new Ctx();
    if (sharedCtx.state === 'suspended') void sharedCtx.resume().catch(() => undefined);
  } catch {
    // Environments without WebAudio (e.g. unit tests) ignore this.
  }
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
  private groupMuted = {music:false,effects:false,ambience:false};
  setGroupMuted(group:SoundGroup,muted:boolean):void {
    this.groupMuted[group] = muted;
    // A music switch that is off stops the track and fetches nothing; turning it on starts the track again.
    if (this.unlocked) this.refresh();
    this.applyVolumes();
  }
  private readonly approved: Set<string>;
  private readonly entries: readonly AudioEntry[];
  private ambienceWanted: string[] = [];
  private musicMode: MusicMode | null = null;
  /** Position in PLAYLIST of the track to play (or playing) while building. */
  private playlistIndex = 0;
  /** Tracks already asked for: each is fetched once, when first needed. */
  private readonly musicAsked = new Set<string>();
  private readonly loadFailed = new Set<string>();
  private musicToken = 0;
  private ambience: Loop | null = null;
  private music: Loop | null = null;
  private ducks = 0;

  constructor(entries: readonly AudioEntry[] = AUDIO_ENTRIES) {
    this.entries = entries;
    this.approved = new Set(allApprovedSounds(entries));
  }

  /** The names the map should load. */
  toLoad(): string[] {
    return approvedSounds(this.entries);
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
    this.musicAsked.clear();
    this.safe(() => backend.setMuted(this.muted));
    this.safe(() => backend.onLoadFailed?.((name) => this.onLoadFailed(name)));
    this.safe(() => backend.onFallbackReady?.(() => this.refresh()));
    this.refresh();
  }

  private onLoadFailed(name: string): void {
    this.loadFailed.add(name);
    this.loadFallback(name);
    // A music track that cannot load is skipped.
    if (groupOf(name) === 'music') this.refresh();
  }

  /** The real sound could not load: load its stand-in, if that is approved. */
  private loadFallback(name: string): void {
    const stand = FALLBACK[name];
    const b = this.backend;
    if (stand && b && this.approved.has(stand)) this.safe(() => b.load?.([stand]));
  }

  detach(): void {
    this.stopLoop('ambience');
    this.stopLoop('music');
    this.musicAsked.clear();
    this.ducks = 0;
    this.backend = null;
  }

  /** The first tap: from now on sounds may play (SPEC 11.3). */
  unlock(): void {
    warmAudioContext();
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
    if (this.muted || this.groupMuted.effects || !this.start(name, false, () => onDone?.())) onDone?.();
  }

  /** A Mission Control sound sequence: each starts when the one before ends; loops are lowered meanwhile. */
  message(names: readonly string[]): void {
    if (this.muted || this.groupMuted.effects) return;
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

  /** What the music is for now (null: none). The board picks the track and fetches it when it is first needed. */
  setMusic(mode: MusicMode | null): void {
    this.musicMode = mode;
    this.refresh();
  }

  /** The music track playing now, if any. */
  musicName(): string | null {
    return this.music ? this.music.name : null;
  }

  /** The track wanted now. A track that failed to load is skipped (the playlist goes on to the next). */
  private wantedTrack(): string | null {
    const mode = this.musicMode;
    if (!mode || this.groupMuted.music) return null;
    const usable = (n: string) => this.approved.has(n) && !(this.loadFailed.has(n) && !this.canPlay(n));
    const special = mode === 'report' ? SOUND.theme : mode === 'storm' ? SOUND.stormMusic : null;
    if (special && usable(special)) return special;
    for (let i = 0; i < PLAYLIST.length; i++) {
      const at = (this.playlistIndex + i) % PLAYLIST.length;
      if (usable(PLAYLIST[at])) {
        this.playlistIndex = at;
        return PLAYLIST[at];
      }
    }
    return null;
  }

  /** Start or switch the loops to match what is wanted. Call again once more sounds have loaded. */
  refresh(): void {
    const amb = this.ambienceWanted.find((n) => this.canPlay(n)) ?? null;
    this.setLoop('ambience', amb);
    const track = this.unlocked ? this.wantedTrack() : null;
    const b = this.backend;
    if (track && b && !this.musicAsked.has(track)) {
      this.musicAsked.add(track);
      this.safe(() => b.load?.([track]));
    }
    this.setLoop('music', track && this.canPlay(track) ? track : null);
  }

  private canPlay(name: string): boolean {
    const b = this.backend;
    if (!this.unlocked || !b || !this.approved.has(name)) return false;
    return this.safe(() => b.has(name)) === true;
  }

  private volumeOf(group: SoundGroup): number {
    // The wind and other ambience have no switch of their own: they follow "Sound effects".
    const v = this.groupMuted[group === 'ambience' ? 'effects' : group] ? 0 : AUDIO.volume[group];
    return group === 'effects' || this.ducks === 0 ? v : v * AUDIO.duckShare;
  }

  /** Play once or loop. Returns false when the sound could not start. */
  private start(name: string, loop: boolean, onEnd: () => void): SoundHandle | null {
    const b = this.backend;
    if (!b || !this.canPlay(name)) return null;
    return this.safe(() => b.play(name, this.volumeOf(groupOf(name)) * gainOf(name, this.entries), loop, onEnd, startAtOf(name, this.entries))) ?? null;
  }

  private setLoop(group: 'ambience' | 'music', name: string | null): void {
    const current = group === 'ambience' ? this.ambience : this.music;
    if ((current ? current.name : null) === name) return;
    this.stopLoop(group);
    if (!name) return;
    // Ambience and the report and storm tracks loop. A playlist track plays once; its end starts the next.
    const loops = group === 'ambience' || this.musicMode !== 'build';
    const token = group === 'music' ? ++this.musicToken : 0;
    const onEnd = loops ? () => undefined : () => this.playlistEnded(token);
    const handle = this.start(name, loops, onEnd);
    const loop = handle ? { name, group, handle } : null;
    if (group === 'ambience') this.ambience = loop;
    else this.music = loop;
  }

  /** A playlist track finished: the next one plays (around again after the last). */
  private playlistEnded(token: number): void {
    if (token !== this.musicToken || this.musicMode !== 'build' || !this.music) return;
    this.music = null;
    this.playlistIndex = (this.playlistIndex + 1) % PLAYLIST.length;
    this.refresh();
  }

  private stopLoop(group: 'ambience' | 'music'): void {
    const current = group === 'ambience' ? this.ambience : this.music;
    if (current) this.safe(() => current.handle.stop());
    if (group === 'ambience') this.ambience = null;
    else this.music = null;
  }

  private applyVolumes(): void {
    for (const loop of [this.ambience, this.music]) {
      if (loop) this.safe(() => loop.handle.setVolume(this.volumeOf(loop.group) * gainOf(loop.name, this.entries)));
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
