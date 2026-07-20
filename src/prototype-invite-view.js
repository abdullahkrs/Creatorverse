import './prototype-invite.css';
import { getLocale } from './i18n.js';
import {
  buildPrototypeInviteUrl,
  createPrototypeInvite,
  escapeInviteHtml,
  parsePrototypeInviteFragment,
  parsePrototypeInviteToken,
} from './prototype-invite.js';
import { createOpaqueIdentifier } from './completion-receipt.js';
import { saveCreatorRealm } from './creator-ledger.js';
import { getPrototypeInviteCopy } from './prototype-invite-i18n.js';

const RECEIPT_KEY = 'creatorverse-prototype-invite-receipt';
const COPY_STATES = new Set(['idle', 'pending', 'success', 'manual', 'failure']);
const THEME_ICONS = Object.freeze({
  cosmic: '<path d="M5 17h3V7H5v10Zm5 0h4V4h-4v13Zm6 0h3V10h-3v7Z"/>',
  wild: '<path d="M12 3c3 0 5 2.1 5 4.8 2 .4 3 1.9 3 3.7 0 2.5-2 4.5-4.5 4.5H14v5h-4v-5H8.5A4.5 4.5 0 0 1 4 11.5c0-1.8 1-3.3 3-3.7C7 5.1 9 3 12 3Z"/>',
  future: '<path d="M7 3h4v4H9v3h6V7h-2V3h4v4h-1v4h4v4h-4v-2H9v2H8v3h3v-1h4v4h-4v-1H6v-5H4v-4h3V7H7V3Z"/>',
});

let followerState = parsePrototypeInviteFragment(window.location.hash);
let draftRealm = {
  name: 'Nova Guild',
  theme: 'cosmic',
  promise: 'A community built around bold ideas.',
  realmId: '',
};
let renderScheduled = false;
let applying = false;
let invalidHeadingFocused = false;

function completionReceiptActive() {
  return Boolean(globalThis.__creatorverseCompletionReceiptActive || document.querySelector('[data-completion-receipt-view]'));
}

