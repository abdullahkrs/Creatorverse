import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorldWakeConnectedPath,
  createWorldWakePresentationMarker,
  deriveWorldWakeModel,
  projectWorldWakeFrame,
  worldWakePhaseAt,
  WORLD_WAKE_PHASES,
} from '../src/living-world-light-relay-world-wake.js';

test('derives one latest active lantern and exact next target only for a fresh partial ready relay', () => {
  const model = deriveWorldWakeModel({ status: 'ready', phase: 'ready', progress: 3 });
  assert.deepEqual(model, {
    eligible: true,
    progress: 3,
    latestActiveIndex: 2,
    targetIndex: 3,
    laterDormantIndex: 4,
  });

  for (const input of [
    { status: 'stale', phase: 'ready', progress: 3 },
    { status: 'storage-error', phase: 'ready', progress: 3 },
    { status: 'ready', phase: 'active', progress: 3 },
    { status: 'ready', phase: 'ready', progress: 0 },
    { status: 'ready', phase: 'ready', progress: 8, completed: true },
    { status: 'ready', phase: 'ready', progress: 3, restored: true },
  ]) {
    assert.equal(deriveWorldWakeModel(input).eligible, false);
  }
});

test('projects deterministic authored phases without progress state', () => {
  assert.equal(worldWakePhaseAt(0), WORLD_WAKE_PHASES.ESTABLISHED);
  assert.equal(worldWakePhaseAt(180), WORLD_WAKE_PHASES.CONNECTED);
  assert.equal(worldWakePhaseAt(760), WORLD_WAKE_PHASES.SEAT);
  assert.equal(worldWakePhaseAt(1100), WORLD_WAKE_PHASES.TARGET);
  assert.equal(worldWakePhaseAt(1900), WORLD_WAKE_PHASES.SETTLED);

  const connected = projectWorldWakeFrame(500);
  assert.equal(connected.phase, WORLD_WAKE_PHASES.CONNECTED);
  assert.ok(connected.connectedProgress > 0 && connected.connectedProgress < 1);
  assert.equal(connected.targetProgress, 0);

  const target = projectWorldWakeFrame(1400);
  assert.equal(target.phase, WORLD_WAKE_PHASES.TARGET);
  assert.ok(target.targetProgress > 0 && target.targetProgress < 1);
  assert.ok(target.connectedOpacity > 0 && target.connectedOpacity < 1);
  assert.equal(Object.hasOwn(target, 'progress'), false);
});

test('binds the echo path to canonical lantern geometry including the bridge-to-first-lantern span', () => {
  assert.equal(createWorldWakeConnectedPath(0), 'M522 336 C540 302 417 292 441 264');
  assert.equal(createWorldWakeConnectedPath(2), 'M478 236 C496 202 491 240 515 212');
  assert.throws(() => createWorldWakeConnectedPath(-1), /INVALID_WORLD_WAKE_LATEST/u);
  assert.throws(() => createWorldWakeConnectedPath(7), /INVALID_WORLD_WAKE_LATEST/u);
});

test('creates an opaque presentation marker from the strict relay fragment without retaining transport values', () => {
  const hash = `#world-relay=${'A'.repeat(80)}`;
  const first = createWorldWakePresentationMarker(hash);
  const second = createWorldWakePresentationMarker(hash);
  const different = createWorldWakePresentationMarker(`#world-relay=${'B'.repeat(80)}`);
  assert.equal(first, second);
  assert.notEqual(first, different);
  assert.match(first, /^creatorverse-world-wake-v1:[a-f0-9]{8}$/u);
  assert.equal(first.includes('world-relay='), false);
  assert.throws(() => createWorldWakePresentationMarker('#world-relay=short'), /INVALID_WORLD_WAKE_CONTEXT/u);
  assert.throws(() => createWorldWakePresentationMarker(`#world-relay=${'A'.repeat(79)}\u202e`), /INVALID_WORLD_WAKE_CONTEXT/u);
});
