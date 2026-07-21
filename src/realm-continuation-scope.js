const PANEL_SELECTOR = '[data-realm-continuation]';
const SETTLED_RECEIPT_STATES = new Set(['success', 'duplicate']);

function hasInviteOrReceiptRoute() {
  const parameters = new URLSearchParams(window.location.hash.replace(/^#/u, ''));
  return parameters.has('invite') || parameters.has('receipt');
}

function routedWorkflowActive() {
  return Boolean(globalThis.__creatorverseCompletionReceiptActive || hasInviteOrReceiptRoute());
}

function competingWorkflowActive() {
  return Boolean(
    routedWorkflowActive()
    || document.querySelector(
      '[data-completion-receipt-view], .creator-studio, [data-prototype-follower-entry], [data-prototype-invite-error], [data-mission-result]',
    ),
  );
}

function getCompletionReceiptState(completionRecord) {
  const renderKey = completionRecord
    ?.closest('[data-completion-receipt-view]')
    ?.dataset.renderKey || '';
  const parts = renderKey.split(':');
  return parts.length > 1 ? parts[1] : '';
}

function allowsContinuation(completionRecord) {
  return SETTLED_RECEIPT_STATES.has(getCompletionReceiptState(completionRecord));
}

function shouldSuppress(panel) {
  const completionRecord = panel.closest('.completion-record');
  if (completionRecord) return !allowsContinuation(completionRecord);
  return competingWorkflowActive();
}

function reconcileActionHierarchy(panel, suppressed) {
  const completionRecord = panel.closest('.completion-record');
  const updateAction = completionRecord?.querySelector('.creator-realm-update-action');
  if (!updateAction) return;
  const continuationIsDominant = !suppressed && allowsContinuation(completionRecord);
  updateAction.classList.toggle('primary', !continuationIsDominant);
  updateAction.classList.toggle('secondary', continuationIsDominant);
}

function reconcileContinuationScope() {
  document.querySelectorAll(PANEL_SELECTOR).forEach(panel => {
    const completionRecord = panel.closest('.completion-record');
    if (!completionRecord && routedWorkflowActive()) {
      panel.remove();
      document.querySelector('.experience')?.removeAttribute('hidden');
      return;
    }
    const suppressed = shouldSuppress(panel);
    panel.toggleAttribute('hidden', suppressed);
    panel.style.display = suppressed ? 'none' : '';
    panel.inert = suppressed;
    reconcileActionHierarchy(panel, suppressed);
  });
}

const app = document.querySelector('#app');
if (app) {
  const observer = new MutationObserver(reconcileContinuationScope);
  observer.observe(app, { childList: true, subtree: true });
}
window.addEventListener('hashchange', reconcileContinuationScope);

reconcileContinuationScope();
