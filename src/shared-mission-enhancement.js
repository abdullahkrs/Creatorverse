import './shared-mission.css';
import { getLocale } from './i18n.js';
import { getSingleCreatorRealm } from './creator-ledger.js';
import { applyMissionActivation, createMissionProgress } from './mission-templates.js';
import { inspectRealmCollaboration } from './realm-collaboration.js';
import {
  SHARED_MISSION_INVITE_FRAGMENT,
  SHARED_MISSION_INVITE_KEY,
  SHARED_MISSION_ISSUED_KEY,
  SHARED_MISSION_PROGRESS_KEY,
  SHARED_MISSION_RECEIPT_FRAGMENT,
  SHARED_MISSION_RECEIPT_KEY,
  classifySharedMissionInvite,
  createEmptySharedMissionProgress,
  createSharedMissionInvite,
  createSharedMissionReceipts,
  decodeSharedMissionReceipt,
  encodeSharedMissionInvite,
  importSharedMissionReceipt,
  inspectSharedMissionReceiptForCreator,
  isValidSharedMissionInvite,
  parseSharedMissionInviteFragment,
  parseSharedMissionReceiptFragment,
  readSharedMissionInvitePreview,
  readSharedMissionProgress,
  readSharedMissionReceiptPreview,
  writeSharedMissionInvitePreview,
  writeSharedMissionProgress,
  writeSharedMissionReceiptPreview,
} from './shared-mission.js';
import { getSharedMissionCopy } from './shared-mission-i18n.js';
import {
  renderSharedMissionError,
  renderSharedMissionFollower,
  renderSharedMissionReceiptPreview,
  renderSharedMissionSetup,
  renderSharedMissionTrigger,
} from './shared-mission-view.js';

const DEFAULT_DRAFT = Object.freeze({ missionId: 'route-choice', scheduleId: 'now-1h' });
const EXTERNAL_HIDDEN_SELECTOR = '.experience, [data-realm-continuation], .creator-tools, .nav-create';

let scheduled = false;
let applying = false;
let setupOpen = false;
let setupDraft = { ...DEFAULT_DRAFT };
let issuedInvite = null;
let setupAction = { state: 'idle', mode: 'copy' };
let setupMessage = '';
let setupForceCopy = false;
let followerMessage = '';
let incomingInvalid = false;
let importStatus = '';
let importing = false;
let focusTarget = '';
let receiptActions = [
  { state: 'idle', mode: 'copy', message: '', forceCopy: false },
  { state: 'idle', mode: 'copy', message: '', forceCopy: false },
];

function currentBaseUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function exactTransportUrl(key, token) {
  const url = new URL(currentBaseUrl());
  url.hash = `${key}=${token}`;
  return url.toString();
}

function safeCopyText(text) {
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

async function activateCapability({ url, title, text, forceCopy = false }) {
  const canShare = !forceCopy && typeof navigator.share === 'function';
  const mode = canShare ? 'share' : 'copy';
  try {
    if (canShare) {
      await navigator.share({ title, text, url });
      return { status: 'shared', mode };
    }
    if (typeof navigator.clipboard?.writeText !== 'function' && typeof document.execCommand !== 'function') {
      return { status: 'unsupported', mode };
    }
    await safeCopyText(`${text}\n${url}`.trim());
    return { status: 'copied', mode };
  } catch (error) {
    if (canShare && error?.name === 'AbortError') return { status: 'cancelled', mode };
    if (canShare && ['NotAllowedError', 'SecurityError'].includes(error?.name)) return { status: 'denied', mode };
    return { status: 'failed', mode };
  }
}

function shareMessage(copy, state, kind = 'invite') {
  if (kind === 'receipt') {
    return {
      shared: copy.receiptShared,
      copied: copy.receiptCopied,
      cancelled: copy.receiptCancelled,
      denied: copy.receiptDenied,
      failed: copy.receiptFailed,
      unsupported: copy.receiptFailed,
    }[state] || '';
  }
  return {
    shared: copy.shared,
    copied: copy.copied,
    cancelled: copy.cancelled,
    denied: copy.denied,
    failed: copy.failed,
    unsupported: copy.failed,
  }[state] || '';
}

function readIssuedInvite() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SHARED_MISSION_ISSUED_KEY) || 'null');
    if (!isValidSharedMissionInvite(parsed)) return null;
    const token = encodeSharedMissionInvite(parsed);
    return Object.freeze({ invite: parsed, token, url: exactTransportUrl(SHARED_MISSION_INVITE_FRAGMENT, token) });
  } catch {
    return null;
  }
}

