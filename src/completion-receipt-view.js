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

const PENDING_KEY = 'creatorverse-pending-completion-receipt';
const ACTIVE_SELECTOR = '[data-completion-receipt-view]';
let activeToken = '';
let activeReceipt = null;
let status = 'none';
let realmSnapshot = null;
let focusKey = '';
let successAnnounced = false;
let renderScheduled = false;

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
  if (status === 'loading') {
    return `<button class="primary completion-import-action" type="button" disabled aria-busy="true"><span>${escapeHtml(localeCopy.checkingTitle)}</span></button>`;
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

function renderView() {
  const experience = document.querySelector('.experience');
  if (!experience || status === 'none') return;
  const localeCopy = copy();
  const [title, body] = statePresentation(localeCopy);
  const realm = realmSnapshot;
  const renderKey = `${getLocale()}:${status}:${activeReceipt?.receiptId || 'invalid'}:${realm?.receipts.length || 0}`;
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
        ` : ''}
        <button class="secondary completion-back-action" type="button" data-action="leave-completion-receipt">${escapeHtml(localeCopy.backAction)}</button>
        <p class="cv-visually-hidden" data-completion-announcement aria-live="polite" aria-atomic="true"></p>
      </div>
    </section>
  `;

  document.querySelector('.nav-create')?.setAttribute('hidden', '');
  document.querySelector('.creator-tools')?.setAttribute('hidden', '');
  document.querySelector('.creator-studio')?.remove();

  queueMicrotask(() => {
    const nextFocusKey = `${status}:${activeReceipt?.receiptId || 'invalid'}`;
    if (focusKey !== nextFocusKey) {
      focusKey = nextFocusKey;
      experience.querySelector('#completion-receipt-title')?.focus({ preventScroll: true });
    }
    if (status === 'success' && !successAnnounced) {
      successAnnounced = true;
      const live = experience.querySelector('[data-completion-announcement]');
      if (live) live.textContent = localeCopy.successTitle;
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
  if (status === 'success') successAnnounced = false;
  scheduleRender();
}

function leaveReceipt() {
  sessionStorage.removeItem(PENDING_KEY);
  activeToken = '';
  activeReceipt = null;
  status = 'none';
  window.location.assign(`${window.location.pathname}${window.location.search}`);
}

function handleClick(event) {
  if (event.target.closest?.('[data-action="import-completion-receipt"], [data-action="retry-completion-receipt"]')) {
    runImport();
    return;
  }
  if (event.target.closest?.('[data-action="leave-completion-receipt"]')) leaveReceipt();
}

document.addEventListener('click', handleClick);

if (initializeFromLocation()) {
  globalThis.__creatorverseCompletionReceiptActive = true;
  scheduleRender();
  queueMicrotask(runValidation);
}