function icon(path, className = '') {
  return `<svg class="cv-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
}

function currentCopy() {
  return getPrototypeInviteCopy(getLocale());
}

function readReceipt() {
  const serialized = sessionStorage.getItem(RECEIPT_KEY);
  if (!serialized) return null;

  try {
    const stored = JSON.parse(serialized);
    const parsed = parsePrototypeInviteToken(stored.token);
    if (parsed.status !== 'valid') throw new Error('INVALID_RECEIPT');
    const state = COPY_STATES.has(stored.state) && stored.state !== 'pending' ? stored.state : 'idle';
    const url = buildPrototypeInviteUrl(`${window.location.origin}${window.location.pathname}`, stored.token);
    return { token: stored.token, state, url, invite: parsed.invite };
  } catch {
    sessionStorage.removeItem(RECEIPT_KEY);
    return null;
  }
}

function saveReceipt(token, state = 'idle') {
  sessionStorage.setItem(RECEIPT_KEY, JSON.stringify({ token, state }));
}

function clearReceipt() {
  sessionStorage.removeItem(RECEIPT_KEY);
}

function syncDraftFromDom() {
  const name = document.querySelector('[data-field="name"]');
  const promise = document.querySelector('[data-field="tagline"]');
  const theme = document.querySelector('[data-theme].selected, [data-theme][aria-checked="true"]');
  if (name?.value) draftRealm.name = name.value;
  if (promise?.value) draftRealm.promise = promise.value;
  if (theme?.dataset.theme) draftRealm.theme = theme.dataset.theme;
}

function getReceiptPresentation(receipt, localeCopy) {
  if (receipt.state === 'pending') return { label: localeCopy.copyPending, message: '', disabled: true, busy: true, manual: false };
  if (receipt.state === 'success') return { label: localeCopy.copySuccessLabel, message: localeCopy.copySuccess, disabled: false, busy: false, manual: false };
  if (receipt.state === 'manual') return { label: localeCopy.retry, message: localeCopy.copyManual, disabled: false, busy: false, manual: true };
  if (receipt.state === 'failure') return { label: localeCopy.retry, message: localeCopy.copyFailure, disabled: false, busy: false, manual: true };
  return { label: localeCopy.copyIdle, message: '', disabled: false, busy: false, manual: false };
}

function receiptMarkup(receipt) {
  const localeCopy = currentCopy();
  const presentation = getReceiptPresentation(receipt, localeCopy);
  const themeLabel = localeCopy.themes[receipt.invite.theme];
  return `
    <div class="invite-receipt" data-prototype-invite-receipt data-render-key="${escapeInviteHtml(`${getLocale()}:${receipt.state}:${receipt.token}`)}">
      <div class="invite-receipt-copy">
        <h2 id="creator-studio-title">${escapeInviteHtml(localeCopy.receiptTitle)}</h2>
        <p>${escapeInviteHtml(localeCopy.receiptSupport)}</p>
        <div class="invite-signal-stamp theme-${escapeInviteHtml(receipt.invite.theme)}">
          ${icon(THEME_ICONS[receipt.invite.theme], 'invite-signal-icon')}
          <strong><bdi>${escapeInviteHtml(receipt.invite.name)}</bdi></strong>
          <span>${escapeInviteHtml(themeLabel)}</span>
        </div>
        <button class="primary invite-copy-action" type="button" data-action="copy-prototype-invite" ${presentation.disabled ? 'disabled' : ''} aria-busy="${presentation.busy}">
          <span>${escapeInviteHtml(presentation.label)}</span>
        </button>
        ${presentation.manual ? `<input class="invite-manual-url" data-invite-manual-url value="${escapeInviteHtml(receipt.url)}" readonly dir="ltr" aria-label="${escapeInviteHtml(localeCopy.copyManual)}">` : ''}
        <p class="invite-copy-status" aria-live="polite" aria-atomic="true">${escapeInviteHtml(presentation.message)}</p>
      </div>
      <p class="cv-visually-hidden" data-invite-receipt-announcement aria-live="polite" aria-atomic="true"></p>
    </div>
  `;
}

function ensureReceipt({ focus = false, announce = false, selectManual = false } = {}) {
  if (completionReceiptActive() || followerState.status !== 'none') return;
  const receipt = readReceipt();
  if (!receipt) return;

  let studio = document.querySelector('.creator-studio');
  if (!studio) {
    studio = document.createElement('section');
    studio.className = 'creator-studio shell';
    studio.id = 'creator-studio';
    document.querySelector('.experience')?.insertAdjacentElement('afterend', studio);
  }
  studio.setAttribute('aria-labelledby', 'creator-studio-title');

  const renderKey = `${getLocale()}:${receipt.state}:${receipt.token}`;
  if (studio.querySelector('[data-prototype-invite-receipt]')?.dataset.renderKey !== renderKey) {
    studio.innerHTML = receiptMarkup(receipt);
  }

  queueMicrotask(() => {
    const button = studio.querySelector('[data-action="copy-prototype-invite"]');
    const manual = studio.querySelector('[data-invite-manual-url]');
    if (selectManual && manual) {
      manual.select();
      manual.setSelectionRange(0, manual.value.length);
    }
    if (focus) button?.focus({ preventScroll: true });
    if (announce) {
      const announcement = studio.querySelector('[data-invite-receipt-announcement]');
      if (announcement) announcement.textContent = currentCopy().receiptTitle;
    }
  });
}

function updateRealmCard(invite, localeCopy) {
  const card = document.querySelector('.realm-card');
  if (!card) return;

  card.classList.remove('theme-cosmic', 'theme-wild', 'theme-future');
  card.classList.add(`theme-${invite.theme}`);
  const title = card.querySelector('.realm-heading h2');
  if (title && title.textContent !== invite.name) title.innerHTML = `<bdi>${escapeInviteHtml(invite.name)}</bdi>`;
  const creator = card.querySelector('.realm-creator bdi, .realm-creator');
  if (creator && creator.textContent !== localeCopy.creatorLabel) creator.textContent = localeCopy.creatorLabel;
  const promise = card.querySelector('.realm-tagline');
  const promiseText = invite.promise || localeCopy.featuredPromise;
  if (promise && promise.textContent !== promiseText) promise.innerHTML = `<bdi>${escapeInviteHtml(promiseText)}</bdi>`;
}

function followerEntryMarkup(invite) {
  const localeCopy = currentCopy();
  const promise = invite.promise || localeCopy.featuredPromise;
  return `
    <header class="follower-entry" data-prototype-follower-entry data-render-key="${escapeInviteHtml(`${getLocale()}:${invite.name}:${invite.theme}:${promise}`)}">
      <h1 id="experience-title">${escapeInviteHtml(localeCopy.entryTitle(''))}<bdi>${escapeInviteHtml(invite.name)}</bdi></h1>
      <div class="follower-entry-facts" aria-label="${escapeInviteHtml(localeCopy.creatorLabel)}">
        <span>${icon(THEME_ICONS[invite.theme], 'follower-fact-icon')}<strong>${escapeInviteHtml(localeCopy.themes[invite.theme])}</strong></span>
        <span>${icon('<path d="M5 6h7v4H9v4h7v4H5V6Zm7 0h7v12h-7v-4h3v-4h-3V6Z"/>', 'follower-fact-icon')}<strong>${escapeInviteHtml(localeCopy.creatorLabel)}</strong></span>
      </div>
      <p><bdi>${escapeInviteHtml(promise)}</bdi></p>
    </header>
  `;
}

function applyValidFollowerEntry(invite) {
  const localeCopy = currentCopy();
  const intro = document.querySelector('.experience-intro');
  const desiredKey = `${getLocale()}:${invite.name}:${invite.theme}:${invite.promise || localeCopy.featuredPromise}`;
  if (intro && intro.querySelector('[data-prototype-follower-entry]')?.dataset.renderKey !== desiredKey) {
    intro.innerHTML = followerEntryMarkup(invite);
  }

  updateRealmCard(invite, localeCopy);
  const resultReady = Boolean(document.querySelector('[data-mission-result]'));
  const createAction = document.querySelector('.nav-create');
  const tools = document.querySelector('.creator-tools');
  if (createAction) createAction.hidden = !resultReady;
  if (tools) tools.hidden = !resultReady;
}

function applyInvalidFollowerEntry() {
  const localeCopy = currentCopy();
  const experience = document.querySelector('.experience');
  if (!experience) return;

  const key = `${getLocale()}:invalid`;
  if (experience.querySelector('[data-prototype-invite-error]')?.dataset.renderKey !== key) {
    experience.innerHTML = `
      <section class="invite-error" data-prototype-invite-error data-render-key="${escapeInviteHtml(key)}" aria-labelledby="invite-error-title">
        <h1 id="invite-error-title" tabindex="-1">${escapeInviteHtml(localeCopy.invalidTitle)}</h1>
        <p>${escapeInviteHtml(localeCopy.invalidBody)}</p>
        <button class="primary" type="button" data-action="open-featured-realm">${escapeInviteHtml(localeCopy.invalidRecovery)}</button>
      </section>
    `;
  }

  document.querySelector('.nav-create')?.setAttribute('hidden', '');
  document.querySelector('.creator-tools')?.setAttribute('hidden', '');
  if (!invalidHeadingFocused) {
    invalidHeadingFocused = true;
    queueMicrotask(() => document.querySelector('#invite-error-title')?.focus({ preventScroll: true }));
  }
}

function applyEnhancements() {
  if (completionReceiptActive() || applying) return;
  applying = true;
  try {
    syncDraftFromDom();
    if (followerState.status === 'valid') applyValidFollowerEntry(followerState.invite);
    else if (followerState.status === 'invalid') applyInvalidFollowerEntry();
    else ensureReceipt();
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

async function copyInvite() {
  const receipt = readReceipt();
  if (!receipt || receipt.state === 'pending') return;

  if (typeof navigator.clipboard?.writeText !== 'function') {
    saveReceipt(receipt.token, 'manual');
    ensureReceipt({ focus: true, selectManual: true });
    return;
  }

  saveReceipt(receipt.token, 'pending');
  ensureReceipt({ focus: true });
  try {
    await navigator.clipboard.writeText(receipt.url);
    saveReceipt(receipt.token, 'success');
    ensureReceipt({ focus: true });
  } catch (error) {
    const state = ['NotAllowedError', 'SecurityError'].includes(error?.name) ? 'manual' : 'failure';
    saveReceipt(receipt.token, state);
    ensureReceipt({ focus: true, selectManual: true });
  }
}

function handleCaptureClick(event) {
  if (completionReceiptActive()) return;
  const createAction = event.target.closest?.('[data-action="creator"]');
  if (createAction) {
    clearReceipt();
    draftRealm = {
      name: 'Nova Guild',
      theme: 'cosmic',
      promise: 'A community built around bold ideas.',
      realmId: '',
    };
    return;
  }

  const theme = event.target.closest?.('[data-theme]');
  if (theme?.dataset.theme) draftRealm.theme = theme.dataset.theme;

  const launch = event.target.closest?.('[data-action="creator-next"]');
  const acknowledgement = document.querySelector('[data-field="safety"]');
  if (!launch || !acknowledgement) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  syncDraftFromDom();

  try {
    if (!draftRealm.realmId) draftRealm.realmId = createOpaqueIdentifier();
    saveCreatorRealm(localStorage, {
      realmId: draftRealm.realmId,
      name: draftRealm.name,
      theme: draftRealm.theme,
    });
    const token = createPrototypeInvite(draftRealm);
    saveReceipt(token, 'idle');
    ensureReceipt({ focus: true, announce: true });
  } catch {
    const message = document.querySelector('.creator-studio .form-message');
    if (message) {
      message.setAttribute('aria-live', 'assertive');
      message.textContent = currentCopy().unsafeDraft;
    }
  }
}

function handleClick(event) {
  if (event.target.closest?.('[data-action="copy-prototype-invite"]')) {
    copyInvite();
    return;
  }

  if (event.target.closest?.('[data-action="open-featured-realm"]')) {
    clearReceipt();
    history.replaceState(null, '', window.location.pathname);
    window.location.reload();
  }
}

function handleInput(event) {
  const field = event.target.closest?.('[data-field="name"], [data-field="tagline"]');
  if (!field) return;
  if (field.dataset.field === 'name') draftRealm.name = field.value;
  if (field.dataset.field === 'tagline') draftRealm.promise = field.value;
}

document.addEventListener('click', handleCaptureClick, true);
document.addEventListener('click', handleClick);
document.addEventListener('input', handleInput, true);
window.addEventListener('hashchange', () => {
  followerState = parsePrototypeInviteFragment(window.location.hash);
  invalidHeadingFocused = false;
  scheduleEnhancements();
});

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(scheduleEnhancements);
  observer.observe(app, { childList: true, subtree: true });
}

applyEnhancements();
