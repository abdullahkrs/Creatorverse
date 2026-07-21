import {
  buildMissionSharePayload,
  createMissionResult,
  createMissionResultActionController,
} from './mission-result.js';
import { getMissionResultCopy } from './mission-result-i18n.js';
import { getDistrictProgressCopy } from './district-progress-i18n.js';
import {
  DISTRICT_SESSION_KEY,
  completeDistrictProgress,
  createDistrictScope,
  districtResultInput,
  restoreDistrictProgress,
  serializeDistrictProgress,
} from './district-progress.js';
import { parsePrototypeInviteFragment } from './prototype-invite.js';
import {
  buildCompletionReceiptUrl,
  createCompletionReceipt,
  createOpaqueIdentifier,
} from './completion-receipt.js';

const RESULT_ACTION = 'mission-result-action';
const COMPLETION_ID_KEY = 'creatorverse-completion-receipt-id';
const OPAQUE_ID = /^[A-Za-z0-9_-]{16,64}$/u;
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
let activeResultRestored = false;
let hasRenderedResult = false;

function getLocale() {
  return document.documentElement.lang?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function icon(path, className = '') {
  return `<svg class="cv-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
}

function districtArtwork() {
  return `
    <svg class="district-artwork" viewBox="0 0 96 72" aria-hidden="true" focusable="false">
      <path class="district-contour" d="M13 18 34 8l18 8 20-5 12 15-6 28-24 10-23-6-18-17Z"/>
      <path class="district-seam" d="M52 16v18l-9 8v16"/>
      <path class="district-beacon" d="M61 43V27m-7 6h14m-11-9 4-5 4 5"/>
    </svg>
  `;
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

function currentDistrictContext() {
  const parsed = parsePrototypeInviteFragment(window.location.hash);
  const scope = createDistrictScope(window.location.hash, parsed.status);
  if (!scope) sessionStorage.removeItem(DISTRICT_SESSION_KEY);
  return { parsed, scope };
}

function readDistrictProgress() {
  const { scope } = currentDistrictContext();
  if (!scope) return null;
  try {
    const stored = JSON.parse(sessionStorage.getItem(DISTRICT_SESSION_KEY) || 'null');
    return restoreDistrictProgress(stored, { scope });
  } catch {
    sessionStorage.removeItem(DISTRICT_SESSION_KEY);
    return restoreDistrictProgress(null, { scope });
  }
}

function writeDistrictProgress(progress) {
  const { scope } = currentDistrictContext();
  if (!scope) return;
  sessionStorage.setItem(DISTRICT_SESSION_KEY, serializeDistrictProgress(progress, { scope }));
}

function ensureCompletionReceiptId(scope) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(COMPLETION_ID_KEY) || 'null');
    if (stored?.scope === scope && typeof stored.id === 'string' && OPAQUE_ID.test(stored.id)) return stored.id;
  } catch {
    sessionStorage.removeItem(COMPLETION_ID_KEY);
  }
  const id = createOpaqueIdentifier();
  sessionStorage.setItem(COMPLETION_ID_KEY, JSON.stringify({ scope, id }));
  return id;
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
    const basePayload = buildMissionSharePayload(result, {
      locale: getLocale(),
      publicUrl: getCurrentPublicUrl(),
    });
    const { parsed, scope } = currentDistrictContext();
    const progress = readDistrictProgress();
    if (parsed.status !== 'valid' || !parsed.invite.realmId || !scope || !progress?.unlocked) {
      activePayload = basePayload;
    } else {
      const token = createCompletionReceipt({
        realmId: parsed.invite.realmId,
        receiptId: ensureCompletionReceiptId(scope),
        missionId: result.templateId,
        roleId: result.roleId,
        routeId: result.routeId,
      });
      activePayload = Object.freeze({
        ...basePayload,
        url: buildCompletionReceiptUrl(getCurrentPublicUrl(), token),
      });
    }
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
  return `${result.roleId}:${result.routeId}:${result.templateId}:${result.district}:${result.energyAfter}`;
}

function getActionPresentation(localeCopy) {
  const mode = activeController?.mode || 'copy';
  if (!activeController) return { label: localeCopy.copy, message: localeCopy.invalidUrl, disabled: true, visibleMessage: true };
  if (actionState === 'pending') {
    return { label: mode === 'share' ? localeCopy.sharing : localeCopy.copying, message: '', disabled: true, visibleMessage: false };
  }
  if (actionState === 'shared') return { label: localeCopy.shared, message: localeCopy.shareSuccess, disabled: false, visibleMessage: false };
  if (actionState === 'copied') return { label: localeCopy.copied, message: localeCopy.copySuccess, disabled: false, visibleMessage: false };
  if (actionState === 'cancelled') return { label: localeCopy.share, message: localeCopy.cancelled, disabled: false, visibleMessage: true };
  if (actionState === 'denied') return { label: localeCopy.share, message: localeCopy.denied, disabled: false, visibleMessage: true };
  if (actionState === 'failed') {
    return { label: mode === 'share' ? localeCopy.share : localeCopy.copy, message: mode === 'share' ? localeCopy.shareFailed : localeCopy.copyFailed, disabled: false, visibleMessage: true };
  }
  if (actionState === 'unsupported') return { label: localeCopy.copy, message: localeCopy.unsupported, disabled: false, visibleMessage: true };
  if (actionState === 'invalid') return { label: localeCopy.copy, message: localeCopy.invalidUrl, disabled: true, visibleMessage: true };
  return { label: mode === 'share' ? localeCopy.share : localeCopy.copy, message: '', disabled: false, visibleMessage: false };
}

function renderResultMarkup(result) {
  const locale = getLocale();
  const localeCopy = getMissionResultCopy(locale);
  const districtCopy = getDistrictProgressCopy(locale);
  const role = localeCopy.roles[result.roleId];
  const route = localeCopy.routes[result.routeId];
  const district = localeCopy.districts[result.district] || result.district;
  const action = getActionPresentation(localeCopy);
  const mode = activeController?.mode || 'copy';
  const restoredClass = activeResultRestored || hasRenderedResult ? 'is-restored' : '';

  return `
    <section class="signal-result" data-mission-result data-district-result aria-labelledby="mission-result-title">
      <div class="signal-result-layout">
        <div class="signal-result-main">
          <header class="signal-result-heading">
            <div>
              <p class="section-kicker">${escapeHtml(localeCopy.kicker)}</p>
              <h2 class="district-unlock-title" id="mission-result-title" tabindex="-1">${escapeHtml(districtCopy.unlockedTitle)}</h2>
              <p class="district-unlock-support">${escapeHtml(districtCopy.unlockedSupport)}</p>
            </div>
            <div class="signal-contribution" aria-label="${escapeHtml(`${localeCopy.energy} +${result.energyAdded}`)}">
              ${icon(ROLE_ICONS[result.roleId], 'signal-role-icon')}
              <strong><bdi dir="ltr">+${result.energyAdded}</bdi></strong>
              <span>${escapeHtml(localeCopy.energy)}</span>
            </div>
          </header>

          <div class="district-progress ${restoredClass}" data-district-progress data-district-state="unlocked" role="progressbar" aria-label="${escapeHtml(districtCopy.progressLabel)}" aria-valuemin="0" aria-valuemax="3" aria-valuenow="3">
            ${districtArtwork()}
            <div class="district-progress-copy">
              <strong>${escapeHtml(district)}</strong>
              <p class="district-progress-status"><bdi>${escapeHtml(districtCopy.unlockedStatus)}</bdi></p>
            </div>
          </div>
        </div>

        <div class="signal-result-side">
          <dl class="signal-result-facts">
            <div><dt>${escapeHtml(localeCopy.role)}</dt><dd>${escapeHtml(role)}</dd></div>
            <div><dt>${escapeHtml(localeCopy.route)}</dt><dd>${escapeHtml(route)}</dd></div>
            <div><dt>${escapeHtml(localeCopy.energy)}</dt><dd><bdi dir="ltr">+${result.energyAdded}</bdi></dd></div>
            <div><dt>${escapeHtml(localeCopy.district)}</dt><dd>${escapeHtml(district)}</dd></div>
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

function lockCompletedRoleControls(result) {
  document.querySelectorAll('[data-role]').forEach(button => {
    const selected = button.dataset.role === result.roleId;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = true;
  });
}

function restoreStoredResult() {
  const progress = readDistrictProgress();
  if (!progress?.unlocked) return false;
  activeResult = createMissionResult(districtResultInput(progress));
  activeResultRestored = true;
  hasRenderedResult = true;
  actionState = 'idle';
  announcedResultKey = resultKey(activeResult);
  createController(activeResult);
  return true;
}

function enhanceCompletedMission() {
  const mission = document.querySelector('.mission');
  if (!mission || mission.querySelector('[data-mission-result]')) return;
  if (!activeResult) restoreStoredResult();
  if (!activeResult) return;
  if (!activeResultRestored && !mission.querySelector('.mission-result strong')) return;

  mission.classList.add('active', 'is-complete');
  mission.setAttribute('aria-labelledby', 'mission-result-title');
  mission.innerHTML = renderResultMarkup(activeResult);
  lockCompletedRoleControls(activeResult);

  const key = resultKey(activeResult);
  if (!activeResultRestored && announcedResultKey !== key) {
    announcedResultKey = key;
    queueMicrotask(() => {
      const districtCopy = getDistrictProgressCopy(getLocale());
      const heading = document.querySelector('#mission-result-title');
      const announcement = document.querySelector('[data-result-announcement]');
      heading?.focus({ preventScroll: true });
      if (announcement) announcement.textContent = districtCopy.announcement;
      setTimeout(() => { if (announcement) announcement.textContent = ''; }, 1200);
    });
  }
  hasRenderedResult = true;
}

function resetResultState() {
  activeResult = null;
  activeController = null;
  activePayload = null;
  actionState = 'idle';
  announcedResultKey = '';
  activeResultRestored = false;
  hasRenderedResult = false;
  if (successResetTimer) clearTimeout(successResetTimer);
  successResetTimer = null;
}

function captureMissionSelection(event) {
  const roleButton = event.target.closest?.('[data-role]');
  if (roleButton) {
    const completed = readDistrictProgress();
    if (completed?.unlocked) {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelector('#mission-result-title')?.focus({ preventScroll: true });
      return;
    }
    resetResultState();
    return;
  }

  const routeButton = event.target.closest?.('[data-route]');
  if (!routeButton || routeButton.disabled) return;

  const selectedRole = document.querySelector('[data-role][aria-pressed="true"]')?.dataset.role;
  const templateId = document.querySelector('.mission')?.dataset.missionTemplate
    || globalThis.__creatorverseMissionTemplateId;
  const { scope } = currentDistrictContext();
  if (!selectedRole || !scope || !templateId) return;

  const existing = readDistrictProgress();
  if (existing?.unlocked) {
    activeResult = createMissionResult(districtResultInput(existing));
    activeResultRestored = true;
    createController(activeResult);
    return;
  }

  const completed = completeDistrictProgress(existing, {
    scope,
    roleId: selectedRole,
    routeId: routeButton.dataset.route,
    templateId,
  });
  writeDistrictProgress(completed);
  activeResult = createMissionResult(districtResultInput(completed));
  activeResultRestored = false;
  hasRenderedResult = false;
  actionState = 'idle';
  createController(activeResult);
}

function refreshResultDom({ focusAction = false } = {}) {
  const host = document.querySelector('[data-mission-result]');
  if (!host || !activeResult) return;
  hasRenderedResult = true;
  host.outerHTML = renderResultMarkup(activeResult);
  lockCompletedRoleControls(activeResult);
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
  restoreStoredResult();
  root.addEventListener('click', captureMissionSelection, true);
  root.addEventListener('click', runResultAction);
  globalThis.addEventListener?.('creatorverse:mission-window-reset', resetResultState);
  const app = root.querySelector('#app');
  if (app) {
    const observer = new MutationObserver(enhanceCompletedMission);
    observer.observe(app, { childList: true, subtree: true });
  }
  enhanceCompletedMission();
}

if (typeof document !== 'undefined') installMissionResultView(document);
