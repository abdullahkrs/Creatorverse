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
    return value ? normalizeMissionScheduleId(value) : MISSION_SCHEDULE_IDS[0];
  } catch {
    return MISSION_SCHEDULE_IDS[0];
  }
}

function persistSelection(value) {
  creatorSelection = normalizeMissionScheduleId(value);
  try {
    sessionStorage.setItem(SELECTION_KEY, creatorSelection);
  } catch {
    // The bounded in-memory selection remains usable when storage is unavailable.
  }
  globalThis[GLOBAL_KEY] = creatorSelection;
}

function currentNow() {
  const injected = globalThis[CLOCK_KEY];
  const value = typeof injected === 'function' ? injected() : injected;
  const numeric = value == null ? Date.now() : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error('MISSION_SCHEDULE_CLOCK_INVALID');
  return numeric;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function scheduleIcon(state) {
  const marker = state === 'upcoming'
    ? '<circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    : state === 'expired'
      ? '<path d="M5 12h14M7 8h10M7 16h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      : '<path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="3" fill="currentColor"/>';
  return `<svg class="mission-window-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${marker}</svg>`;
}

function optionMarkup(id, label) {
  const checked = creatorSelection === id;
  return `<label class="mission-window-option ${checked ? 'is-selected' : ''}">
    <input type="radio" name="mission-schedule" value="${id}" ${checked ? 'checked' : ''}>
    <span><bdi dir="auto">${escapeHtml(label)}</bdi></span>
  </label>`;
}

function synchronizeLaunch(launch, summary) {
  const ready = Boolean(summary.querySelector('input[name="mission-template"]:checked')) && Boolean(creatorSelection);
  launch.disabled = !ready;
  launch.setAttribute('aria-disabled', String(!ready));
}

function synchronizeScheduleOptions(selector) {
  selector.querySelectorAll('input[name="mission-schedule"]').forEach(input => {
    const checked = input.value === creatorSelection;
    input.checked = checked;
    input.closest('.mission-window-option')?.classList.toggle('is-selected', checked);
  });
}

function enhanceCreatorSelector() {
  const summary = document.querySelector('.creator-studio .launch-summary');
  const missionSelector = summary?.querySelector('[data-mission-template-owned]');
  const launch = document.querySelector('.creator-studio [data-action="creator-next"]');
  if (!summary || !missionSelector || !launch) return;

  const localized = getMissionScheduleCopy(getLocale());
  const key = getLocale();
  let selector = summary.querySelector('[data-mission-schedule-owned]');
  if (!selector || selector.dataset.scheduleKey !== key) {
    selector?.remove();
    missionSelector.insertAdjacentHTML('afterend', `
      <fieldset class="mission-window-selector" data-mission-schedule-owned data-schedule-key="${key}" aria-describedby="mission-window-validation">
        <legend>${escapeHtml(localized.selectorLegend)}</legend>
        <div class="mission-window-options">
          ${MISSION_SCHEDULE_IDS.map(id => optionMarkup(id, localized.options[id])).join('')}
        </div>
      </fieldset>
    `);
    selector = summary.querySelector('[data-mission-schedule-owned]');
  } else {
    synchronizeScheduleOptions(selector);
  }

  if (!document.querySelector('#mission-window-validation')) {
    const message = document.querySelector('.creator-studio .form-message');
    message?.insertAdjacentHTML('beforebegin', '<p id="mission-window-validation" class="mission-window-validation" aria-live="polite"></p>');
  }
  const validation = document.querySelector('#mission-window-validation');
  if (validation?.textContent === localized.selectorValidation) validation.textContent = '';

  synchronizeLaunch(launch, summary);
  queueMicrotask(() => {
    if (launch.isConnected && summary.isConnected) synchronizeLaunch(launch, summary);
  });
}

function clearMissionSession() {
  for (const key of PROGRESS_KEYS) sessionStorage.removeItem(key);
  document.querySelectorAll('[data-mission-result], [data-completion-receipt]').forEach(element => element.remove());
  globalThis.dispatchEvent(new CustomEvent('creatorverse:mission-window-reset'));
}

function hasInviteRoute() {
  const raw = String(window.location.hash || '').replace(/^#/u, '');
  return raw ? new URLSearchParams(raw).has('invite') : false;
}

function readScheduleState() {
  let now;
  try {
    now = currentNow();
  } catch {
    return { parsed: null, schedule: null, state: 'error' };
  }

  const parsed = parsePrototypeInviteFragment(window.location.hash, { now });
  if (parsed.status === 'none') return { parsed, schedule: null, state: null };
  if (parsed.status !== 'valid') return { parsed, schedule: null, state: 'invalid' };
  if (!Number.isSafeInteger(parsed.invite.startMinute) || !Number.isSafeInteger(parsed.invite.endMinute)) {
    return { parsed, schedule: null, state: 'active' };
  }

  try {
    const schedule = classifyMissionSchedule(parsed.invite, now);
    return { parsed, schedule, state: schedule.state };
  } catch {
    return { parsed: { status: 'invalid' }, schedule: null, state: 'invalid' };
  }
}

function formatStartTime(startMs) {
  const locale = getLocale() === 'ar' ? 'ar-AE' : 'en';
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(startMs));
}

function supportMarkup(state, schedule, localized) {
  if (state !== 'upcoming' || !schedule) {
    const text = state === 'expired'
      ? localized.expiredSupport
      : state === 'invalid'
        ? localized.invalidSupport
        : localized.errorSupport;
    return escapeHtml(text);
  }
  const time = formatStartTime(schedule.startMs);
  const [before, after = ''] = localized.startsAt.split('{time}');
  const iso = new Date(schedule.startMs).toISOString();
  return `${escapeHtml(before)}<time datetime="${iso}"><bdi dir="auto">${escapeHtml(time)}</bdi></time>${escapeHtml(after)}`;
}

function statusMarkup(state, schedule) {
  const localized = getMissionScheduleCopy(getLocale());
  const title = state === 'upcoming'
    ? localized.upcomingTitle
    : state === 'expired'
      ? localized.expiredTitle
      : state === 'invalid'
        ? localized.invalidTitle
        : localized.errorTitle;
  const action = state === 'upcoming'
    ? `<button class="primary" type="button" data-action="mission-schedule-recheck">${escapeHtml(localized.checkAgain)}</button>`
    : state === 'error'
      ? `<button class="primary" type="button" data-action="mission-schedule-recheck">${escapeHtml(localized.tryAgain)}</button>`
      : `<a class="primary link-button" href="#join">${escapeHtml(localized.back)}</a>`;

  return `<section class="mission-window-status is-${state}" data-mission-window-status data-state="${state}" data-mission-window-locale="${getLocale()}" aria-labelledby="mission-window-title">
    ${scheduleIcon(state)}
    <div class="mission-window-copy">
      <h2 id="mission-window-title" tabindex="-1">${escapeHtml(title)}</h2>
      <p>${supportMarkup(state, schedule, localized)}</p>
    </div>
    <div class="mission-window-actions">${action}</div>
  </section>`;
}

function ensureAnnouncer() {
  let announcer = document.querySelector('[data-mission-window-live]');
  if (!announcer) {
    announcer = document.createElement('p');
    announcer.className = 'visually-hidden';
    announcer.dataset.missionWindowLive = '';
    announcer.setAttribute('aria-live', 'polite');
    document.body.append(announcer);
  }
  return announcer;
}

function announce(text) {
  const announcer = ensureAnnouncer();
  if (announcer.textContent === text) return;
  announcer.textContent = text;
}

function showActiveMission(roleGrid, mission) {
  roleGrid.hidden = false;
  roleGrid.removeAttribute('data-mission-window-hidden');
  mission.querySelector('[data-mission-window-status]')?.remove();
  mission.querySelectorAll('[data-mission-window-hidden]').forEach(child => {
    child.hidden = false;
    child.removeAttribute('data-mission-window-hidden');
  });
}

function hideMissionForWindow(roleGrid, mission) {
  roleGrid.hidden = true;
  roleGrid.dataset.missionWindowHidden = '';
  [...mission.children].forEach(child => {
    if (child.matches('[data-mission-window-status]')) return;
    child.hidden = true;
    child.dataset.missionWindowHidden = '';
  });
}

function scheduleBoundary(schedule) {
  clearTimeout(boundaryTimer);
  boundaryTimer = null;
  if (!schedule || schedule.nextBoundaryMs == null || globalThis[CLOCK_KEY] != null) return;
  const delay = Math.max(20, schedule.nextBoundaryMs - currentNow() + 20);
  boundaryTimer = setTimeout(
    () => applyFollowerState({ announceChange: true, focusChange: true, forceRender: true }),
    Math.min(delay, 2_147_000_000),
  );
}

function applyFollowerState({ announceChange = false, focusChange = false, forceRender = false } = {}) {
  const { parsed, schedule, state } = readScheduleState();
  const previousState = currentState;
  currentInvite = parsed?.status === 'valid' ? parsed.invite : null;
  currentState = state;

  const roleGrid = document.querySelector('.role-grid');
  const mission = document.querySelector('.mission');
  if (!mission || !roleGrid) return state;

  if (state == null) {
    clearTimeout(boundaryTimer);
    boundaryTimer = null;
    showActiveMission(roleGrid, mission);
    return state;
  }

  if (state === 'active') {
    showActiveMission(roleGrid, mission);
    scheduleBoundary(schedule);
    if (announceChange && previousState === 'upcoming') {
      announce(getMissionScheduleCopy(getLocale()).transitionActive);
    }
    if (focusChange && previousState === 'upcoming') {
      queueMicrotask(() => document.querySelector('[data-role]')?.focus({ preventScroll: true }));
    }
    return state;
  }

  clearTimeout(boundaryTimer);
  boundaryTimer = null;
  const shouldReloadTerminal = previousState !== null
    && previousState !== state
    && (state === 'expired' || state === 'invalid');
  if (previousState !== state) clearMissionSession();
  if (shouldReloadTerminal) {
    window.location.reload();
    return state;
  }
  hideMissionForWindow(roleGrid, mission);

  const existing = mission.querySelector('[data-mission-window-status]');
  if (
    forceRender
    || !existing
    || existing.dataset.state !== state
    || existing.dataset.missionWindowLocale !== getLocale()
  ) {
    existing?.remove();
    mission.insertAdjacentHTML('afterbegin', statusMarkup(state, schedule));
  }

  if (state === 'upcoming') scheduleBoundary(schedule);
  if (announceChange && previousState && previousState !== state) {
    const localized = getMissionScheduleCopy(getLocale());
    announce(state === 'expired' ? localized.transitionExpired : localized.invalidSupport);
  }
  if (focusChange || state === 'expired' || state === 'invalid') {
    queueMicrotask(() => mission.querySelector('#mission-window-title')?.focus({ preventScroll: true }));
  }
  return state;
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

function handleRecheck(button) {
  const localized = getMissionScheduleCopy(getLocale());
  button.disabled = true;
  button.setAttribute('aria-disabled', 'true');
  button.textContent = localized.checking;
  queueMicrotask(() => applyFollowerState({ announceChange: true, focusChange: true, forceRender: true }));
}

function handleCaptureClick(event) {
  const recheck = event.target.closest?.('[data-action="mission-schedule-recheck"]');
  if (recheck) {
    event.preventDefault();
    event.stopImmediatePropagation();
    handleRecheck(recheck);
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
  if (gated && hasInviteRoute() && currentState !== 'active') {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function handleChange(event) {
  const input = event.target.closest?.('input[name="mission-schedule"]');
  if (!input) return;
  persistSelection(input.value);
  const selector = input.closest('[data-mission-schedule-owned]');
  if (selector) synchronizeScheduleOptions(selector);
  const summary = input.closest('.launch-summary');
  const launch = document.querySelector('.creator-studio [data-action="creator-next"]');
  if (summary && launch) synchronizeLaunch(launch, summary);
}

function teardown() {
  clearTimeout(boundaryTimer);
  boundaryTimer = null;
}

document.addEventListener('click', handleCaptureClick, true);
document.addEventListener('change', handleChange);
window.addEventListener('hashchange', () => applyFollowerState({ forceRender: true }));
window.addEventListener('creatorverse:schedule-clock', () => applyFollowerState({ announceChange: true, focusChange: true, forceRender: true }));
window.addEventListener('pagehide', teardown, { once: true });

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(queueApply);
  observer.observe(app, { childList: true, subtree: true });
}

ensureAnnouncer();
applyAll();
