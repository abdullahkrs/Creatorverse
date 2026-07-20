import './completion-receipt.css';
import { getLocale } from './i18n.js';
import {
  parseCompletionReceiptFragment,
  parseCompletionReceiptToken,
} from './completion-receipt.js';
import {
  CREATOR_LEDGER_LIMIT,
  getCreatorRealm,
  importCompletionReceipt,
} from './creator-ledger.js';
import { getCompletionReceiptCopy } from './completion-receipt-i18n.js';
import {
  buildCreatorRealmUpdateManualText,
  buildCreatorRealmUpdatePayload,
  createCreatorRealmUpdateActionController,
  deriveCreatorRealmUpdate,
} from './creator-realm-update.js';
import { getCreatorRealmUpdateCopy } from './creator-realm-update-i18n.js';

const PENDING_KEY = 'creatorverse-pending-completion-receipt';
const ACTIVE_SELECTOR = '[data-completion-receipt-view]';
const REALM_UPDATE_ACTION = 'creator-realm-update-action';
let activeToken = '';
let activeReceipt = null;
let status = 'none';
let realmSnapshot = null;
let focusKey = '';
let successAnnounced = false;
let renderScheduled = false;
let realmUpdate = null;
let realmUpdateController = null;
let realmUpdatePayload = null;
let realmUpdateActionState = 'idle';
let realmUpdateKey = '';
let focusRealmUpdate = false;
let focusRealmUpdateAction = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function copy() {
  return getCompletionReceiptCopy(getLocale());
}

function readPending() {
  try {
    const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    if (pending?.status === 'invalid') return { status: 'invalid' };
    if (typeof pending?.token !== 'string') return { status: 'none' };
    const parsed = parseCompletionReceiptToken(pending.token);
    return parsed.status === 'valid' ? { ...parsed, token: pending.token } : { status: 'none' };
  } catch {
    sessionStorage.removeItem(PENDING_KEY);
    return { status: 'none' };
  }
}

function persistPending(next) {
  if (next.status === 'valid') sessionStorage.setItem(PENDING_KEY, JSON.stringify({ token: next.token }));
  else if (next.status === 'invalid') sessionStorage.setItem(PENDING_KEY, JSON.stringify({ status: 'invalid' }));
  else sessionStorage.removeItem(PENDING_KEY);
}

function initializeFromLocation() {
  const parsed = parseCompletionReceiptFragment(window.location.hash);
  if (parsed.status === 'valid') {
    const token = new URLSearchParams(window.location.hash.replace(/^#/u, '')).get('receipt') || '';
    activeToken = token;
    activeReceipt = parsed.receipt;
    status = 'loading';
    persistPending({ status: 'valid', token });
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}`);
    return true;
  }
  if (parsed.status === 'invalid') {
    activeToken = '';
    activeReceipt = null;
    status = 'invalid';
    persistPending({ status: 'invalid' });
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}`);
    return true;
  }
  if (window.location.hash) {
    persistPending({ status: 'none' });
    return false;
  }
  const pending = readPending();
  if (pending.status === 'valid') {
    activeToken = pending.token;
    activeReceipt = pending.receipt;
    status = 'loading';
    return true;
  }
  if (pending.status === 'invalid') {
    status = 'invalid';
    return true;
  }
  return false;
}

function validateActiveReceipt() {
  if (!activeReceipt) {
    status = 'invalid';
    realmSnapshot = null;
    return;
  }
  realmSnapshot = getCreatorRealm(localStorage, activeReceipt.realmId);
  if (!realmSnapshot) {
    status = 'mismatch';
    return;
  }
  if (realmSnapshot.receipts.some(entry => entry.id === activeReceipt.receiptId)) {
    status = 'duplicate';
    return;
  }
  if (realmSnapshot.receipts.length >= CREATOR_LEDGER_LIMIT) {
    status = 'full';
    return;
  }
  status = 'valid';
}

