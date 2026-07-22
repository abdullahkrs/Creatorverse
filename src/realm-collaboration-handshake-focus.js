let confirmationFocusPending = false;

function successHeading() {
  return document.querySelector(
    '[data-realm-collaboration][data-state="reciprocal-success"] #realm-handshake-title',
  );
}

function focusConfirmedHeading() {
  if (!confirmationFocusPending) return;
  const heading = successHeading();
  if (!heading) return;

  confirmationFocusPending = false;
  requestAnimationFrame(() => {
    successHeading()?.focus({ preventScroll: true });
  });
}

function resetSameDocumentConfirmation(event) {
  if (!location.hash.includes('collab-confirm') || !successHeading()) return;
  event.stopImmediatePropagation();
  location.reload();
}

document.addEventListener('click', event => {
  const action = event.target.closest?.('[data-action="confirm-realm-collaboration-handshake"]');
  if (!action || action.disabled || action.getAttribute('aria-busy') === 'true') return;
  confirmationFocusPending = true;
}, true);

window.addEventListener('hashchange', resetSameDocumentConfirmation, true);

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(focusConfirmedHeading);
  observer.observe(app, { childList: true, subtree: true });
}
