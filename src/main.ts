import '@fontsource/chakra-petch/700.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './ui/styles.css';
import { App } from './ui/app';
import { loadBook, randomSite } from './ui/book';
import { browserStorage } from './save/save';

const app = new App(document.getElementById('app') as HTMLElement, {
  book: loadBook(),
  storage: browserStorage(),
  // Phaser is a big download, so it loads only when the map is first shown.
  createMap: async (container, callbacks) => (await import('./game/createGame')).createMap(container, callbacks),
  randomSite,
  now: () => performance.now(),
  reducedMotion: () => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  },
});

app.start();