function fieldRecordMarkup(receipt, localeCopy) {
  if (!receipt) return '';
  return `
    <dl class="completion-facts">
      <div><dt>${escapeHtml(localeCopy.mission)}</dt><dd>${escapeHtml(localeCopy.missions[receipt.missionId])}</dd></div>
      <div><dt>${escapeHtml(localeCopy.role)}</dt><dd>${escapeHtml(localeCopy.roles[receipt.roleId])}</dd></div>
      <div><dt>${escapeHtml(localeCopy.district)}</dt><dd>${escapeHtml(localeCopy.districts[receipt.districtId])}</dd></div>
      <div><dt>${escapeHtml(localeCopy.contribution)}</dt><dd><bdi dir="ltr">+3</bdi></dd></div>
    </dl>
  `;
}

function ledgerMarkup(realm, localeCopy) {
  if (!realm || realm.receipts.length === 0) {
    return `
      <div class="completion-ledger-empty" data-ledger-empty>
        <h3>${escapeHtml(localeCopy.emptyTitle)}</h3>
        <p>${escapeHtml(localeCopy.emptyBody)}</p>
      </div>
    `;
  }
  const rows = [...realm.receipts].reverse().map(entry => `
    <li>
      <span class="completion-ledger-glyph" aria-hidden="true"></span>
      <span><strong>${escapeHtml(localeCopy.missions[entry.missionId])}</strong><small>${escapeHtml(localeCopy.roles[entry.roleId])} · ${escapeHtml(localeCopy.routes[entry.routeId])}</small></span>
      <bdi dir="ltr">+3</bdi>
    </li>
  `).join('');
  return `<ul class="completion-ledger-list" data-ledger-list>${rows}</ul>`;
}

function statePresentation(localeCopy) {
  const map = {
    loading: [localeCopy.checkingTitle, localeCopy.checkingBody],
    valid: [localeCopy.previewTitle, ''],
    success: [localeCopy.successTitle, localeCopy.successBody],
    invalid: [localeCopy.invalidTitle, localeCopy.invalidBody],
    mismatch: [localeCopy.mismatchTitle, localeCopy.mismatchBody],
    duplicate: [localeCopy.duplicateTitle, localeCopy.duplicateBody],
    full: [localeCopy.fullTitle, localeCopy.fullBody],
    'storage-error': [localeCopy.storageTitle, localeCopy.storageBody],
  };
  return map[status] || map.invalid;
}

function actionMarkup(localeCopy) {
  if (status === 'valid') {
    return `<button class="primary completion-import-action" type="button" data-action="import-completion-receipt"><span>${escapeHtml(localeCopy.addAction)}</span></button>`;
  }
  if (status === 'storage-error') {
    return `<button class="primary completion-import-action" type="button" data-action="retry-completion-receipt"><span>${escapeHtml(localeCopy.retryAction)}</span></button>`;
  }
  return '';
}

