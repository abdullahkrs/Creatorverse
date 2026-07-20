import './mission-templates.css';
import { getLocale } from './i18n.js';
import { parsePrototypeInviteFragment } from './prototype-invite.js';
import {
  DEFAULT_MISSION_TEMPLATE_ID,
  MISSION_TEMPLATE_IDS,
  applyMissionActivation,
  createMissionProgress,
  getMissionTemplateCopy,
  normalizeMissionTemplateId,
} from './mission-templates.js';

const STATE_KEY = 'creatorverse-mission-template-state';
const REPAIRED_KEY = 'creatorverse-mission-invite-repaired';
const GLOBAL_KEY = '__creatorverseMissionTemplateId';

const ICONS = Object.freeze({
  'route-choice': '<path d="M4 18h5V9h6V5l5 7-5 7v-4h-2v5H4v-2Zm0-12h7v2H4V6Z"/>',
  'relay-sequence': '<path d="M4 9h4v4H4V9Zm6 0h4v4h-4V9Zm6 0h4v4h-4V9ZM8 10h2v2H8v-2Zm6 0h2v2h-2v-2Z"/>',
  'signal-match': '<path d="M3 12h3l2-5 4 10 3-7 2 2h4v2h-5l-1-1-3 7-4-10-1 4H3v-2Z"/>',
  pulse: '<path d="M3 12h4l2-6 5 12 2-6h5v2h-4l-3 8L9 10l-1 4H3v-2Z"/>',
  beam: '<path d="M4 6h16v3H4V6Zm0 9h16v3H4v-3Z"/>',
  wave: '<path d="M3 13c2.5-6 5.5-6 8 0s5.5 6 10 0v3c-4.5 6-7.5 6-10 0s-5.5-6-8 0v-3Z"/>',
});

