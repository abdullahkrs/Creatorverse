import { applyLocale, getLocale, setLocale } from './i18n.js';
import './multilingual.css';

const RESTORE_KEY = 'creatorverse-locale-restore';
const LAST_ROUTE_KEY = 'creatorverse-last-route';

function rememberRouteSelection(event) {
  const route = event.target.closest?.('[data-route]');
  if (route && !route.disabled) sessionStorage.setItem(LAST_ROUTE_KEY, route.dataset.route || '');
}

document.addEventListener('click', rememberRouteSelection, true);

function captureInteractionState() {
  const role = document.querySelector('[data-role][aria-pressed="true"]')?.dataset.role || '';
  const route = sessionStorage.getItem(LAST_ROUTE_KEY) || '';
  const completed = Boolean(document.querySelector('[data-mission-result]'));

  sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ role, route, completed }));
}

function restoreInteractionState() {
  const serialized = sessionStorage.getItem(RESTORE_KEY);
  if (!serialized) return;
  sessionStorage.removeItem(RESTORE_KEY);

  try {
    const state = JSON.parse(serialized);
    const role = typeof state.role === 'string' ? state.role : '';
    const route = typeof state.route === 'string' ? state.route : '';
    const roleButton = role ? document.querySelector(`[data-role="${CSS.escape(role)}"]`) : null;

    roleButton?.click();
    if (state.completed && route) {
      document.querySelector(`[data-route="${CSS.escape(route)}"]`)?.click();
    }
  } catch {
    sessionStorage.removeItem(LAST_ROUTE_KEY);
  }
}

function renderLanguageControl() {
  const host = document.querySelector('.nav-actions');
  if (!host) return;

  let control = host.querySelector('.language-control');
  if (!control) {
    control = document.createElement('div');
    control.className = 'language-control';
    control.setAttribute('aria-label', 'Language');
    control.innerHTML = `
      <button type="button" data-locale="en">EN</button>
      <button type="button" data-locale="ar">العربية</button>
    `;
    host.prepend(control);

    control.addEventListener('click', event => {
      const button = event.target.closest('[data-locale]');
      if (!button || button.dataset.locale === getLocale()) return;
      captureInteractionState();
      setLocale(button.dataset.locale);
      window.location.reload();
    });
  }
  updateSelectedLanguage();
}

function updateSelectedLanguage() {
  document.querySelectorAll('[data-locale]').forEach(button => {
    const selected = button.dataset.locale === getLocale();
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

let applying = false;
function localizeApplication() {
  if (applying) return;
  applying = true;
  renderLanguageControl();
  applyLocale(document);
  updateSelectedLanguage();
  applying = false;
}

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(() => queueMicrotask(localizeApplication));
  observer.observe(app, { childList: true, subtree: true });
}

localizeApplication();
queueMicrotask(restoreInteractionState);
