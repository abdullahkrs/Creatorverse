import './realm-quarantine.css';
import { parsePrototypeInviteFragment } from './prototype-invite.js';
import { getRealmQuarantineCopy } from './realm-quarantine-i18n.js';
import {
  isRealmQuarantined,
  quarantineRealm,
  readRealmQuarantine,
  repairRealmQuarantine,
  restoreQuarantinedRealm,
} from './realm-quarantine.js';

const INVITE_SESSION_KEYS = Object.freeze([
  'creatorverse-mission-template-state',
  'creatorverse-district-progress',
  'creatorverse-completion-receipt-id',
  'creatorverse-pending-completion-receipt',
  'creatorverse-prototype-invite-receipt',
  'creatorverse-last-route',
  'creatorverse-locale-restore',
]);
const REASON_COPY = Object.freeze({
  'unsafe-real-world': 'unsafeRealWorld',
  'harassment-hateful': 'harassmentHateful',
  'personal-private-information': 'personalPrivate',
});
const SHIELD_ICON = '<path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3Zm-4 8h8M9 8l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/>';
const GATE_ICON = '<path d="M5 20V7l7-4 7 4v13M8 20V9h8v11M9 13h6M9 16h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/>';

const sessionBlocked = new Map();
let blockedContext = null;
let blockedMode = 'hidden';
let restoreError = false;
let triggerToRestore = null;
let applying = false;
let renderScheduled = false;

