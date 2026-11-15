// The isometric site (SPEC 5.1, 5.2, 5.3, 11.1). Draws only; the rules live in src/sim.
// Badges and labels (draw order step 4) are HTML laid over the canvas by the interface.
// Astronauts (SPEC 11.2) are decoration: they read the state and never change it.

import Phaser from 'phaser';
import { config, isRevealed, type Building, type GameState } from '../sim/index.ts';
import { ART_FILE } from '../ui/info.ts';
import type { MapCallbacks, MapInsets, MapModel } from '../ui/mapView.ts';
import { approvedSounds } from '../ui/sound.ts';
import { Crowd, astronautDepth, type AstroAnim } from './astronauts.ts';
import {
  clampCamera,
  easeCamera,
  fitCamera,
  panBy,
  revealedBounds,
  screenToWorld,
  viewMidpoint,
  worldToScreen,
  zoomAround,
  zoomCentre,
  type Bounds,
  type Cam,
  type Viewport,
} from './camera.ts';
import { soundUrls } from './phaserSound.ts';

const { RENDER, SITE_SIZE, SHELTER_ALPHA, CAMERA, ASTRONAUT, VIEW } = config;
const ART = import.meta.env.BASE_URL + 'assets/art/';

const HALF_W = RENDER.tileWidth / 2;
const HALF_H = RENDER.tileHeight / 2;

const TERRAIN_FILES = ['ground_mars_2', 'ice_tile', 'rock_tile', 'unsurveyed_tile', 'crater_small'];

const ASTRO_KEY = 'astronaut_sheet';

function animKey(anim: AstroAnim): string {
  return `astro_${anim}`;
}

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

interface Gesture {
  start: { x: number; y: number };
  last: { x: number; y: number };
  /** Moved further than a tap allows: a drag, never a tap. */
  moved: boolean;
  /** Two fingers were down at some point: a pinch, never a tap. */
  multi: boolean;
  /** True while dragging across tiles to place buildings or shelters. */
  dragPlaced: boolean;
  lastDragTile: string | null;
}

export class MapScene extends Phaser.Scene {
  private model: MapModel | null = null;
  private insets: MapInsets = { top: 0, bottom: 0 };
  private pixelRatio = 1;
  private cam: Cam | null = null;
  /** True once the player has panned or zoomed; until then the camera keeps fitting the revealed area. */
  private userMoved = false;
  private shownRing: number | null = null;
  private redrawing=false;
  private renderedView="";
  /** The "Survey expanded" moment in progress. */
  private survey: { from: Cam; start: number; prevRing: number } | null = null;
  private fadeTiles: Phaser.GameObjects.Image[] = [];
  private buildingSprites: { sprite: Phaser.GameObjects.Image; building: Building }[] = [];
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: Gesture | null = null;
  private pinchDist: number | null = null;
  /** Astronaut wandering uses Math.random: decoration only, never the simulation's generator. */
  private crowd = new Crowd(Math.random);
  private astroSprites = new Map<number, Phaser.GameObjects.Sprite>();

  constructor(
    private readonly callbacks: MapCallbacks,
    private readonly onReady: (scene: MapScene) => void,
  ) {
    super('MapScene');
  }

  preload(): void {
    for (const f of TERRAIN_FILES) this.load.image(f, ART + f + '.png');
    for (const f of Object.values(ART_FILE)) this.load.image(f, ART + f + '.png');
    this.load.spritesheet(ASTRO_KEY, ART + 'astronaut_sheet.png', { frameWidth: ASTRONAUT.frameWidth, frameHeight: ASTRONAUT.frameHeight });
  }

