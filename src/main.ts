import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/app';
import { loadBook, randomSite } from './ui/book';
import {openSaveStorage} from './save/database.ts';
import { browserStorage } from './save/save';

async function boot(): Promise<void> {
const app = new App(document.getElementById('app') as HTMLElement, {
  book: loadBook(),
  storage: await openSaveStorage(browserStorage()),
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

// Offline play after the first visit (SPEC 2). When a new version has been installed, reload only
// when it cannot interrupt play: at once on Home and other pages, otherwise when the player leaves the map.
registerSW({ immediate: true, onNeedReload: () => app.whenSafe(() => window.location.reload()) });

}
void boot();
