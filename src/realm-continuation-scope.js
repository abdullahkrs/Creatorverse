const PANEL_SELECTOR = '[data-realm-continuation]';

function shouldSuppress(panel) {
  const completionRecord = panel.closest('.completion-record');
  if (completionRecord) return !completionRecord.classList.contains('is-success');
  return Boolean(document.querySelector('.creator-studio'));
}

function reconcileContinuationScope() {
  document.querySelectorAll(PANEL_SELECTOR).forEach(panel => {
    const suppressed = shouldSuppress(panel);
    panel.toggleAttribute('hidden', suppressed);
    panel.inert = suppressed;
    if (suppressed && !panel.closest('.completion-record')) {
      document.querySelector('.experience')?.removeAttribute('hidden');
    }
  });
}

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(reconcileContinuationScope);
  observer.observe(app, { childList: true, subtree: true });
}

reconcileContinuationScope();
