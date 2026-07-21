import './realm-collaboration.css';
import { getLocale } from './i18n.js';
import { getSingleCreatorRealm } from './creator-ledger.js';
import { createMissionResultActionController } from './mission-result.js';
import {
  acceptRealmCollaboration,
  clearRealmCollaborationPreview,
  createRealmCollaborationProposal,
  inspectRealmCollaboration,
  parseRealmCollaborationHash,
  readRealmCollaborationPreview,
  removeRealmCollaboration,
  writeRealmCollaborationPreview,
} from './realm-collaboration.js';
import { getRealmCollaborationCopy } from './realm-collaboration-i18n.js';
import {
  renderCollaborationAction,
  renderCollaborationError,
  renderCollaborationLinked,
  renderCollaborationPreview,
  renderCollaborationReady,
} from './realm-collaboration-view.js';

let scheduled = false;
let applying = false;
let flowOpen = false;
let generatedProposal = null;
let shareController = null;
let shareState = 'idle';
let forceCopy = false;
let incomingInvalid = false;
let confirmationOpen = false;
let operationKind = '';
let operationMessage = '';
let focusTarget = '';
let previewFocusPending = false;

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

function syncShareController(realm) {
  if (!generatedProposal?.url) {
    shareController = null;
    return;
  }
  const navigatorLike = forceCopy ? { clipboard: navigator.clipboard } : navigator;
  shareController = createMissionResultActionController({
    navigatorLike,
    payload: {
      title: getRealmCollaborationCopy(getLocale()).title,
      text: realm.name,
      url: generatedProposal.url,
    },
    copyText,
  });
}

function consumeIncomingTransport() {
  const url = new URL(window.location.href);
  let consumed = false;
  if (url.searchParams.has('collab')) {
    incomingInvalid = true;
    clearRealmCollaborationPreview(sessionStorage);
    url.searchParams.delete('collab');
    consumed = true;
  }

  if (window.location.hash.includes('collab')) {
    const parsed = parseRealmCollaborationHash(window.location.hash);
    if (parsed.status === 'ready') {
      try {
        writeRealmCollaborationPreview(sessionStorage, parsed.proposal);
        incomingInvalid = false;
        previewFocusPending = true;
      } catch {
        clearRealmCollaborationPreview(sessionStorage);
        incomingInvalid = true;
      }
    } else {
      clearRealmCollaborationPreview(sessionStorage);
      incomingInvalid = true;
    }
    url.hash = '';
    consumed = true;
  }

  if (consumed) {
    history.replaceState(history.state, '', `${url.pathname}${url.search}`);
    window.dispatchEvent(new Event('creatorverse:collaboration-route-consumed'));
  }
}

function actionPresentation(copy) {
  const mode = shareController?.mode || 'copy';
  if (shareState === 'pending') return { label: mode === 'share' ? copy.sharing : copy.copying, disabled: true };
  if (shareState === 'shared') return { label: copy.share, disabled: false };
  if (shareState === 'copied') return { label: copy.copy, disabled: false };
  if (shareState === 'cancelled') return { label: copy.share, disabled: false };
  if (shareState === 'denied') return { label: copy.copy, disabled: false };
  if (shareState === 'failed' || shareState === 'unsupported') return { label: copy.retry, disabled: false };
  return { label: mode === 'share' ? copy.share : copy.copy, disabled: !shareController };
}

function actionMessage(copy) {
  return {
    shared: copy.shared,
    copied: copy.copied,
    cancelled: copy.cancelled,
    denied: copy.denied,
    failed: copy.failed,
    unsupported: copy.failed,
  }[shareState] || operationMessage;
}

function replacePanel(host, markup, key) {
  const existing = host.querySelector(':scope > [data-realm-collaboration]');
  if (existing?.dataset.renderKey === key) return existing;
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const next = template.content.firstElementChild;
  next.dataset.renderKey = key;
  if (existing) existing.replaceWith(next);
  else host.append(next);
  return next;
}

