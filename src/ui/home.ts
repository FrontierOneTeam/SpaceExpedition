import { t } from './strings';

/** Home (SPEC 6.1): one main button. "Continue Your Outpost" when a run is saved. */
export function renderHome(root: HTMLElement, hasSave: boolean, onStart: () => void): void {
  root.innerHTML = '';

  const screen = document.createElement('main');
  screen.className = 'home';

  const panel = document.createElement('div');
  panel.className = 'home__panel';

  const logo = document.createElement('img');
  logo.className = 'home__logo';
  logo.src = import.meta.env.BASE_URL + 'assets/art/logo.png';
  logo.alt = t('home.logoAlt');

  const title = document.createElement('h1');
  title.className = 'home__title';
  title.textContent = t('home.title');

  const objective = document.createElement('p');
  objective.className = 'home__objective';
  objective.textContent = t('home.objective');

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'button';
  start.dataset.action = 'home-start';
  start.textContent = hasSave ? t('home.continue') : t('home.start');
  start.addEventListener('click', onStart);

  panel.append(logo, title, objective, start);
  screen.append(panel);
  root.append(screen);
}
