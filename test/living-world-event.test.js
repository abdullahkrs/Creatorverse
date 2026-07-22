import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLivingWorldUrl,
  commitLivingWorldContribution,
  createLivingWorldEvent,
  decodeLivingWorldEvent,
  deriveLoombridgeSlats,
  encodeLivingWorldEvent,
  evaluateThreadLocks,
  eventFromLocation,
  LIVING_WORLD_STORAGE_KEY,
  readLivingWorldState,
} from '../src/living-world-event.js';
import { getLivingWorldCopy } from '../src/living-world-i18n.js';

const NOW = 1_800_000_000_000;
const EVENT_ID = 'event_000000000000000000000001';

function cryptoLike() {
  return { getRandomValues(bytes) { bytes.fill(7); return bytes; } };
}

function event(overrides = {}) {
  return createLivingWorldEvent({ duration: '6h', target: 24 }, {
    now: NOW,
    eventId: EVENT_ID,
    creatorName: 'Noura',
    ...overrides,
  });
}

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return new Map(values); },
  };
}

function flatten(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' ? flatten(child, path) : [[path, child]];
  });
}

test('living world event token is exact and language independent', () => {
  const created = createLivingWorldEvent({ duration: '24h', target: 48 }, {
    now: NOW,
    cryptoLike: cryptoLike(),
    creatorName: 'Noura',
    progress: 17,
  });
  const token = encodeLivingWorldEvent(created, { now: NOW });
  assert.deepEqual(decodeLivingWorldEvent(token, { now: NOW }), created);
  const url = buildLivingWorldUrl(created, { progress: 18, baseUrl: 'https://example.test/path?ignored=yes' });
  const parsed = eventFromLocation(new URL(url).hash, { now: NOW });
  assert.equal(parsed.status, 'ready');
  assert.equal(parsed.event.progress, 18);
  assert.equal(new URL(url).search, '?ignored=yes');
});

test('living world event rejects unknown, duplicate, hostile, oversized, and expired tokens', () => {
  const valid = event();
  const raw = new URLSearchParams({
    v: '1',
    eventId: valid.eventId,
    creatorName: valid.creatorName,
    motif: valid.motif,
    landmark: valid.landmark,
    duration: valid.duration,
    target: String(valid.target),
    progress: String(valid.progress),
    expiresAt: String(valid.expiresAt),
  });
  const encodeRaw = value => Buffer.from(value).toString('base64url');

  const unknown = new URLSearchParams(raw);
  unknown.append('analytics', '1');
  assert.throws(() => decodeLivingWorldEvent(encodeRaw(unknown.toString()), { now: NOW }), /INVALID_EVENT_SHAPE/);

  const duplicate = new URLSearchParams(raw);
  duplicate.append('progress', '9');
  assert.throws(() => decodeLivingWorldEvent(encodeRaw(duplicate.toString()), { now: NOW }), /INVALID_EVENT_SHAPE/);

  const hostile = new URLSearchParams(raw);
  hostile.set('creatorName', 'Noura\u202eadmin');
  assert.throws(() => decodeLivingWorldEvent(encodeRaw(hostile.toString()), { now: NOW }), /INVALID_CREATOR_NAME/);

  assert.throws(() => decodeLivingWorldEvent('a'.repeat(1401), { now: NOW }), /INVALID_EVENT_TOKEN/);
  assert.throws(() => decodeLivingWorldEvent(encodeLivingWorldEvent(valid, { now: NOW }), { now: valid.expiresAt + 1 }), /EVENT_EXPIRED/);
});

test('event creation uses only allowlisted duration, target, world identity, and bounded creator name', () => {
  const created = createLivingWorldEvent({ duration: '6h', target: 12 }, { now: NOW, cryptoLike: cryptoLike() });
  assert.equal(created.motif, 'folded-horizon');
  assert.equal(created.landmark, 'loombridge');
  assert.match(created.eventId, /^event_[a-z0-9]{20,40}$/);
  assert.throws(() => createLivingWorldEvent({ duration: '7h', target: 12 }, { now: NOW, cryptoLike: cryptoLike() }), /INVALID_EVENT_DURATION/);
  assert.throws(() => createLivingWorldEvent({ duration: '6h', target: 13 }, { now: NOW, cryptoLike: cryptoLike() }), /INVALID_EVENT_TARGET/);
  assert.throws(() => createLivingWorldEvent({}, { now: NOW, cryptoLike: cryptoLike(), creatorName: 'A'.repeat(29) }), /INVALID_CREATOR_NAME/);
});

