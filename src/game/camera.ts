import {revealBounds} from '../sim/terrain.ts';
// Pan and zoom maths for the map camera (SPEC 5.6). Pure: no Phaser, no DOM, so it can be tested.
// Screen values are canvas (device) pixels. World values are the units of SPEC 5.1.

import { config } from '../sim/index.ts';

const { RENDER, REVEAL_RINGS, CAMERA } = config;

const HALF_W = RENDER.tileWidth / 2;
const HALF_H = RENDER.tileHeight / 2;

export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
  /** Canvas pixels covered by panels at the top and bottom of the map. */
  insetTop: number;
  insetBottom: number;
  /** Canvas pixels per CSS pixel. */
  pixelRatio: number;
}

/** zoom: canvas pixels per world unit. (x, y): the world point at the centre of the uncovered part of the view. */
export interface Cam {
  zoom: number;
  x: number;
  y: number;
}

/** The world box of the revealed area, with room above the top row for building pictures. */
export function revealedBounds(ring: number): Bounds {
  const r = revealBounds(ring);
  const span = r.max - r.min;
  return {
    left: -span * HALF_W - HALF_W,
    right: span * HALF_W + HALF_W,
    top: 2 * r.min * HALF_H - HALF_H - RENDER.fitHeadroom,
    bottom: 2 * r.max * HALF_H + HALF_H,
  };
}

function available(vp: Viewport): { top: number; height: number } {
  return { top: vp.insetTop, height: Math.max(1, vp.height - vp.insetTop - vp.insetBottom) };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** Clamp between two limits given in either order. */
function clampBetween(v: number, a: number, b: number): number {
  return clamp(v, Math.min(a, b), Math.max(a, b));
}

/** The zoom at which the whole revealed area fits the uncovered part of the view. */
export function fitZoom(b: Bounds, vp: Viewport): number {
  const { height } = available(vp);
  return Math.max(0.01, Math.min(vp.width / (b.right - b.left), height / (b.bottom - b.top)) * RENDER.fitMargin);
}

/** From "whole revealed area fits" to 2x tile size (SPEC 5.6). */
export function zoomLimits(b: Bounds, vp: Viewport): { min: number; max: number } {
  const min = fitZoom(b, vp);
  return { min, max: Math.max(min, CAMERA.maxZoom * vp.pixelRatio) };
}

/** The camera that shows the whole revealed area. */
export function fitCamera(b: Bounds, vp: Viewport): Cam {
  return { zoom: fitZoom(b, vp), x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
}

/**
 * Keep the zoom inside its limits and the revealed area on screen: when the area is larger
 * than the view, the view cannot leave it; when it is smaller, it cannot leave the view.
 */
export function clampCamera(cam: Cam, b: Bounds, vp: Viewport): Cam {
  const { min, max } = zoomLimits(b, vp);
  const zoom = clamp(cam.zoom, min, max);
  const halfW = vp.width / 2 / zoom;
  const halfH = available(vp).height / 2 / zoom;
  return {
    zoom,
    x: clampBetween(cam.x, b.left + halfW, b.right - halfW),
    y: clampBetween(cam.y, b.top + halfH, b.bottom - halfH),
  };
}

export function screenToWorld(cam: Cam, vp: Viewport, px: number, py: number): { x: number; y: number } {
  const a = available(vp);
  return { x: (px - vp.width / 2) / cam.zoom + cam.x, y: (py - (a.top + a.height / 2)) / cam.zoom + cam.y };
}

export function worldToScreen(cam: Cam, vp: Viewport, x: number, y: number): { x: number; y: number } {
  const a = available(vp);
  return { x: (x - cam.x) * cam.zoom + vp.width / 2, y: (y - cam.y) * cam.zoom + a.top + a.height / 2 };
}

/** The world point at the middle of the whole view, for the renderer's camera. */
export function viewMidpoint(cam: Cam, vp: Viewport): { x: number; y: number } {
  return screenToWorld(cam, vp, vp.width / 2, vp.height / 2);
}

/** Drag the view by a screen distance, then clamp. */
export function panBy(cam: Cam, dx: number, dy: number, b: Bounds, vp: Viewport): Cam {
  return clampCamera({ zoom: cam.zoom, x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom }, b, vp);
}

/** Zoom by a factor, keeping the world point under (px, py) in place, then clamp. */
export function zoomAround(cam: Cam, factor: number, px: number, py: number, b: Bounds, vp: Viewport): Cam {
  const { min, max } = zoomLimits(b, vp);
  const zoom = clamp(cam.zoom * factor, min, max);
  const before = screenToWorld(cam, vp, px, py);
  const after = screenToWorld({ ...cam, zoom }, vp, px, py);
  return clampCamera({ zoom, x: cam.x + before.x - after.x, y: cam.y + before.y - after.y }, b, vp);
}

/** Zoom about the middle of the uncovered part of the view (the + and − buttons). */
export function zoomCentre(cam: Cam, factor: number, b: Bounds, vp: Viewport): Cam {
  const a = available(vp);
  return zoomAround(cam, factor, vp.width / 2, a.top + a.height / 2, b, vp);
}

/** Smoothly ease from one camera to another, t from 0 to 1. */
export function easeCamera(from: Cam, to: Cam, t: number): Cam {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
  return { zoom: from.zoom + (to.zoom - from.zoom) * k, x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}
