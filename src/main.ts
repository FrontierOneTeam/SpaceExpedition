import '@fontsource/chakra-petch/700.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './ui/styles.css';
import { renderHome } from './ui/home';
import { t } from './ui/strings';

const app = document.getElementById('app') as HTMLElement;

renderHome(app, async () => {
  // Phaser is a big download. Show a short line while it arrives.
  const loading = document.createElement('p');
  loading.className = 'loading';
  loading.textContent = t('boot.loading');
  app.replaceChildren(loading);

  const { createGame } = await import('./game/createGame');
  app.replaceChildren();
  createGame();
});
