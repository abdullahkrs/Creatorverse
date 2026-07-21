import './realm-continuation.css';
import { getLocale } from './i18n.js';
import { CREATOR_LEDGER_KEY, getSingleCreatorRealm } from './creator-ledger.js';
import { getMissionTemplateCopy } from './mission-templates.js';
import { getMissionScheduleCopy } from './mission-schedule-i18n.js';
import {
  clearRealmContinuationDraft,
  createRealmContinuationInvite,
  readRealmContinuationDraft,
  restorePendingRealmContinuationInvite,
  writeRealmContinuationDraft,
} from './realm-continuation.js';
import { getRealmContinuationCopy } from './realm-continuation-i18n.js';
import { createMissionResultActionController } from './mission-result.js';

const ACTIVE_SELECTOR = '[data-realm-continuation]';
const DISMISSED_KEY = 'creatorverse-realm-continuation-dismissed';
let renderScheduled = false;
let applying = false;
let actionState = 'idle';
let operationError = '';
let activeInvite = null;
let actionController = null;
let forceCopy = false;
let focusTarget = '';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function currentBaseUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function copyText(text) {
  if (typeof navigator.clipboard?.writeText === 'function') return navigator.clipboard.writeText(text);
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.insetInlineStart = '-9999px';
  document.body.append(field);
  field.select();
  const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
  field.remove();
  return copied ? Promise.resolve() : Promise.reject(new Error('COPY_UNAVAILABLE'));
}

function invitePayload(invite, realm) {
  const locale = getLocale();
  const localeCopy = getRealmContinuationCopy(locale);
  const missionCopy = getMissionTemplateCopy(locale).templates[invite.mission.missionId];
  return Object.freeze({
    title: localeCopy.readyTitle,
    text: `${realm.name} · ${missionCopy.name}`,
    url: invite.url,
  });
}

function syncActionController(realm) {
  if (!activeInvite?.url) {
    actionController = null;
    return;
  }
  const navigatorLike = forceCopy
    ? { clipboard: navigator.clipboard }
    : navigator;
  actionController = createMissionResultActionController({
    navigatorLike,
    payload: invitePayload(activeInvite, realm),
    copyText,
  });
}

function restoreInvite(realm) {
  const restored = restorePendingRealmContinuationInvite(localStorage, {
    now: Date.now(),
    baseUrl: currentBaseUrl(),
  });
  activeInvite = restored.status === 'ready' ? restored : null;
  if (!activeInvite) {
    actionController = null;
    forceCopy = false;
    actionState = 'idle';
  } else {
    syncActionController(realm);
  }
}

function realmArtwork() {
  return `
    <svg class="realm-continuation-map" viewBox="0 0 144 96" aria-hidden="true" focusable="false">
      <path class="continuation-route" d="M12 70h36l18-22h28l16-20h22"/>
      <circle class="continuation-node is-complete" cx="48" cy="70" r="6"/>
      <circle class="continuation-node" cx="94" cy="48" r="6"/>
      <path class="continuation-stamp" d="m112 18 16 6v18l-16 7-16-7V24Z"/>
    </svg>
  `;
}

function contextMarkup(realm, localeCopy) {
  return `
    <div class="realm-continuation-context">
      ${realmArtwork()}
      <div class="realm-continuation-realm">
        <p class="section-kicker">${escapeHtml(localeCopy.kicker)}</p>
        <strong><bdi>${escapeHtml(realm.name)}</bdi></strong>
        <dl>
          <div><dt>${escapeHtml(localeCopy.energy)}</dt><dd><bdi dir="ltr">${realm.total}</bdi></dd></div>
          <div><dt>${escapeHtml(localeCopy.contributions)}</dt><dd><bdi dir="ltr">${realm.receipts.length}</bdi></dd></div>
        </dl>
      </div>
    </div>
  `;
}

function readyMarkup(realm, localeCopy) {
  return `
    <section class="realm-continuation is-ready" data-realm-continuation data-state="ready" aria-labelledby="realm-continuation-title">
      ${contextMarkup(realm, localeCopy)}
      <div class="realm-continuation-operation">
        <div>
          <h2 id="realm-continuation-title">${escapeHtml(localeCopy.title)}</h2>
          <p>${escapeHtml(localeCopy.support)}</p>
        </div>
        <button class="primary realm-continuation-launch" type="button" data-action="open-realm-continuation">${escapeHtml(localeCopy.launch)}</button>
      </div>
    </section>
  `;
}

