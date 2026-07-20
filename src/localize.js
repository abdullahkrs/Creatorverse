import { applyLocale, getLocale, setLocale } from './i18n.js';
import './multilingual.css';

const RESTORE_KEY = 'creatorverse-locale-restore';
const LAST_ROUTE_KEY = 'creatorverse-last-route';
const MISSION_STATE_KEY = 'creatorverse-mission-template-state';
const RESTORING_FLAG = '__creatorverseRestoringLocaleState';
const SIGNAL_ERROR_CODE = 'signal-match-incorrect';
const SIGNAL_ERROR_COMMANDS = new Set(['pulse', 'beam']);

function rememberRouteSelection(event) {
  const route = event.target.closest?.('[data-route]');
  if (route && !route.disabled) sessionStorage.setItem(LAST_ROUTE_KEY, route.dataset.route || '');
}

document.addEventListener('click', rememberRouteSelection, true);

function currentCreatorStep() {
  const studio = document.querySelector('.creator-studio');
  if (!studio) return 0;
  if (studio.querySelector('.launch-summary')) return 3;
  if (studio.querySelector('.theme-grid')) return 2;
  return 1;
}

function currentRecoveryCommand() {
  try {
    const missionState = JSON.parse(sessionStorage.getItem(MISSION_STATE_KEY) || 'null');
    if (missionState?.messageCode !== SIGNAL_ERROR_CODE) return '';
    return SIGNAL_ERROR_COMMANDS.has(missionState?.messageCommand)
      ? missionState.messageCommand
      : '';
  } catch {
    return '';
  }
}

function captureInteractionState() {
  const role = document.querySelector('[data-role][aria-pressed="true"]')?.dataset.role || '';
  const route = sessionStorage.getItem(LAST_ROUTE_KEY) || '';
  const completed = Boolean(document.querySelector('[data-mission-result]'));
  const creatorStep = currentCreatorStep();
  const recoveryCommand = currentRecoveryCommand();

  sessionStorage.setItem(RESTORE_KEY, JSON.stringify({
    role,
    route,
    completed,
    creatorStep,
    recoveryCommand,
  }));
}

function restoreCompletedRoute(route) {
  requestAnimationFrame(() => {
    const selector = CSS.escape(route);
    const missionAction = document.querySelector(`[data-mission-command="${selector}"]`);
    const legacyAction = document.querySelector(`[data-route="${selector}"]`);
    const action = missionAction || legacyAction;
    if (action && !action.disabled) action.click();
  });
}

function restoreCreatorStep(step) {
  const creatorAction = document.querySelector('[data-action="creator"]');
  if (!creatorAction || step < 1 || step > 3) return;

  creatorAction.click();
  for (let currentStep = 1; currentStep < step; currentStep += 1) {
    document.querySelector('.creator-studio [data-action="creator-next"]')?.click();
  }
}

function restoreRecoveryFocus(command) {
  if (!SIGNAL_ERROR_COMMANDS.has(command)) return;
  const selector = CSS.escape(command);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelector(`[data-mission-command="${selector}"]`)?.focus({ preventScroll: true });
  }));
}

function restoreInteractionState() {
  const serialized = sessionStorage.getItem(RESTORE_KEY);
  if (!serialized) return;
  sessionStorage.removeItem(RESTORE_KEY);

  try {
    const state = JSON.parse(serialized);
    const role = typeof state.role === 'string' ? state.role : '';
    const route = typeof state.route === 'string' ? state.route : '';
    const creatorStep = Number.isInteger(state.creatorStep) ? state.creatorStep : 0;
    const recoveryCommand = SIGNAL_ERROR_COMMANDS.has(state.recoveryCommand)
      ? state.recoveryCommand
      : '';

    globalThis[RESTORING_FLAG] = true;
    restoreCreatorStep(creatorStep);

    const roleButton = role ? document.querySelector(`[data-role="${CSS.escape(role)}"]`) : null;
    roleButton?.click();
    if (state.completed && route) restoreCompletedRoute(route);
    if (recoveryCommand) restoreRecoveryFocus(recoveryCommand);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      delete globalThis[RESTORING_FLAG];
    }));
  } catch {
    delete globalThis[RESTORING_FLAG];
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
if (document.readyState === 'complete') {
  setTimeout(restoreInteractionState, 0);
} else {
  window.addEventListener('load', restoreInteractionState, { once: true });
}
