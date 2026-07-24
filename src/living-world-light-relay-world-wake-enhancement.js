import {
  createWorldWakeConnectedPath,
  createWorldWakePresentationMarker,
  deriveWorldWakeModel,
  projectWorldWakeFrame,
  WORLD_WAKE_PHASES,
  WORLD_WAKE_REDUCED_MS,
} from './living-world-light-relay-world-wake.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TEST_FLAG = '__CREATORVERSE_WORLD_WAKE_TEST__';
const TEST_CONTROL = '__CREATORVERSE_WORLD_WAKE_TEST_CONTROL__';
const app = document.querySelector('#app');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');

let active = null;
let syncFrame = 0;
let lastTestState = Object.freeze({ active: false, phase: 'idle' });

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function safeSession(action, fallback = null) {
  try { return action(); } catch { return fallback; }
}

function presentationSeen(marker) {
  return safeSession(() => sessionStorage.getItem(marker), null) === 'seen';
}

function claimPresentation(marker) {
  if (presentationSeen(marker)) return false;
  const stored = safeSession(() => {
    sessionStorage.setItem(marker, 'seen');
    return sessionStorage.getItem(marker) === 'seen';
  }, false);
  return stored === true;
}

function currentRoot() {
  return document.querySelector('[data-living-light-relay][data-route="relay"]');
}

function readModel(root) {
  if (!(root instanceof Element) || root.dataset.phase !== 'ready') return null;
  const target = root.querySelector('[data-light-relay-target="true"]');
  const targetIndex = Number(target?.dataset.lanternIndex);
  if (!Number.isSafeInteger(targetIndex)) return null;
  const latest = root.querySelector(`.signal-lantern.is-active[data-lantern-index="${targetIndex - 1}"]`);
  const later = root.querySelector(`.signal-lantern[data-lantern-index="${targetIndex + 1}"]`);
  const model = deriveWorldWakeModel({
    status: 'ready',
    phase: root.dataset.phase,
    progress: targetIndex,
    completed: false,
    restored: false,
  });
  if (!model.eligible || !latest || !target) return null;
  return Object.freeze({ ...model, latest, target, later });
}

