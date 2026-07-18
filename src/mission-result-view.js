import {
  buildMissionSharePayload,
  createMissionResult,
  createMissionResultActionController,
} from './mission-result.js';
import { getMissionResultCopy } from './mission-result-i18n.js';

const RESULT_ACTION = 'mission-result-action';
const ROLE_ICONS = Object.freeze({
  builder: '<path d="M5 18V9l7-4 7 4v9h-5v-5h-4v5H5Zm5-7h4V9h-4v2Z"/>',
  explorer: '<path d="m12 4 7 4-3 9-4 3-4-3-3-9 7-4Zm0 4-3 2 2 5 1 1 1-1 2-5-3-2Z"/>',
  guardian: '<path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3Zm0 5-3 1v2c0 2.4 1.1 4.3 3 5.6 1.9-1.3 3-3.2 3-5.6V9l-3-1Z"/>',
});
const CONTROL_ICONS = Object.freeze({
  share: '<path d="M8 12h8M13 7l5 5-5 5M6 5H4v14h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/>',
  copy: '<path d="M8 8h10v11H8zM5 5h10v3M5 5v11h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"/>',
});

let activeResult = null;
let activeController = null;
let activePayload = null;
let actionState = 'idle';
let announcedResultKey = '';
let successResetTimer = null;

