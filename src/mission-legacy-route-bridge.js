const LEGACY_HOST = '[data-mission-legacy-triggers]';

function detachLegacyRoutes(root = document) {
  root.querySelectorAll(`${LEGACY_HOST} [data-route]`).forEach(button => {
    button.dataset.legacyRoute = button.dataset.route;
    button.removeAttribute('data-route');
  });
}

function missionContext(action) {
  const templateId = document.querySelector('.mission')?.dataset.missionTemplate;
  const command = action.dataset.missionCommand;

  if (templateId === 'route-choice') {
    return { complete: ['sky', 'ocean'].includes(command), routeId: command };
  }
  if (templateId === 'signal-match') {
    return { complete: command === 'wave', routeId: 'ocean' };
  }
  return { complete: command === '3', routeId: 'sky' };
}

function completeThroughDetachedLegacyTrigger(event) {
  const action = event.target.closest?.('[data-mission-command]');
  if (!action || action.disabled || document.querySelector('[data-mission-result]')) return;

  const context = missionContext(action);
  if (!context.complete) return;

  const trigger = document.querySelector(
    `${LEGACY_HOST} [data-legacy-route="${CSS.escape(context.routeId)}"]`,
  );
  if (!trigger || trigger.disabled) return;

  trigger.dataset.route = context.routeId;
  try {
    trigger.click();
  } finally {
    trigger.removeAttribute('data-route');
  }
}

document.addEventListener('click', completeThroughDetachedLegacyTrigger);

const app = document.querySelector('#app');
if (app) {
  new MutationObserver(() => detachLegacyRoutes(app)).observe(app, {
    childList: true,
    subtree: true,
  });
}

detachLegacyRoutes();
