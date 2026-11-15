import { describe, expect, it } from 'vitest';
import {
  clampCamera,
  fitCamera,
  fitZoom,
  panBy,
  revealedBounds,
  screenToWorld,
  worldToScreen,
  zoomAround,
  zoomLimits,
  type Viewport,
} from '../src/game/camera.ts';
import { config } from '../src/sim/index.ts';

const phone: Viewport = { width: 750, height: 800, insetTop: 120, insetBottom: 0, pixelRatio: 2 };

describe('camera maths (SPEC 5.6)', () => {
  it('fits the whole revealed area at the smallest zoom', () => {
    const b = revealedBounds(0);
    const cam = fitCamera(b, phone);
    const tl = worldToScreen(cam, phone, b.left, b.top);
    const br = worldToScreen(cam, phone, b.right, b.bottom);
    expect(tl.x).toBeGreaterThanOrEqual(0);
    expect(br.x).toBeLessThanOrEqual(phone.width);
    expect(tl.y).toBeGreaterThanOrEqual(phone.insetTop);
    expect(br.y).toBeLessThanOrEqual(phone.height);
  });

  it('zooms from "fits" to 2x tile size, never beyond', () => {
    const b = revealedBounds(0);
    const { min, max } = zoomLimits(b, phone);
    expect(min).toBe(fitZoom(b, phone));
    expect(max).toBe(config.CAMERA.maxZoom * phone.pixelRatio);
    let cam = fitCamera(b, phone);
    for (let i = 0; i < 30; i++) cam = zoomAround(cam, 1.5, 300, 400, b, phone);
    expect(cam.zoom).toBe(max);
    for (let i = 0; i < 30; i++) cam = zoomAround(cam, 0.5, 300, 400, b, phone);
    expect(cam.zoom).toBe(min);
  });

  it('keeps the point under the fingers in place while zooming', () => {
    const b = revealedBounds(3);
    const start = fitCamera(b, phone);
    const before = screenToWorld(start, phone, 400, 500);
    const cam = zoomAround(start, 1.3, 400, 500, b, phone);
    const after = screenToWorld(cam, phone, 400, 500);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('clamps panning so the revealed area stays on screen', () => {
    const b = revealedBounds(1);
    let cam = zoomAround(fitCamera(b, phone), 3, 375, 460, b, phone);
    cam = panBy(cam, 100000, 100000, b, phone);
    // Zoomed in, the view cannot leave the revealed area.
    const tl = screenToWorld(cam, phone, 0, phone.insetTop);
    expect(tl.x).toBeGreaterThanOrEqual(b.left - 1e-6);
    expect(tl.y).toBeGreaterThanOrEqual(b.top - 1e-6);
    cam = panBy(cam, -100000, -100000, b, phone);
    const br = screenToWorld(cam, phone, phone.width, phone.height);
    expect(br.x).toBeLessThanOrEqual(b.right + 1e-6);
    expect(br.y).toBeLessThanOrEqual(b.bottom + 1e-6);
  });

  it('at the fit zoom the area cannot be dragged off screen', () => {
    const b = revealedBounds(0);
    const fit = fitCamera(b, phone);
    const cam = panBy(fit, 5000, -5000, b, phone);
    const tl = worldToScreen(cam, phone, b.left, b.top);
    const br = worldToScreen(cam, phone, b.right, b.bottom);
    expect(tl.x).toBeGreaterThanOrEqual(-1e-6);
    expect(br.x).toBeLessThanOrEqual(phone.width + 1e-6);
    expect(tl.y).toBeGreaterThanOrEqual(phone.insetTop - 1e-6);
    expect(br.y).toBeLessThanOrEqual(phone.height + 1e-6);
  });

  it('a larger revealed area gives a wider fit (the camera eases out when the map grows)', () => {
    expect(fitZoom(revealedBounds(1), phone)).toBeLessThan(fitZoom(revealedBounds(0), phone));
    const clamped = clampCamera({ zoom: 100, x: 0, y: 0 }, revealedBounds(0), phone);
    expect(clamped.zoom).toBe(zoomLimits(revealedBounds(0), phone).max);
  });
});
