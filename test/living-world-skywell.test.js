import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { createLivingWorldEvent } from '../src/living-world-event.js';
import { createLivingWorldChapter } from '../src/living-world-chapter.js';
import {
  buildLivingWorldSkywellUrl,
  commitLivingWorldSkywellContribution,
  createLivingWorldSkywell,
  createOrResumeLivingWorldSkywell,
  decodeLivingWorldSkywell,
  deriveSkywellRibs,
  encodeLivingWorldSkywell,
  evaluateSkywellLocks,
  LIVING_WORLD_SKYWELL_LAUNCH_KEY,
  LIVING_WORLD_SKYWELL_STORAGE_KEY,
  readLivingWorldSkywellState,
  skywellFromLocation,
} from '../src/living-world-skywell.js';
import {
  createLivingWorldSkywellMediaModel,
  createLivingWorldSkywellSharePayload,
  LIVING_WORLD_SKYWELL_MEDIA_FILENAME,
  LIVING_WORLD_SKYWELL_MEDIA_HEIGHT,
  LIVING_WORLD_SKYWELL_MEDIA_WIDTH,
} from '../src/living-world-skywell-media.js';
import { getLivingWorldSkywellCopy, livingWorldSkywellKeyParity } from '../src/living-world-skywell-i18n.js';

const NOW = 2_000_000_000_000;
let sequence = 1;

