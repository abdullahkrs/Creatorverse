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
    confirmationFocusPending = true;
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
        confirmationFocusPending = true;
      }
    } else {
      clearRealmCollaborationConfirmationPreview(sessionStorage);
      confirmationInvalid = true;
      confirmationFocusPending = true;
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
  }[proposalState] || confirmationMessage;
}

function returnMessage(copy) {
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

function readySection() {
  return document.querySelector('[data-realm-continuation][data-state="ready"]');
}

function collaborationPanel(section = readySection()) {
  return section?.querySelector(':scope > [data-realm-collaboration]') || null;
}

function ensurePanelOpen(section) {
  const current = collaborationPanel(section);
  if (current) return current;
  const trigger = section?.querySelector('[data-action="open-realm-collaboration"]');
  if (trigger) trigger.click();
  return collaborationPanel(section);
}

function applyPanelMarkup(panel, markup, key) {
  if (!panel) return null;
  if (panel.dataset.handshakeKey === key) return panel;
  const next = parseMarkup(markup);
  const renderKey = panel.dataset.renderKey;
  panel.className = next.className;
  for (const attribute of [...panel.attributes]) {
    if (attribute.name.startsWith('data-') && !['data-realm-collaboration', 'data-render-key'].includes(attribute.name)) {
      panel.removeAttribute(attribute.name);
    }
  }
  for (const attribute of [...next.attributes]) {
    if (attribute.name !== 'class') panel.setAttribute(attribute.name, attribute.value);
  }
  panel.replaceChildren(...next.childNodes);
  panel.dataset.handshakeKey = key;
  if (renderKey) panel.dataset.renderKey = renderKey;
  return panel;
}

function realmFromRecord(record) {
  return { id: record.sourceRealmId, name: record.sourceName, theme: record.sourceTheme };
}

function classifyConfirmation(realm, confirmation) {
  if (!confirmation || confirmation.sourceRealmId !== realm.id || confirmation.acceptingRealmId === realm.id) {
    return { status: 'mismatch', pending: null };
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
  if (pending.status === 'empty') return { status: 'no-pending', pending: null };
  if (pending.status !== 'ready') return { status: 'storage', pending: null };
  const matches = pending.proposal.proposalId === confirmation.proposalId
    && pending.proposal.sourceRealmId === confirmation.sourceRealmId
    && pending.proposal.sourceName === realm.name
    && pending.proposal.sourceTheme === realm.theme;
  return matches
    ? { status: 'ready', pending: pending.proposal }
    : { status: 'mismatch', pending: pending.proposal };
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
  if (!panel || !collaboration?.record || !['linked', 'removal-confirmation'].includes(panel.dataset.state)) return;
  const copy = getRealmCollaborationCopy(locale);
  const action = sharePresentation(copy, returnController, returnState, copy.returnConfirmation);
  const manual = ['denied', 'failed', 'unsupported'].includes(returnState) ? returnOutcome?.url || '' : '';
  const key = `${locale}:${collaboration.record.proposalId}:${returnState}:${manual}`;
  const existing = panel.querySelector('[data-handshake-return]');
  if (existing?.dataset.returnKey === key) return;
  const next = parseMarkup(renderReturnConfirmationControl({
    locale,
    action,
    message: returnMessage(copy),
    manualUrl: manual,
  }));
  next.dataset.returnKey = key;
  if (existing) existing.replaceWith(next);
  else panel.append(next);
}

function focusWithin(panel, selector) {
  if (!selector || !panel) return;
  queueMicrotask(() => panel.querySelector(selector)?.focus({ preventScroll: true }));
}

function restoreBasePanel(nextFocus = '[data-action="open-realm-collaboration"]') {
  const section = readySection();
  const panel = collaborationPanel(section);
  panel?.remove();
  const trigger = section?.querySelector('[data-action="open-realm-collaboration"]');
  trigger?.click();
  focusSelector = nextFocus;
  scheduleEnhancement();
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
        const kind = confirmationInvalid ? 'invalid' : 'no-pending';
        const panel = renderStandalone(renderHandshakeError({ locale, kind }), `${locale}:${kind}`);
        if (confirmationFocusPending || focusSelector) {
          const selector = focusSelector || '#realm-handshake-title';
          confirmationFocusPending = false;
          focusSelector = '';
          focusWithin(panel, selector);
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
        markup = renderHandshakeSuccess({
          locale,
          local: realm,
          accepting: realmFromRecord(confirmationSuccess),
          message: confirmationMessage,
        });
        key = `${locale}:success:${confirmationSuccess.proposalId}:${confirmationMessage}`;
      } else if (confirmationInvalid) {
        markup = renderHandshakeError({ locale, kind: 'invalid' });
        key = `${locale}:invalid-confirmation`;
      } else {
        const classification = classifyConfirmation(realm, preview);
        const effectiveStatus = confirmationOperation && confirmationOperation !== 'confirming'
          ? confirmationOperation
          : classification.status;

        if (classification.status === 'duplicate') {
          confirmationSuccess = classification.record;
          confirmationFocusPending = false;
          clearRealmCollaborationConfirmationPreview(sessionStorage);
          markup = renderHandshakeSuccess({
            locale,
            local: realm,
            accepting: realmFromRecord(classification.record),
          });
          key = `${locale}:duplicate:${classification.record.proposalId}`;
        } else if (effectiveStatus === 'ready' || confirmationOperation === 'confirming') {
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
          key = `${locale}:preview:${preview.proposalId}:${confirmationOperation}:${confirmationMessage}`;
        } else {
          const kind = ['storage', 'mismatch', 'no-pending', 'already-linked'].includes(effectiveStatus)
            ? effectiveStatus
            : 'invalid';
          markup = renderHandshakeError({
            locale,
            kind,
            message: confirmationMessage,
            hasPending: Boolean(classification.pending),
          });
          key = `${locale}:error:${kind}:${Boolean(classification.pending)}:${confirmationMessage}`;
        }
      }

      panel = applyPanelMarkup(panel, markup, key);
      if (confirmationFocusPending || focusSelector) {
        const selector = focusSelector || '#realm-handshake-title';
        confirmationFocusPending = false;
        focusSelector = '';
        focusWithin(panel, selector);
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
      }), `${locale}:pending:${pending.proposal.proposalId}:${proposalState}:${discardOpen}:${confirmationMessage}`);
      if (focusSelector) {
        const selector = focusSelector;
        focusSelector = '';
        focusWithin(panel, selector);
      }
      return;
    }

    if (pending.status !== 'empty' && pending.status !== 'ready') {
      panel = ensurePanelOpen(section);
      if (!panel) return;
      panel = applyPanelMarkup(panel, renderHandshakeError({ locale, kind: 'storage' }), `${locale}:pending-storage`);
      if (focusSelector) {
        const selector = focusSelector;
        focusSelector = '';
        focusWithin(panel, selector);
      }
      return;
    }

    if (panel && collaboration.status === 'ready') {
      appendReturnControl(panel, locale, realm, collaboration);
      if (focusSelector) {
        const selector = focusSelector;
        focusSelector = '';
        focusWithin(panel, selector);
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
    confirmationMessage = '';
    syncProposalController(single.realm);
    focusSelector = '[data-action="resume-realm-collaboration"]';
  } else {
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
    confirmationMessage = getRealmCollaborationCopy(getLocale()).pendingDiscarded;
    restoreBasePanel('[data-action="create-realm-collaboration"]');
  } else {
    discardOpen = false;
    confirmationMessage = getRealmCollaborationCopy(getLocale()).storageSupport;
    focusSelector = '#realm-handshake-title';
    scheduleEnhancement();
  }
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
      confirmationMessage = outcome.status === 'success'
        ? getRealmCollaborationCopy(getLocale()).confirmedSupport
        : '';
      confirmationSuccess = outcome.record;
      focusSelector = outcome.status === 'success' ? '#realm-handshake-title' : '';
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

function cancelHandshake() {
  const pending = getSingleCreatorRealm(localStorage);
  clearRealmCollaborationConfirmationPreview(sessionStorage);
  confirmationInvalid = false;
  confirmationOperation = '';
  confirmationMessage = '';
  confirmationSuccess = null;
  if (pending.status === 'ready' && inspectPendingRealmCollaboration(localStorage, pending.realm.id).status === 'ready') {
    focusSelector = '[data-action="resume-realm-collaboration"]';
    scheduleEnhancement();
  } else {
    restoreBasePanel('[data-action="open-realm-collaboration"]');
  }
}

function finishHandshake() {
  clearRealmCollaborationConfirmationPreview(sessionStorage);
  confirmationInvalid = false;
  confirmationOperation = '';
  confirmationMessage = '';
  confirmationSuccess = null;
  restoreBasePanel('[data-action="open-realm-collaboration"]');
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
    if ([
      'accept-realm-collaboration',
      'remove-realm-collaboration',
      'keep-realm-collaboration',
      'confirm-remove-realm-collaboration',
      'open-realm-collaboration',
    ].includes(action)) queueMicrotask(scheduleEnhancement);
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
  else if (action === 'finish-realm-collaboration-handshake') finishHandshake();
  else cancelHandshake();
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