  /** The five rows of the astronaut sheet as animations. */
  private makeAnims(): void {
    if (!this.textures.exists(ASTRO_KEY)) return;
    for (const [name, a] of Object.entries(ASTRONAUT.anims)) {
      const key = animKey(name as AstroAnim);
      if (this.anims.exists(key)) continue;
      const start = a.row * ASTRONAUT.columns;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(ASTRO_KEY, { start, end: start + a.frames - 1 }),
        frameRate: a.fps,
        repeat: -1,
      });
    }
  }

  /**
   * Load the approved sounds in the background, after the map is shown. Only approved entries of
   * audio.json are ever requested; a file that fails to load stays silent.
   */
  private loadSounds(): void {
    const names = approvedSounds();
    if (names.length === 0) return;
    for (const name of names) this.load.audio(name, soundUrls(name));
    this.load.on('filecomplete', () => this.callbacks.onSoundsLoaded?.());
    this.load.start();
  }

  create(): void {
    // A second touch pointer, for pinch.
    this.input.addPointer(1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p, true));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p, false));
    this.input.on('wheel', (p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      if (!this.cam || !this.model) return;
      this.userInput();
      this.cam = zoomAround(this.cam, Math.exp(-dy * CAMERA.wheelStep), p.x, p.y, this.bounds(), this.viewport());
      this.apply();
    });
    this.makeAnims();
    this.onReady(this);
    this.loadSounds();
  }

  // ---- Input: drag to pan, pinch or wheel to zoom, a short press is a tap ----

  private isPlacing(): boolean {
    if (!this.model) return false;
    return this.model.placing ?? (this.model.highlight.length > 0 || this.model.outline !== null);
  }

  private dragAlongSegment(x0: number, y0: number, x1: number, y1: number, g: Gesture): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 12));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const tile = this.pick(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      if (!tile) continue;
      const key = `${tile.r},${tile.c}`;
      if (key === g.lastDragTile) continue;
      g.lastDragTile = key;
      this.callbacks.onTileDrag?.(tile.r, tile.c);
      // Placing the last affordable item clears placing mode mid-stroke; stop cleanly.
      if (!this.isPlacing()) break;
    }
  }

  private onDown(p: Phaser.Input.Pointer): void {
    this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.pointers.size === 1) {
      this.gesture = { start: { x: p.x, y: p.y }, last: { x: p.x, y: p.y }, moved: false, multi: false, dragPlaced: false, lastDragTile: null };
    } else {
      if (this.gesture) this.gesture.multi = true;
      this.pinchDist = this.pointerSpread();
    }
  }

  private pointerSpread(): number | null {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return null;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const prev = this.pointers.get(p.id);
    if (!prev || !this.cam || !this.model) return;
    const cur = { x: p.x, y: p.y };
    this.pointers.set(p.id, cur);
    const g = this.gesture;
    if (!g) return;
    if (this.pointers.size >= 2) {
      const dist = this.pointerSpread();
      if (dist && this.pinchDist) {
        const pts = [...this.pointers.values()];
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        this.userInput();
        this.cam = zoomAround(this.cam, dist / this.pinchDist, mid.x, mid.y, this.bounds(), this.viewport());
        this.apply();
      }
      this.pinchDist = dist;
      return;
    }
    const distFromStart = Math.hypot(cur.x - g.start.x, cur.y - g.start.y);
    if (!g.multi && this.callbacks.onTileDrag && (g.dragPlaced || (this.isPlacing() && distFromStart > 6 * this.pixelRatio))) {
      const firstDrag = !g.dragPlaced;
      g.dragPlaced = true;
      g.moved = true;
      this.dragAlongSegment(firstDrag ? g.start.x : g.last.x, firstDrag ? g.start.y : g.last.y, cur.x, cur.y, g);
      g.last = cur;
      return;
    }
    if (!g.moved && distFromStart > RENDER.tapSlopPx * this.pixelRatio) g.moved = true;
    g.last = cur;
    if (!g.moved || g.multi) return;
    this.userInput();
    this.cam = panBy(this.cam, cur.x - prev.x, cur.y - prev.y, this.bounds(), this.viewport());
    this.apply();
  }

  private onUp(p: Phaser.Input.Pointer, inside: boolean): void {
    if (!this.pointers.has(p.id)) return;
    this.pointers.delete(p.id);
    this.pinchDist = this.pointerSpread();
    if (this.pointers.size > 0) return;
    const g = this.gesture;
    this.gesture = null;
    // A drag, drag-place stroke, or a pinch never counts as a tap on a tile.
    if (!inside || !g || g.moved || g.multi || g.dragPlaced) return;
    const tile = this.pick(p.x, p.y);
    if (tile) this.callbacks.onTileTap(tile.r, tile.c);
  }

  /** The player took the camera: stop fitting, and finish any survey moment at once. */
  private userInput(): void {
    this.userMoved = true;
    if (this.survey) this.finishSurvey();
  }

  /** The + and − buttons. */
  zoomBy(factor: number): void {
    if (!this.cam || !this.model) return;
    this.userInput();
    this.cam = zoomCentre(this.cam, factor, this.bounds(), this.viewport());
    this.apply();
  }

  setPixelRatio(ratio: number): void {
    this.pixelRatio = ratio;
  }

  setInsets(insets: MapInsets): void {
    if (insets.top === this.insets.top && insets.bottom === this.insets.bottom && this.cam) return;
    this.insets = insets;
    this.layout();
  }

  /** Redraw everything from the model. Turn-based, so a full redraw is cheap enough. */
  draw(model: MapModel): void {
    this.redrawing=true;
    const ring = model.state.ring;
    if (this.shownRing !== null && ring > this.shownRing) {
      // "Survey expanded": ease out to the new area and fade the new tiles in (SPEC 5.3).
      this.userMoved = false;
      this.survey = model.reducedMotion || !this.cam ? null : { from: this.cam, start: this.time.now, prevRing: this.shownRing };
    }
    this.shownRing = ring;
    this.model = model;
    this.tweens.killAll();
    this.children.removeAll(true);
    this.buildingSprites = [];
    this.fadeTiles = [];
    this.astroSprites.clear();
    const state = model.state;
    this.crowd.sync(state);
    if(!this.cam)this.cam=fitCamera(this.bounds(),this.viewport());
    this.drawTerrain(state);
    this.drawHighlights(model);
    this.drawThings(model);
    this.drawAstronauts(model, 0);
    this.layout();
    this.renderedView=this.viewKey();
    this.redrawing=false;
  }

  /** Every astronaut dances for a moment (SPEC 11.2). */
  celebrate(): void {
    this.crowd.celebrate(this.time.now);
  }

  update(time: number, delta: number): void {
    if (this.model) this.drawAstronauts(this.model, Math.min(delta, 100));
    this.surveyStep(time);
  }

  /** One frame of the "Survey expanded" moment. */
  private surveyStep(time: number): void {
    const s = this.survey;
    if (!s || !this.model) return;
    const t = Math.min(1, (time - s.start) / CAMERA.surveyMs);
    this.cam = easeCamera(s.from, fitCamera(this.bounds(), this.viewport()), t);
    for (const tile of this.fadeTiles) tile.setAlpha(t);
    if (t >= 1) this.finishSurvey();
    else this.apply();
  }

  private finishSurvey(): void {
    this.survey = null;
    for (const tile of this.fadeTiles) tile.setAlpha(1);
    this.fadeTiles = [];
    if (!this.userMoved) this.cam = fitCamera(this.bounds(), this.viewport());
    this.apply();
  }

  private visible(r:number,c:number):boolean {
    if(!this.cam)return true;
    const tile=tileCentre(r,c);
    const p=worldToScreen(this.cam,this.viewport(),tile.x,tile.y);
    return p.x>=-240&&p.y>=-240&&p.x<=this.scale.width+240&&p.y<=this.scale.height+240;
  }
  private viewKey():string {const c=this.cam;return c?`${Math.round(c.x/64)},${Math.round(c.y/32)},${c.zoom.toFixed(2)}`:'';}
  private drawTerrain(state: GameState): void {
    const s = this.survey;
    const progress = s ? Math.min(1, (this.time.now - s.start) / CAMERA.surveyMs) : 1;
    for (let r = 0; r < state.terrain.length; r++) {
      for (let c = 0; c < state.terrain.length; c++) {
        if(!this.visible(r,c))continue;
        const { x, y } = tileCentre(r, c);
        const kind = state.terrain[r][c];
        const revealed = isRevealed(state.ring, r, c);
        const key = !revealed ? 'unsurveyed_tile' : kind === 'ice' ? 'ice_tile' : kind === 'rock' ? 'rock_tile' : 'ground_mars_2';
        const depth = DEPTH.terrain + (r + c) / 100;
        const fresh = s !== null && revealed && !isRevealed(s.prevRing, r, c);
        if (fresh) {
          // The unsurveyed tile stays underneath while the new one fades in over it.
          this.add.image(x, y, 'unsurveyed_tile').setScale(RENDER.artScale).setDepth(depth - 0.0005);
        }
        const img = this.add.image(x, y, key).setScale(RENDER.artScale).setDepth(depth);
        const parts = [img];
        if (revealed && kind === 'crater') parts.push(this.add.image(x, y, 'crater_small').setScale(RENDER.artScale).setDepth(depth + 0.001));
        if (fresh) {
          for (const p of parts) p.setAlpha(progress);
          this.fadeTiles.push(...parts);
        }
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

  /** The same diamond, shrunk towards its centre. */
  private inset(pts: Phaser.Geom.Point[], k: number): Phaser.Geom.Point[] {
    const cx = (pts[0].x + pts[2].x) / 2;
    const cy = (pts[0].y + pts[2].y) / 2;
    return pts.map((p) => new Phaser.Geom.Point(cx + (p.x - cx) * k, cy + (p.y - cy) * k));
  }

  private drawHighlights(model: MapModel): void {
    // Valid tiles glow: a strong amber fill, a thick amber edge and a light inner line (SPEC 16.4.2).
    const g = this.add.graphics().setDepth(DEPTH.highlight);
    for (const t of model.highlight) {
      const pts = this.diamond(t.r, t.c);
      g.fillStyle(VIEW.glowColour, VIEW.glowFillAlpha);
      g.fillPoints(pts, true);
      g.lineStyle(VIEW.glowLine, VIEW.glowColour, 1);
      g.strokePoints(pts, true);
      g.lineStyle(VIEW.glowInnerLine, VIEW.glowInnerColour, 1);
      g.strokePoints(this.inset(pts, 0.82), true);
    }
    if (model.outline) {
      const pts = this.diamond(model.outline.r, model.outline.c, config.SHELTER.size, config.SHELTER.size);
      g.fillStyle(VIEW.shelterOutlineColour, VIEW.shelterOutlineFillAlpha);
      g.fillPoints(pts, true);
      g.lineStyle(VIEW.shelterOutlineLine, VIEW.shelterOutlineColour, 1);
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
      if(!this.visible(b.r,b.c))continue;
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
      if(!this.visible(s.r,s.c))continue;
      // Placed at the bottom corner of the 2x2 block; depth from its bottom tile plus 0.5.
      const br = s.r + (s.size ?? 1) - 1;
      const bc = s.c + (s.size ?? 1) - 1;
      const { x, y } = tileCentre(br, bc);
      this.add
        .image(x, y + HALF_H, ART_FILE.shelter)
        .setOrigin(0.5, 1)
        .setScale(RENDER.artScale)
        .setScale(RENDER.artScale * (s.size ?? 1) / 2)
        .setAlpha(SHELTER_ALPHA)
        .setDepth(DEPTH.things + br + bc + 0.5 + tieBreak(br, bc));
    }
  }

  /** Move the crowd on and place one sprite per astronaut, depth-sorted with the buildings (SPEC 5.2). */
  private drawAstronauts(model: MapModel, dt: number): void {
    if (!this.textures.exists(ASTRO_KEY)) return;
    const motion = !model.reducedMotion;
    this.crowd.step(dt, this.time.now, model.state, model.astronauts, model.reducedMotion);
    const alive = new Set<number>();
    for (const a of this.crowd.agents) {
      alive.add(a.id);
      let sprite = this.astroSprites.get(a.id);
      if (!sprite || !sprite.active) {
        sprite = this.add.sprite(0, 0, ASTRO_KEY, 0).setOrigin(0.5, 1).setScale(RENDER.astronautScale);
        sprite.setData('astronaut', a.id);
        this.astroSprites.set(a.id, sprite);
      }
      const p = tileCentre(a.r, a.c);
      sprite.setPosition(p.x, p.y + ASTRONAUT.footOffset);
      sprite.setDepth(DEPTH.things + astronautDepth(a) + tieBreak(Math.round(a.r), Math.round(a.c)));
      sprite.setFlipX(a.left);
      const key = animKey(a.anim);
      if (motion) {
        if (sprite.anims.currentAnim?.key !== key || !sprite.anims.isPlaying) sprite.play(key);
      } else {
        // Reduced motion: a still pose, no walking or dancing animation.
        if (sprite.anims.isPlaying) sprite.anims.stop();
        const still = a.anim === 'shiver' ? ASTRONAUT.anims.shiver.row * ASTRONAUT.columns : 0;
        if (Number(sprite.frame.name) !== still) sprite.setFrame(still);
      }
    }
    for (const [id, sprite] of this.astroSprites) {
      if (!alive.has(id)) {
        sprite.destroy();
        this.astroSprites.delete(id);
      }
    }
  }

  /** The astronaut whose picture is under a point, front first. */
  private pickAstronaut(wx: number, wy: number): number | null {
    const front = [...this.astroSprites.values()].sort((a, b) => b.depth - a.depth);
    for (const sprite of front) {
      const bounds = sprite.getBounds();
      if (!bounds.contains(wx, wy)) continue;
      let lx = Math.floor((wx - bounds.x) / sprite.scaleX);
      const ly = Math.floor((wy - bounds.y) / sprite.scaleY);
      if (sprite.flipX) lx = ASTRONAUT.frameWidth - 1 - lx;
      const alpha = this.textures.getPixelAlpha(lx, ly, ASTRO_KEY, sprite.frame.name);
      if (alpha !== undefined && alpha !== null && alpha > RENDER.pickAlpha) return sprite.getData('astronaut') as number;
    }
    return null;
  }

  private viewport(): Viewport {
    return {
      width: this.scale.width,
      height: this.scale.height,
      insetTop: this.insets.top * this.pixelRatio,
      insetBottom: this.insets.bottom * this.pixelRatio,
      pixelRatio: this.pixelRatio,
    };
  }

  private bounds(): Bounds {
    return revealedBounds(this.model ? this.model.state.ring : 0);
  }

  /**
   * Place the camera: fit the revealed area until the player moves it (at 6x6 the base then
   * fills the view), otherwise keep their view, clamped. A survey moment drives it from update().
   */
  private layout(): void {
    if (!this.model) return;
    if (this.survey) {
      this.surveyStep(this.time.now);
      return;
    }
    const b = this.bounds();
    const vp = this.viewport();
    this.cam = !this.userMoved || !this.cam ? fitCamera(b, vp) : clampCamera(this.cam, b, vp);
    this.apply();
  }

  private apply(): void {
    const c = this.cam;
    if (!c) return;
    const mid = viewMidpoint(c, this.viewport());
    const cam = this.cameras.main;
    cam.setZoom(c.zoom);
    cam.centerOn(mid.x, mid.y);
    this.callbacks.onLayout();
    if(!this.redrawing&&this.model&&this.viewKey()!==this.renderedView)this.draw(this.model);
  }

  /** Re-place the camera after the canvas changed size. */
  refit(): void {
    this.layout();
  }

  private toWorld(px: number, py: number): { x: number; y: number } {
    return this.cam ? screenToWorld(this.cam, this.viewport(), px, py) : { x: 0, y: 0 };
  }

  /** CSS pixels from the map's top-left corner. */
  worldToCss(x: number, y: number): { x: number; y: number } {
    if (!this.cam) return { x: 0, y: 0 };
    const p = worldToScreen(this.cam, this.viewport(), x, y);
    return { x: p.x / this.pixelRatio, y: p.y / this.pixelRatio };
  }

  cssScale(): number {
    return this.cam ? this.cam.zoom / this.pixelRatio : 1;
  }

  /** A tap on a building's picture picks that building; otherwise the ground tile under it. */
  private pick(px: number, py: number): { r: number; c: number } | null {
    const w = this.toWorld(px, py);
    const placing = this.isPlacing();
    if (!placing) {
      const astronaut = this.pickAstronaut(w.x, w.y);
      if (astronaut !== null) {
        this.crowd.tap(astronaut);
        this.callbacks.onAstronautTap?.();
        return null;
      }
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
    if (r < 0 || c < 0 || r >= (this.model?.state.terrain.length ?? 12) || c >= (this.model?.state.terrain.length ?? 12)) return null;
    return { r, c };
  }
}