function locale() {
  return document.documentElement.lang?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function copy() {
  return getRealmQuarantineCopy(locale());
}

function icon(path, className = '') {
  return `<svg class="cv-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
}

function clearInviteSession() {
  for (const key of INVITE_SESSION_KEYS) sessionStorage.removeItem(key);
  globalThis.__creatorverseRealmQuarantineBlocked = blockedContext?.realmId || true;
  globalThis.__creatorverseCompletionReceiptActive = false;
  window.dispatchEvent(new CustomEvent('creatorverse:realm-quarantined'));
}

function removeInviteFromHistory() {
  history.replaceState(null, '', window.location.pathname);
}

function currentInvite() {
  const parsed = parsePrototypeInviteFragment(window.location.hash);
  if (parsed.status !== 'valid' || !parsed.invite.realmId) return null;
  return parsed.invite;
}

function readStateSafely() {
  try {
    const state = readRealmQuarantine(localStorage);
    if (state.status === 'recovered') {
      try { return repairRealmQuarantine(localStorage, state); } catch { return state; }
    }
    return state;
  } catch {
    return null;
  }
}

function hideInviteChrome() {
  document.querySelector('.nav-create')?.setAttribute('hidden', '');
  document.querySelector('.creator-tools')?.setAttribute('hidden', '');
}

function blockedMarkup() {
  const text = copy();
  const isError = blockedMode === 'error';
  const isRestored = blockedMode === 'restored';
  const title = isError ? text.closedTitle : isRestored ? text.restoredTitle : text.hiddenTitle;
  const support = isError ? text.saveError : isRestored ? text.restoredSupport : text.hiddenSupport;

  return `
    <section class="realm-quarantine-state ${isError ? 'is-error' : ''}" data-realm-quarantine-state data-state="${blockedMode}" aria-labelledby="realm-quarantine-state-title">
      <div class="realm-quarantine-gate" aria-hidden="true">${icon(GATE_ICON)}</div>
      <div class="realm-quarantine-state-copy">
        <p class="section-kicker">${text.safety}</p>
        <h1 id="realm-quarantine-state-title" tabindex="-1">${title}</h1>
        <p>${support}</p>
      </div>
      <div class="realm-quarantine-state-actions">
        ${isError ? `<button class="primary" type="button" data-action="retry-realm-quarantine">${text.retrySave}</button>` : `<button class="primary" type="button" data-action="quarantine-return-home">${text.returnHome}</button>`}
        ${!isError && !isRestored ? `<button class="secondary" type="button" data-action="show-realm-again">${text.showAgain}</button>` : ''}
        ${isError ? `<button class="secondary" type="button" data-action="quarantine-return-home">${text.returnHome}</button>` : ''}
      </div>
      <p class="realm-quarantine-status" data-quarantine-status aria-live="polite" aria-atomic="true">${restoreError ? text.restoreError : ''}</p>
    </section>
  `;
}

function renderBlocked({ focus = false } = {}) {
  const experience = document.querySelector('.experience');
  if (!experience || !blockedContext) return;
  const key = `${locale()}:${blockedMode}:${restoreError}`;
  if (experience.dataset.quarantineRenderKey !== key) {
    experience.dataset.quarantineRenderKey = key;
    experience.innerHTML = blockedMarkup();
  }
  hideInviteChrome();
  if (focus) queueMicrotask(() => document.querySelector('#realm-quarantine-state-title')?.focus({ preventScroll: true }));
}

function ensureSafetyTrigger(invite) {
  const followerEntry = document.querySelector('[data-prototype-follower-entry]');
  if (!followerEntry || document.querySelector('[data-action="open-realm-safety"]')) return;
  const text = copy();
  const row = document.createElement('div');
  row.className = 'realm-safety-row';
  row.innerHTML = `
    <button class="realm-safety-trigger" type="button" data-action="open-realm-safety" aria-label="${text.safetyAria}">
      ${icon(SHIELD_ICON)}<span>${text.safety}</span>
    </button>
  `;
  followerEntry.append(row);
  row.dataset.realmAvailable = invite.realmId ? 'true' : 'false';
}

function applyGuard() {
  if (applying) return;
  applying = true;
  try {
    const invite = currentInvite();
    if (invite) {
      const state = readStateSafely();
      const blocked = sessionBlocked.has(invite.realmId) || isRealmQuarantined(state, invite.realmId);
      if (blocked) {
        blockedContext = sessionBlocked.get(invite.realmId) || { realmId: invite.realmId, reason: state.records.find(record => record.r === invite.realmId)?.q };
        blockedMode = sessionBlocked.get(invite.realmId)?.saved === false ? 'error' : 'hidden';
        clearInviteSession();
        removeInviteFromHistory();
        renderBlocked();
        return;
      }
      blockedContext = null;
      delete globalThis.__creatorverseRealmQuarantineBlocked;
      ensureSafetyTrigger(invite);
      return;
    }

    if (blockedContext) renderBlocked();
  } finally {
    applying = false;
  }
}

function scheduleGuard() {
  if (renderScheduled) return;
  renderScheduled = true;
  queueMicrotask(() => {
    renderScheduled = false;
    applyGuard();
  });
}

function safetyDialogMarkup() {
  const text = copy();
  const reasons = [
    ['unsafe-real-world', text.unsafeRealWorld],
    ['harassment-hateful', text.harassmentHateful],
    ['personal-private-information', text.personalPrivate],
  ];
  return `
    <form method="dialog" class="realm-quarantine-dialog-form">
      <header>
        <div class="realm-quarantine-dialog-icon">${icon(SHIELD_ICON)}</div>
        <div>
          <h2 id="realm-quarantine-dialog-title" tabindex="-1">${text.choiceTitle}</h2>
          <p>${text.choiceSupport}</p>
        </div>
      </header>
      <fieldset>
        <legend>${text.reasonLegend}</legend>
        ${reasons.map(([value, label]) => `
          <label class="realm-quarantine-reason">
            <input type="radio" name="realm-quarantine-reason" value="${value}">
            <span>${label}</span>
          </label>
        `).join('')}
      </fieldset>
      <div class="realm-quarantine-dialog-actions">
        <button class="primary" type="button" data-action="confirm-realm-quarantine" disabled>${text.hide}</button>
        <button class="secondary" type="button" data-action="cancel-realm-quarantine">${text.cancel}</button>
      </div>
      <p class="cv-visually-hidden" data-quarantine-dialog-status aria-live="polite" aria-atomic="true"></p>
    </form>
  `;
}

function createDialog(kind) {
  document.querySelector('[data-realm-quarantine-dialog]')?.remove();
  const dialog = document.createElement('dialog');
  dialog.className = 'realm-quarantine-dialog';
  dialog.dataset.realmQuarantineDialog = kind;
  dialog.setAttribute('aria-labelledby', kind === 'restore' ? 'realm-restore-dialog-title' : 'realm-quarantine-dialog-title');
  if (kind === 'restore') {
    const text = copy();
    dialog.innerHTML = `
      <form method="dialog" class="realm-quarantine-dialog-form is-restore">
        <header><div class="realm-quarantine-dialog-icon">${icon(GATE_ICON)}</div><div><h2 id="realm-restore-dialog-title" tabindex="-1">${text.restoreTitle}</h2><p>${text.restoreSupport}</p></div></header>
        <div class="realm-quarantine-dialog-actions">
          <button class="primary" type="button" data-action="confirm-realm-restore">${text.showAgain}</button>
          <button class="secondary" type="button" data-action="cancel-realm-restore">${text.keepHidden}</button>
        </div>
      </form>
    `;
  } else {
    dialog.innerHTML = safetyDialogMarkup();
  }
  document.body.append(dialog);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog(dialog, true);
  });
  dialog.showModal();
  queueMicrotask(() => dialog.querySelector('h2')?.focus({ preventScroll: true }));
  return dialog;
}

function closeDialog(dialog, restoreFocus) {
  dialog?.close();
  dialog?.remove();
  if (restoreFocus) queueMicrotask(() => triggerToRestore?.focus({ preventScroll: true }));
}

function invalidateAndBlock(realmId, reason) {
  blockedContext = { realmId, reason };
  sessionBlocked.set(realmId, { realmId, reason, saved: false });
  clearInviteSession();
  removeInviteFromHistory();
}

async function confirmQuarantine(dialog) {
  const selected = dialog.querySelector('input[name="realm-quarantine-reason"]:checked');
  const invite = currentInvite();
  if (!selected || !invite?.realmId) return;

  const text = copy();
  dialog.querySelectorAll('input, button').forEach(control => { control.disabled = true; });
  const button = dialog.querySelector('[data-action="confirm-realm-quarantine"]');
  if (button) button.textContent = text.hiding;
  const status = dialog.querySelector('[data-quarantine-dialog-status]');
  if (status) status.textContent = text.hiding;

  invalidateAndBlock(invite.realmId, selected.value);
  await new Promise(resolve => requestAnimationFrame(resolve));
  try {
    quarantineRealm(localStorage, { realmId: invite.realmId, reason: selected.value });
    sessionBlocked.set(invite.realmId, { realmId: invite.realmId, reason: selected.value, saved: true });
    blockedMode = 'hidden';
  } catch {
    blockedMode = 'error';
  }
  closeDialog(dialog, false);
  renderBlocked({ focus: true });
}

async function retrySave(button) {
  if (!blockedContext || button.disabled) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  await new Promise(resolve => requestAnimationFrame(resolve));
  try {
    quarantineRealm(localStorage, blockedContext);
    sessionBlocked.set(blockedContext.realmId, { ...blockedContext, saved: true });
    blockedMode = 'hidden';
    renderBlocked({ focus: true });
  } catch {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    document.querySelector('[data-quarantine-status]').textContent = copy().saveError;
    button.focus({ preventScroll: true });
  }
}

async function confirmRestore(dialog) {
  if (!blockedContext) return;
  const action = dialog.querySelector('[data-action="confirm-realm-restore"]');
  dialog.querySelectorAll('button').forEach(button => { button.disabled = true; });
  await new Promise(resolve => requestAnimationFrame(resolve));
  try {
    restoreQuarantinedRealm(localStorage, blockedContext.realmId);
    sessionBlocked.delete(blockedContext.realmId);
    delete globalThis.__creatorverseRealmQuarantineBlocked;
    blockedMode = 'restored';
    restoreError = false;
    closeDialog(dialog, false);
    renderBlocked({ focus: true });
  } catch {
    restoreError = true;
    closeDialog(dialog, false);
    renderBlocked();
    queueMicrotask(() => document.querySelector('[data-action="show-realm-again"]')?.focus({ preventScroll: true }));
  }
  action?.removeAttribute('aria-busy');
}

function handleInput(event) {
  const radio = event.target.closest?.('input[name="realm-quarantine-reason"]');
  if (!radio) return;
  const dialog = radio.closest('dialog');
  const confirm = dialog?.querySelector('[data-action="confirm-realm-quarantine"]');
  if (confirm) confirm.disabled = !dialog.querySelector('input[name="realm-quarantine-reason"]:checked');
}

function handleCaptureClick(event) {
  const trigger = event.target.closest?.('[data-action="open-realm-safety"]');
  if (trigger) {
    event.preventDefault();
    event.stopImmediatePropagation();
    triggerToRestore = trigger;
    createDialog('hide');
    return;
  }

  if (blockedContext && event.target.closest?.('[data-role], [data-route], [data-mission-command], [data-mission-result], [data-completion-receipt]')) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function handleClick(event) {
  const dialog = event.target.closest?.('dialog');
  if (event.target.closest?.('[data-action="cancel-realm-quarantine"], [data-action="cancel-realm-restore"]')) {
    closeDialog(dialog, true);
    return;
  }
  if (event.target.closest?.('[data-action="confirm-realm-quarantine"]')) {
    confirmQuarantine(dialog);
    return;
  }
  if (event.target.closest?.('[data-action="retry-realm-quarantine"]')) {
    retrySave(event.target.closest('button'));
    return;
  }
  if (event.target.closest?.('[data-action="show-realm-again"]')) {
    triggerToRestore = event.target.closest('button');
    createDialog('restore');
    return;
  }
  if (event.target.closest?.('[data-action="confirm-realm-restore"]')) {
    confirmRestore(dialog);
    return;
  }
  if (event.target.closest?.('[data-action="quarantine-return-home"]')) {
    blockedContext = null;
    delete globalThis.__creatorverseRealmQuarantineBlocked;
    history.replaceState(null, '', window.location.pathname);
    window.location.reload();
  }
}

document.addEventListener('click', handleCaptureClick, true);
document.addEventListener('click', handleClick);
document.addEventListener('change', handleInput);
window.addEventListener('hashchange', applyGuard);
window.addEventListener('popstate', applyGuard);
window.addEventListener('pageshow', applyGuard);
window.addEventListener('resize', scheduleGuard);
window.addEventListener('storage', event => {
  if (event.storageArea === localStorage) scheduleGuard();
});

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(scheduleGuard);
  observer.observe(app, { childList: true, subtree: true });
}

applyGuard();