function selectionMarkup(realm, draft, localeCopy) {
  const missionCopy = getMissionTemplateCopy(getLocale());
  const scheduleCopy = getMissionScheduleCopy(getLocale());
  return `
    <section class="realm-continuation is-selecting" data-realm-continuation data-state="selected" aria-labelledby="realm-continuation-title">
      ${contextMarkup(realm, localeCopy)}
      <form class="realm-continuation-operation" data-form="realm-continuation">
        <div>
          <h2 id="realm-continuation-title" tabindex="-1">${escapeHtml(localeCopy.title)}</h2>
          <p>${escapeHtml(localeCopy.support)}</p>
        </div>
        <fieldset>
          <legend>${escapeHtml(missionCopy.selectorLegend)}</legend>
          <div class="realm-continuation-options">
            ${Object.entries(missionCopy.templates).map(([id, item]) => `
              <label><input type="radio" name="continuation-mission" value="${escapeHtml(id)}" ${draft.missionId === id ? 'checked' : ''}><span>${escapeHtml(item.name)}</span></label>
            `).join('')}
          </div>
        </fieldset>
        <fieldset>
          <legend>${escapeHtml(scheduleCopy.selectorLegend)}</legend>
          <div class="realm-continuation-options">
            ${Object.entries(scheduleCopy.options).map(([id, label]) => `
              <label><input type="radio" name="continuation-schedule" value="${escapeHtml(id)}" ${draft.scheduleId === id ? 'checked' : ''}><span><bdi>${escapeHtml(label)}</bdi></span></label>
            `).join('')}
          </div>
        </fieldset>
        <div class="realm-continuation-actions">
          <button class="primary" type="submit" data-action="create-realm-continuation" ${actionState === 'pending' ? 'disabled aria-busy="true"' : ''}>${escapeHtml(actionState === 'pending' ? localeCopy.creating : localeCopy.create)}</button>
          <button class="secondary" type="button" data-action="cancel-realm-continuation">${escapeHtml(localeCopy.cancel)}</button>
        </div>
        <p class="realm-continuation-status" data-continuation-status aria-live="polite" aria-atomic="true">${escapeHtml(operationError)}</p>
      </form>
    </section>
  `;
}

function actionPresentation(localeCopy) {
  const mode = actionController?.mode || 'copy';
  if (actionState === 'pending-action') return { label: mode === 'share' ? localeCopy.sharing : localeCopy.copying, disabled: true, message: '' };
  if (actionState === 'shared') return { label: localeCopy.share, disabled: false, message: localeCopy.shared };
  if (actionState === 'copied') return { label: localeCopy.copy, disabled: false, message: localeCopy.copied };
  if (actionState === 'cancelled') return { label: localeCopy.share, disabled: false, message: localeCopy.cancelled };
  if (actionState === 'denied') return { label: localeCopy.copy, disabled: false, message: localeCopy.denied };
  if (actionState === 'failed' || actionState === 'unsupported') return { label: localeCopy.retry, disabled: false, message: localeCopy.failed };
  return { label: mode === 'share' ? localeCopy.share : localeCopy.copy, disabled: !actionController, message: '' };
}

function inviteMarkup(realm, localeCopy) {
  const missionCopy = getMissionTemplateCopy(getLocale()).templates[activeInvite.mission.missionId];
  const scheduleCopy = getMissionScheduleCopy(getLocale()).options[activeInvite.mission.scheduleId];
  const action = actionPresentation(localeCopy);
  const manual = ['denied', 'failed', 'unsupported'].includes(actionState);
  return `
    <section class="realm-continuation is-invite-ready" data-realm-continuation data-state="success" aria-labelledby="realm-continuation-result-title">
      ${contextMarkup(realm, localeCopy)}
      <div class="realm-continuation-operation">
        <div class="realm-continuation-result">
          <svg class="realm-continuation-invite-stamp" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <path d="m32 5 22 9v25L32 59 10 39V14Z"/>
            <path d="M21 32h22M32 21v22"/>
          </svg>
          <div>
            <p class="section-kicker">${escapeHtml(localeCopy.stampLabel)}</p>
            <h2 id="realm-continuation-result-title" tabindex="-1">${escapeHtml(localeCopy.readyTitle)}</h2>
            <p>${escapeHtml(localeCopy.readySupport)}</p>
            <dl>
              <div><dt>${escapeHtml(getMissionTemplateCopy(getLocale()).missionLabel)}</dt><dd>${escapeHtml(missionCopy.name)}</dd></div>
              <div><dt>${escapeHtml(getMissionScheduleCopy(getLocale()).selectorLegend)}</dt><dd><bdi>${escapeHtml(scheduleCopy)}</bdi></dd></div>
            </dl>
          </div>
        </div>
        <div class="realm-continuation-share">
          <button class="primary" type="button" data-action="share-realm-continuation" ${action.disabled ? 'disabled' : ''}>${escapeHtml(action.label)}</button>
          <p class="realm-continuation-status" aria-live="polite" aria-atomic="true">${escapeHtml(action.message)}</p>
          ${manual ? `<label class="realm-continuation-manual"><span>${escapeHtml(localeCopy.manual)}</span><input readonly dir="ltr" value="${escapeHtml(activeInvite.url)}"></label>` : ''}
        </div>
      </div>
    </section>
  `;
}

