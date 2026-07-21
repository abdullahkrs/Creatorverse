const PROGRESS_KEYS = Object.freeze([
  'creatorverse-mission-template-state',
  'creatorverse-district-progress',
  'creatorverse-completion-receipt-id',
  'creatorverse-pending-completion-receipt',
]);

let ownedInviteRoute = hasInviteRoute();
let restoring = false;

function routeHas(parameter) {
  const raw = String(window.location.hash || '').replace(/^#/u, '');
  return raw ? new URLSearchParams(raw).has(parameter) : false;
}

function hasInviteRoute() {
  return routeHas('invite');
}

function hasReceiptRoute() {
  return routeHas('receipt');
}

function clearMissionSession() {
  for (const key of PROGRESS_KEYS) sessionStorage.removeItem(key);
  document.querySelectorAll('[data-mission-result], [data-completion-receipt]').forEach(element => element.remove());
  globalThis.dispatchEvent(new CustomEvent('creatorverse:mission-window-reset'));
}

function restoreFeaturedRealm() {
  if (restoring) return;
  restoring = true;
  clearMissionSession();
  history.replaceState(history.state, '', window.location.pathname);
  window.location.reload();
}

function handleRecoveryClick(event) {
  const action = event.target.closest?.('[data-mission-window-status] a[href="#join"]');
  if (!action) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  restoreFeaturedRealm();
}

function handleHashChange() {
  const nextInviteRoute = hasInviteRoute();
  if (ownedInviteRoute && !nextInviteRoute) {
    if (hasReceiptRoute()) {
      ownedInviteRoute = false;
      return;
    }
    restoreFeaturedRealm();
    return;
  }
  ownedInviteRoute = nextInviteRoute;
}

document.addEventListener('click', handleRecoveryClick, true);
window.addEventListener('hashchange', handleHashChange);