function artworkMarkup() {
  return `
    <svg class="completion-district-mark" viewBox="0 0 120 88" aria-hidden="true" focusable="false">
      <path class="completion-contour" d="M14 25 38 10l24 9 25-7 19 21-8 34-31 12-29-8-24-23Z"/>
      <path class="completion-seam" d="M62 19v24l-12 10v19"/>
      <path class="completion-beacon" d="M76 57V34m-9 9h18m-14-13 5-7 5 7"/>
    </svg>
  `;
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

function currentPublicUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function resetRealmUpdate() {
  realmUpdate = null;
  realmUpdateController = null;
  realmUpdatePayload = null;
  realmUpdateActionState = 'idle';
  realmUpdateKey = '';
  focusRealmUpdateAction = false;
}

function syncRealmUpdate() {
  const next = deriveCreatorRealmUpdate(realmSnapshot);
  if (next.status !== 'ready') {
    resetRealmUpdate();
    return;
  }
  const nextKey = `${getLocale()}:${next.archetypeId}:${next.districtId}:${next.contributionCount}:${next.totalEnergy}`;
  if (realmUpdateKey === nextKey && realmUpdateController) return;

  realmUpdate = next;
  realmUpdateKey = nextKey;
  realmUpdateActionState = 'idle';
  try {
    realmUpdatePayload = buildCreatorRealmUpdatePayload(next, {
      locale: getLocale(),
      publicUrl: currentPublicUrl(),
    });
    realmUpdateController = createCreatorRealmUpdateActionController({
      navigatorLike: navigator,
      payload: realmUpdatePayload,
      copyText: hasCopyCapability() ? copyText : null,
    });
  } catch {
    realmUpdatePayload = null;
    realmUpdateController = null;
    realmUpdateActionState = 'invalid';
  }
}

function realmUpdateActionPresentation(localeCopy) {
  const mode = realmUpdateController?.mode || 'copy';
  if (!realmUpdateController) {
    return { label: localeCopy.copyAction, message: localeCopy.invalid, disabled: true, manual: false };
  }
  if (realmUpdateActionState === 'pending') {
    return {
      label: mode === 'share' ? localeCopy.sharing : localeCopy.copying,
      message: '',
      disabled: true,
      manual: false,
    };
  }
  if (realmUpdateActionState === 'shared') return { label: localeCopy.shareAction, message: localeCopy.shared, disabled: false, manual: false };
  if (realmUpdateActionState === 'copied') return { label: localeCopy.copyAction, message: localeCopy.copied, disabled: false, manual: false };
  if (realmUpdateActionState === 'cancelled') return { label: localeCopy.shareAction, message: localeCopy.cancelled, disabled: false, manual: false };
  if (realmUpdateActionState === 'denied') return { label: localeCopy.shareAction, message: localeCopy.denied, disabled: false, manual: true };
  if (realmUpdateActionState === 'failed') return { label: mode === 'share' ? localeCopy.shareAction : localeCopy.copyAction, message: localeCopy.failed, disabled: false, manual: true };
  if (realmUpdateActionState === 'unsupported') return { label: localeCopy.copyAction, message: localeCopy.unsupported, disabled: false, manual: true };
  if (realmUpdateActionState === 'invalid') return { label: localeCopy.copyAction, message: localeCopy.invalid, disabled: true, manual: false };
  return { label: mode === 'share' ? localeCopy.shareAction : localeCopy.copyAction, message: '', disabled: false, manual: false };
}

function signalSealMarkup(update) {
  return `
    <div class="creator-realm-update-seal" aria-hidden="true">
      <svg viewBox="0 0 88 88" focusable="false">
        <path class="realm-seal-boundary" d="M44 6 72 16l10 28-10 28-28 10-28-10L6 44l10-28Z"/>
        <path class="realm-seal-district" d="m24 49 11-18 16 5 13-9 2 27-16 11-18-5Z"/>
        <path class="realm-seal-signal" d="M44 52V34m-8 7h16m-12-11 4-6 4 6"/>
      </svg>
      <strong><bdi dir="ltr">+${update.latestContribution}</bdi></strong>
    </div>
  `;
}

function formatUpdateText(template, district, total) {
  return template
    .replace('{district}', district)
    .replace('{total}', String(total));
}

function realmUpdateMarkup() {
  const localeCopy = getCreatorRealmUpdateCopy(getLocale());
  if (!realmSnapshot) return '';
  if (!realmUpdate || realmUpdate.status !== 'ready') {
    return `
      <section class="creator-realm-update is-waiting" data-creator-realm-update data-update-state="empty" aria-labelledby="creator-realm-update-title">
        <div class="creator-realm-update-copy">
          <p class="section-kicker">${escapeHtml(localeCopy.kicker)}</p>
          <h2 id="creator-realm-update-title">${escapeHtml(localeCopy.waitingTitle)}</h2>
          <p>${escapeHtml(localeCopy.waitingBody)}</p>
        </div>
      </section>
    `;
  }

  const archetype = localeCopy.archetypes[realmUpdate.archetypeId];
  const district = localeCopy.districts[realmUpdate.districtId];
  const change = formatUpdateText(localeCopy.changeTemplate, district, realmUpdate.totalEnergy);
  const action = realmUpdateActionPresentation(localeCopy);
  const manualText = action.manual && realmUpdatePayload
    ? buildCreatorRealmUpdateManualText(realmUpdatePayload)
    : '';

  return `
    <section class="creator-realm-update is-ready" data-creator-realm-update data-update-state="${escapeHtml(realmUpdateActionState)}" aria-labelledby="creator-realm-update-title">
      ${signalSealMarkup(realmUpdate)}
      <div class="creator-realm-update-copy">
        <p class="creator-realm-location">${escapeHtml(archetype)} <span aria-hidden="true">·</span> ${escapeHtml(district)}</p>
        <h2 id="creator-realm-update-title" tabindex="-1">${escapeHtml(localeCopy.title)}</h2>
        <p class="creator-realm-change">${escapeHtml(change)}</p>
        <dl class="creator-realm-update-facts">
          <div><dt>${escapeHtml(localeCopy.contributions)}</dt><dd><bdi dir="ltr">${realmUpdate.contributionCount}</bdi></dd></div>
          <div><dt>${escapeHtml(localeCopy.energy)}</dt><dd><bdi dir="ltr">${realmUpdate.totalEnergy}</bdi></dd></div>
        </dl>
        <progress class="creator-realm-energy" max="72" value="${realmUpdate.totalEnergy}" aria-label="${escapeHtml(localeCopy.energy)}"></progress>
      </div>
      <div class="creator-realm-update-action-area">
        <button class="primary creator-realm-update-action" type="button" data-action="${REALM_UPDATE_ACTION}" ${action.disabled ? 'disabled' : ''} aria-describedby="creator-realm-update-status">
          <span>${escapeHtml(action.label)}</span>
        </button>
        <p id="creator-realm-update-status" class="creator-realm-update-status ${action.message ? '' : 'cv-visually-hidden'}" aria-live="polite" aria-atomic="true">${escapeHtml(action.message)}</p>
        ${manualText ? `
          <label class="creator-realm-manual-copy">
            <span>${escapeHtml(localeCopy.manualLabel)}</span>
            <textarea readonly rows="3" dir="auto">${escapeHtml(manualText)}</textarea>
          </label>
        ` : ''}
      </div>
    </section>
  `;
}

function renderView() {
  const experience = document.querySelector('.experience');
  if (!experience || status === 'none') return;
  const localeCopy = copy();
  const [title, body] = statePresentation(localeCopy);
  const realm = realmSnapshot;
  syncRealmUpdate();
  const renderKey = `${getLocale()}:${status}:${activeReceipt?.receiptId || 'invalid'}:${realm?.receipts.length || 0}:${realmUpdateKey}:${realmUpdateActionState}`;
  if (experience.querySelector(ACTIVE_SELECTOR)?.dataset.renderKey === renderKey) return;

  experience.innerHTML = `
    <section class="completion-receipt-view" data-completion-receipt-view data-render-key="${escapeHtml(renderKey)}" translate="no" aria-labelledby="completion-receipt-title">
      <div class="completion-context">
        <p class="section-kicker">${escapeHtml(localeCopy.localOnly)}</p>
        ${artworkMarkup()}
        <div>
          <strong class="completion-realm-name">${escapeHtml(realm?.name || localeCopy.previewTitle)}</strong>
          <p>${escapeHtml(localeCopy.ledgerLimit)}</p>
        </div>
        ${realm ? `<div class="completion-total"><span>${escapeHtml(localeCopy.total)}</span><strong><bdi dir="ltr">${realm.total}</bdi></strong></div>` : ''}
      </div>

      <div class="completion-record ${status === 'success' ? 'is-success' : ''}">
        <header>
          <h1 id="completion-receipt-title" tabindex="-1">${escapeHtml(title)}</h1>
          ${body ? `<p>${escapeHtml(body)}</p>` : ''}
        </header>
        ${['valid', 'success', 'duplicate', 'full', 'storage-error'].includes(status) ? fieldRecordMarkup(activeReceipt, localeCopy) : ''}
        ${actionMarkup(localeCopy)}
        ${realm ? `
          <section class="completion-ledger" aria-labelledby="completion-ledger-title">
            <div class="completion-ledger-heading">
              <h2 id="completion-ledger-title">${escapeHtml(localeCopy.ledgerTitle)}</h2>
              <span><bdi dir="ltr">${realm.receipts.length}/${CREATOR_LEDGER_LIMIT}</bdi></span>
            </div>
            <p>${escapeHtml(localeCopy.ledgerLimit)}</p>
            ${ledgerMarkup(realm, localeCopy)}
          </section>
          ${realmUpdateMarkup()}
        ` : ''}
        <button class="secondary completion-back-action" type="button" data-action="leave-completion-receipt">${escapeHtml(localeCopy.backAction)}</button>
        <p class="cv-visually-hidden" data-completion-announcement aria-live="polite" aria-atomic="true"></p>
      </div>
    </section>
  `;

  document.querySelector('.nav-create')?.setAttribute('hidden', '');
  document.querySelector('.creator-tools')?.setAttribute('hidden', '');
  document.querySelector('.creator-studio')?.remove();

  const nextFocusKey = `${status}:${activeReceipt?.receiptId || 'invalid'}`;
  const shouldAnnounceSuccess = status === 'success';
  queueMicrotask(() => {
    if (focusRealmUpdate && realmUpdate?.status === 'ready') {
      focusRealmUpdate = false;
      focusKey = nextFocusKey;
      experience.querySelector('#creator-realm-update-title')?.focus({ preventScroll: true });
    } else if (focusKey !== nextFocusKey) {
      focusKey = nextFocusKey;
      experience.querySelector('#completion-receipt-title')?.focus({ preventScroll: true });
    }
    if (focusRealmUpdateAction) {
      focusRealmUpdateAction = false;
      experience.querySelector(`[data-action="${REALM_UPDATE_ACTION}"]`)?.focus({ preventScroll: true });
    }
    if (shouldAnnounceSuccess && !successAnnounced) {
      successAnnounced = true;
      const live = experience.querySelector('[data-completion-announcement]');
      if (live) live.textContent = getCreatorRealmUpdateCopy(getLocale()).title;
    }
  });
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  queueMicrotask(() => {
    renderScheduled = false;
    renderView();
  });
}

function runValidation() {
  if (status !== 'loading') return;
  validateActiveReceipt();
  scheduleRender();
}

function runImport() {
  if (!activeReceipt || !['valid', 'storage-error'].includes(status)) return;
  const outcome = importCompletionReceipt(localStorage, activeReceipt);
  status = outcome.status;
  realmSnapshot = outcome.realm || getCreatorRealm(localStorage, activeReceipt.realmId);
  resetRealmUpdate();
  if (status === 'success') {
    successAnnounced = false;
    focusRealmUpdate = realmSnapshot?.receipts.length === 1;
  }
  scheduleRender();
}

async function runRealmUpdateAction(event) {
  const button = event.target.closest?.(`[data-action="${REALM_UPDATE_ACTION}"]`);
  if (!button || button.disabled) return false;
  if (!realmUpdateController) {
    realmUpdateActionState = 'invalid';
    focusRealmUpdateAction = true;
    scheduleRender();
    return true;
  }

  const activation = realmUpdateController.activate();
  realmUpdateActionState = 'pending';
  focusRealmUpdateAction = true;
  scheduleRender();
  const outcome = await activation;
  if (outcome.status === 'ignored') return true;
  realmUpdateActionState = outcome.status;
  focusRealmUpdateAction = true;
  scheduleRender();
  return true;
}

function leaveReceipt() {
  sessionStorage.removeItem(PENDING_KEY);
  activeToken = '';
  activeReceipt = null;
  status = 'none';
  resetRealmUpdate();
  window.location.assign(`${window.location.pathname}${window.location.search}`);
}

function handleClick(event) {
  if (event.target.closest?.(`[data-action="${REALM_UPDATE_ACTION}"]`)) {
    runRealmUpdateAction(event);
    return;
  }
  if (event.target.closest?.('[data-action="import-completion-receipt"], [data-action="retry-completion-receipt"]')) {
    runImport();
    return;
  }
  if (event.target.closest?.('[data-action="leave-completion-receipt"]')) leaveReceipt();
}

function activateFromLocation({ fromHashChange = false } = {}) {
  if (fromHashChange && parseCompletionReceiptFragment(window.location.hash).status === 'none') return false;
  if (!initializeFromLocation()) return false;
  realmSnapshot = null;
  focusKey = '';
  successAnnounced = false;
  focusRealmUpdate = false;
  resetRealmUpdate();
  globalThis.__creatorverseCompletionReceiptActive = true;
  scheduleRender();
  queueMicrotask(runValidation);
  return true;
}

document.addEventListener('click', handleClick);
window.addEventListener('hashchange', () => {
  activateFromLocation({ fromHashChange: true });
});

activateFromLocation();
