// What the interface needs from the map. The Phaser scene implements it; tests use a fake.

import type { GameState } from '../sim/index.ts';
import type { SoundBackend } from './sound.ts';

export interface MapModel {
  state: GameState;
  /** Tiles to highlight as valid for the chosen building. */
  highlight: { r: number; c: number }[];
  /** The shelter footprint being previewed (its top tile), or null. */
  outline: { r: number; c: number } | null;
  /** True while a placeable building or shelter is selected for tap or drag placement. */
  placing?: boolean;
  /** A tile the guided start points at, or null. */
  hintTile: { r: number; c: number } | null;
  /** Buildings that get no power today (from the day preview). */
  unpowered: number[];
  reducedMotion: boolean;
  /** What the astronauts mirror (SPEC 11.2). Read from the run; the map never changes the state. */
  astronauts: { tomorrowRadiation: number; coldHabitats: number[] };
}

export interface MapInsets {
  /** CSS pixels of the map covered by panels at the top and bottom. */
  top: number;
  bottom: number;
}

export interface MapCallbacks {
  /** A tap on the map, resolved to a tile (a tap on a building picture gives that building's tile). */
  onTileTap(r: number, c: number): void;
  /** Dragging across tiles while placing a building or shelter. */
  onTileDrag?(r: number, c: number): void;
  /** The camera moved or the view resized: badges must be placed again. */
  onLayout(): void;
  /** An astronaut was tapped (it dances once). */
  onAstronautTap?(): void;
  /** More approved sounds finished loading. */
  onSoundsLoaded?(): void;
}

export interface MapView {
  render(model: MapModel): void;
  setInsets(insets: MapInsets): void;
  /** Where a world point of a tile is, in CSS pixels from the map's top-left corner. */
  tileToScreen(r: number, c: number, lift?: number): { x: number; y: number };
  /** World units to CSS pixels at the current zoom. */
  scale(): number;
  /** Zoom about the middle of the view (the + and − buttons). Above 1 zooms in. */
  zoomBy(factor: number): void;
  /** Every astronaut dances for a moment (a goal or chapter was completed). */
  celebrate?(): void;
  /** The map's audio engine, once it exists. */
  sound?: SoundBackend;
  destroy(): void;
}

export type CreateMap = (container: HTMLElement, callbacks: MapCallbacks) => Promise<MapView>;