function persistIssuedInvite(invite) {
  sessionStorage.setItem(SHARED_MISSION_ISSUED_KEY, JSON.stringify(invite.invite));
  const restored = readIssuedInvite();
  if (!restored || restored.invite.missionInstanceId !== invite.invite.missionInstanceId) {
    throw new TypeError('SHARED_ISSUED_WRITE_NOT_VERIFIED');
  }
  return restored;
}

function clearIssuedInvite() {
  try { sessionStorage.removeItem(SHARED_MISSION_ISSUED_KEY); } catch {}
}

function clearInvitePreview() {
  try {
    sessionStorage.removeItem(SHARED_MISSION_INVITE_KEY);
    sessionStorage.removeItem(SHARED_MISSION_PROGRESS_KEY);
  } catch {}
}

function clearReceiptPreview() {
  try { sessionStorage.removeItem(SHARED_MISSION_RECEIPT_KEY); } catch {}
}

function consumeIncomingTransport() {
  const url = new URL(window.location.href);
  const queryHasInvite = url.searchParams.has(SHARED_MISSION_INVITE_FRAGMENT);
  const queryHasReceipt = url.searchParams.has(SHARED_MISSION_RECEIPT_FRAGMENT);
  const hashHasInvite = window.location.hash.includes(SHARED_MISSION_INVITE_FRAGMENT);
  const hashHasReceipt = window.location.hash.includes(SHARED_MISSION_RECEIPT_FRAGMENT);
  if (!queryHasInvite && !queryHasReceipt && !hashHasInvite && !hashHasReceipt) return;

  let valid = false;
  try {
    if (!queryHasInvite && !queryHasReceipt && hashHasInvite && !hashHasReceipt) {
      const parsed = parseSharedMissionInviteFragment(window.location.hash, { now: Date.now() });
      if (parsed.status === 'valid') {
        clearReceiptPreview();
        const currentProgress = readSharedMissionProgress(sessionStorage, parsed.invite);
        if (currentProgress.missionInstanceId !== parsed.invite.missionInstanceId) {
          sessionStorage.removeItem(SHARED_MISSION_PROGRESS_KEY);
        }
        writeSharedMissionInvitePreview(sessionStorage, parsed.invite);
        importStatus = '';
        incomingInvalid = false;
        valid = true;
        focusTarget = '#shared-mission-follower-title';
      }
    } else if (!queryHasInvite && !queryHasReceipt && hashHasReceipt && !hashHasInvite) {
      const parsed = parseSharedMissionReceiptFragment(window.location.hash);
      if (parsed.status === 'valid') {
        clearInvitePreview();
        writeSharedMissionReceiptPreview(sessionStorage, parsed.receipt);
        importStatus = '';
        incomingInvalid = false;
        valid = true;
        focusTarget = '#shared-mission-import-title';
      }
    }
  } catch {
    valid = false;
  }

  if (!valid) {
    clearInvitePreview();
    clearReceiptPreview();
    importStatus = '';
    incomingInvalid = true;
    focusTarget = '#shared-mission-error-title';
  }
  url.searchParams.delete(SHARED_MISSION_INVITE_FRAGMENT);
  url.searchParams.delete(SHARED_MISSION_RECEIPT_FRAGMENT);
  url.hash = '';
  history.replaceState(history.state, '', `${url.pathname}${url.search}`);
}

function markExternalContent(hidden) {
  document.querySelectorAll(EXTERNAL_HIDDEN_SELECTOR).forEach(element => {
    if (hidden) {
      if (!element.hasAttribute('hidden')) {
        element.setAttribute('data-shared-external-hidden', 'true');
        element.setAttribute('hidden', '');
      }
    } else if (element.dataset.sharedExternalHidden === 'true') {
      element.removeAttribute('hidden');
      delete element.dataset.sharedExternalHidden;
    }
  });
}

function shellHost() {
  const main = document.querySelector('main') || document.body;
  let shell = main.querySelector(':scope > [data-shared-mission-shell]');
  if (!shell) {
    shell = document.createElement('div');
    shell.className = 'shared-mission-shell';
    shell.dataset.sharedMissionShell = 'true';
    main.append(shell);
  }
  return shell;
}

