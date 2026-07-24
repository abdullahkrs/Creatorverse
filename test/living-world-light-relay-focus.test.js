import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRelayWorldCamera,
  getRelayLanternPoint,
  projectRelayLanternState,
} from '../src/living-world-light-relay-focus.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

test('authored relay camera keeps every bounded target in the readable region', () => {
  for (const viewport of VIEWPORTS) {
    for (let targetIndex = 1; targetIndex < 8; targetIndex += 1) {
      const camera = createRelayWorldCamera(targetIndex, {
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      });
      assert.ok(camera.targetInlineRatio >= 0.58, `${viewport.width}:${targetIndex}: inline minimum`);
      assert.ok(camera.targetInlineRatio <= 0.82, `${viewport.width}:${targetIndex}: inline maximum`);
      assert.ok(camera.targetBlockRatio >= 0.4, `${viewport.width}:${targetIndex}: block minimum`);
      assert.ok(camera.targetBlockRatio <= 0.52, `${viewport.width}:${targetIndex}: block maximum`);
      assert.ok(camera.width <= 800);
      assert.ok(camera.height <= 560);
    }
  }
});

test('phone camera materially enlarges the relay destination without changing world coordinates', () => {
  const target = getRelayLanternPoint(3);
  const phone = createRelayWorldCamera(3, { viewportWidth: 320, viewportHeight: 568 });
  const desktop = createRelayWorldCamera(3, { viewportWidth: 1440, viewportHeight: 900 });
  assert.deepEqual(target, { x: 552, y: 197 });
  assert.equal(phone.width, 420);
  assert.equal(phone.height, 560);
  assert.equal(desktop.width, 800);
  assert.equal(desktop.height, 500);
  assert.ok(phone.width < desktop.width);
});

test('completed world uses the unchanged full geography', () => {
  assert.deepEqual(createRelayWorldCamera(7, {
    viewportWidth: 390,
    viewportHeight: 844,
    complete: true,
  }), {
    x: 0,
    y: 0,
    width: 800,
    height: 560,
    targetX: null,
    targetY: null,
    targetInlineRatio: null,
    targetBlockRatio: null,
    viewportWidth: 390,
    viewportHeight: 844,
  });
});

test('structural state projection distinguishes active, target, accepted, dormant, and stale states', () => {
  assert.equal(projectRelayLanternState({ active: true, target: false, connected: false, phase: 'ready' }), 'active');
  assert.equal(projectRelayLanternState({ active: false, target: true, connected: false, phase: 'ready' }), 'target');
  assert.equal(projectRelayLanternState({ active: true, target: true, connected: true, phase: 'impact' }), 'accepted');
  assert.equal(projectRelayLanternState({ active: false, target: false, connected: false, phase: 'ready' }), 'dormant');
  assert.equal(projectRelayLanternState({ active: false, target: true, connected: false, phase: 'stale' }), 'dormant');
});

test('invalid camera target fails closed', () => {
  assert.throws(() => createRelayWorldCamera(-1), /INVALID_RELAY_FOCUS_TARGET/u);
  assert.throws(() => createRelayWorldCamera(8), /INVALID_RELAY_FOCUS_TARGET/u);
  assert.throws(() => getRelayLanternPoint('3.5'), /INVALID_RELAY_FOCUS_TARGET/u);
});
