const LEGACY_HOST = '[data-mission-legacy-triggers]';
const legacyTriggers = new Map();

function rememberAndDetachLegacyRoutes(root = document) {
  root.querySelectorAll(`${LEGACY_HOST} [data-route]`).forEach(button => {
    const routeId = button.dataset.route;
    if (!routeId) return;
    button.dataset.legacyRoute = routeId;
    button.removeAttribute('data-route');
    legacyTriggers.set(routeId, button);
  });

  root.querySelectorAll(`${LEGACY_HOST} [data-legacy-route]`).forEach(button => {
    const routeId = button.dataset.legacyRoute;
    if (routeId) legacyTriggers.set(routeId, button);
  });
}

function restoreDetachedLegacyRoutes(root = document) {
  const host = root.querySelector(LEGACY_HOST);
  if (!host) return;

  legacyTriggers.forEach(trigger => {
    if (!host.contains(trigger)) host.append(trigger);
  });
}

function synchronizeLegacyRoutes(root = document) {
  rememberAndDetachLegacyRoutes(root);
  restoreDetachedLegacyRoutes(root);
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

  const trigger = legacyTriggers.get(context.routeId)
    || document.querySelector(`${LEGACY_HOST} [data-legacy-route="${CSS.escape(context.routeId)}"]`);
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
  new MutationObserver(() => synchronizeLegacyRoutes(app)).observe(app, {
    childList: true,
    subtree: true,
  });
}

synchronizeLegacyRoutes();
