import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLivingWorldShareFailure,
  createLivingWorldMediaModel,
  createLivingWorldMediaSharePayload,
  LIVING_WORLD_MEDIA_FILENAME,
  LIVING_WORLD_MEDIA_HEIGHT,
  LIVING_WORLD_MEDIA_SCENE_BOUNDS,
  LIVING_WORLD_MEDIA_TYPE,
  LIVING_WORLD_MEDIA_WIDTH,
  supportsLivingWorldFileShare,
} from '../src/living-world-media.js';
import { getLivingWorldMediaCopy, livingWorldMediaCopyKeys } from '../src/living-world-media-i18n.js';

function event(overrides = {}) {
  return {
    v: 1,
    eventId: 'event_000000000000000000000051',
    creatorName: 'Noura',
    motif: 'folded-horizon',
    landmark: 'loombridge',
    duration: '24h',
    target: 24,
    progress: 8,
    expiresAt: 9999999999999,
    ...overrides,
  };
}

test('partial media model is exact, bounded, portrait, and identifier-free', () => {
  const source = event();
  const model = createLivingWorldMediaModel(source, 12, 'en');
  assert.equal(model.width, LIVING_WORLD_MEDIA_WIDTH);
  assert.equal(model.height, LIVING_WORLD_MEDIA_HEIGHT);
  assert.equal(model.type, LIVING_WORLD_MEDIA_TYPE);
  assert.equal(model.filename, LIVING_WORLD_MEDIA_FILENAME);
  assert.equal(model.state, 'partial');
  assert.equal(model.activeSlats, 6);
  assert.equal(model.sceneRatio, 0.75);
  assert.equal(LIVING_WORLD_MEDIA_SCENE_BOUNDS.height, 1440);
  assert.match(model.outcome, /12 of 24/u);
  assert.doesNotMatch(JSON.stringify(model), /event_|000000000000000000000051|expiresAt|creatorName/u);
  assert.deepEqual(source, event());
});

test('completed media model uses a materially distinct truthful reveal', () => {
  const partial = createLivingWorldMediaModel(event(), 23, 'en');
  const completed = createLivingWorldMediaModel(event(), 24, 'en');
  assert.equal(partial.state, 'partial');
  assert.equal(partial.activeSlats, 11);
  assert.equal(completed.state, 'complete');
  assert.equal(completed.activeSlats, 12);
  assert.notEqual(partial.outcome, completed.outcome);
  assert.notEqual(partial.invitation, completed.invitation);
  assert.match(completed.alternative, /fully lit/u);
});

test('Arabic model has independent RTL hierarchy and bounded localized copy', () => {
  const model = createLivingWorldMediaModel(event(), 12, 'ar');
  assert.equal(model.direction, 'rtl');
  assert.equal(model.locale, 'ar');
  assert.match(model.worldIdentity, /الأفق/u);
  assert.match(model.outcome, /١٢/u);
  assert.doesNotMatch(model.outcome, /12/u);
});

test('media projection rejects unknown fields, controls, invalid progress, and wrong world identity', () => {
  assert.throws(() => createLivingWorldMediaModel({ ...event(), extra: true }, 12, 'en'), /INVALID_MEDIA_EVENT/u);
  assert.throws(() => createLivingWorldMediaModel(event({ creatorName: 'No\u202eura' }), 12, 'en'), /INVALID_MEDIA_EVENT/u);
  assert.throws(() => createLivingWorldMediaModel(event({ motif: 'other' }), 12, 'en'), /INVALID_MEDIA_EVENT/u);
  assert.throws(() => createLivingWorldMediaModel(event(), 7, 'en'), /INVALID_MEDIA_PROGRESS/u);
  assert.throws(() => createLivingWorldMediaModel(event(), 25, 'en'), /INVALID_MEDIA_PROGRESS/u);
});

test('safe share payload accepts only a strict fragment event URL', () => {
  const model = createLivingWorldMediaModel(event(), 12, 'en');
  const payload = createLivingWorldMediaSharePayload(model, 'https://creatorverse.test/#world-event=bounded_token');
  assert.equal(payload.url, 'https://creatorverse.test/#world-event=bounded_token');
  assert.equal(payload.title, model.shareTitle);
  assert.equal(payload.text, model.shareText);
  assert.throws(() => createLivingWorldMediaSharePayload(model, 'https://creatorverse.test/?leak=1#world-event=x'), /INVALID_MEDIA_URL/u);
  assert.throws(() => createLivingWorldMediaSharePayload(model, 'https://creatorverse.test/#other=x'), /INVALID_MEDIA_URL/u);
});

test('capability and failure classification are deterministic', () => {
  const file = { name: LIVING_WORLD_MEDIA_FILENAME, type: LIVING_WORLD_MEDIA_TYPE };
  assert.equal(supportsLivingWorldFileShare({ share() {}, canShare: ({ files }) => files[0] === file }, file), true);
  assert.equal(supportsLivingWorldFileShare({ share() {} }, file), false);
  assert.equal(supportsLivingWorldFileShare({ share() {}, canShare() { throw new Error('x'); } }, file), false);
  assert.equal(classifyLivingWorldShareFailure({ name: 'AbortError' }), 'cancelled');
  assert.equal(classifyLivingWorldShareFailure({ name: 'NotAllowedError' }), 'denied');
  assert.equal(classifyLivingWorldShareFailure(new Error('x')), 'unavailable');
});

test('media localization keys and copy budgets stay synchronized', () => {
  assert.deepEqual(livingWorldMediaCopyKeys('en'), livingWorldMediaCopyKeys('ar'));
  for (const locale of ['en', 'ar']) {
    const copy = getLivingWorldMediaCopy(locale);
    assert.ok(copy.action.split(/\s+/u).length <= 3);
    assert.ok(copy.dialogTitle.split(/\s+/u).length <= 5);
    assert.ok(copy.eventTitle.split(/\s+/u).length <= 6);
    assert.ok(copy.partialInvitation.split(/\s+/u).length <= 7);
    assert.ok(copy.completeInvitation.split(/\s+/u).length <= 7);
    assert.ok(copy.generationError.length <= 72);
    assert.ok(copy.shareUnavailable.length <= 72);
  }
});

test('fixed filename contains no identifier, timestamp, locale, or user input', () => {
  assert.equal(LIVING_WORLD_MEDIA_FILENAME, 'creatorverse-folded-horizon.png');
  assert.doesNotMatch(LIVING_WORLD_MEDIA_FILENAME, /event|realm|receipt|relationship|\d{4}|noura|ar-|en-/iu);
});
