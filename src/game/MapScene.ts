// The isometric site (SPEC 5.1, 5.2, 5.3, 11.1). Draws only; the rules live in src/sim.
// Badges and labels (draw order step 4) are HTML laid over the canvas by the interface.

import Phaser from 'phaser';
import { config, isRevealed, type Building, type GameState } from '../sim/index.ts';
import { ART_FILE } from '../ui/info.ts';
import type { MapCallbacks, MapInsets, MapModel } from '../ui/mapView.ts';

const { RENDER, REVEAL_RINGS, SITE_SIZE, SHELTER_ALPHA } = config;
const ART = import.meta.env.BASE_URL + 'assets/art/';

const HALF_W = RENDER.tileWidth / 2;
const HALF_H = RENDER.tileHeight / 2;

const TERRAIN_FILES = ['ground_mars_2', 'ice_tile', 'rock_tile', 'unsurveyed_tile', 'crater_small'];

/** Depth bands for the draw order of SPEC 5.2. */
const DEPTH = { terrain: 0, highlight: 2, things: 10 } as const;

/** Tile centre in world units (SPEC 5.1). */
export function tileCentre(r: number, c: number): { x: number; y: number } {
  return { x: (c - r) * HALF_W, y: (c + r) * HALF_H };
}

/** Left-to-right tie break, small enough to stay inside one r + c step. */
function tieBreak(r: number, c: number): number {
  return (c - r + SITE_SIZE) / 1000;
}

export class MapScene extends Phaser.Scene {
  private model: MapModel | null = null;
  private insets: MapInsets = { top: 0, bottom: 0 };
  private pixelRatio = 1;
  private zoom = 1;
  private centre = { x: 0, y: 0 };
  private buildingSprites: { sprite: Phaser.GameObjects.Image; building: Building }[] = [];
  private downAt: { x: number; y: number } | null = null;

  constructor(
    private readonly callbacks: MapCallbacks,
    private readonly onReady: (scene: MapScene) => void,
  ) {
    super('MapScene');
  }

  preload(): void {
    for (const f of TERRAIN_FILES) this.load.image(f, ART + f + '.png');
    for (const f of Object.values(ART_FILE)) this.load.image(f, ART + f + '.png');
  }

