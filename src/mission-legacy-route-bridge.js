const LEGACY_HOST = '[data-mission-legacy-triggers]';

function detachLegacyRoutes(root = document) {
  root.querySelectorAll(`${LEGACY_HOST} [data-route]`).forEach(button => {
    button.dataset.legacyRoute = button.dataset.route;
    button.removeAttribute('data-route');
  });
}

function legacyRouteFor(action) {
  const templateId = document.querySelector('.mission')?.dataset.missionTemplate;
  if (templateId === 'route-choice') return action.dataset.missionCommand;
  if (templateId === 'signal-match') return 'ocean';
  return 'sky';
}

function exposeLegacyRouteForCurrentActivation(event) {
  const action = event.target.closest?.('[data-mission-command]');
  if (!action || action.disabled) return;

  const routeId = legacyRouteFor(action);
  const trigger = document.querySelector(`${LEGACY_HOST} [data-legacy-route="${CSS.escape(routeId)}"]`);
  if (!trigger) return;

  trigger.dataset.route = routeId;
  queueMicrotask(() => trigger.removeAttribute('data-route'));
}

document.addEventListener('click', exposeLegacyRouteForCurrentActivation, true);

const app = document.querySelector('#app');
if (app) {
  new MutationObserver(() => detachLegacyRoutes(app)).observe(app, {
    childList: true,
    subtree: true,
  });
}

detachLegacyRoutes();