function errorMarkup(status, localeCopy) {
  const presentation = status === 'invalid'
    ? [localeCopy.invalidTitle, localeCopy.invalidBody]
    : status === 'full'
      ? [localeCopy.fullTitle, localeCopy.fullBody]
      : [localeCopy.storageTitle, localeCopy.storageBody];
  return `
    <section class="realm-continuation is-error" data-realm-continuation data-state="error" aria-labelledby="realm-continuation-error-title">
      <div class="realm-continuation-operation">
        <h2 id="realm-continuation-error-title" tabindex="-1">${escapeHtml(presentation[0])}</h2>
        <p>${escapeHtml(presentation[1])}</p>
        <button class="primary" type="button" data-action="recover-realm-continuation">${escapeHtml(status === 'invalid' ? localeCopy.recovery : localeCopy.retry)}</button>
      </div>
    </section>
  `;
}

function getHost() {
  const update = document.querySelector('.completion-record .creator-realm-update');
  if (update) return { type: 'receipt', element: update };
  if (window.location.hash || globalThis.__creatorverseCompletionReceiptActive) return null;
  const experience = document.querySelector('.experience');
  return experience ? { type: 'home', element: experience } : null;
}

function removeExisting() {
  document.querySelectorAll(ACTIVE_SELECTOR).forEach(element => element.remove());
}

function restoreBaseExperience() {
  document.querySelector('.experience')?.removeAttribute('hidden');
  document.querySelector('.nav-create')?.removeAttribute('hidden');
  document.querySelector('.creator-tools')?.removeAttribute('hidden');
}

function renderMarkup(host, markup, renderKey) {
  const existing = host.type === 'receipt'
    ? host.element.nextElementSibling?.matches?.(ACTIVE_SELECTOR) && host.element.nextElementSibling
    : document.querySelector('main > [data-realm-continuation]');
  if (existing?.dataset.renderKey === renderKey) return existing;
  existing?.remove();
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const element = template.content.firstElementChild;
  element.dataset.renderKey = renderKey;
  host.element.insertAdjacentElement('afterend', element);
  return element;
}

function applyContinuation() {
  if (applying) return;
  applying = true;
  try {
    const host = getHost();
    if (!host) return;
    const locale = getLocale();
    const localeCopy = getRealmContinuationCopy(locale);
    const single = getSingleCreatorRealm(localStorage);
    if (single.status === 'unavailable') {
      removeExisting();
      restoreBaseExperience();
      return;
    }
    if (sessionStorage.getItem(DISMISSED_KEY) === single.realm?.id) {
      removeExisting();
      restoreBaseExperience();
      return;
    }

    if (host.type === 'home') {
      host.element.setAttribute('hidden', '');
      document.querySelector('.nav-create')?.setAttribute('hidden', '');
      document.querySelector('.creator-tools')?.setAttribute('hidden', '');
    }

    if (single.status === 'invalid') {
      const element = renderMarkup(host, errorMarkup('invalid', localeCopy), `${locale}:invalid`);
      queueMicrotask(() => element.querySelector('#realm-continuation-error-title')?.focus({ preventScroll: true }));
      return;
    }

    const realm = single.realm;
    const draft = readRealmContinuationDraft(sessionStorage, realm.id);
    const pending = restorePendingRealmContinuationInvite(localStorage, { now: Date.now(), baseUrl: currentBaseUrl() });
    if (pending.status === 'ready' && activeInvite?.mission?.id !== pending.mission.id) {
      activeInvite = pending;
      actionState = 'idle';
      forceCopy = false;
      syncActionController(realm);
    } else if (pending.status !== 'ready' && activeInvite) {
      activeInvite = null;
      actionController = null;
      actionState = 'idle';
    }

    let markup;
    let stateKey;
    if (operationError === 'full' || operationError === 'storage-error') {
      markup = errorMarkup(operationError, localeCopy);
      stateKey = operationError;
    } else if (activeInvite) {
      markup = inviteMarkup(realm, localeCopy);
      stateKey = `invite:${activeInvite.mission.id}:${actionState}:${forceCopy}`;
    } else if (draft.open) {
      markup = selectionMarkup(realm, draft, localeCopy);
      stateKey = `select:${draft.missionId}:${draft.scheduleId}:${actionState}:${operationError}`;
    } else {
      markup = readyMarkup(realm, localeCopy);
      stateKey = 'ready';
    }
    const renderKey = `${locale}:${host.type}:${realm.id}:${realm.total}:${realm.receipts.length}:${stateKey}`;
    const element = renderMarkup(host, markup, renderKey);
    if (focusTarget) {
      const selector = focusTarget;
      focusTarget = '';
      queueMicrotask(() => element.querySelector(selector)?.focus({ preventScroll: true }));
    }
  } finally {
    applying = false;
  }
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  queueMicrotask(() => {
    renderScheduled = false;
    applyContinuation();
  });
}