function removePanels() {
  document.querySelectorAll('[data-realm-collaboration]').forEach(element => element.remove());
}

function ensureAction(section, locale, linked) {
  const operation = section.querySelector('.realm-continuation-operation');
  if (!operation) return null;
  let button = operation.querySelector('[data-action="open-realm-collaboration"]');
  const markup = renderCollaborationAction(locale, linked);
  if (!button) {
    const template = document.createElement('template');
    template.innerHTML = markup.trim();
    button = template.content.firstElementChild;
    operation.append(button);
  } else {
    const template = document.createElement('template');
    template.innerHTML = markup.trim();
    const replacement = template.content.firstElementChild;
    button.replaceWith(replacement);
    button = replacement;
  }
  button.setAttribute('aria-expanded', String(flowOpen));
  return button;
}

function outsideHost() {
  return document.querySelector('main') || document.querySelector('#app');
}

function sourceRealmFromRecord(record) {
  return { id: record.sourceRealmId, name: record.sourceName, theme: record.sourceTheme };
}

function applyEnhancement() {
  if (applying) return;
  applying = true;
  try {
    const locale = getLocale();
    const copy = getRealmCollaborationCopy(locale);
    const single = getSingleCreatorRealm(localStorage);
    const preview = readRealmCollaborationPreview(sessionStorage);
    const readySection = document.querySelector('[data-realm-continuation][data-state="ready"]');

    if (single.status !== 'ready' || !readySection) {
      document.querySelectorAll('[data-action="open-realm-collaboration"]').forEach(element => element.remove());
      removePanels();
      if (!preview && !incomingInvalid) return;
      const host = outsideHost();
      if (!host) return;
      const kind = incomingInvalid ? 'invalid' : 'noRealm';
      const panel = replacePanel(host, renderCollaborationError({ locale, kind }), `${locale}:${kind}`);
      if (previewFocusPending || focusTarget) {
        previewFocusPending = false;
        focusTarget = '';
        queueMicrotask(() => panel.querySelector('#realm-collaboration-error-title')?.focus({ preventScroll: true }));
      }
      return;
    }

    const realm = single.realm;
    const collaboration = inspectRealmCollaboration(localStorage, realm.id);
    const linked = collaboration.status === 'ready';
    const action = ensureAction(readySection, locale, linked);

    let markup = '';
    let key = '';
    if (collaboration.status === 'invalid' || collaboration.status === 'mismatch') {
      markup = renderCollaborationError({ locale, kind: 'storage' });
      key = `${locale}:storage`;
      flowOpen = true;
    } else if (preview) {
      flowOpen = true;
      if (preview.sourceRealmId === realm.id) {
        operationKind = 'self';
        markup = renderCollaborationError({ locale, kind: 'self' });
        key = `${locale}:self:${preview.proposalId}`;
      } else if (linked) {
        const duplicate = collaboration.record.proposalId === preview.proposalId
          && collaboration.record.sourceRealmId === preview.sourceRealmId;
        if (duplicate) {
          operationMessage = copy.duplicate;
          markup = renderCollaborationLinked({
            locale,
            source: sourceRealmFromRecord(collaboration.record),
            local: realm,
            confirm: confirmationOpen,
            message: operationMessage,
          });
          key = `${locale}:linked:duplicate:${confirmationOpen}`;
        } else {
          operationKind = 'already';
          markup = renderCollaborationError({ locale, kind: 'already' });
          key = `${locale}:already:${preview.proposalId}`;
        }
      } else {
        markup = renderCollaborationPreview({
          locale,
          source: { id: preview.sourceRealmId, name: preview.sourceName, theme: preview.sourceTheme },
          local: realm,
          state: operationKind === 'accepting' ? 'accepting' : 'preview',
          message: operationMessage,
        });
        key = `${locale}:preview:${preview.proposalId}:${operationKind}:${operationMessage}`;
      }
    } else if (incomingInvalid) {
      flowOpen = true;
      markup = renderCollaborationError({ locale, kind: 'invalid' });
      key = `${locale}:invalid`;
    } else if (flowOpen && linked) {
      markup = renderCollaborationLinked({
        locale,
        source: sourceRealmFromRecord(collaboration.record),
        local: realm,
        confirm: confirmationOpen,
        message: operationMessage,
      });
      key = `${locale}:linked:${collaboration.record.proposalId}:${confirmationOpen}:${operationMessage}`;
    } else if (flowOpen) {
      const presentation = actionPresentation(copy);
      markup = renderCollaborationReady({
        locale,
        realm,
        proposal: generatedProposal,
        action: { ...presentation, state: shareState },
        message: actionMessage(copy),
      });
      key = `${locale}:ready:${generatedProposal?.proposal?.proposalId || 'empty'}:${shareState}:${operationMessage}`;
    }

    action?.setAttribute('aria-expanded', String(flowOpen));
    if (!markup) {
      readySection.querySelector(':scope > [data-realm-collaboration]')?.remove();
      return;
    }

    const panel = replacePanel(readySection, markup, key);
    if (previewFocusPending) {
      previewFocusPending = false;
      queueMicrotask(() => panel.querySelector('#realm-collaboration-preview-title, #realm-collaboration-error-title')?.focus({ preventScroll: true }));
    }
    if (focusTarget) {
      const selector = focusTarget;
      focusTarget = '';
      queueMicrotask(() => (panel.querySelector(selector) || readySection.querySelector(selector))?.focus({ preventScroll: true }));
    }
  } finally {
    applying = false;
  }
}