test('one accepted contribution advances exactly once and duplicate attempts remain neutral', () => {
  const storage = memoryStorage();
  const current = event({ progress: 7 });
  const first = commitLivingWorldContribution(storage, current, { now: NOW });
  assert.deepEqual(first, { status: 'accepted', progress: 8, completed: false });
  const second = commitLivingWorldContribution(storage, current, { now: NOW });
  assert.deepEqual(second, { status: 'duplicate', progress: 8, completed: false });
  assert.deepEqual(readLivingWorldState(storage, current), { status: 'duplicate', progress: 8, contributed: true });
  const stored = JSON.parse(storage.getItem(LIVING_WORLD_STORAGE_KEY));
  assert.equal(stored.events.length, 1);
  assert.equal(stored.events[0].progress, 8);
});

test('goal completion is bounded and never grants extra progress', () => {
  const storage = memoryStorage();
  const current = event({ progress: 23 });
  assert.deepEqual(commitLivingWorldContribution(storage, current, { now: NOW }), {
    status: 'accepted', progress: 24, completed: true,
  });
  assert.deepEqual(commitLivingWorldContribution(storage, current, { now: NOW }), {
    status: 'duplicate', progress: 24, completed: true,
  });
  assert.equal(deriveLoombridgeSlats(24, 24), 12);
});

test('malformed storage and unverified writes fail closed without partial progress', () => {
  const current = event({ progress: 4 });
  const malformed = memoryStorage([[LIVING_WORLD_STORAGE_KEY, '{bad']]);
  assert.equal(readLivingWorldState(malformed, current).status, 'storage-error');
  assert.equal(commitLivingWorldContribution(malformed, current, { now: NOW }).status, 'storage-error');

  const values = new Map();
  const unverified = {
    getItem(key) { return values.get(key) || null; },
    setItem() {},
    removeItem(key) { values.delete(key); },
  };
  assert.deepEqual(commitLivingWorldContribution(unverified, current, { now: NOW }), {
    status: 'storage-error', progress: 4,
  });
});

test('a stale or mismatched local record cannot overwrite the event snapshot', () => {
  const current = event({ progress: 10 });
  const stale = memoryStorage([[LIVING_WORLD_STORAGE_KEY, JSON.stringify({
    version: 1,
    events: [{ eventId: current.eventId, target: 24, progress: 9, contributed: false }],
  })]]);
  assert.equal(readLivingWorldState(stale, current).status, 'storage-error');
  assert.equal(commitLivingWorldContribution(stale, current, { now: NOW }).status, 'storage-error');
});

test('thread interaction requires two of three locks and never creates a bonus', () => {
  assert.deepEqual(evaluateThreadLocks([true, true, false]), { successfulLocks: 2, accepted: true, perfect: false });
  assert.deepEqual(evaluateThreadLocks([true, true, true]), { successfulLocks: 3, accepted: true, perfect: true });
  assert.deepEqual(evaluateThreadLocks([true, false, false]), { successfulLocks: 1, accepted: false, perfect: false });
  assert.throws(() => evaluateThreadLocks([true, true]), /INVALID_LOCK_RESULTS/);
  assert.equal(deriveLoombridgeSlats(0, 24), 0);
  assert.equal(deriveLoombridgeSlats(12, 24), 6);
});

test('Arabic and English living world copy remain exactly synchronized and within core budgets', () => {
  const english = new Map(flatten(getLivingWorldCopy('en')));
  const arabic = new Map(flatten(getLivingWorldCopy('ar')));
  assert.deepEqual([...arabic.keys()].sort(), [...english.keys()].sort());
  for (const [key, value] of [...english, ...arabic]) {
    assert.equal(typeof value, 'string', key);
    assert.ok(value.trim(), key);
  }
  for (const locale of ['en', 'ar']) {
    const value = getLivingWorldCopy(locale);
    assert.ok(value.world.title.split(/\s+/u).length <= 6);
    assert.ok(value.world.send.split(/\s+/u).length <= 3);
    assert.ok(value.active.status.split(/\s+/u).length <= 2);
    assert.ok(value.active.lock.split(/\s+/u).length <= 2);
    assert.ok(value.result.reached.split(/\s+/u).length <= 6);
    assert.ok(value.result.share.split(/\s+/u).length <= 3);
    assert.ok(value.recovery.unavailable.length <= 72);
  }
});