function icon(name, className = '') {
  return `<svg class="cv-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ICONS['route-choice']}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function loadState() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
    const templateId = normalizeMissionTemplateId(stored?.templateId);
    return {
      templateId,
      creatorSelection: null,
      progress: stored?.completed
        ? Object.freeze({ templateId, step: Number(stored.step) || 0, completed: true, contribution: 3 })
        : createMissionProgress(templateId),
      message: '',
    };
  } catch {
    return {
      templateId: DEFAULT_MISSION_TEMPLATE_ID,
      creatorSelection: null,
      progress: createMissionProgress(DEFAULT_MISSION_TEMPLATE_ID),
      message: '',
    };
  }
}

let state = loadState();
let renderScheduled = false;
let applying = false;

const initialInvite = parsePrototypeInviteFragment(window.location.hash);
if (initialInvite.status === 'invalid') {
  sessionStorage.removeItem(REPAIRED_KEY);
  state = {
    templateId: DEFAULT_MISSION_TEMPLATE_ID,
    creatorSelection: null,
    progress: createMissionProgress(DEFAULT_MISSION_TEMPLATE_ID),
    message: '',
  };
} else if (initialInvite.status === 'valid') {
  const templateId = normalizeMissionTemplateId(initialInvite.invite.missionId);
  state = { templateId, creatorSelection: null, progress: createMissionProgress(templateId), message: '' };
}

globalThis[GLOBAL_KEY] = state.templateId;

function saveState() {
  sessionStorage.setItem(STATE_KEY, JSON.stringify({
    templateId: state.templateId,
    step: state.progress.step,
    completed: state.progress.completed,
  }));
  globalThis[GLOBAL_KEY] = state.templateId;
}

function copy() {
  return getMissionTemplateCopy(getLocale());
}

function templateOptionMarkup(templateId, currentCopy) {
  const template = currentCopy.templates[templateId];
  const checked = state.creatorSelection === templateId;
  return `
    <label class="mission-template-option ${checked ? 'is-selected' : ''}">
      <input type="radio" name="mission-template" value="${templateId}" ${checked ? 'checked' : ''}>
      ${icon(templateId, 'mission-template-icon')}
      <span class="mission-template-copy"><strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.description)}</small></span>
      <span class="mission-template-mark" aria-hidden="true">${checked ? '✓' : ''}</span>
    </label>
  `;
}

function enhanceCreatorSelector() {
  const summary = document.querySelector('.creator-studio .launch-summary');
  const launch = document.querySelector('.creator-studio [data-action="creator-next"]');
  if (!summary || !launch) return;

  const currentCopy = copy();
  const key = `${getLocale()}:${state.creatorSelection || 'none'}`;
  if (summary.dataset.missionTemplateKey !== key) {
    summary.dataset.missionTemplateKey = key;
    summary.setAttribute('translate', 'no');
    summary.innerHTML = `
      <fieldset class="mission-template-selector" data-mission-template-owned aria-describedby="mission-template-help mission-template-validation">
        <legend>${escapeHtml(currentCopy.selectorLegend)}</legend>
        <p id="mission-template-help">${escapeHtml(currentCopy.selectorHelp)}</p>
        <div class="mission-template-rail">
          ${MISSION_TEMPLATE_IDS.map(id => templateOptionMarkup(id, currentCopy)).join('')}
        </div>
      </fieldset>
      <label class="check-row"><input type="checkbox" data-field="safety" checked> <span>${escapeHtml(currentCopy.safety)}</span></label>
    `;
  }

  launch.disabled = !state.creatorSelection;
  launch.setAttribute('aria-disabled', String(!state.creatorSelection));
  const message = document.querySelector('.creator-studio .form-message');
  if (message) {
    message.id = 'mission-template-validation';
    if (state.creatorSelection && message.textContent === currentCopy.validation) message.textContent = '';
  }
}

function missionActionMarkup(templateId, currentCopy, hasRole) {
  const template = currentCopy.templates[templateId];
  if (templateId === 'route-choice') {
    return `
      <div class="mission-template-actions mission-template-actions-two" aria-label="${escapeHtml(template.name)}">
        ${Object.entries(template.actions).map(([id, label]) => `<button class="route" type="button" data-route="${id}" data-mission-command="${id}" ${!hasRole ? 'disabled' : ''}>${escapeHtml(label)}</button>`).join('')}
      </div>
    `;
  }

  if (templateId === 'relay-sequence') {
    return `
      <p class="mission-template-progress"><bdi>${escapeHtml(template.step(Math.min(3, state.progress.step + 1)))}</bdi></p>
      <div class="mission-template-actions mission-relay-actions" aria-label="${escapeHtml(template.name)}">
        ${[1, 2, 3].map(step => {
          const done = state.progress.step >= step;
          const enabled = hasRole && !state.progress.completed && state.progress.step + 1 === step;
          return `<button class="route mission-relay" type="button" data-mission-command="${step}" ${enabled ? '' : 'disabled'} aria-label="${escapeHtml(template.actions[step])}${done ? ' ✓' : ''}">${icon('relay-sequence')}<span>${escapeHtml(template.actions[step])}</span><span aria-hidden="true">${done ? '✓' : step}</span></button>`;
        }).join('')}
      </div>
    `;
  }

  return `
    <div class="mission-signal-target" aria-label="${escapeHtml(template.target)}">${icon('wave')}<strong>${escapeHtml(template.target)}</strong></div>
    <div class="mission-template-actions mission-signal-actions" aria-label="${escapeHtml(template.name)}">
      ${Object.entries(template.actions).map(([id, label]) => `<button class="route mission-signal" type="button" data-mission-command="${id}" ${!hasRole ? 'disabled' : ''}>${icon(id)}<span>${escapeHtml(label)}</span></button>`).join('')}
    </div>
  `;
}

function decorateCompletedResult() {
  const result = document.querySelector('[data-mission-result]');
  if (!result || result.dataset.missionTemplate === state.templateId) return;
  const currentCopy = copy();
  const template = currentCopy.templates[state.templateId];
  result.dataset.missionTemplate = state.templateId;
  result.setAttribute('translate', 'no');
  const kicker = result.querySelector('.section-kicker');
  const title = result.querySelector('#mission-result-title');
  if (kicker) kicker.textContent = currentCopy.kicker;
  if (title) title.textContent = currentCopy.complete;
  const facts = result.querySelectorAll('.signal-result-facts > div');
  const missionFact = facts[1];
  if (missionFact) {
    const term = missionFact.querySelector('dt');
    const value = missionFact.querySelector('dd');
    if (term) term.textContent = currentCopy.missionLabel;
    if (value) value.textContent = template.name;
  }
}

function enhanceMission() {
  if (document.querySelector('[data-mission-result]')) {
    decorateCompletedResult();
    return;
  }

  const mission = document.querySelector('.mission');
  if (!mission) return;
  const selectedRole = document.querySelector('[data-role][aria-pressed="true"]')?.dataset.role || '';
  const currentCopy = copy();
  const template = currentCopy.templates[state.templateId];
  const repaired = sessionStorage.getItem(REPAIRED_KEY) === '1';
  const status = selectedRole ? (state.progress.step > 0 ? currentCopy.active : currentCopy.ready) : currentCopy.chooseRole;
  const key = `${getLocale()}:${state.templateId}:${selectedRole}:${state.progress.step}:${state.message}:${repaired}`;
  if (mission.dataset.missionTemplateKey === key) return;

  const legacyButtons = [...mission.querySelectorAll('[data-route]')]
    .filter(button => !button.closest('[data-mission-legacy-triggers]') && !button.hasAttribute('data-mission-command'));
  if (!legacyButtons.length) {
    const existing = [...mission.querySelectorAll('[data-mission-legacy-triggers] [data-route]')];
    legacyButtons.push(...existing);
  }

  mission.dataset.missionTemplateKey = key;
  mission.dataset.missionTemplate = state.templateId;
  mission.setAttribute('translate', 'no');
  mission.innerHTML = `
    <header class="mission-heading">
      <div>
        <p class="section-kicker">${escapeHtml(currentCopy.kicker)}</p>
        <h2 id="mission-title" tabindex="-1">${escapeHtml(template.name)}</h2>
      </div>
      <span class="mission-status">${escapeHtml(status)}</span>
    </header>
    ${repaired ? `<p class="mission-repaired" role="status">${escapeHtml(currentCopy.repaired)}</p>` : ''}
    <p class="mission-prompt">${escapeHtml(selectedRole ? template.prompt : currentCopy.chooseRole)}</p>
    ${missionActionMarkup(state.templateId, currentCopy, Boolean(selectedRole))}
    <p class="mission-template-message" role="status" aria-live="polite">${escapeHtml(state.message)}</p>
    <div hidden data-mission-legacy-triggers></div>
  `;
  const legacyHost = mission.querySelector('[data-mission-legacy-triggers]');
  legacyButtons.forEach(button => legacyHost?.append(button));
}

function enhanceReceipt() {
  const receipt = document.querySelector('[data-prototype-invite-receipt]');
  if (!receipt || receipt.querySelector('[data-mission-receipt]')) return;
  const currentCopy = copy();
  const template = currentCopy.templates[state.templateId];
  const stamp = receipt.querySelector('.invite-signal-stamp');
  stamp?.insertAdjacentHTML('afterend', `<p class="invite-mission-summary" data-mission-receipt translate="no"><strong>${escapeHtml(currentCopy.missionLabel)}:</strong> ${escapeHtml(template.name)}</p>`);
}

function applyEnhancements() {
  if (applying) return;
  applying = true;
  try {
    enhanceCreatorSelector();
    enhanceMission();
    enhanceReceipt();
    decorateCompletedResult();
  } finally {
    applying = false;
  }
}

function scheduleEnhancements() {
  if (renderScheduled) return;
  renderScheduled = true;
  queueMicrotask(() => {
    renderScheduled = false;
    applyEnhancements();
  });
}

function resetProgress(templateId = state.templateId) {
  state.progress = createMissionProgress(templateId);
  state.message = '';
  saveState();
}

function completeThroughLegacy(routeId) {
  const trigger = document.querySelector(`[data-mission-legacy-triggers] [data-route="${CSS.escape(routeId)}"]`);
  if (!trigger || trigger.disabled) return;
  state.progress = Object.freeze({ ...state.progress, completed: true, contribution: 3 });
  state.message = '';
  saveState();
  trigger.click();
}

function focusMissionHeadingAfterRender() {
  queueMicrotask(() => queueMicrotask(() => document.querySelector('#mission-title')?.focus({ preventScroll: true })));
}

function handleCaptureClick(event) {
  const openCreator = event.target.closest?.('[data-action="creator"]');
  if (openCreator) {
    sessionStorage.removeItem(REPAIRED_KEY);
    state.creatorSelection = null;
    state.message = '';
    return;
  }

  const role = event.target.closest?.('[data-role]');
  if (role) {
    sessionStorage.removeItem(REPAIRED_KEY);
    resetProgress();
    focusMissionHeadingAfterRender();
    return;
  }

  const launch = event.target.closest?.('.creator-studio [data-action="creator-next"]');
  if (launch && document.querySelector('.creator-studio .launch-summary')) {
    if (!state.creatorSelection) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const message = document.querySelector('.creator-studio .form-message');
      if (message) message.textContent = copy().validation;
      document.querySelector('.mission-template-selector input')?.focus();
      return;
    }
    state.templateId = state.creatorSelection;
    resetProgress(state.templateId);
  }
}

function handleChange(event) {
  const selector = event.target.closest?.('input[name="mission-template"]');
  if (!selector) return;
  state.creatorSelection = normalizeMissionTemplateId(selector.value, { fallback: false });
  state.templateId = state.creatorSelection;
  resetProgress(state.templateId);
  scheduleEnhancements();
}

function handleMissionClick(event) {
  const action = event.target.closest?.('[data-mission-command]');
  if (!action || action.disabled) return;
  const activation = action.dataset.missionCommand;
  const next = applyMissionActivation(state.progress, activation);

  if (state.templateId === 'signal-match' && next === state.progress && activation !== 'wave') {
    state.message = copy().templates['signal-match'].incorrect;
    scheduleEnhancements();
    return;
  }

  if (next === state.progress) return;
  state.progress = next;
  state.message = '';
  saveState();

  if (next.completed) {
    const route = state.templateId === 'route-choice'
      ? activation
      : state.templateId === 'signal-match'
        ? 'ocean'
        : 'sky';
    completeThroughLegacy(route);
    return;
  }

  scheduleEnhancements();
  queueMicrotask(() => document.querySelector(`[data-mission-command="${next.step + 1}"]`)?.focus({ preventScroll: true }));
}

document.addEventListener('click', handleCaptureClick, true);
document.addEventListener('change', handleChange);
document.addEventListener('click', handleMissionClick);

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(scheduleEnhancements);
  observer.observe(app, { childList: true, subtree: true });
}

applyEnhancements();