function renderExternal(markup, key) {
  markExternalContent(true);
  const shell = shellHost();
  if (shell.dataset.renderKey !== key) {
    shell.dataset.renderKey = key;
    shell.innerHTML = markup.trim();
  }
  if (focusTarget) {
    const selector = focusTarget;
    focusTarget = '';
    queueMicrotask(() => shell.querySelector(selector)?.focus({ preventScroll: true }));
  }
}

function clearExternal() {
  document.querySelector('[data-shared-mission-shell]')?.remove();
  markExternalContent(false);
}

function collaborationContext() {
  const single = getSingleCreatorRealm(localStorage);
  if (single.status !== 'ready') return { status: single.status, realm: null, collaboration: null };
  const collaboration = inspectRealmCollaboration(localStorage, single.realm.id);
  return { status: collaboration.status, realm: single.realm, collaboration: collaboration.record };
}

function ensureTrigger(context) {
  const linkedPanel = document.querySelector('[data-realm-collaboration][data-state="linked"], [data-realm-collaboration][data-state="reciprocal-success"]');
  const actions = linkedPanel?.querySelector('.realm-collaboration-actions, .realm-handshake-actions');
  document.querySelectorAll('[data-action="open-shared-mission"]').forEach(button => {
    if (!actions?.contains(button)) button.remove();
  });
  if (!actions || context.status !== 'ready') return null;
  let trigger = actions.querySelector('[data-action="open-shared-mission"]');
  if (!trigger) {
    const template = document.createElement('template');
    template.innerHTML = renderSharedMissionTrigger(getLocale()).trim();
    trigger = template.content.firstElementChild;
    actions.prepend(trigger);
  }
  const label = getSharedMissionCopy(getLocale()).action;
  if (trigger.textContent !== label) trigger.textContent = label;
  trigger.setAttribute('aria-expanded', String(setupOpen));
  return trigger;
}

function replaceSetupPanel(host, markup, key) {
  let panel = host.querySelector(':scope > [data-shared-mission]');
  if (panel?.dataset.renderKey === key) return panel;
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const next = template.content.firstElementChild;
  next.dataset.renderKey = key;
  if (panel) panel.replaceWith(next);
  else host.append(next);
  return next;
}

function sanitizedFollowerProgress(invite) {
  let progress = readSharedMissionProgress(sessionStorage, invite);
  if (!progress.completed || !progress.result) return progress;
  try {
    if (progress.result.receipts.length !== 2) throw new TypeError('SHARED_RESULT_INVALID');
    const targets = new Set();
    for (const item of progress.result.receipts) {
      const receipt = decodeSharedMissionReceipt(item.token);
      if (receipt.sharedMissionId !== invite.missionInstanceId
        || receipt.completionId !== progress.result.completionId
        || receipt.targetRealmId !== item.targetRealmId
        || ![invite.initiatorRealmId, invite.linkedRealmId].includes(receipt.targetRealmId)
        || item.url !== exactTransportUrl(SHARED_MISSION_RECEIPT_FRAGMENT, item.token)) {
        throw new TypeError('SHARED_RESULT_BINDING_INVALID');
      }
      const expectedName = receipt.targetRealmId === invite.initiatorRealmId ? invite.initiatorName : invite.linkedName;
      if (item.targetName !== expectedName) throw new TypeError('SHARED_RESULT_NAME_INVALID');
      targets.add(receipt.targetRealmId);
    }
    if (targets.size !== 2) throw new TypeError('SHARED_RESULT_TARGETS_INVALID');
    return progress;
  } catch {
    try { sessionStorage.removeItem(SHARED_MISSION_PROGRESS_KEY); } catch {}
    followerMessage = getSharedMissionCopy(getLocale()).storageSupport;
    return createEmptySharedMissionProgress(invite);
  }
}

function followerActionPresentation(action, copy) {
  const mode = action.forceCopy || typeof navigator.share !== 'function' ? 'copy' : 'share';
  return { ...action, mode, message: action.message || shareMessage(copy, action.state, 'receipt') };
}