function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    applyEnhancement();
  });
}

function openFlow() {
  flowOpen = true;
  operationKind = '';
  operationMessage = '';
  focusTarget = '#realm-collaboration-title, #realm-collaboration-linked-title';
  scheduleEnhancement();
}

function closeFlow() {
  flowOpen = false;
  generatedProposal = null;
  shareController = null;
  shareState = 'idle';
  forceCopy = false;
  operationKind = '';
  operationMessage = '';
  confirmationOpen = false;
  focusTarget = '[data-action="open-realm-collaboration"]';
  scheduleEnhancement();
}

function createProposal() {
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready') return;
  const outcome = createRealmCollaborationProposal(single.realm, {
    cryptoLike: globalThis.crypto,
    baseUrl: currentBaseUrl(),
  });
  if (outcome.status !== 'ready') {
    operationKind = 'storage';
    operationMessage = getRealmCollaborationCopy(getLocale()).storageSupport;
    scheduleEnhancement();
    return;
  }
  generatedProposal = outcome;
  shareState = 'idle';
  forceCopy = false;
  syncShareController(single.realm);
  focusTarget = '[data-action="share-realm-collaboration"]';
  scheduleEnhancement();
}

async function runShareAction() {
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready' || !shareController || shareState === 'pending') return;
  const activation = shareController.activate();
  shareState = 'pending';
  focusTarget = '[data-action="share-realm-collaboration"]';
  scheduleEnhancement();
  const outcome = await activation;
  if (outcome.status === 'ignored') return;
  shareState = outcome.status;
  if (outcome.status === 'denied' || outcome.status === 'unsupported') {
    forceCopy = true;
    syncShareController(single.realm);
  }
  focusTarget = '[data-action="share-realm-collaboration"]';
  scheduleEnhancement();
}

function rejectIncoming() {
  clearRealmCollaborationPreview(sessionStorage);
  incomingInvalid = false;
  operationKind = '';
  operationMessage = '';
  confirmationOpen = false;
  flowOpen = false;
  focusTarget = '[data-action="open-realm-collaboration"]';
  scheduleEnhancement();
}

