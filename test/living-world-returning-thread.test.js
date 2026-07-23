import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commitLivingWorldContribution,
  createLivingWorldEvent,
  LIVING_WORLD_STORAGE_KEY,
} from '../src/living-world-event.js';
import {
  commitLivingWorldChapterContribution,
  createLivingWorldChapter,
  LIVING_WORLD_CHAPTER_STORAGE_KEY,
} from '../src/living-world-chapter.js';
import {
  createOrRestoreReturningThread,
  deriveReturningThreadChapterState,
  parseReturningThread,
  projectReturningThreadMedia,
  readReturningThreadForChapter,
  readReturningThreadForEvent,
  RETURNING_THREAD_KINDS,
  RETURNING_THREAD_STORAGE_KEY,
  serializeReturningThread,
  validateReturningThread,
} from '../src/living-world-returning-thread.js';
import { getReturningThreadCopy, returningThreadKeyParity } from '../src/living-world-returning-thread-i18n.js';

const NOW = 2_000_000_000_000;
let sequence = 1000;

class MemoryStorage {
  constructor(initial = {}) { this.map = new Map(Object.entries(initial)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

function id(prefix) { return `${prefix}_${String(sequence++).padStart(24, '0')}`; }
function fixedCrypto(value) {
  return { getRandomValues(target) { target.fill(value); return target; } };
}
function event(progress = 11) {
  return createLivingWorldEvent({ duration: '6h', target: 12 }, {
    now: NOW,
    eventId: id('event'),
    creatorName: 'Noura',
    progress,
    cryptoLike: fixedCrypto(0),
  });
}
function acceptedPredecessor(storage, kindByte = 0) {
  const source = event(11);
  assert.deepEqual(commitLivingWorldContribution(storage, source, { now: NOW }), {
    status: 'accepted', progress: 12, completed: true,
  });
  const created = createOrRestoreReturningThread(storage, source, {
    now: NOW,
    cryptoLike: fixedCrypto(kindByte),
  });
  assert.equal(created.status, 'created');
  return { event: { ...source, progress: 12 }, thread: created.thread };
}
function chapter(predecessor, progress = 0) {
  return createLivingWorldChapter(predecessor, { duration: '6h' }, {
    now: NOW,
    chapterId: id('chapter'),
    progress,
    cryptoLike: fixedCrypto(0),
  });
}

test('stores one exact versioned threadmark with four equal allowlisted kinds', () => {
  const observed = [];
  for (let index = 0; index < 4; index += 1) {
    const storage = new MemoryStorage();
    const value = acceptedPredecessor(storage, index);
    observed.push(value.thread.kind);
    assert.deepEqual(Object.keys(value.thread).sort(), [
      'contributionBinding', 'kind', 'landmark', 'motif', 'predecessorEventId', 'v',
    ].sort());
    const serialized = storage.getItem(RETURNING_THREAD_STORAGE_KEY);
    assert.deepEqual(parseReturningThread(serialized), value.thread);
    assert.equal(serializeReturningThread(value.thread), serialized);
  }
  assert.deepEqual(observed, RETURNING_THREAD_KINDS);
});

test('creates only after verified contribution and never rerolls on restore', () => {
  const storage = new MemoryStorage();
  const source = event(2);
  assert.equal(createOrRestoreReturningThread(storage, source, { now: NOW, cryptoLike: fixedCrypto(0) }).status, 'not-contributed');
  assert.equal(storage.getItem(RETURNING_THREAD_STORAGE_KEY), null);
  assert.equal(commitLivingWorldContribution(storage, source, { now: NOW }).status, 'accepted');
  const first = createOrRestoreReturningThread(storage, source, { now: NOW, cryptoLike: fixedCrypto(1) });
  const second = createOrRestoreReturningThread(storage, source, { now: NOW, cryptoLike: fixedCrypto(3) });
  assert.equal(first.status, 'created');
  assert.equal(second.status, 'restored');
  assert.equal(second.thread.kind, first.thread.kind);
  assert.deepEqual(readReturningThreadForEvent(storage, source, { now: NOW }).thread, first.thread);
});

test('rejects malformed, duplicate, unknown, mismatched, and unsupported local state', () => {
  const storage = new MemoryStorage();
  const { event: predecessor, thread } = acceptedPredecessor(storage);
  const serialized = serializeReturningThread(thread);
  assert.throws(() => parseReturningThread(`${serialized}&kind=twin-latch`), /INVALID_RETURNING_THREAD_STORAGE/u);
  assert.throws(() => parseReturningThread(`${serialized}&unknown=x`), /INVALID_RETURNING_THREAD_STORAGE/u);
  assert.throws(() => validateReturningThread({ ...thread, kind: 'rare-thread' }), /INVALID_RETURNING_THREAD/u);
  assert.throws(() => validateReturningThread({ ...thread, rawId: 'hidden' }), /INVALID_RETURNING_THREAD/u);

  const other = event(12);
  assert.equal(readReturningThreadForEvent(storage, other, { now: NOW }).status, 'none');
  const otherChapter = chapter(other);
  assert.equal(readReturningThreadForChapter(storage, otherChapter, { now: NOW }).status, 'none');
  storage.setItem(RETURNING_THREAD_STORAGE_KEY, `${serialized}&kind=twin-latch`);
  assert.equal(readReturningThreadForChapter(storage, chapter(predecessor), { now: NOW }).status, 'invalid');
});

test('failed thread storage preserves the authoritative world contribution', () => {
  const storage = new MemoryStorage();
  const source = event(11);
  assert.equal(commitLivingWorldContribution(storage, source, { now: NOW }).status, 'accepted');
  const worldBefore = storage.getItem(LIVING_WORLD_STORAGE_KEY);
  const originalSet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === RETURNING_THREAD_STORAGE_KEY) return;
    originalSet(key, value);
  };
  assert.equal(createOrRestoreReturningThread(storage, source, { now: NOW, cryptoLike: fixedCrypto(0) }).status, 'unavailable');
  assert.equal(storage.getItem(LIVING_WORLD_STORAGE_KEY), worldBefore);
  assert.equal(storage.getItem(RETURNING_THREAD_STORAGE_KEY), null);
});

test('matching chapter restores one thread and extends it into exactly one lantern', () => {
  const storage = new MemoryStorage();
  const { event: predecessor, thread } = acceptedPredecessor(storage, 2);
  const followUp = chapter(predecessor, 3);
  const before = deriveReturningThreadChapterState(storage, followUp, { now: NOW });
  assert.equal(before.status, 'ready');
  assert.equal(before.thread.kind, thread.kind);
  assert.equal(before.extended, false);
  assert.equal(before.lanternIndex, null);

  assert.deepEqual(commitLivingWorldChapterContribution(storage, followUp, { now: NOW }), {
    status: 'accepted', progress: 4, completed: false,
  });
  const after = deriveReturningThreadChapterState(storage, followUp, { now: NOW });
  assert.equal(after.extended, true);
  assert.equal(after.progress, 4);
  assert.equal(after.lanternIndex, 3);
  assert.equal(after.thread.kind, thread.kind);
  assert.equal(commitLivingWorldChapterContribution(storage, followUp, { now: NOW }).status, 'duplicate');
  assert.equal(deriveReturningThreadChapterState(storage, followUp, { now: NOW }).lanternIndex, 3);
  assert.ok(storage.getItem(LIVING_WORLD_CHAPTER_STORAGE_KEY));
});

test('fresh context is neutral and media projection contains no local identifiers', () => {
  const sourceStorage = new MemoryStorage();
  const { event: predecessor, thread } = acceptedPredecessor(sourceStorage, 3);
  const followUp = chapter(predecessor, 7);
  const fresh = new MemoryStorage();
  assert.equal(deriveReturningThreadChapterState(fresh, followUp, { now: NOW }).status, 'none');
  const partial = projectReturningThreadMedia(thread);
  const extended = projectReturningThreadMedia(thread, { extended: true, lanternIndex: 7 });
  assert.deepEqual(Object.keys(partial).sort(), ['extended', 'kind', 'lanternIndex'].sort());
  assert.equal(partial.lanternIndex, null);
  assert.equal(extended.lanternIndex, 7);
  assert.equal(JSON.stringify(extended).includes(predecessor.eventId), false);
  assert.throws(() => projectReturningThreadMedia(thread, { extended: true, lanternIndex: 8 }), /INVALID_RETURNING_THREAD_MEDIA/u);
});

test('returning-thread localization stays synchronized and within copy budgets', () => {
  assert.equal(returningThreadKeyParity().equal, true);
  for (const locale of ['en', 'ar']) {
    const value = getReturningThreadCopy(locale);
    assert.ok(value.label.split(/\s+/u).length <= 3);
    assert.ok(value.woven.split(/\s+/u).length <= 6);
    assert.ok(value.extended.split(/\s+/u).length <= 7);
    assert.ok(value.worldSavedUnavailable.length <= 72);
    assert.ok(value.deviceUnavailable.length <= 72);
  }
});
