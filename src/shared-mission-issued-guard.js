import { getSingleCreatorRealm } from './creator-ledger.js';
import { inspectRealmCollaboration } from './realm-collaboration.js';
import {
  SHARED_MISSION_ISSUED_KEY,
  isValidSharedMissionInvite,
} from './shared-mission.js';

export function isIssuedSharedMissionBoundToContext(invite, realm, collaboration) {
  return isValidSharedMissionInvite(invite)
    && invite.initiatorRealmId === realm?.id
    && invite.initiatorName === realm?.name
    && invite.initiatorTheme === realm?.theme
    && invite.linkedRealmId === collaboration?.sourceRealmId
    && invite.linkedName === collaboration?.sourceName
    && invite.linkedTheme === collaboration?.sourceTheme
    && invite.relationshipId === collaboration?.proposalId;
}

export function inspectIssuedSharedMissionBinding(localStore, sessionStore) {
  try {
    const raw = sessionStore?.getItem(SHARED_MISSION_ISSUED_KEY);
    if (raw === null || raw === undefined) return { status: 'none' };

    const invite = JSON.parse(raw);
    const single = getSingleCreatorRealm(localStore);
    if (single.status !== 'ready') return { status: 'stale' };

    const collaboration = inspectRealmCollaboration(localStore, single.realm.id);
    if (collaboration.status !== 'ready') return { status: 'stale' };

    return isIssuedSharedMissionBoundToContext(invite, single.realm, collaboration.record)
      ? { status: 'ready', invite }
      : { status: 'stale' };
  } catch {
    return { status: 'stale' };
  }
}

function clearIssuedInvite(sessionStore) {
  try { sessionStore?.removeItem(SHARED_MISSION_ISSUED_KEY); } catch {}
}

function closeStaleSetup() {
  const close = document.querySelector('[data-shared-mission] [data-action="close-shared-mission"]');
  if (close instanceof HTMLButtonElement && !close.disabled) close.click();
}

function normalizeReceiptSelectors(root = document) {
  root.querySelectorAll?.('.shared-mission-receipt-action[data-receipt-index]').forEach(card => {
    card.dataset.receiptCardIndex = card.dataset.receiptIndex;
    card.removeAttribute('data-receipt-index');
  });
}

function enforceIssuedInviteBinding() {
  const inspected = inspectIssuedSharedMissionBinding(localStorage, sessionStorage);
  if (inspected.status !== 'stale') return false;
  clearIssuedInvite(sessionStorage);
  queueMicrotask(closeStaleSetup);
  return true;
}

function enforceRuntimeContracts() {
  normalizeReceiptSelectors();
  enforceIssuedInviteBinding();
}

function handleClickCapture(event) {
  const control = event.target.closest?.('[data-action="open-shared-mission"], [data-action="share-shared-mission"]');
  if (!control) return;

  const stale = enforceIssuedInviteBinding();
  if (stale && control.dataset.action === 'share-shared-mission') {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.addEventListener('click', handleClickCapture, true);
  window.addEventListener('storage', enforceRuntimeContracts);

  const app = document.querySelector('#app');
  if (app) {
    const observer = new MutationObserver(enforceRuntimeContracts);
    observer.observe(app, { childList: true, subtree: true });
  }

  enforceRuntimeContracts();
}
