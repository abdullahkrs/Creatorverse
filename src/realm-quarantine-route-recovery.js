import { parsePrototypeInviteFragment } from './prototype-invite.js';

let recoveryScheduled = false;
let reloadStarted = false;

function recoverUnblockedInviteShell() {
  recoveryScheduled = false;
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
  queueMicrotask(recoverUnblockedInviteShell);
}

window.addEventListener('hashchange', scheduleRecovery);
window.addEventListener('popstate', scheduleRecovery);