function installOverlay(root, model) {
  const world = root.querySelector('[data-light-relay-world]');
  const unfinished = world?.querySelector('.light-relay-structure.is-unfinished .light-relay-strand');
  const unfinishedPath = unfinished?.getAttribute('d');
  if (!world || !unfinishedPath) return null;

  const overlay = svgElement('g', {
    class: 'world-wake-overlay',
    'data-world-wake-overlay': 'true',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const connected = svgElement('path', {
    class: 'world-wake-connected-span',
    d: createWorldWakeConnectedPath(model.latestActiveIndex),
    pathLength: '100',
    'data-world-wake-connected': 'true',
  });
  const target = svgElement('path', {
    class: 'world-wake-target-span',
    d: unfinishedPath,
    pathLength: '100',
    'data-world-wake-target-span': 'true',
  });
  overlay.append(connected, target);
  world.append(overlay);
  return Object.freeze({ world, overlay, connected, target });
}

function resetTemporaryState(presentation) {
  if (!presentation) return;
  cancelAnimationFrame(presentation.frame);
  clearTimeout(presentation.timer);
  presentation.mediaListener?.();
  presentation.overlay?.remove();
  presentation.model.latest.classList.remove('is-world-wake-latest');
  presentation.model.target.classList.remove('is-world-wake-next');
  presentation.model.latest.style.removeProperty('--world-wake-latest-emphasis');
  presentation.model.latest.querySelector('.lantern-core')?.style.removeProperty('transform');
  presentation.root.removeAttribute('data-world-wake');
  presentation.root.removeAttribute('data-world-wake-phase');
}

function settle(reason = 'settled') {
  if (!active) return;
  const presentation = active;
  active = null;
  resetTemporaryState(presentation);
  lastTestState = Object.freeze({
    active: false,
    phase: WORLD_WAKE_PHASES.SETTLED,
    reason,
    latestActiveIndex: presentation.model.latestActiveIndex,
    targetIndex: presentation.model.targetIndex,
  });
}

function applyFrame(presentation, elapsed) {
  if (!presentation || presentation !== active) return;
  if (!presentation.root.isConnected) {
    settle('teardown');
    return;
  }
  const projection = projectWorldWakeFrame(elapsed);
  if (projection.settled) {
    settle('settled');
    return;
  }

  presentation.root.dataset.worldWake = 'active';
  presentation.root.dataset.worldWakePhase = projection.phase;
  presentation.overlay.dataset.worldWakePhase = projection.phase;
  presentation.connected.style.strokeDashoffset = String(100 * (1 - projection.connectedProgress));
  presentation.connected.style.opacity = String(projection.connectedOpacity);
  presentation.target.style.strokeDashoffset = String(100 * (1 - projection.targetProgress));
  presentation.target.style.opacity = String(projection.targetOpacity);
  presentation.model.latest.style.setProperty('--world-wake-latest-emphasis', String(projection.latestEmphasis));
  presentation.model.latest.querySelector('.lantern-core')?.style.setProperty('transform', `scale(${projection.latestScale.toFixed(4)})`);
  presentation.model.latest.classList.add('is-world-wake-latest');
  presentation.model.target.classList.add('is-world-wake-next');

  lastTestState = Object.freeze({
    active: true,
    phase: projection.phase,
    elapsed: Math.max(0, Number(elapsed) || 0),
    latestActiveIndex: presentation.model.latestActiveIndex,
    targetIndex: presentation.model.targetIndex,
  });
}

function advance(now) {
  if (!active) return;
  const elapsed = Math.max(0, now - active.startedAt);
  applyFrame(active, elapsed);
  if (active && !globalThis[TEST_FLAG]) active.frame = requestAnimationFrame(advance);
}

function installTestControl() {
  if (!globalThis[TEST_FLAG]) return;
  globalThis[TEST_CONTROL] = Object.freeze({
    setElapsed(elapsed) {
      if (!active) return false;
      applyFrame(active, elapsed);
      return true;
    },
    settle() {
      settle('test');
    },
    state() {
      return lastTestState;
    },
  });
}

function startReducedPresentation(presentation) {
  presentation.root.dataset.worldWake = 'active';
  presentation.root.dataset.worldWakePhase = 'reduced';
  presentation.overlay.dataset.worldWakePhase = 'reduced';
  presentation.connected.style.strokeDashoffset = '0';
  presentation.connected.style.opacity = '1';
  presentation.target.style.strokeDashoffset = '0';
  presentation.target.style.opacity = '1';
  presentation.model.latest.classList.add('is-world-wake-latest');
  presentation.model.target.classList.add('is-world-wake-next');
  lastTestState = Object.freeze({
    active: true,
    phase: 'reduced',
    latestActiveIndex: presentation.model.latestActiveIndex,
    targetIndex: presentation.model.targetIndex,
  });
  if (!globalThis[TEST_FLAG]) presentation.timer = setTimeout(() => settle('reduced'), WORLD_WAKE_REDUCED_MS);
}

function startPresentation(root) {
  if (active?.root === root || root.dataset.phase !== 'ready') return;
  if (active) settle('replaced');

  const model = readModel(root);
  if (!model) return;

  let marker;
  try { marker = createWorldWakePresentationMarker(location.hash); } catch { return; }
  if (presentationSeen(marker)) return;

  const overlay = installOverlay(root, model);
  if (!overlay) return;
  if (!claimPresentation(marker)) {
    overlay.overlay.remove();
    return;
  }

  active = {
    root,
    model,
    marker,
    ...overlay,
    frame: 0,
    timer: 0,
    startedAt: performance.now(),
    mediaListener: null,
  };

  const onMotionChange = () => settle('motion-change');
  motionPreference.addEventListener?.('change', onMotionChange, { once: true });
  active.mediaListener = () => motionPreference.removeEventListener?.('change', onMotionChange);
  installTestControl();

  if (motionPreference.matches) {
    startReducedPresentation(active);
    return;
  }

  applyFrame(active, 0);
  if (!globalThis[TEST_FLAG]) active.frame = requestAnimationFrame(advance);
}

function synchronize() {
  const root = currentRoot();
  if (active && (!active.root.isConnected || active.root !== root || active.root.dataset.phase !== 'ready')) settle('route-change');
  if (root) startPresentation(root);
}

function scheduleSynchronize() {
  cancelAnimationFrame(syncFrame);
  syncFrame = requestAnimationFrame(() => {
    syncFrame = 0;
    synchronize();
  });
}

function interruptFromClick(event) {
  if (!active) return;
  const start = event.target.closest?.('[data-start-relay]');
  const locale = event.target.closest?.('[data-relay-locale]');
  if (start || locale) settle(start ? 'contribution' : 'locale-change');
}

function interruptFromKeyboard(event) {
  if (!active || event.repeat || ![' ', 'Enter'].includes(event.key)) return;
  if (event.target.closest?.('[data-start-relay]')) settle('keyboard-contribution');
}

function startFromWorldPointer(event) {
  if (!active || active.root.dataset.phase !== 'ready') return;
  if (!event.target.closest?.('[data-light-relay-world]') || event.target.closest?.('button, a')) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const action = active.root.querySelector('[data-start-relay]');
  if (!action || action.disabled) return;
  event.preventDefault();
  event.stopPropagation();
  settle('world-pointer-contribution');
  action.click();
}

if (app) {
  const observer = new MutationObserver(scheduleSynchronize);
  observer.observe(app, { childList: true, subtree: true });
  document.addEventListener('click', interruptFromClick, true);
  document.addEventListener('keydown', interruptFromKeyboard, true);
  document.addEventListener('pointerdown', startFromWorldPointer, true);
  addEventListener('hashchange', () => {
    settle('navigation');
    scheduleSynchronize();
  });
  addEventListener('popstate', () => {
    settle('navigation');
    scheduleSynchronize();
  });
  addEventListener('beforeunload', () => settle('teardown'));
  scheduleSynchronize();
}
