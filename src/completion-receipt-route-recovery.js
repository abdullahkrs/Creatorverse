const PENDING_KEY = 'creatorverse-pending-completion-receipt';
const ACTIVE_SELECTOR = '[data-completion-receipt-view]';
let recovering = false;

function routeHas(parameter) {
  const raw = String(window.location.hash || '').replace(/^#/u, '');
  return raw ? new URLSearchParams(raw).has(parameter) : false;
}

function receiptWorkflowActive() {
  return Boolean(
    globalThis.__creatorverseCompletionReceiptActive
    || document.querySelector(ACTIVE_SELECTOR),
  );
}

function recoverRoutedHash() {
  if (recovering
    || !window.location.hash
    || routeHas('receipt')
    || !receiptWorkflowActive()) {
    return;
  }

  recovering = true;
  sessionStorage.removeItem(PENDING_KEY);
  globalThis.__creatorverseCompletionReceiptActive = false;
  window.location.reload();
}

window.addEventListener('hashchange', recoverRoutedHash);
