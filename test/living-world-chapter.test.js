import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { createLivingWorldEvent } from '../src/living-world-event.js';
import {
  buildLivingWorldChapterUrl,
  chapterFromLocation,
  commitLivingWorldChapterContribution,
  createLivingWorldChapter,
  createOrResumeLivingWorldChapter,
  decodeLivingWorldChapter,
  deriveSignalLanterns,
  encodeLivingWorldChapter,
  evaluateSignalLocks,
  LIVING_WORLD_CHAPTER_LAUNCH_KEY,
  LIVING_WORLD_CHAPTER_STORAGE_KEY,
  readLivingWorldChapterState,
} from '../src/living-world-chapter.js';
import {
  createLivingWorldChapterMediaModel,
  createLivingWorldChapterSharePayload,
  LIVING_WORLD_CHAPTER_MEDIA_FILENAME,
  LIVING_WORLD_CHAPTER_MEDIA_HEIGHT,
  LIVING_WORLD_CHAPTER_MEDIA_WIDTH,
} from '../src/living-world-chapter-media.js';
import { getLivingWorldChapterCopy, livingWorldChapterKeyParity } from '../src/living-world-chapter-i18n.js';

const NOW = 2_000_000_000_000;
let sequence = 1;

class MemoryStorage {
  constructor(initial = {}) { this.map = new Map(Object.entries(initial)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

function eventId() {
  return `event_${String(sequence++).padStart(24, '0')}`;
}

function chapterId() {
  return `chapter_${String(sequence++).padStart(24, '0')}`;
}

function predecessor({ progress = 12, target = 12, now = NOW } = {}) {
  return createLivingWorldEvent({ duration: '6h', target }, {
    now,
    cryptoLike: webcrypto,
    eventId: eventId(),
    creatorName: 'Noura',
    progress,
  });
}

function chapter(options = {}) {
  return createLivingWorldChapter(options.predecessor || predecessor(), {
    duration: options.duration || '6h',
  }, {
    now: options.now || NOW,
    cryptoLike: webcrypto,
    chapterId: options.chapterId || chapterId(),
    progress: options.progress ?? 0,
  });
}

function decodeToken(token) {
  return Buffer.from(token, 'base64url').toString('utf8');
}

function encodeToken(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

test('creates one exact completed-predecessor chapter and round-trips its fragment', () => {
  const value = chapter();
  assert.deepEqual(Object.keys(value).sort(), [
    'chapter', 'chapterId', 'creatorName', 'duration', 'expiresAt', 'landmark',
    'motif', 'predecessor', 'progress', 'target', 'v',
  ].sort());
  assert.equal(value.chapter, 'light-far-shore');
  assert.equal(value.landmark, 'signal-grove');
  assert.equal(value.target, 8);

  const token = encodeLivingWorldChapter(value, { now: NOW });
  assert.deepEqual(decodeLivingWorldChapter(token, { now: NOW }), value);
  const url = buildLivingWorldChapterUrl(value, {
    baseUrl: 'https://example.test/path?discard=1',
    now: NOW,
  });
  const parsed = new URL(url);
  assert.equal(parsed.search, '');
  assert.match(parsed.hash, /^#world-chapter=/u);
  assert.equal(chapterFromLocation(parsed.hash, { now: NOW }).status, 'ready');
});

test('rejects partial, altered, expired, duplicate-field, unknown-field, and query transports', () => {
  assert.throws(
    () => createLivingWorldChapter(predecessor({ progress: 11 }), {}, { now: NOW, chapterId: chapterId() }),
    /INVALID_CHAPTER_PREDECESSOR/u,
  );

  const value = chapter();
  assert.throws(() => encodeLivingWorldChapter({ ...value, creatorName: 'Other' }, { now: NOW }), /INVALID_CHAPTER_BINDING/u);
  assert.equal(chapterFromLocation('#world-chapter=broken', { now: NOW }).status, 'invalid');
  assert.equal(chapterFromLocation(`?world-chapter=${encodeLivingWorldChapter(value, { now: NOW })}`, { now: NOW }).status, 'none');
  assert.equal(chapterFromLocation(`#world-chapter=${encodeLivingWorldChapter(value, { now: NOW })}`, { now: value.expiresAt + 1 }).status, 'expired');

  const original = decodeToken(encodeLivingWorldChapter(value, { now: NOW }));
  assert.throws(() => decodeLivingWorldChapter(encodeToken(`${original}&progress=1`), { now: NOW }), /INVALID_CHAPTER_SHAPE/u);
  assert.throws(() => decodeLivingWorldChapter(encodeToken(`${original}&unknown=x`), { now: NOW }), /INVALID_CHAPTER_SHAPE/u);
  assert.throws(() => encodeLivingWorldChapter({ ...value, creatorName: 'No\u202eura' }, { now: NOW }), /INVALID_CHAPTER_CREATOR/u);
});

test('creates or resumes exactly one chapter for one completed predecessor', () => {
  const storage = new MemoryStorage();
  const source = predecessor();
  const first = createOrResumeLivingWorldChapter(storage, source, { duration: '24h' }, {
    now: NOW,
    cryptoLike: webcrypto,
    chapterId: chapterId(),
  });
  assert.equal(first.status, 'created');
  const second = createOrResumeLivingWorldChapter(storage, source, { duration: '6h' }, {
    now: NOW,
    cryptoLike: webcrypto,
    chapterId: chapterId(),
  });
  assert.equal(second.status, 'resumed');
  assert.equal(second.chapter.chapterId, first.chapter.chapterId);
  const stored = JSON.parse(storage.getItem(LIVING_WORLD_CHAPTER_LAUNCH_KEY));
  assert.equal(stored.launches.length, 1);
});

test('one accepted contribution activates one lantern and duplicates remain neutral', () => {
  const storage = new MemoryStorage();
  const value = chapter({ progress: 3 });
  assert.deepEqual(readLivingWorldChapterState(storage, value, { now: NOW }), {
    status: 'ready', progress: 3, contributed: false,
  });
  assert.deepEqual(commitLivingWorldChapterContribution(storage, value, { now: NOW }), {
    status: 'accepted', progress: 4, completed: false,
  });
  assert.deepEqual(commitLivingWorldChapterContribution(storage, value, { now: NOW }), {
    status: 'duplicate', progress: 4, completed: false,
  });
  const stored = JSON.parse(storage.getItem(LIVING_WORLD_CHAPTER_STORAGE_KEY));
  assert.equal(stored.chapters.length, 1);
  assert.equal(stored.chapters[0].progress, 4);
});

test('the eighth accepted contribution completes the light-field', () => {
  const storage = new MemoryStorage();
  const value = chapter({ progress: 7 });
  assert.deepEqual(commitLivingWorldChapterContribution(storage, value, { now: NOW }), {
    status: 'accepted', progress: 8, completed: true,
  });
});

test('malformed and failed storage preserve prior state', () => {
  const value = chapter();
  const malformed = new MemoryStorage({ [LIVING_WORLD_CHAPTER_STORAGE_KEY]: '{bad' });
  assert.equal(readLivingWorldChapterState(malformed, value, { now: NOW }).status, 'storage-error');
  assert.equal(commitLivingWorldChapterContribution(malformed, value, { now: NOW }).status, 'storage-error');

  const previous = JSON.stringify({ version: 1, chapters: [] });
  const blocked = new MemoryStorage({ [LIVING_WORLD_CHAPTER_STORAGE_KEY]: previous });
  blocked.setItem = () => {};
  const result = commitLivingWorldChapterContribution(blocked, value, { now: NOW });
  assert.equal(result.status, 'storage-error');
  assert.equal(blocked.getItem(LIVING_WORLD_CHAPTER_STORAGE_KEY), previous);
});

test('projects exactly eight structural lantern states and evaluates the three resonators', () => {
  const lanterns = deriveSignalLanterns(5);
  assert.equal(lanterns.length, 8);
  assert.equal(lanterns.filter(item => item.active).length, 5);
  assert.deepEqual(evaluateSignalLocks([true, false, true]), { successfulLocks: 2, accepted: true, perfect: false });
  assert.deepEqual(evaluateSignalLocks([true, true, true]), { successfulLocks: 3, accepted: true, perfect: true });
  assert.deepEqual(evaluateSignalLocks([false, true, false]), { successfulLocks: 1, accepted: false, perfect: false });
  assert.throws(() => evaluateSignalLocks([true]), /INVALID_SIGNAL_RESULTS/u);
});

test('chapter localization stays synchronized and within the visible copy budget', () => {
  const parity = livingWorldChapterKeyParity();
  assert.equal(parity.equal, true);
  for (const locale of ['en', 'ar']) {
    const copy = getLivingWorldChapterCopy(locale);
    assert.ok(copy.world.title.split(/\s+/u).length <= 6);
    assert.ok(copy.world.send.split(/\s+/u).length <= 3);
    assert.ok(copy.result.reached.split(/\s+/u).length <= 6);
    assert.ok(copy.result.share.split(/\s+/u).length <= 3);
    assert.ok(copy.recovery.unavailable.length <= 72);
  }
});

test('portrait media remains exact, truthful, and bound to the safe chapter link', () => {
  const value = chapter({ progress: 4 });
  const partial = createLivingWorldChapterMediaModel(value, 4, 'en');
  const complete = createLivingWorldChapterMediaModel(value, 8, 'ar');
  assert.equal(partial.width, LIVING_WORLD_CHAPTER_MEDIA_WIDTH);
  assert.equal(partial.height, LIVING_WORLD_CHAPTER_MEDIA_HEIGHT);
  assert.equal(partial.filename, LIVING_WORLD_CHAPTER_MEDIA_FILENAME);
  assert.equal(partial.state, 'partial');
  assert.equal(complete.state, 'complete');
  assert.notEqual(partial.outcome, complete.outcome);
  assert.match(complete.outcome, /الثماني/u);

  const url = buildLivingWorldChapterUrl(value, { progress: 4, baseUrl: 'https://example.test/', now: NOW });
  const payload = createLivingWorldChapterSharePayload(partial, url);
  assert.equal(payload.url, url);
  assert.throws(() => createLivingWorldChapterSharePayload(partial, 'https://example.test/?chapter=x'), /INVALID_CHAPTER_MEDIA_URL/u);
  assert.throws(() => createLivingWorldChapterMediaModel({ ...value, rawId: 'hidden' }, 4), /INVALID_CHAPTER_MEDIA/u);
});
