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
  root.querySelectorAll('.light-relay-energy-bead').forEach(bead => bead.remove());
  if (root.dataset.phase !== 'active' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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

export function applyRelayWorldFocus(root, {
  viewportWidth = globalThis.innerWidth,
  viewportHeight = globalThis.innerHeight,
} = {}) {
  if (!(root instanceof Element) || !root.matches('[data-living-light-relay][data-route="relay"]')) return null;
  const world = root.querySelector('[data-light-relay-world]');
  if (!world) return null;

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
  root.dataset.relayFocus = 'authored';
  return camera;
}

function scheduleApply() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    frame = 0;
    const root = document.querySelector('[data-living-light-relay][data-route="relay"]');
    if (root) applyRelayWorldFocus(root);
  });
}

if (app) {
  const observer = new MutationObserver(scheduleApply);
  observer.observe(app, { childList: true, subtree: true });
  addEventListener('resize', scheduleApply, { passive: true });
  addEventListener('popstate', scheduleApply, { passive: true });
  scheduleApply();
}