function applyEnhancement() {
  if (applying) return;
  applying = true;
  try {
    const locale = getLocale();
    const copy = getSharedMissionCopy(locale);
    const receipt = readSharedMissionReceiptPreview(sessionStorage);
    const invite = readSharedMissionInvitePreview(sessionStorage, { now: Date.now() });

    if (receipt) {
      const inspected = inspectSharedMissionReceiptForCreator(localStorage, receipt);
      const status = importStatus || inspected.status;
      renderExternal(renderSharedMissionReceiptPreview({
        locale,
        receipt,
        status,
        realm: inspected.realm,
        importing,
      }), `${locale}:receipt:${receipt.receiptId}:${status}:${importing}`);
      return;
    }

    if (invite) {
      const classified = classifySharedMissionInvite(invite, Date.now());
      if (classified.status !== 'ready') {
        renderExternal(renderSharedMissionError({ locale, kind: 'invalid' }), `${locale}:invite-invalid`);
        return;
      }
      const progress = sanitizedFollowerProgress(invite);
      const actions = receiptActions.map(action => followerActionPresentation(action, copy));
      renderExternal(renderSharedMissionFollower({
        locale,
        invite,
        windowState: classified.state,
        progress,
        message: followerMessage,
        receiptActions: actions,
      }), `${locale}:follower:${invite.missionInstanceId}:${classified.state}:${progress.roleId}:${progress.step}:${progress.completed}:${progress.result?.completionId || ''}:${actions.map(action => `${action.state}:${action.mode}`).join('|')}:${followerMessage}`);
      return;
    }

    if (incomingInvalid) {
      renderExternal(renderSharedMissionError({ locale, kind: 'invalid' }), `${locale}:transport-invalid`);
      return;
    }

    clearExternal();
    const context = collaborationContext();
    const trigger = ensureTrigger(context);
    if (!trigger || context.status !== 'ready') {
      setupOpen = false;
      issuedInvite = null;
      document.querySelectorAll('[data-shared-mission]').forEach(element => element.remove());
      return;
    }

    const collaborationPanel = trigger.closest('[data-realm-collaboration]');
    if (!setupOpen || !collaborationPanel) {
      collaborationPanel?.querySelector(':scope > [data-shared-mission]')?.remove();
      return;
    }
    if (!issuedInvite) issuedInvite = readIssuedInvite();
    const actionMode = setupForceCopy || typeof navigator.share !== 'function' ? 'copy' : 'share';
    setupAction = { ...setupAction, mode: actionMode };
    const markup = renderSharedMissionSetup({
      locale,
      realm: context.realm,
      collaboration: context.collaboration,
      draft: setupDraft,
      invite: issuedInvite,
      action: setupAction,
      message: setupMessage,
    });
    const panel = replaceSetupPanel(collaborationPanel, markup, `${locale}:${issuedInvite?.invite.missionInstanceId || 'draft'}:${setupDraft.missionId}:${setupDraft.scheduleId}:${setupAction.state}:${setupAction.mode}:${setupMessage}`);
    trigger.setAttribute('aria-expanded', 'true');
    if (focusTarget) {
      const selector = focusTarget;
      focusTarget = '';
      queueMicrotask(() => panel.querySelector(selector)?.focus({ preventScroll: true }));
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

function openSetup() {
  setupOpen = true;
  setupDraft = { ...DEFAULT_DRAFT };
  issuedInvite = readIssuedInvite();
  setupAction = { state: 'idle', mode: typeof navigator.share === 'function' ? 'share' : 'copy' };
  setupMessage = '';
  setupForceCopy = false;
  focusTarget = '#shared-mission-title';
  scheduleEnhancement();
}

function closeSetup() {
  setupOpen = false;
  issuedInvite = null;
  clearIssuedInvite();
  setupAction = { state: 'idle', mode: 'copy' };
  setupMessage = '';
  setupForceCopy = false;
  focusTarget = '[data-action="open-shared-mission"]';
  scheduleEnhancement();
}

function updateSetupSelection(event) {
  const input = event.target.closest?.('input[name="shared-mission-template"], input[name="shared-mission-window"]');
  if (!input) return;
  if (input.name === 'shared-mission-template') setupDraft.missionId = input.value;
  else setupDraft.scheduleId = input.value;
  clearIssuedInvite();
  issuedInvite = null;
  setupAction = { state: 'idle', mode: typeof navigator.share === 'function' ? 'share' : 'copy' };
  setupMessage = '';
  scheduleEnhancement();
}

function createInvite() {
  const context = collaborationContext();
  if (context.status !== 'ready' || setupAction.state === 'creating') return;
  setupAction = { ...setupAction, state: 'creating' };
  setupMessage = '';
  scheduleEnhancement();
  queueMicrotask(() => {
    const outcome = createSharedMissionInvite(localStorage, context.realm, context.collaboration, setupDraft, {
      now: Date.now(),
      cryptoLike: globalThis.crypto,
      baseUrl: currentBaseUrl(),
    });
    if (outcome.status === 'ready') {
      try {
        issuedInvite = persistIssuedInvite(outcome);
        setupAction = { state: 'idle', mode: typeof navigator.share === 'function' ? 'share' : 'copy' };
        focusTarget = '#shared-mission-title';
      } catch {
        clearIssuedInvite();
        issuedInvite = null;
        setupAction = { state: 'failed', mode: 'copy' };
        setupMessage = copyForCurrentLocale().storageSupport;
      }
    } else {
      setupAction = { state: 'failed', mode: 'copy' };
      setupMessage = copyForCurrentLocale().mismatchSupport;
    }
    scheduleEnhancement();
  });
}

function copyForCurrentLocale() {
  return getSharedMissionCopy(getLocale());
}

async function shareInvite() {
  if (!issuedInvite?.url || setupAction.state === 'pending') return;
  const context = collaborationContext();
  if (context.status !== 'ready') return;
  const copy = copyForCurrentLocale();
  setupAction = { ...setupAction, state: 'pending' };
  focusTarget = '[data-action="share-shared-mission"]';
  scheduleEnhancement();
  const outcome = await activateCapability({
    url: issuedInvite.url,
    title: copy.inviteReadyTitle,
    text: `${context.realm.name} · ${context.collaboration.sourceName}`,
    forceCopy: setupForceCopy,
  });
  setupAction = { state: outcome.status, mode: outcome.mode };
  setupMessage = shareMessage(copy, outcome.status, 'invite');
  if (['denied', 'unsupported'].includes(outcome.status)) setupForceCopy = true;
  focusTarget = '[data-action="share-shared-mission"]';
  scheduleEnhancement();
}

function selectFollowerRole(button) {
  const invite = readSharedMissionInvitePreview(sessionStorage, { now: Date.now() });
  if (!invite) return;
  const current = sanitizedFollowerProgress(invite);
  if (current.completed) return;
  const next = { ...current, roleId: button.dataset.role, step: 0, routeId: '', result: null };
  try {
    writeSharedMissionProgress(sessionStorage, next, invite);
    followerMessage = '';
    focusTarget = '#shared-mission-follower-title';
  } catch {
    followerMessage = copyForCurrentLocale().storageSupport;
  }
  scheduleEnhancement();
}

function routeForCompletion(missionId, command) {
  if (missionId === 'route-choice') return command;
  return missionId === 'signal-match' ? 'ocean' : 'sky';
}

function activateFollowerMission(button) {
  const invite = readSharedMissionInvitePreview(sessionStorage, { now: Date.now() });
  if (!invite || classifySharedMissionInvite(invite, Date.now()).state !== 'active') return;
  const current = sanitizedFollowerProgress(invite);
  if (!current.roleId || current.completed) return;
  const command = button.dataset.command;
  const base = Object.freeze({
    ...createMissionProgress(invite.missionId),
    step: current.step,
    completed: false,
    contribution: 0,
  });
  const applied = applyMissionActivation(base, command);
  if (applied === base) {
    if (invite.missionId === 'signal-match' && command !== 'wave') {
      followerMessage = copyForCurrentLocale().signalMismatch;
      focusTarget = `[data-command="${CSS.escape(command)}"]`;
      scheduleEnhancement();
    }
    return;
  }

  const routeId = applied.completed ? routeForCompletion(invite.missionId, command) : '';
  let next = { ...current, step: applied.step, completed: false, routeId: '', result: null };
  if (applied.completed) {
    const outcome = createSharedMissionReceipts(invite, { roleId: current.roleId, routeId }, {
      now: Date.now(),
      cryptoLike: globalThis.crypto,
      baseUrl: currentBaseUrl(),
    });
    if (outcome.status !== 'ready') {
      followerMessage = copyForCurrentLocale().storageSupport;
      scheduleEnhancement();
      return;
    }
    next = {
      ...current,
      step: applied.step,
      completed: true,
      routeId,
      result: {
        completionId: outcome.completionId,
        receipts: outcome.receipts.map(item => ({
          targetRealmId: item.targetRealmId,
          targetName: item.targetName,
          token: item.token,
          url: item.url,
        })),
      },
    };
  }
  try {
    writeSharedMissionProgress(sessionStorage, next, invite);
    followerMessage = '';
    if (next.completed) {
      receiptActions = [
        { state: 'idle', mode: typeof navigator.share === 'function' ? 'share' : 'copy', message: '', forceCopy: false },
        { state: 'idle', mode: typeof navigator.share === 'function' ? 'share' : 'copy', message: '', forceCopy: false },
      ];
      focusTarget = '#shared-mission-follower-title';
    } else {
      focusTarget = `[data-command="${next.step + 1}"]`;
    }
  } catch {
    followerMessage = copyForCurrentLocale().storageSupport;
  }
  scheduleEnhancement();
}

async function shareReceipt(button) {
  const invite = readSharedMissionInvitePreview(sessionStorage, { now: Date.now() });
  if (!invite) return;
  const progress = sanitizedFollowerProgress(invite);
  const index = Number(button.dataset.receiptIndex);
  const item = progress.result?.receipts?.[index];
  const action = receiptActions[index];
  if (!item || !action || action.state === 'pending') return;
  const copy = copyForCurrentLocale();
  receiptActions[index] = { ...action, state: 'pending', message: '' };
  focusTarget = `[data-action="share-shared-receipt"][data-receipt-index="${index}"]`;
  scheduleEnhancement();
  const outcome = await activateCapability({
    url: item.url,
    title: copy.completeTitle,
    text: `${copy.receiptFor} ${item.targetName} · +3`,
    forceCopy: action.forceCopy,
  });
  receiptActions[index] = {
    state: outcome.status,
    mode: outcome.mode,
    message: shareMessage(copy, outcome.status, 'receipt'),
    forceCopy: action.forceCopy || ['denied', 'unsupported'].includes(outcome.status),
  };
  focusTarget = `[data-action="share-shared-receipt"][data-receipt-index="${index}"]`;
  scheduleEnhancement();
}

function importReceipt() {
  const receipt = readSharedMissionReceiptPreview(sessionStorage);
  if (!receipt || importing) return;
  importing = true;
  focusTarget = '[data-action="import-shared-receipt"]';
  scheduleEnhancement();
  queueMicrotask(() => {
    const outcome = importSharedMissionReceipt(localStorage, receipt);
    importing = false;
    importStatus = outcome.status;
    focusTarget = '#shared-mission-import-title';
    scheduleEnhancement();
  });
}

function discardExternal(kind = 'all') {
  if (kind !== 'receipt') clearInvitePreview();
  if (kind !== 'invite') clearReceiptPreview();
  incomingInvalid = false;
  importStatus = '';
  importing = false;
  followerMessage = '';
  receiptActions = [
    { state: 'idle', mode: 'copy', message: '', forceCopy: false },
    { state: 'idle', mode: 'copy', message: '', forceCopy: false },
  ];
  clearExternal();
  focusTarget = '[data-action="open-realm-continuation"], .nav-create';
  scheduleEnhancement();
}

function handleClick(event) {
  const action = event.target.closest?.('[data-action]');
  if (!action) return;
  if (action.dataset.action === 'open-shared-mission') openSetup();
  else if (action.dataset.action === 'close-shared-mission') closeSetup();
  else if (action.dataset.action === 'share-shared-mission') shareInvite();
  else if (action.dataset.action === 'select-shared-role') selectFollowerRole(action);
  else if (action.dataset.action === 'activate-shared-mission') activateFollowerMission(action);
  else if (action.dataset.action === 'share-shared-receipt') shareReceipt(action);
  else if (action.dataset.action === 'import-shared-receipt') importReceipt();
  else if (action.dataset.action === 'discard-shared-receipt') discardExternal('receipt');
  else if (action.dataset.action === 'discard-shared-mission') discardExternal('invite');
}

function handleSubmit(event) {
  if (!event.target.matches?.('[data-form="shared-mission"]')) return;
  event.preventDefault();
  createInvite();
}

function handleKeydown(event) {
  if (event.key === 'Escape' && setupOpen) {
    event.preventDefault();
    closeSetup();
  }
}

function handleHashChange() {
  consumeIncomingTransport();
  scheduleEnhancement();
}

document.addEventListener('click', handleClick);
document.addEventListener('change', updateSetupSelection);
document.addEventListener('submit', handleSubmit);
document.addEventListener('keydown', handleKeydown);
window.addEventListener('hashchange', handleHashChange);
window.addEventListener('storage', scheduleEnhancement);
const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(app, { childList: true, subtree: true });
}
consumeIncomingTransport();
scheduleEnhancement();