  create(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.downAt = { x: p.x, y: p.y };
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const down = this.downAt;
      this.downAt = null;
      if (!down) return;
      if (Math.hypot(p.x - down.x, p.y - down.y) > RENDER.tapSlopPx * this.pixelRatio) return;
      const tile = this.pick(p.x, p.y);
      if (tile) this.callbacks.onTileTap(tile.r, tile.c);
    });
    this.onReady(this);
  }

  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
  }

  setInsets(insets: MapInsets): void {
    this.insets = insets;
    this.fit();
  }

  /** Redraw everything from the model. Turn-based, so a full redraw is cheap enough. */
  draw(model: MapModel): void {
    this.model = model;
    this.tweens.killAll();
    this.children.removeAll(true);
    this.buildingSprites = [];
    const state = model.state;
    this.drawTerrain(state);
    this.drawHighlights(model);
    this.drawThings(model);
    this.fit();
  }

  private drawTerrain(state: GameState): void {
    for (let r = 0; r < SITE_SIZE; r++) {
      for (let c = 0; c < SITE_SIZE; c++) {
        const { x, y } = tileCentre(r, c);
        const kind = state.terrain[r][c];
        const revealed = isRevealed(state.ring, r, c);
        const key = !revealed ? 'unsurveyed_tile' : kind === 'ice' ? 'ice_tile' : kind === 'rock' ? 'rock_tile' : 'ground_mars_2';
        const depth = DEPTH.terrain + (r + c) / 100;
        this.add.image(x, y, key).setScale(RENDER.artScale).setDepth(depth);
        if (revealed && kind === 'crater') this.add.image(x, y, 'crater_small').setScale(RENDER.artScale).setDepth(depth + 0.001);
      }
    }
  }

  private diamond(r: number, c: number, rows = 1, cols = 1): Phaser.Geom.Point[] {
    const top = tileCentre(r, c);
    const right = tileCentre(r, c + cols - 1);
    const bottom = tileCentre(r + rows - 1, c + cols - 1);
    const left = tileCentre(r + rows - 1, c);
    return [
      new Phaser.Geom.Point(top.x, top.y - HALF_H),
      new Phaser.Geom.Point(right.x + HALF_W, right.y),
      new Phaser.Geom.Point(bottom.x, bottom.y + HALF_H),
      new Phaser.Geom.Point(left.x - HALF_W, left.y),
    ];
  }

  private drawHighlights(model: MapModel): void {
    const g = this.add.graphics().setDepth(DEPTH.highlight);
    g.fillStyle(RENDER.highlightColour, RENDER.highlightAlpha);
    g.lineStyle(RENDER.highlightLine, RENDER.highlightColour, 1);
    for (const t of model.highlight) {
      const pts = this.diamond(t.r, t.c);
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
    }
    if (model.outline) {
      const pts = this.diamond(model.outline.r, model.outline.c, 2, 2);
      g.fillStyle(RENDER.outlineColour, RENDER.outlineFillAlpha);
      g.fillPoints(pts, true);
      g.lineStyle(RENDER.outlineLine, RENDER.outlineColour, 1);
      g.strokePoints(pts, true);
    }
    if (model.hintTile) {
      const hint = this.add.graphics().setDepth(DEPTH.highlight + 0.5);
      hint.lineStyle(RENDER.outlineLine, RENDER.hintColour, 1);
      hint.strokePoints(this.diamond(model.hintTile.r, model.hintTile.c), true);
      if (!model.reducedMotion) {
        this.tweens.add({ targets: hint, alpha: RENDER.pulseMinAlpha, duration: RENDER.pulseMs, yoyo: true, repeat: -1 });
      }
    }
  }

  private drawThings(model: MapModel): void {
    const state = model.state;
    for (const b of state.buildings) {
      const { x, y } = tileCentre(b.r, b.c);
      const sprite = this.add
        .image(x, y + HALF_H, ART_FILE[b.type])
        .setOrigin(0.5, 1)
        .setScale(RENDER.artScale)
        .setDepth(DEPTH.things + b.r + b.c + tieBreak(b.r, b.c));
      if (b.brokenDays > 0) {
        if (model.reducedMotion) sprite.setAlpha(RENDER.brokenAlpha);
        else this.tweens.add({ targets: sprite, alpha: RENDER.brokenAlpha, duration: RENDER.brokenFlickerMs, yoyo: true, repeat: -1 });
      } else if (model.unpowered.includes(b.id)) {
        sprite.setTint(RENDER.unpoweredTint);
      } else if (b.damagedDays > 0) {
        sprite.setTint(RENDER.damagedTint);
      }
      this.buildingSprites.push({ sprite, building: b });
    }
    for (const s of state.shelters) {
      // Placed at the bottom corner of the 2x2 block; depth from its bottom tile plus 0.5.
      const br = s.r + 1;
      const bc = s.c + 1;
      const { x, y } = tileCentre(br, bc);
      this.add
        .image(x, y + HALF_H, ART_FILE.shelter)
        .setOrigin(0.5, 1)
        .setScale(RENDER.artScale)
        .setAlpha(SHELTER_ALPHA)
        .setDepth(DEPTH.things + br + bc + 0.5 + tieBreak(br, bc));
    }
  }

  /** Fit the revealed area into the part of the view not covered by panels. */
  private fit(): void {
    if (!this.model) return;
    const ring = REVEAL_RINGS[Math.min(this.model.state.ring, REVEAL_RINGS.length - 1)];
    const span = ring.max - ring.min;
    const left = -span * HALF_W - HALF_W;
    const right = span * HALF_W + HALF_W;
    const top = 2 * ring.min * HALF_H - HALF_H - RENDER.fitHeadroom;
    const bottom = 2 * ring.max * HALF_H + HALF_H;
    const w = this.scale.width;
    const h = this.scale.height;
    const insetTop = this.insets.top * this.pixelRatio;
    const insetBottom = this.insets.bottom * this.pixelRatio;
    const availH = Math.max(1, h - insetTop - insetBottom);
    const zoom = Math.max(0.01, Math.min(w / (right - left), availH / (bottom - top)) * RENDER.fitMargin);
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2 - (insetTop + availH / 2 - h / 2) / zoom;
    this.zoom = zoom;
    this.centre = { x: cx, y: cy };
    const cam = this.cameras.main;
    cam.setZoom(zoom);
    cam.centerOn(cx, cy);
    this.callbacks.onLayout();
  }

  /** Re-fit after the canvas changed size. */
  refit(): void {
    this.fit();
  }

  private toWorld(px: number, py: number): { x: number; y: number } {
    return {
      x: (px - this.scale.width / 2) / this.zoom + this.centre.x,
      y: (py - this.scale.height / 2) / this.zoom + this.centre.y,
    };
  }

  /** CSS pixels from the map's top-left corner. */
  worldToCss(x: number, y: number): { x: number; y: number } {
    return {
      x: ((x - this.centre.x) * this.zoom + this.scale.width / 2) / this.pixelRatio,
      y: ((y - this.centre.y) * this.zoom + this.scale.height / 2) / this.pixelRatio,
    };
  }

  cssScale(): number {
    return this.zoom / this.pixelRatio;
  }

  /** A tap on a building's picture picks that building; otherwise the ground tile under it. */
  private pick(px: number, py: number): { r: number; c: number } | null {
    const w = this.toWorld(px, py);
    const placing = this.model ? this.model.highlight.length > 0 || this.model.outline !== null : false;
    if (!placing) {
      const front = this.buildingSprites.slice().sort((a, b) => b.sprite.depth - a.sprite.depth);
      for (const { sprite, building } of front) {
        const bounds = sprite.getBounds();
        if (!bounds.contains(w.x, w.y)) continue;
        const lx = Math.floor((w.x - bounds.x) / sprite.scaleX);
        const ly = Math.floor((w.y - bounds.y) / sprite.scaleY);
        const alpha = this.textures.getPixelAlpha(lx, ly, sprite.texture.key);
        if (alpha !== undefined && alpha !== null && alpha > RENDER.pickAlpha) return { r: building.r, c: building.c };
      }
    }
    const u = w.x / HALF_W;
    const v = w.y / HALF_H;
    const c = Math.round((u + v) / 2);
    const r = Math.round((v - u) / 2);
    if (r < 0 || c < 0 || r >= SITE_SIZE || c >= SITE_SIZE) return null;
    return { r, c };
  }
}
