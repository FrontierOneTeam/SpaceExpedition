import Phaser from 'phaser';
import { config } from '../sim/index.ts';
import type { MapCallbacks, MapView } from '../ui/mapView.ts';
import { MapScene } from './MapScene.ts';
import { phaserSoundBackend } from './phaserSound.ts';

/**
 * Start Phaser inside the map container and resolve once the map scene is ready.
 * The canvas is drawn at the screen's pixel density (capped) and shown at CSS size,
 * so the art stays sharp on phones.
 */
export function createMap(container: HTMLElement, callbacks: MapCallbacks): Promise<MapView> {
  const ratio = (): number => Math.min(config.RENDER.maxPixelRatio, Math.max(1, window.devicePixelRatio || 1));
  const size = (): { w: number; h: number } => ({
    w: Math.max(1, container.clientWidth),
    h: Math.max(1, container.clientHeight),
  });

  return new Promise((resolve) => {
    let pr = ratio();
    const { w, h } = size();
    let observer: ResizeObserver | null = null;

    const scene = new MapScene(callbacks, (ready) => {
      ready.setPixelRatio(pr);
      const view: MapView = {
        render: (model) => ready.draw(model),
        setInsets: (insets) => ready.setInsets(insets),
        tileToScreen: (r, c, lift = 0) => {
          const x = (c - r) * (config.RENDER.tileWidth / 2);
          const y = (c + r) * (config.RENDER.tileHeight / 2) - lift;
          return ready.worldToCss(x, y);
        },
        scale: () => ready.cssScale(),
        zoomBy: (factor) => ready.zoomBy(factor),
        celebrate: () => ready.celebrate(),
        sound: phaserSoundBackend(game),
        destroy: () => {
          observer?.disconnect();
          game.destroy(true);
        },
      };
      observer = new ResizeObserver(() => {
        pr = ratio();
        const s = size();
        ready.setPixelRatio(pr);
        game.scale.setZoom(1 / pr);
        game.scale.resize(s.w * pr, s.h * pr);
        ready.refit();
      });
      observer.observe(container);
      resolve(view);
    });

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      backgroundColor: config.RENDER.backgroundColour,
      scale: { mode: Phaser.Scale.NONE, width: w * pr, height: h * pr, zoom: 1 / pr },
      // Sound plays through Phaser (SPEC 2, 11.3); only approved files are ever loaded.
      banner: false,
      scene: [scene],
    });
  });
}
