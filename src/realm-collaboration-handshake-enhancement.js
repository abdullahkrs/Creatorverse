import './realm-collaboration-handshake.css';
import { getLocale } from './i18n.js';
import { getSingleCreatorRealm } from './creator-ledger.js';
import { createMissionResultActionController } from './mission-result.js';
import { inspectRealmCollaboration } from './realm-collaboration.js';
import {
  clearRealmCollaborationConfirmationPreview,
  confirmRealmCollaboration,
  createPendingRealmCollaboration,
  createRealmCollaborationConfirmation,
  discardPendingRealmCollaboration,
  inspectPendingRealmCollaboration,
  parseRealmCollaborationConfirmationHash,
  readRealmCollaborationConfirmationPreview,
  resumePendingRealmCollaboration,
  writeRealmCollaborationConfirmationPreview,
} from './realm-collaboration-handshake.js';
import { getRealmCollaborationCopy } from './realm-collaboration-i18n.js';
import {
  renderConfirmationPreview,
  renderHandshakeError,
  renderHandshakeReady,
  renderHandshakeSuccess,
  renderPendingHandshake,
  renderReturnConfirmationControl,
} from './realm-collaboration-handshake-view.js';

let scheduled = false;
let applying = false;
let proposalOutcome = null;
let proposalController = null;
let proposalState = 'idle';
let proposalForceCopy = false;
let discardOpen = false;
let confirmationInvalid = false;
let confirmationOperation = '';
let confirmationMessage = '';
let confirmationSuccess = null;
let confirmationFocusPending = false;
let returnOutcome = null;
let returnController = null;
let returnState = 'idle';
let returnForceCopy = false;
let focusSelector = '';

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

function consumeConfirmationTransport() {
  const url = new URL(window.location.href);
  const queryInvalid = url.searchParams.has('collab-confirm');
  const hasConfirmationHash = window.location.hash.includes('collab-confirm');
  let consumed = false;

  if (queryInvalid) {
    url.searchParams.delete('collab-confirm');
    clearRealmCollaborationConfirmationPreview(sessionStorage);
    confirmationInvalid = true;
    consumed = true;
  }

  if (hasConfirmationHash) {
    const parsed = parseRealmCollaborationConfirmationHash(window.location.hash);
    if (!queryInvalid && parsed.status === 'ready') {
      try {
        writeRealmCollaborationConfirmationPreview(sessionStorage, parsed.confirmation);
        confirmationInvalid = false;
        confirmationFocusPending = true;
      } catch {
        clearRealmCollaborationConfirmationPreview(sessionStorage);
        confirmationInvalid = true;
      }
    } else {
      clearRealmCollaborationConfirmationPreview(sessionStorage);
      confirmationInvalid = true;
    }
    url.hash = '';
    consumed = true;
  }

  if (consumed) {
    history.replaceState(history.state, '', `${url.pathname}${url.search}`);
    window.dispatchEvent(new Event('creatorverse:collaboration-confirmation-consumed'));
  }
}

function createController(outcome, realm, forceCopy, title) {
  if (!outcome?.url) return null;
  const navigatorLike = forceCopy ? { clipboard: navigator.clipboard } : navigator;
  return createMissionResultActionController({
    navigatorLike,
    payload: {
      title,
      text: realm.name,
      url: outcome.url,
    },
    copyText,
  });
}

function syncProposalController(realm) {
  proposalController = createController(
    proposalOutcome,
    realm,
    proposalForceCopy,
    getRealmCollaborationCopy(getLocale()).title,
  );
}

function syncReturnController(realm) {
  returnController = createController(
    returnOutcome,
    realm,
    returnForceCopy,
    getRealmCollaborationCopy(getLocale()).completeTitle,
  );
}

function sharePresentation(copy, controller, state, initialLabel) {
  const mode = controller?.mode || 'copy';
  if (state === 'pending') return { label: mode === 'share' ? copy.sharing : copy.copying, disabled: true };
  if (state === 'failed' || state === 'unsupported') return { label: copy.retry, disabled: false };
  if (state === 'denied') return { label: copy.copy, disabled: false };
  if (state === 'shared') return { label: copy.share, disabled: false };
  if (state === 'copied') return { label: copy.copy, disabled: false };
  return { label: initialLabel || (mode === 'share' ? copy.share : copy.copy), disabled: !controller };
}

