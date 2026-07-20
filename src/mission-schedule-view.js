import './mission-schedule.css';
import { getLocale } from './i18n.js';
import { parsePrototypeInviteFragment } from './prototype-invite.js';
import {
  MISSION_SCHEDULE_IDS,
  classifyMissionSchedule,
  normalizeMissionScheduleId,
} from './mission-schedule.js';
import { getMissionScheduleCopy } from './mission-schedule-i18n.js';

const SELECTION_KEY = 'creatorverse-mission-schedule-selection';
const GLOBAL_KEY = '__creatorverseMissionScheduleId';
const CLOCK_KEY = '__creatorverseMissionScheduleNow';
const RESTORING_FLAG = '__creatorverseRestoringLocaleState';
const PROGRESS_KEYS = Object.freeze([
  'creatorverse-mission-template-state',
  'creatorverse-district-progress',
  'creatorverse-completion-receipt-id',
  'creatorverse-pending-completion-receipt',
]);

let creatorSelection = restoreSelection();
let currentState = null;
let currentInvite = null;
let boundaryTimer = null;
let renderQueued = false;
let applying = false;

globalThis[GLOBAL_KEY] = creatorSelection;

function restoreSelection() {
  try {
    const value = sessionStorage.getItem(SELECTION_KEY);
    return value ? normalizeMissionScheduleId(value) : null;
  } catch {
    return null;
  }
}

function currentNow() {
  const injected = globalThis[CLOCK_KEY];
  if (typeof injected === 'function') return Number(injected());
  if (Number.isFinite(Number(injected))) return Number(injected);
  return Date.now();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function scheduleIcon() {
  return `<svg class="mission-window-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M12 3v3M19.8 8.2l-2.6 1.5M4.2 8.2l2.6 1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="2.25" fill="currentColor"/>
  </svg>`;
}

function optionLabel(id, label) {
  const checked = creatorSelection === id;
  const [first, second] = label.split('·').map(part => part.trim());
  return `<label class="mission-window-option ${checked ? 'is-selected' : ''}">
    <input type="radio" name="mission-schedule" value="${id}" ${checked ? 'checked' : ''}>
    <span>${escapeHtml(first)}${second ? ` <span aria-hidden="true">·</span> <bdi dir="ltr">${escapeHtml(second)}</bdi>` : ''}</span>
  </label>`;
}

function enhanceCreatorSelector() {
  const summary = document.querySelector('.creator-studio .launch-summary');
  const missionSelector = summary?.querySelector('[data-mission-template-owned]');
  const launch = document.querySelector('.creator-studio [data-action="creator-next"]');
  if (!summary || !missionSelector || !launch) return;

  const localized = getMissionScheduleCopy(getLocale());
  const key = `${getLocale()}:${creatorSelection || 'none'}`;
  let selector = summary.querySelector('[data-mission-schedule-owned]');
  if (!selector || selector.dataset.scheduleKey !== key) {
    selector?.remove();
    missionSelector.insertAdjacentHTML('afterend', `
      <fieldset class="mission-window-selector" data-mission-schedule-owned data-schedule-key="${key}" aria-describedby="mission-window-help mission-window-validation">
        <legend>${escapeHtml(localized.selectorLegend)}</legend>
        <p id="mission-window-help">${escapeHtml(localized.selectorHelp)}</p>
        <div class="mission-window-options">
          ${MISSION_SCHEDULE_IDS.map(id => optionLabel(id, localized.options[id])).join('')}
        </div>
      </fieldset>
    `);
    selector = summary.querySelector('[data-mission-schedule-owned]');
  }

  const missionSelected = Boolean(summary.querySelector('input[name="mission-template"]:checked'));
  const ready = missionSelected && Boolean(creatorSelection);
  launch.disabled = !ready;
  launch.setAttribute('aria-disabled', String(!ready));
  const message = document.querySelector('.creator-studio .form-message');
  if (message) {
    const existing = document.querySelector('#mission-window-validation');
    if (!existing) message.insertAdjacentHTML('beforebegin', '<p id="mission-window-validation" class="form-message mission-window-validation" aria-live="polite"></p>');
    const validation = document.querySelector('#mission-window-validation');
    if (creatorSelection && validation?.textContent === localized.selectorValidation) validation.textContent = '';
  }
}

function clearMissionSession() {
  for (const key of PROGRESS_KEYS) sessionStorage.removeItem(key);
  document.querySelector('[data-mission-result]')?.remove();
  document.querySelector('[data-completion-receipt]')?.remove();
  globalThis.dispatchEvent(new CustomEvent('creatorverse:mission-window-reset'));
}

function readScheduleState() {
  const now = currentNow();
  const parsed = parsePrototypeInviteFragment(window.location.hash, { now });
  if (parsed.status !== 'valid') return { parsed, schedule: null };
  try {
    return {
      parsed,
      schedule: classifyMissionSchedule(parsed.invite, now),
    };
  } catch {
    return { parsed: { status: 'invalid' }, schedule: null };
  }
}

function statusMarkup(scheduleState) {
  const localized = getMissionScheduleCopy(getLocale());
  const stateCopy = localized.states[scheduleState];
  const unavailable = scheduleState !== 'active';
  return `<section class="mission-window-status is-${scheduleState}" data-mission-window-status data-state="${scheduleState}" aria-labelledby="mission-window-title">
    ${scheduleIcon()}
    <div class="mission-window-copy">
      <p class="section-kicker">${escapeHtml(localized.kicker)}</p>
      <h2 id="mission-window-title" tabindex="-1">${escapeHtml(stateCopy.title)}</h2>
      <p>${escapeHtml(stateCopy.support)}</p>
    </div>
    ${unavailable ? `<div class="mission-window-actions">
      <button class="primary" type="button" disabled aria-disabled="true">${escapeHtml(stateCopy.control)}</button>
      <a class="secondary link-button" href="#join">${escapeHtml(localized.back)}</a>
    </div>` : ''}
    <p class="visually-hidden" data-mission-window-live aria-live="polite"></p>
  </section>`;
}

function applyFollowerState({ announce = false } = {}) {
  const { parsed, schedule } = readScheduleState();
  currentInvite = parsed.status === 'valid' ? parsed.invite : null;
  const nextState = schedule?.state ?? (parsed.status === 'invalid' ? 'invalid' : null);
  const previousState = currentState;
  currentState = nextState;

  clearTimeout(boundaryTimer);
  boundaryTimer = null;

  const roleGrid = document.querySelector('.role-grid');
  const mission = document.querySelector('.mission');
  if (!mission || !roleGrid) return;

  if (!schedule) {
    roleGrid.hidden = nextState === 'invalid';
    mission.querySelector('[data-mission-window-status]')?.remove();
    if (nextState === 'invalid') clearMissionSession();
    return;
  }

  if (schedule.state !== 'active' && previousState !== schedule.state) clearMissionSession();
  roleGrid.hidden = schedule.state !== 'active';

  const existing = mission.querySelector('[data-mission-window-status]');
  if (!existing || existing.dataset.state !== schedule.state || existing.dataset.locale !== getLocale()) {
    existing?.remove();
    mission.insertAdjacentHTML('afterbegin', statusMarkup(schedule.state));
    const inserted = mission.querySelector('[data-mission-window-status]');
    if (inserted) inserted.dataset.locale = getLocale();
  }

  [...mission.children].forEach(child => {
    if (child.matches('[data-mission-window-status]')) return;
    child.hidden = schedule.state !== 'active';
  });

  if (announce && previousState && previousState !== schedule.state) {
    const localized = getMissionScheduleCopy(getLocale());
    const live = mission.querySelector('[data-mission-window-live]');
    if (live) live.textContent = schedule.state === 'active' ? localized.transitionActive : localized.transitionEnded;
    queueMicrotask(() => mission.querySelector('#mission-window-title')?.focus({ preventScroll: true }));
  }

  if (schedule.nextBoundaryMs != null && globalThis[CLOCK_KEY] == null) {
    const delay = Math.max(20, schedule.nextBoundaryMs - currentNow() + 20);
    boundaryTimer = setTimeout(() => applyFollowerState({ announce: true }), Math.min(delay, 2_147_000_000));
  }
}

function applyAll() {
  if (applying) return;
  applying = true;
  try {
    enhanceCreatorSelector();
    applyFollowerState();
  } finally {
    applying = false;
  }
}

function queueApply() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    applyAll();
  });
}

