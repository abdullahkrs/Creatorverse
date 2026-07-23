import {
  createRelayWorldCamera,
  projectRelayLanternState,
} from './living-world-light-relay-focus.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const app = document.querySelector('#app');
let frame = 0;

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function removeStaleTarget(root) {
  if (root.dataset.phase !== 'stale') return;
  root.querySelector('.light-relay-structure')?.remove();
  root.querySelectorAll('.signal-lantern.is-relay-target').forEach(lantern => {
    lantern.classList.remove('is-relay-target', 'is-relay-connected');
    lantern.removeAttribute('data-light-relay-target');
  });
}

function applyLanternStates(root) {
  const phase = root.dataset.phase || 'ready';
  removeStaleTarget(root);

  root.querySelectorAll('.signal-lantern').forEach(lantern => {
    const state = projectRelayLanternState({
      active: lantern.classList.contains('is-active'),
      target: lantern.classList.contains('is-relay-target'),
      connected: lantern.classList.contains('is-relay-connected'),
      phase,
    });

    lantern.dataset.lanternState = state;
    lantern.classList.toggle('is-dormant', state === 'dormant');
    const ring = lantern.querySelector('.lantern-inner-ring');

    if (state === 'target' && !ring) {
      lantern.querySelector('.lantern-core')?.after(svgElement('circle', {
        class: 'lantern-inner-ring',
        cx: 11,
        cy: 34,
        r: 4.5,
        'aria-hidden': 'true',
      }));
    } else if (state !== 'target') {
      ring?.remove();
    }
  });
}

function ensureEnergyBead(root) {
  const existing = root.querySelector('.light-relay-energy-bead');
  const shouldShow = root.dataset.phase === 'active'
    && !matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!shouldShow) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const structure = root.querySelector('.light-relay-structure.is-unfinished');
  const path = structure?.querySelector('.light-relay-strand')?.getAttribute('d');
  if (!structure || !path) return;

  const bead = svgElement('circle', {
    class: 'light-relay-energy-bead',
    r: 8,
    'data-light-relay-energy': 'in-transit',
    'aria-hidden': 'true',
  });
  bead.append(svgElement('animateMotion', {
    dur: '1150ms',
    repeatCount: 'indefinite',
    path,
    rotate: 'auto',
  }));
  structure.append(bead);
}

function cameraTarget(root) {
  const target = root.querySelector('[data-light-relay-target="true"]');
  if (target) return Number(target.dataset.lanternIndex);
  const active = [...root.querySelectorAll('.signal-lantern.is-active')];
  return active.length > 0 ? Number(active.at(-1).dataset.lanternIndex) : 0;
}

function explicitRootTextScale() {
  const value = document.documentElement.style.fontSize.trim();
  if (!value) return 1;
  if (value.endsWith('%')) {
    const percent = Number.parseFloat(value);
    return Number.isFinite(percent) ? percent / 100 : 1;
  }
  if (value.endsWith('px')) {
    const pixels = Number.parseFloat(value);
    return Number.isFinite(pixels) ? pixels / 16 : 1;
  }
  if (value.endsWith('rem') || value.endsWith('em')) {
    const relative = Number.parseFloat(value);
    return Number.isFinite(relative) ? relative : 1;
  }
  return 1;
}

function blockBottomWithinRoot(root, selector) {
  const element = root.querySelector(selector);
  if (!element) return 0;
  const rootTop = root.getBoundingClientRect().top;
  return Math.max(0, element.getBoundingClientRect().bottom - rootTop);
}

function applyTextScaleProjection(root, { viewportWidth, viewportHeight }) {
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const textScale = Math.max(rootFontSize / 16, explicitRootTextScale());
  const largePhoneText = viewportWidth <= 390 && textScale >= 1.5;
  const titleBlock = root.querySelector('.light-relay-title-block');
  root.dataset.relayTextScale = largePhoneText ? 'large-phone' : 'default';

  if (largePhoneText) {
    const titleStart = 144;
    titleBlock?.style.setProperty('inset-block-start', `${titleStart}px`);

    const titleBottom = blockBottomWithinRoot(root, '.light-relay-title-block');
    const worldStart = Math.min(216, Math.max(
      196,
      Math.round(viewportHeight * 0.35),
      Math.ceil(titleBottom + 8),
    ));
    root.style.setProperty('--relay-large-text-world-start', `${worldStart}px`);
  } else {
    titleBlock?.style.removeProperty('inset-block-start');
    root.style.removeProperty('--relay-large-text-world-start');
  }
}

function projectCurrentRelay() {
  const root = document.querySelector('[data-living-light-relay][data-route="relay"]');
  if (root) applyRelayWorldFocus(root);
}

function bindImmediatePhaseProjection(root) {
  root.querySelectorAll('[data-start-relay], [data-relay-retry]').forEach(trigger => {
    if (trigger.dataset.relayFocusBound === 'true') return;
    trigger.dataset.relayFocusBound = 'true';
    trigger.addEventListener('click', projectCurrentRelay, { once: true });
  });
}

export function applyRelayWorldFocus(root, {
  viewportWidth = globalThis.innerWidth,
  viewportHeight = globalThis.innerHeight,
} = {}) {
  if (!(root instanceof Element) || !root.matches('[data-living-light-relay][data-route="relay"]')) return null;
  const world = root.querySelector('[data-light-relay-world]');
  if (!world) return null;

  applyTextScaleProjection(root, { viewportWidth, viewportHeight });
  applyLanternStates(root);
  const complete = root.dataset.phase === 'complete';
  const targetIndex = cameraTarget(root);
  const camera = createRelayWorldCamera(targetIndex, { viewportWidth, viewportHeight, complete });

  world.setAttribute('viewBox', `${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
  world.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  world.dataset.relayCamera = complete ? 'complete' : 'target';
  world.dataset.cameraTarget = String(targetIndex);
  world.dataset.cameraTargetInline = camera.targetInlineRatio == null ? '' : camera.targetInlineRatio.toFixed(4);
  world.dataset.cameraTargetBlock = camera.targetBlockRatio == null ? '' : camera.targetBlockRatio.toFixed(4);
  world.dataset.cameraViewBox = `${camera.x},${camera.y},${camera.width},${camera.height}`;

  ensureEnergyBead(root);
  bindImmediatePhaseProjection(root);
  root.dataset.relayFocus = 'authored';
  return camera;
}

function scheduleApply() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    frame = 0;
    projectCurrentRelay();
  });
}

if (app) {
  const observer = new MutationObserver(scheduleApply);
  observer.observe(app, { childList: true, subtree: true });

  const textScaleObserver = new MutationObserver(scheduleApply);
  textScaleObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'class'],
  });

  addEventListener('resize', scheduleApply, { passive: true });
  addEventListener('popstate', scheduleApply, { passive: true });
  scheduleApply();
}