function proposalMessage(copy) {
  return {
    shared: copy.shared,
    copied: copy.copied,
    cancelled: copy.cancelled,
    denied: copy.denied,
    failed: copy.failed,
    unsupported: copy.failed,
  }[proposalState] || '';
}

function confirmationShareMessage(copy) {
  return {
    shared: copy.confirmationShared,
    copied: copy.confirmationCopied,
    cancelled: copy.confirmationCancelled,
    denied: copy.confirmationDenied,
    failed: copy.confirmationFailed,
    unsupported: copy.confirmationFailed,
  }[returnState] || '';
}

function parseMarkup(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

function applyPanelMarkup(panel, markup, key) {
  if (!panel) return null;
  if (panel.dataset.handshakeKey === key) return panel;
  const next = parseMarkup(markup);
  const renderKey = panel.dataset.renderKey;
  panel.className = next.className;
  panel.setAttribute('data-state', next.dataset.state || 'ready');
  panel.setAttribute('aria-labelledby', next.getAttribute('aria-labelledby') || 'realm-handshake-title');
  panel.replaceChildren(...next.childNodes);
  panel.dataset.handshakeKey = key;
  if (renderKey) panel.dataset.renderKey = renderKey;
  return panel;
}

function readySection() {
  return document.querySelector('[data-realm-continuation][data-state="ready"]');
}

function collaborationPanel(section) {
  return section?.querySelector(':scope > [data-realm-collaboration]') || null;
}

function ensurePanelOpen(section) {
  const current = collaborationPanel(section);
  if (current) return current;
  const trigger = section?.querySelector('[data-action="open-realm-collaboration"]');
  if (trigger && trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
  return collaborationPanel(section);
}

function realmFromRecord(record) {
  return { id: record.sourceRealmId, name: record.sourceName, theme: record.sourceTheme };
}

function classifyConfirmation(realm, confirmation) {
  if (!confirmation || confirmation.sourceRealmId !== realm.id || confirmation.acceptingRealmId === realm.id) {
    return { status: 'mismatch' };
  }
  const linked = inspectRealmCollaboration(localStorage, realm.id);
  if (linked.status === 'ready') {
    const same = linked.record.proposalId === confirmation.proposalId
      && linked.record.sourceRealmId === confirmation.acceptingRealmId
      && linked.record.sourceName === confirmation.acceptingName
      && linked.record.sourceTheme === confirmation.acceptingTheme;
    return same ? { status: 'duplicate', record: linked.record } : { status: 'already-linked' };
  }
  if (linked.status !== 'empty') return { status: 'storage' };

  const pending = inspectPendingRealmCollaboration(localStorage, realm.id);
  if (pending.status === 'empty') return { status: 'no-pending' };
  if (pending.status !== 'ready') return { status: 'storage' };
  const matches = pending.proposal.proposalId === confirmation.proposalId
    && pending.proposal.sourceRealmId === confirmation.sourceRealmId
    && pending.proposal.sourceName === realm.name
    && pending.proposal.sourceTheme === realm.theme;
  return matches ? { status: 'ready', pending: pending.proposal } : { status: 'mismatch', pending: pending.proposal };
}

function renderStandalone(markup, key) {
  let panel = document.querySelector('[data-realm-handshake-standalone]');
  if (!panel) {
    panel = parseMarkup(markup);
    panel.removeAttribute('data-realm-collaboration');
    panel.setAttribute('data-realm-handshake-standalone', '');
    document.body.append(panel);
  } else if (panel.dataset.handshakeKey !== key) {
    const next = parseMarkup(markup);
    panel.className = next.className;
    panel.setAttribute('data-state', next.dataset.state || 'invalid');
    panel.replaceChildren(...next.childNodes);
  }
  panel.dataset.handshakeKey = key;
  return panel;
}

function appendReturnControl(panel, locale, realm, collaboration) {
  if (!panel || !collaboration?.record || panel.dataset.state === 'confirmation-preview') return;
  const copy = getRealmCollaborationCopy(locale);
  const existing = panel.querySelector('[data-handshake-return]');
  const action = sharePresentation(copy, returnController, returnState, copy.returnConfirmation);
  const manual = ['denied', 'failed', 'unsupported'].includes(returnState) ? returnOutcome?.url || '' : '';
  const next = parseMarkup(renderReturnConfirmationControl({
    locale,
    action,
    message: confirmationShareMessage(copy),
    manualUrl: manual,
  }));
  if (existing) existing.replaceWith(next);
  else panel.append(next);
}

function applyEnhancement() {
  if (applying) return;
  applying = true;
  try {
    const locale = getLocale();
    const copy = getRealmCollaborationCopy(locale);
    const single = getSingleCreatorRealm(localStorage);
    const preview = readRealmCollaborationConfirmationPreview(sessionStorage);
    const section = readySection();

    if (single.status !== 'ready' || !section) {
      if (preview || confirmationInvalid) {
        const markup = renderHandshakeError({ locale, kind: confirmationInvalid ? 'invalid' : 'no-pending' });
        const standalone = renderStandalone(markup, `${locale}:${confirmationInvalid ? 'invalid' : 'no-realm'}`);
        if (confirmationFocusPending) {
          confirmationFocusPending = false;
          queueMicrotask(() => standalone.querySelector('#realm-handshake-title')?.focus({ preventScroll: true }));
        }
      } else {
        document.querySelector('[data-realm-handshake-standalone]')?.remove();
      }
      return;
    }

    document.querySelector('[data-realm-handshake-standalone]')?.remove();
    const realm = single.realm;
    let panel = collaborationPanel(section);

    if (preview || confirmationInvalid || confirmationSuccess) {
      panel = ensurePanelOpen(section);
      if (!panel) return;
      let markup;
      let key;
      if (confirmationSuccess) {
        const accepting = realmFromRecord(confirmationSuccess);
        markup = renderHandshakeSuccess({ locale, local: realm, accepting, message: confirmationMessage });
        key = `${locale}:success:${confirmationSuccess.proposalId}`;
      } else if (confirmationInvalid) {
        markup = renderHandshakeError({ locale, kind: 'invalid' });
        key = `${locale}:invalid-confirmation`;
      } else {
        const classification = classifyConfirmation(realm, preview);
        if (classification.status === 'duplicate') {
          confirmationSuccess = classification.record;
          clearRealmCollaborationConfirmationPreview(sessionStorage);
          markup = renderHandshakeSuccess({ locale, local: realm, accepting: realmFromRecord(classification.record) });
          key = `${locale}:duplicate-success:${classification.record.proposalId}`;
        } else if (classification.status === 'ready' && confirmationOperation !== 'storage') {
          markup = renderConfirmationPreview({
            locale,
            local: realm,
            accepting: {
              id: preview.acceptingRealmId,
              name: preview.acceptingName,
              theme: preview.acceptingTheme,
            },
            confirming: confirmationOperation === 'confirming',
            message: confirmationMessage,
          });
          key = `${locale}:confirmation-preview:${preview.proposalId}:${confirmationOperation}:${confirmationMessage}`;
        } else {
          const kind = confirmationOperation === 'storage' ? 'storage' : classification.status;
          markup = renderHandshakeError({
            locale,
            kind,
            message: confirmationMessage,
            hasPending: Boolean(classification.pending),
          });
          key = `${locale}:confirmation-error:${kind}:${Boolean(classification.pending)}:${confirmationMessage}`;
        }
      }
      panel = applyPanelMarkup(panel, markup, key);
      if (confirmationFocusPending || focusSelector) {
        const selector = focusSelector || '#realm-handshake-title';
        confirmationFocusPending = false;
        focusSelector = '';
        queueMicrotask(() => panel.querySelector(selector)?.focus({ preventScroll: true }));
      }
      return;
    }

    const collaboration = inspectRealmCollaboration(localStorage, realm.id);
    const pending = inspectPendingRealmCollaboration(localStorage, realm.id);

    if (pending.status === 'ready' && collaboration.status === 'empty') {
      panel = ensurePanelOpen(section);
      if (!panel) return;
      if (!proposalOutcome || proposalOutcome.proposal.proposalId !== pending.proposal.proposalId) {
        proposalOutcome = resumePendingRealmCollaboration(pending.proposal, { baseUrl: currentBaseUrl() });
        proposalState = 'idle';
        proposalForceCopy = false;
        syncProposalController(realm);
      }
      const action = sharePresentation(copy, proposalController, proposalState, copy.resume);
      const manual = ['denied', 'failed', 'unsupported'].includes(proposalState) ? proposalOutcome.url : '';
      panel = applyPanelMarkup(panel, renderPendingHandshake({
        locale,
        realm,
        action,
        message: proposalMessage(copy),
        discardOpen,
        manualUrl: manual,
      }), `${locale}:pending:${pending.proposal.proposalId}:${proposalState}:${discardOpen}`);
      if (focusSelector) {
        const selector = focusSelector;
        focusSelector = '';
        queueMicrotask(() => panel.querySelector(selector)?.focus({ preventScroll: true }));
      }
      return;
    }

    if (pending.status !== 'empty' && pending.status !== 'ready') {
      panel = ensurePanelOpen(section);
      if (!panel) return;
      applyPanelMarkup(panel, renderHandshakeError({ locale, kind: 'storage' }), `${locale}:pending-storage`);
      return;
    }

    if (panel?.dataset.handshakeKey?.startsWith(`${locale}:ready-after-discard`)) return;

    if (panel && collaboration.status === 'ready' && ['linked', 'removal-confirmation'].includes(panel.dataset.state)) {
      appendReturnControl(panel, locale, realm, collaboration);
      if (focusSelector) {
        const selector = focusSelector;
        focusSelector = '';
        queueMicrotask(() => panel.querySelector(selector)?.focus({ preventScroll: true }));
      }
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

function createProposal() {
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready') return;
  const outcome = createPendingRealmCollaboration(localStorage, single.realm, {
    cryptoLike: globalThis.crypto,
    baseUrl: currentBaseUrl(),
  });
  if (outcome.status === 'ready') {
    proposalOutcome = outcome;
    proposalState = 'idle';
    proposalForceCopy = false;
    discardOpen = false;
    syncProposalController(single.realm);
    focusSelector = '[data-action="resume-realm-collaboration"]';
  } else {
    confirmationOperation = 'storage';
    confirmationMessage = getRealmCollaborationCopy(getLocale()).storageSupport;
    focusSelector = '#realm-handshake-title';
  }
  scheduleEnhancement();
}

async function sharePendingProposal() {
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready' || !proposalController || proposalState === 'pending') return;
  const activation = proposalController.activate();
  proposalState = 'pending';
  focusSelector = '[data-action="resume-realm-collaboration"]';
  scheduleEnhancement();
  const outcome = await activation;
  if (outcome.status === 'ignored') return;
  proposalState = outcome.status;
  if (outcome.status === 'denied' || outcome.status === 'unsupported') {
    proposalForceCopy = true;
    syncProposalController(single.realm);
  }
  focusSelector = '[data-action="resume-realm-collaboration"]';
  scheduleEnhancement();
}

function openDiscard() {
  discardOpen = true;
  focusSelector = '[data-action="keep-pending-realm-collaboration"]';
  scheduleEnhancement();
}

function closeDiscard() {
  discardOpen = false;
  focusSelector = '[data-action="discard-pending-realm-collaboration"]';
  scheduleEnhancement();
}

function confirmDiscard() {
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready') return;
  const outcome = discardPendingRealmCollaboration(localStorage, single.realm.id);
  if (outcome.status === 'discarded' || outcome.status === 'empty') {
    proposalOutcome = null;
    proposalController = null;
    proposalState = 'idle';
    proposalForceCopy = false;
    discardOpen = false;
    const panel = collaborationPanel(readySection());
    if (panel) {
      applyPanelMarkup(panel, renderHandshakeReady({
        locale: getLocale(),
        realm: single.realm,
        message: getRealmCollaborationCopy(getLocale()).pendingDiscarded,
      }), `${getLocale()}:ready-after-discard`);
      focusSelector = '[data-action="create-realm-collaboration"]';
    }
  } else {
    discardOpen = false;
    confirmationMessage = getRealmCollaborationCopy(getLocale()).storageSupport;
    focusSelector = '#realm-handshake-title';
  }
  scheduleEnhancement();
}

async function returnConfirmation() {
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready' || returnState === 'pending') return;
  const collaboration = inspectRealmCollaboration(localStorage, single.realm.id);
  if (collaboration.status !== 'ready') return;
  if (!returnOutcome) {
    returnOutcome = createRealmCollaborationConfirmation(single.realm, collaboration.record, { baseUrl: currentBaseUrl() });
    if (returnOutcome.status !== 'ready') return;
    syncReturnController(single.realm);
  }
  if (!returnController) return;
  const activation = returnController.activate();
  returnState = 'pending';
  focusSelector = '[data-action="return-realm-collaboration-confirmation"]';
  scheduleEnhancement();
  const outcome = await activation;
  if (outcome.status === 'ignored') return;
  returnState = outcome.status;
  if (outcome.status === 'denied' || outcome.status === 'unsupported') {
    returnForceCopy = true;
    syncReturnController(single.realm);
  }
  focusSelector = '[data-action="return-realm-collaboration-confirmation"]';
  scheduleEnhancement();
}

function confirmHandshake() {
  const single = getSingleCreatorRealm(localStorage);
  const preview = readRealmCollaborationConfirmationPreview(sessionStorage);
  if (single.status !== 'ready' || !preview || confirmationOperation === 'confirming') return;
  confirmationOperation = 'confirming';
  confirmationMessage = '';
  scheduleEnhancement();
  queueMicrotask(() => {
    const outcome = confirmRealmCollaboration(localStorage, single.realm, preview);
    if (outcome.status === 'success' || outcome.status === 'duplicate') {
      clearRealmCollaborationConfirmationPreview(sessionStorage);
      confirmationInvalid = false;
      confirmationOperation = '';
      confirmationMessage = getRealmCollaborationCopy(getLocale()).confirmedSupport;
      confirmationSuccess = outcome.record;
      focusSelector = '#realm-handshake-title';
    } else if (outcome.status === 'storage-error' || outcome.status === 'invalid-storage') {
      confirmationOperation = 'storage';
      confirmationMessage = getRealmCollaborationCopy(getLocale()).storageSupport;
      focusSelector = '#realm-handshake-title';
    } else {
      confirmationOperation = outcome.status;
      confirmationMessage = '';
      focusSelector = '#realm-handshake-title';
    }
    scheduleEnhancement();
  });
}

function closeHandshake() {
  clearRealmCollaborationConfirmationPreview(sessionStorage);
  confirmationInvalid = false;
  confirmationOperation = '';
  confirmationMessage = '';
  confirmationSuccess = null;
  const close = collaborationPanel(readySection())?.querySelector('[data-action="close-realm-collaboration"]');
  if (close) close.click();
  else document.querySelector('[data-realm-handshake-standalone]')?.remove();
  focusSelector = '[data-action="open-realm-collaboration"]';
  scheduleEnhancement();
}

function resumeMatchingProposal() {
  clearRealmCollaborationConfirmationPreview(sessionStorage);
  confirmationInvalid = false;
  confirmationOperation = '';
  confirmationMessage = '';
  confirmationSuccess = null;
  focusSelector = '[data-action="resume-realm-collaboration"]';
  scheduleEnhancement();
}

function handleClickCapture(event) {
  const target = event.target.closest?.('[data-action]');
  const action = target?.dataset.action;
  const owned = new Set([
    'create-realm-collaboration',
    'resume-realm-collaboration',
    'discard-pending-realm-collaboration',
    'keep-pending-realm-collaboration',
    'confirm-discard-pending-realm-collaboration',
    'return-realm-collaboration-confirmation',
    'confirm-realm-collaboration-handshake',
    'cancel-realm-collaboration-handshake',
    'finish-realm-collaboration-handshake',
    'resume-matching-realm-collaboration',
  ]);
  if (!owned.has(action)) {
    if (action === 'accept-realm-collaboration' || action === 'remove-realm-collaboration' || action === 'keep-realm-collaboration') {
      queueMicrotask(scheduleEnhancement);
    }
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  if (action === 'create-realm-collaboration') createProposal();
  else if (action === 'resume-realm-collaboration') sharePendingProposal();
  else if (action === 'discard-pending-realm-collaboration') openDiscard();
  else if (action === 'keep-pending-realm-collaboration') closeDiscard();
  else if (action === 'confirm-discard-pending-realm-collaboration') confirmDiscard();
  else if (action === 'return-realm-collaboration-confirmation') returnConfirmation();
  else if (action === 'confirm-realm-collaboration-handshake') confirmHandshake();
  else if (action === 'resume-matching-realm-collaboration') resumeMatchingProposal();
  else closeHandshake();
}

function handleKeydown(event) {
  if (event.key === 'Escape' && discardOpen) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeDiscard();
  }
}

function handleHashChange() {
  consumeConfirmationTransport();
  scheduleEnhancement();
}

document.addEventListener('click', handleClickCapture, true);
document.addEventListener('keydown', handleKeydown, true);
window.addEventListener('hashchange', handleHashChange);
window.addEventListener('storage', scheduleEnhancement);
window.addEventListener('creatorverse:collaboration-confirmation-consumed', scheduleEnhancement);
const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(app, { childList: true, subtree: true });
}
consumeConfirmationTransport();
scheduleEnhancement();