class MemoryStorage {
  constructor(initial = {}) { this.map = new Map(Object.entries(initial)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

function eventId() { return `event_${String(sequence++).padStart(24, '0')}`; }
function chapterId() { return `chapter_${String(sequence++).padStart(24, '0')}`; }
function skywellId() { return `skywell_${String(sequence++).padStart(24, '0')}`; }

function predecessor({ chapterProgress = 8, now = NOW } = {}) {
  const event = createLivingWorldEvent({ duration: '6h', target: 12 }, {
    now,
    cryptoLike: webcrypto,
    eventId: eventId(),
    creatorName: 'Noura',
    progress: 12,
  });
  return createLivingWorldChapter(event, { duration: '6h' }, {
    now,
    cryptoLike: webcrypto,
    chapterId: chapterId(),
    progress: chapterProgress,
  });
}

function skywell(options = {}) {
  return createLivingWorldSkywell(options.predecessor || predecessor(), {
    now: options.now || NOW,
    cryptoLike: webcrypto,
    skywellId: options.skywellId || skywellId(),
    progress: options.progress ?? 0,
  });
}

function decodeToken(token) { return Buffer.from(token, 'base64url').toString('utf8'); }
function encodeToken(value) { return Buffer.from(value, 'utf8').toString('base64url'); }

test('creates one strict completed-grove Skywell event and round-trips its fragment', () => {
  const value = skywell();
  assert.deepEqual(Object.keys(value).sort(), [
    'creatorName', 'duration', 'event', 'expiresAt', 'landmark', 'motif',
    'predecessor', 'progress', 'skywellId', 'target', 'v',
  ].sort());
  assert.equal(value.event, 'open-skywell');
  assert.equal(value.landmark, 'skywell');
  assert.equal(value.target, 6);
  const token = encodeLivingWorldSkywell(value, { now: NOW });
  assert.deepEqual(decodeLivingWorldSkywell(token, { now: NOW }), value);
  const url = buildLivingWorldSkywellUrl(value, { baseUrl: 'https://example.test/path?discard=1', now: NOW });
  const parsed = new URL(url);
  assert.equal(parsed.search, '');
  assert.match(parsed.hash, /^#world-skywell=/u);
  assert.equal(skywellFromLocation(parsed.hash, { now: NOW }).status, 'ready');
});

test('rejects incomplete predecessors and hostile, expired, duplicate, unknown, and query transports', () => {
  assert.throws(
    () => createLivingWorldSkywell(predecessor({ chapterProgress: 7 }), { now: NOW, skywellId: skywellId() }),
    /INVALID_SKYWELL_PREDECESSOR/u,
  );
  const value = skywell();
  assert.throws(() => encodeLivingWorldSkywell({ ...value, creatorName: 'Other' }, { now: NOW }), /INVALID_SKYWELL_BINDING/u);
  assert.throws(() => encodeLivingWorldSkywell({ ...value, creatorName: 'No\u202eura' }, { now: NOW }), /INVALID_SKYWELL_CREATOR/u);
  assert.equal(skywellFromLocation('#world-skywell=broken', { now: NOW }).status, 'invalid');
  assert.equal(skywellFromLocation(`?world-skywell=${encodeLivingWorldSkywell(value, { now: NOW })}`, { now: NOW }).status, 'none');
  assert.equal(skywellFromLocation(`#world-skywell=${encodeLivingWorldSkywell(value, { now: NOW })}`, { now: value.expiresAt + 1 }).status, 'expired');
  const original = decodeToken(encodeLivingWorldSkywell(value, { now: NOW }));
  assert.throws(() => decodeLivingWorldSkywell(encodeToken(`${original}&progress=1`), { now: NOW }), /INVALID_SKYWELL_SHAPE/u);
  assert.throws(() => decodeLivingWorldSkywell(encodeToken(`${original}&unknown=x`), { now: NOW }), /INVALID_SKYWELL_SHAPE/u);
});

test('creates or resumes exactly one Skywell for one completed chapter', () => {
  const storage = new MemoryStorage();
  const source = predecessor();
  const first = createOrResumeLivingWorldSkywell(storage, source, {
    now: NOW, cryptoLike: webcrypto, skywellId: skywellId(),
  });
  assert.equal(first.status, 'created');
  const second = createOrResumeLivingWorldSkywell(storage, source, {
    now: NOW, cryptoLike: webcrypto, skywellId: skywellId(),
  });
  assert.equal(second.status, 'resumed');
  assert.equal(second.skywell.skywellId, first.skywell.skywellId);
  assert.equal(JSON.parse(storage.getItem(LIVING_WORLD_SKYWELL_LAUNCH_KEY)).launches.length, 1);
});

test('one accepted contribution opens exactly one rib and duplicate attempts remain neutral', () => {
  const storage = new MemoryStorage();
  const value = skywell({ progress: 2 });
  assert.deepEqual(readLivingWorldSkywellState(storage, value, { now: NOW }), {
    status: 'ready', progress: 2, contributed: false,
  });
  assert.deepEqual(commitLivingWorldSkywellContribution(storage, value, { now: NOW }), {
    status: 'accepted', progress: 3, completed: false,
  });
  assert.deepEqual(commitLivingWorldSkywellContribution(storage, value, { now: NOW }), {
    status: 'duplicate', progress: 3, completed: false,
  });
  const stored = JSON.parse(storage.getItem(LIVING_WORLD_SKYWELL_STORAGE_KEY));
  assert.equal(stored.skywells.length, 1);
  assert.equal(stored.skywells[0].progress, 3);
});

test('the sixth accepted contribution completes the aperture', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(commitLivingWorldSkywellContribution(storage, skywell({ progress: 5 }), { now: NOW }), {
    status: 'accepted', progress: 6, completed: true,
  });
});

test('ahead and malformed storage fail closed without rollback or multiplication', () => {
  const value = skywell({ progress: 2 });
  const malformed = new MemoryStorage({ [LIVING_WORLD_SKYWELL_STORAGE_KEY]: '{bad' });
  assert.equal(readLivingWorldSkywellState(malformed, value, { now: NOW }).status, 'storage-error');
  assert.equal(commitLivingWorldSkywellContribution(malformed, value, { now: NOW }).status, 'storage-error');

  const source = new MemoryStorage();
  const first = commitLivingWorldSkywellContribution(source, value, { now: NOW });
  assert.equal(first.progress, 3);
  const olderLink = { ...value, progress: 1 };
  assert.equal(readLivingWorldSkywellState(source, olderLink, { now: NOW }).status, 'stale');
});

test('projects six structural rib states and reuses bounded two-of-three acceptance', () => {
  const ribs = deriveSkywellRibs(3);
  assert.equal(ribs.length, 6);
  assert.equal(ribs.filter(item => item.open).length, 3);
  assert.equal(ribs.filter(item => item.target).length, 1);
  assert.equal(ribs.filter(item => item.dormant).length, 2);
  assert.deepEqual(evaluateSkywellLocks([true, false, true]), { successfulLocks: 2, accepted: true, perfect: false });
  assert.deepEqual(evaluateSkywellLocks([true, true, true]), { successfulLocks: 3, accepted: true, perfect: true });
  assert.deepEqual(evaluateSkywellLocks([false, true, false]), { successfulLocks: 1, accepted: false, perfect: false });
  assert.throws(() => evaluateSkywellLocks([true]), /INVALID_SKYWELL_SIGNAL_RESULTS/u);
});

test('Skywell localization stays synchronized and inside visible copy budgets', () => {
  assert.equal(livingWorldSkywellKeyParity().equal, true);
  for (const locale of ['en', 'ar']) {
    const copy = getLivingWorldSkywellCopy(locale);
    assert.ok(copy.world.title.split(/\s+/u).length <= 6);
    assert.ok(copy.world.send.split(/\s+/u).length <= 3);
    assert.ok(copy.launch.action.split(/\s+/u).length <= 3);
    assert.ok(copy.result.opened.split(/\s+/u).length <= 6);
    assert.ok(copy.result.share.split(/\s+/u).length <= 3);
    assert.ok(copy.recovery.unavailable.length <= 72);
  }
});

test('portrait media is exact, distinct, metadata-free by contract, and bound to the strict link', () => {
  const value = skywell({ progress: 3 });
  const partial = createLivingWorldSkywellMediaModel(value, 3, 'en');
  const complete = createLivingWorldSkywellMediaModel(value, 6, 'ar');
  assert.equal(partial.width, LIVING_WORLD_SKYWELL_MEDIA_WIDTH);
  assert.equal(partial.height, LIVING_WORLD_SKYWELL_MEDIA_HEIGHT);
  assert.equal(partial.filename, LIVING_WORLD_SKYWELL_MEDIA_FILENAME);
  assert.equal(partial.state, 'partial');
  assert.equal(complete.state, 'complete');
  assert.notEqual(partial.outcome, complete.outcome);
  const url = buildLivingWorldSkywellUrl(value, { progress: 3, baseUrl: 'https://example.test/', now: NOW });
  assert.equal(createLivingWorldSkywellSharePayload(partial, url).url, url);
  assert.throws(() => createLivingWorldSkywellSharePayload(partial, 'https://example.test/?skywell=x'), /INVALID_SKYWELL_MEDIA_URL/u);
  assert.throws(() => createLivingWorldSkywellMediaModel({ ...value, rawId: 'hidden' }, 3), /INVALID_SKYWELL_MEDIA/u);
});