function getLocale() {
  return document.documentElement.lang?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function icon(path, className = '') {
  return `<svg class="cv-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getCurrentPublicUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

async function copyText(text) {
  if (typeof navigator.clipboard?.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return;
  }

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.insetInlineStart = '-9999px';
  document.body.append(field);
  field.select();
  const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('COPY_UNAVAILABLE');
}

function hasCopyCapability() {
  return typeof navigator.clipboard?.writeText === 'function'
    || typeof document.execCommand === 'function';
}

function createController(result) {
  try {
    activePayload = buildMissionSharePayload(result, {
      locale: getLocale(),
      publicUrl: getCurrentPublicUrl(),
    });
    activeController = createMissionResultActionController({
      navigatorLike: navigator,
      payload: activePayload,
      copyText: hasCopyCapability() ? copyText : null,
    });
  } catch {
    activePayload = null;
    activeController = null;
  }
}

function resultKey(result) {
  return `${result.roleId}:${result.routeId}:${result.energyBefore}:${result.energyAfter}`;
}

function getActionPresentation(copy) {
  const mode = activeController?.mode || 'copy';
  if (!activeController) return { label: copy.copy, message: copy.invalidUrl, disabled: true, visibleMessage: true };
  if (actionState === 'pending') {
    return { label: mode === 'share' ? copy.sharing : copy.copying, message: '', disabled: true, visibleMessage: false };
  }
  if (actionState === 'shared') return { label: copy.shared, message: copy.shareSuccess, disabled: false, visibleMessage: false };
  if (actionState === 'copied') return { label: copy.copied, message: copy.copySuccess, disabled: false, visibleMessage: false };
  if (actionState === 'cancelled') return { label: copy.share, message: copy.cancelled, disabled: false, visibleMessage: true };
  if (actionState === 'denied') return { label: copy.share, message: copy.denied, disabled: false, visibleMessage: true };
  if (actionState === 'failed') {
    return { label: mode === 'share' ? copy.share : copy.copy, message: mode === 'share' ? copy.shareFailed : copy.copyFailed, disabled: false, visibleMessage: true };
  }
  if (actionState === 'unsupported') return { label: copy.copy, message: copy.unsupported, disabled: false, visibleMessage: true };
  if (actionState === 'invalid') return { label: copy.copy, message: copy.invalidUrl, disabled: true, visibleMessage: true };
  return { label: mode === 'share' ? copy.share : copy.copy, message: '', disabled: false, visibleMessage: false };
}

function renderResultMarkup(result) {
  const locale = getLocale();
  const copy = getMissionResultCopy(locale);
  const role = copy.roles[result.roleId];
  const route = copy.routes[result.routeId];
  const district = copy.districts[result.district] || result.district;
  const beforePercent = Math.max(0, Math.min(100, (result.energyBefore / result.target) * 100));
  const gainPercent = Math.max(0, Math.min(100 - beforePercent, (result.energyAdded / result.target) * 100));
  const afterPercent = Math.max(0, Math.min(100, (result.energyAfter / result.target) * 100));
  const action = getActionPresentation(copy);
  const mode = activeController?.mode || 'copy';

  return `
    <section class="signal-result" data-mission-result aria-labelledby="mission-result-title">
      <div class="signal-result-layout">
        <div class="signal-result-main">
          <header class="signal-result-heading">
            <div>
              <p class="section-kicker">${escapeHtml(copy.kicker)}</p>
              <h2 id="mission-result-title" tabindex="-1">${escapeHtml(copy.title)}</h2>
            </div>
            <div class="signal-contribution" aria-label="${escapeHtml(`${copy.energy} +${result.energyAdded}`)}">
              ${icon(ROLE_ICONS[result.roleId], 'signal-role-icon')}
              <strong><bdi dir="ltr">+${result.energyAdded}</bdi></strong>
              <span>${escapeHtml(copy.energy)}</span>
            </div>
          </header>

          <div class="signal-progress" role="progressbar" aria-label="${escapeHtml(copy.realmChange)}" aria-valuemin="0" aria-valuemax="${result.target}" aria-valuenow="${result.energyAfter}">
            <div class="signal-progress-label">
              <strong>${escapeHtml(district)}</strong>
              <bdi dir="ltr">${result.energyBefore} → ${result.energyAfter}</bdi>
            </div>
            <div class="signal-energy-track" style="--signal-before:${beforePercent}%;--signal-gain:${gainPercent}%;--signal-after:${afterPercent}%" aria-hidden="true">
              <span class="signal-energy-before"></span>
              <span class="signal-energy-gain"></span>
              <span class="signal-energy-node"></span>
            </div>
          </div>
        </div>

        <div class="signal-result-side">
          <dl class="signal-result-facts">
            <div><dt>${escapeHtml(copy.role)}</dt><dd>${escapeHtml(role)}</dd></div>
            <div><dt>${escapeHtml(copy.route)}</dt><dd>${escapeHtml(route)}</dd></div>
            <div><dt>${escapeHtml(copy.energy)}</dt><dd><bdi dir="ltr">+${result.energyAdded}</bdi></dd></div>
            <div><dt>${escapeHtml(copy.district)}</dt><dd>${escapeHtml(district)}</dd></div>
          </dl>

          <div class="signal-result-action-area">
            <button class="primary signal-result-action" type="button" data-action="${RESULT_ACTION}" ${action.disabled ? 'disabled' : ''} aria-describedby="mission-result-action-status">
              ${actionState === 'pending' ? '<span class="signal-action-progress" aria-hidden="true"></span>' : icon(CONTROL_ICONS[mode])}
              <span>${escapeHtml(action.label)}</span>
            </button>
            <p id="mission-result-action-status" class="signal-action-status ${action.visibleMessage ? '' : 'cv-visually-hidden'}" aria-live="polite" aria-atomic="true">${escapeHtml(action.message)}</p>
          </div>
        </div>
      </div>
      <p class="cv-visually-hidden" data-result-announcement aria-live="polite" aria-atomic="true"></p>
    </section>
  `;
}

function enhanceCompletedMission() {
  const mission = document.querySelector('.mission');
  if (!mission || mission.querySelector('[data-mission-result]')) return;
  if (!activeResult || !mission.querySelector('.mission-result strong')) return;

  mission.classList.add('active', 'is-complete');
  mission.setAttribute('aria-labelledby', 'mission-result-title');
  mission.innerHTML = renderResultMarkup(activeResult);

  const key = resultKey(activeResult);
  if (announcedResultKey !== key) {
    announcedResultKey = key;
    queueMicrotask(() => {
      const copy = getMissionResultCopy(getLocale());
      const heading = document.querySelector('#mission-result-title');
      const announcement = document.querySelector('[data-result-announcement]');
      heading?.focus({ preventScroll: true });
      if (announcement) announcement.textContent = copy.ready;
      setTimeout(() => { if (announcement) announcement.textContent = ''; }, 1200);
    });
  }
}

function resetResultState() {
  activeResult = null;
  activeController = null;
  activePayload = null;
  actionState = 'idle';
  announcedResultKey = '';
  if (successResetTimer) clearTimeout(successResetTimer);
  successResetTimer = null;
}

function captureMissionSelection(event) {
  const roleButton = event.target.closest?.('[data-role]');
  if (roleButton) {
    resetResultState();
    return;
  }

  const routeButton = event.target.closest?.('[data-route]');
  if (!routeButton || routeButton.disabled) return;

  const selectedRole = document.querySelector('[data-role][aria-pressed="true"]')?.dataset.role;
  const progress = document.querySelector('.realm-card .progress');
  if (!selectedRole || !progress) return;

  activeResult = createMissionResult({
    roleId: selectedRole,
    routeId: routeButton.dataset.route,
    energyBefore: Number(progress.getAttribute('aria-valuenow')),
    target: Number(progress.getAttribute('aria-valuemax')),
    district: 'Signal Harbor',
  });
  actionState = 'idle';
  createController(activeResult);
}

function refreshResultDom({ focusAction = false } = {}) {
  const host = document.querySelector('[data-mission-result]');
  if (!host || !activeResult) return;
  host.outerHTML = renderResultMarkup(activeResult);
  if (focusAction) document.querySelector(`[data-action="${RESULT_ACTION}"]`)?.focus({ preventScroll: true });
}

async function runResultAction(event) {
  const button = event.target.closest?.(`[data-action="${RESULT_ACTION}"]`);
  if (!button || button.disabled) return;

  if (!activeController) {
    actionState = 'invalid';
    refreshResultDom({ focusAction: true });
    return;
  }

  const activation = activeController.activate();
  actionState = 'pending';
  refreshResultDom({ focusAction: true });
  const outcome = await activation;
  if (outcome.status === 'ignored') return;
  actionState = outcome.status;
  refreshResultDom({ focusAction: true });

  if (['shared', 'copied'].includes(outcome.status)) {
    if (successResetTimer) clearTimeout(successResetTimer);
    successResetTimer = setTimeout(() => {
      actionState = 'idle';
      refreshResultDom({ focusAction: true });
    }, 1400);
  }
}

export function installMissionResultView(root = document) {
  root.addEventListener('click', captureMissionSelection, true);
  root.addEventListener('click', runResultAction);
  const app = root.querySelector('#app');
  if (app) {
    const observer = new MutationObserver(enhanceCompletedMission);
    observer.observe(app, { childList: true, subtree: true });
  }
  enhanceCompletedMission();
}

if (typeof document !== 'undefined') installMissionResultView(document);