function handleCaptureClick(event) {
  const openCreator = event.target.closest?.('[data-action="creator"]');
  if (openCreator && globalThis[RESTORING_FLAG] !== true) {
    creatorSelection = null;
    sessionStorage.removeItem(SELECTION_KEY);
    globalThis[GLOBAL_KEY] = null;
    return;
  }

  const launch = event.target.closest?.('.creator-studio [data-action="creator-next"]');
  if (launch && document.querySelector('.creator-studio .launch-summary')) {
    const missionSelected = Boolean(document.querySelector('input[name="mission-template"]:checked'));
    if (missionSelected && !creatorSelection) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const localized = getMissionScheduleCopy(getLocale());
      const validation = document.querySelector('#mission-window-validation');
      if (validation) validation.textContent = localized.selectorValidation;
      document.querySelector('input[name="mission-schedule"]')?.focus();
      return;
    }
    globalThis[GLOBAL_KEY] = creatorSelection;
  }

  const gated = event.target.closest?.('[data-role], [data-route], [data-mission-command], [data-action="mission-result-action"], [data-action="share-completion-receipt"]');
  if (gated && currentInvite && currentState !== 'active') {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function handleChange(event) {
  const input = event.target.closest?.('input[name="mission-schedule"]');
  if (!input) return;
  creatorSelection = normalizeMissionScheduleId(input.value);
  sessionStorage.setItem(SELECTION_KEY, creatorSelection);
  globalThis[GLOBAL_KEY] = creatorSelection;
  queueApply();
}

function handleClockChange() {
  applyFollowerState({ announce: true });
}

function teardown() {
  clearTimeout(boundaryTimer);
  boundaryTimer = null;
}

document.addEventListener('click', handleCaptureClick, true);
document.addEventListener('change', handleChange);
window.addEventListener('hashchange', () => applyFollowerState());
window.addEventListener('creatorverse:schedule-clock', handleClockChange);
window.addEventListener('pagehide', teardown, { once: true });

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(queueApply);
  observer.observe(app, { childList: true, subtree: true });
}

applyAll();