function acceptIncoming() {
  const single = getSingleCreatorRealm(localStorage);
  const preview = readRealmCollaborationPreview(sessionStorage);
  if (single.status !== 'ready' || !preview || operationKind === 'accepting') return;
  operationKind = 'accepting';
  scheduleEnhancement();
  queueMicrotask(() => {
    const outcome = acceptRealmCollaboration(localStorage, single.realm, preview);
    const copy = getRealmCollaborationCopy(getLocale());
    if (outcome.status === 'success' || outcome.status === 'duplicate') {
      clearRealmCollaborationPreview(sessionStorage);
      incomingInvalid = false;
      operationKind = '';
      operationMessage = outcome.status === 'duplicate' ? copy.duplicate : copy.linkedSupport;
      focusTarget = '#realm-collaboration-linked-title';
    } else if (outcome.status === 'already-linked') {
      operationKind = 'already';
    } else if (outcome.status === 'self-link') {
      operationKind = 'self';
    } else {
      operationKind = 'storage';
      operationMessage = copy.storageSupport;
    }
    scheduleEnhancement();
  });
}

function openRemovalConfirmation() {
  confirmationOpen = true;
  focusTarget = '[data-action="keep-realm-collaboration"]';
  scheduleEnhancement();
}

function cancelRemovalConfirmation() {
  confirmationOpen = false;
  focusTarget = '[data-action="remove-realm-collaboration"]';
  scheduleEnhancement();
}

function confirmRemoval() {
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready') return;
  const outcome = removeRealmCollaboration(localStorage, single.realm.id);
  const copy = getRealmCollaborationCopy(getLocale());
  if (outcome.status === 'removed' || outcome.status === 'empty') {
    clearRealmCollaborationPreview(sessionStorage);
    confirmationOpen = false;
    generatedProposal = null;
    shareController = null;
    operationKind = '';
    operationMessage = copy.removed;
    flowOpen = true;
    focusTarget = '[data-action="open-realm-collaboration"]';
  } else {
    confirmationOpen = false;
    operationKind = 'storage';
    operationMessage = copy.storageSupport;
    focusTarget = '#realm-collaboration-error-title';
  }
  scheduleEnhancement();
}

function viewCurrent() {
  clearRealmCollaborationPreview(sessionStorage);
  incomingInvalid = false;
  operationKind = '';
  operationMessage = '';
  flowOpen = true;
  focusTarget = '#realm-collaboration-linked-title';
  scheduleEnhancement();
}

function createRealmRecovery() {
  clearRealmCollaborationPreview(sessionStorage);
  incomingInvalid = false;
  document.querySelector('.nav-create, [data-action="open-creator-setup"]')?.click();
  scheduleEnhancement();
}

function retryOperation() {
  operationKind = '';
  operationMessage = '';
  scheduleEnhancement();
}

function handleClick(event) {
  const action = event.target.closest?.('[data-action]')?.dataset.action;
  if (action === 'open-realm-collaboration') openFlow();
  else if (action === 'close-realm-collaboration') closeFlow();
  else if (action === 'create-realm-collaboration') createProposal();
  else if (action === 'share-realm-collaboration') runShareAction();
  else if (action === 'reject-realm-collaboration') rejectIncoming();
  else if (action === 'accept-realm-collaboration') acceptIncoming();
  else if (action === 'remove-realm-collaboration') openRemovalConfirmation();
  else if (action === 'keep-realm-collaboration') cancelRemovalConfirmation();
  else if (action === 'confirm-remove-realm-collaboration') confirmRemoval();
  else if (action === 'view-current-realm-collaboration') viewCurrent();
  else if (action === 'create-realm-from-collaboration') createRealmRecovery();
  else if (action === 'retry-realm-collaboration') retryOperation();
}

function handleKeydown(event) {
  if (event.key === 'Escape' && confirmationOpen) {
    event.preventDefault();
    cancelRemovalConfirmation();
  }
}

function handleHashChange() {
  consumeIncomingTransport();
  scheduleEnhancement();
}

document.addEventListener('click', handleClick);
document.addEventListener('keydown', handleKeydown);
window.addEventListener('hashchange', handleHashChange);
window.addEventListener('storage', scheduleEnhancement);
window.addEventListener('creatorverse:collaboration-route-consumed', scheduleEnhancement);
const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(app, { childList: true, subtree: true });
}
consumeIncomingTransport();
scheduleEnhancement();
