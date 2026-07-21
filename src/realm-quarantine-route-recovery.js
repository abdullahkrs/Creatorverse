import { parsePrototypeInviteFragment } from './prototype-invite.js';

const RECOVERY_DELAY_MS = 75;

let recoveryScheduled = false;
let recoveryTimer = 0;
let reloadStarted = false;

function recoverUnblockedInviteShell() {
  recoveryScheduled = false;
  recoveryTimer = 0;
  if (reloadStarted) return;

  const quarantineState = document.querySelector('[data-realm-quarantine-state]');
  if (!quarantineState) return;

  const parsed = parsePrototypeInviteFragment(window.location.hash);
  if (parsed.status !== 'valid' || !parsed.invite.realmId) return;

  // The primary quarantine guard runs first. A remaining valid fragment plus no
  // active block means this is a different or explicitly restored realm, while
  // the document still contains the old quarantine panel instead of the base
  // experience shell. Reload only this safe transition so the existing render
  // pipeline rebuilds the follower experience and clears stale mission state.
  if (globalThis.__creatorverseRealmQuarantineBlocked) return;

  reloadStarted = true;
  window.location.reload();
}

function scheduleRecovery() {
  if (recoveryScheduled || reloadStarted) return;
  recoveryScheduled = true;

  // Yield briefly to an explicit full navigation initiated by the same route
  // change. Its beforeunload cancels this document's timer, preventing two
  // competing reloads while preserving automatic same-tab hash recovery.
  recoveryTimer = window.setTimeout(recoverUnblockedInviteShell, RECOVERY_DELAY_MS);
}

window.addEventListener('beforeunload', () => {
  if (recoveryTimer) window.clearTimeout(recoveryTimer);
  recoveryTimer = 0;
  recoveryScheduled = false;
});
window.addEventListener('hashchange', scheduleRecovery);
window.addEventListener('popstate', scheduleRecovery);