function openContinuation() {
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready') return;
  const draft = readRealmContinuationDraft(sessionStorage, single.realm.id);
  try {
    writeRealmContinuationDraft(sessionStorage, { ...draft, open: true });
    operationError = '';
    focusTarget = '#realm-continuation-title';
  } catch {
    operationError = 'storage-error';
    focusTarget = '#realm-continuation-error-title';
  }
  scheduleRender();
}

function updateSelection(event) {
  const input = event.target.closest?.('input[name="continuation-mission"], input[name="continuation-schedule"]');
  if (!input) return;
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready') return;
  const draft = readRealmContinuationDraft(sessionStorage, single.realm.id);
  const next = input.name === 'continuation-mission'
    ? { ...draft, missionId: input.value, open: true }
    : { ...draft, scheduleId: input.value, open: true };
  try {
    writeRealmContinuationDraft(sessionStorage, next);
    operationError = '';
  } catch {
    operationError = 'storage-error';
  }
  scheduleRender();
}

function cancelContinuation() {
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready') return;
  const draft = readRealmContinuationDraft(sessionStorage, single.realm.id);
  try {
    writeRealmContinuationDraft(sessionStorage, { ...draft, open: false });
  } catch {
    clearRealmContinuationDraft(sessionStorage);
  }
  operationError = '';
  focusTarget = '[data-action="open-realm-continuation"]';
  scheduleRender();
}

function createInvite() {
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready' || actionState === 'pending') return;
  const draft = readRealmContinuationDraft(sessionStorage, single.realm.id);
  actionState = 'pending';
  operationError = '';
  scheduleRender();
  queueMicrotask(() => {
    const outcome = createRealmContinuationInvite(localStorage, {
      missionId: draft.missionId,
      scheduleId: draft.scheduleId,
    }, {
      now: Date.now(),
      cryptoLike: globalThis.crypto,
      baseUrl: currentBaseUrl(),
    });
    actionState = 'idle';
    if (outcome.status === 'ready') {
      activeInvite = outcome;
      forceCopy = false;
      syncActionController(outcome.realm);
      try {
        writeRealmContinuationDraft(sessionStorage, { ...draft, open: false });
      } catch {
        clearRealmContinuationDraft(sessionStorage);
      }
      focusTarget = '#realm-continuation-result-title';
    } else {
      operationError = outcome.status === 'full' ? 'full' : 'storage-error';
      focusTarget = outcome.status === 'full' ? '#realm-continuation-error-title' : '[data-action="create-realm-continuation"]';
    }
    scheduleRender();
  });
}

async function runInviteAction() {
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready' || !actionController || actionState === 'pending-action') return;
  const activation = actionController.activate();
  actionState = 'pending-action';
  focusTarget = '[data-action="share-realm-continuation"]';
  scheduleRender();
  const outcome = await activation;
  if (outcome.status === 'ignored') return;
  actionState = outcome.status;
  if (outcome.status === 'denied') {
    forceCopy = true;
    syncActionController(single.realm);
  }
  focusTarget = '[data-action="share-realm-continuation"]';
  scheduleRender();
}

function recoverContinuation() {
  if (operationError === 'storage-error') {
    operationError = '';
    actionState = 'idle';
    focusTarget = '[data-action="create-realm-continuation"]';
    scheduleRender();
    return;
  }
  if (operationError === 'full') {
    operationError = '';
    scheduleRender();
    return;
  }
  localStorage.removeItem(CREATOR_LEDGER_KEY);
  clearRealmContinuationDraft(sessionStorage);
  activeInvite = null;
  operationError = '';
  window.location.reload();
}

function handleClick(event) {
  if (event.target.closest?.('[data-action="open-realm-continuation"]')) openContinuation();
  else if (event.target.closest?.('[data-action="cancel-realm-continuation"]')) cancelContinuation();
  else if (event.target.closest?.('[data-action="share-realm-continuation"]')) runInviteAction();
  else if (event.target.closest?.('[data-action="recover-realm-continuation"]')) recoverContinuation();
}

function handleSubmit(event) {
  if (!event.target.matches?.('[data-form="realm-continuation"]')) return;
  event.preventDefault();
  createInvite();
}

document.addEventListener('click', handleClick);
document.addEventListener('change', updateSelection);
document.addEventListener('submit', handleSubmit);
window.addEventListener('hashchange', scheduleRender);
window.addEventListener('storage', scheduleRender);
const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(scheduleRender);
  observer.observe(app, { childList: true, subtree: true });
}
restoreInvite(getSingleCreatorRealm(localStorage).realm);
scheduleRender();
