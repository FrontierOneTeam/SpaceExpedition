import { esc } from './format.ts';
import { t } from './strings.ts';

/**
 * Home (SPEC 6.1): one main button, "Continue Your Outpost" when a run is saved, and small links.
 * Past reports shows only once a report exists (SPEC 16.2).
 */
export function homeHtml(hasSave: boolean, hasReports: boolean): string {
  const reports = hasReports ? `<button type="button" class="link" data-action="open-reports">${esc(t('home.reports'))}</button>` : '';
  return `<main class="home">
    <div class="home__panel">
      <img class="home__logo" src="${import.meta.env.BASE_URL}assets/art/logo.png" alt="${esc(t('home.logoAlt'))}">
      <h1 class="home__title">${esc(t('home.title'))}</h1>
      <p class="home__objective">${esc(t('home.objective'))}</p>
      <button type="button" class="button" data-action="home-start">${esc(hasSave ? t('home.continue') : t('home.start'))}</button>
      <nav class="home__links">
        ${reports}
        <button type="button" class="link" data-action="open-sources">${esc(t('home.sources'))}</button>
        <button type="button" class="link" data-action="open-settings">${esc(t('home.settings'))}</button>
      </nav>
    </div>
    <div class="gloss-layer"></div>
  </main>`;
}
