import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { createLivingWorldEvent } from '../src/living-world-event.js';
import {
  createLivingWorldChapter,
  LIVING_WORLD_CHAPTER_STORAGE_KEY,
} from '../src/living-world-chapter.js';
import {
  buildLivingWorldLightRelayUrl,
  commitLivingWorldLightRelayContribution,
  createLivingWorldLightRelay,
  decodeLightRelayChapter,
  decodeLivingWorldLightRelay,
  deriveLightRelayLanterns,
  encodeLivingWorldLightRelay,
  evaluateLightRelayLocks,
  lightRelayFromLocation,
  resolveLivingWorldLightRelay,
} from '../src/living-world-light-relay.js';
import {
  createLivingWorldLightRelayMediaModel,
  createLivingWorldLightRelaySharePayload,
  LIVING_WORLD_LIGHT_RELAY_MEDIA_FILENAME,
  LIVING_WORLD_LIGHT_RELAY_MEDIA_HEIGHT,
  LIVING_WORLD_LIGHT_RELAY_MEDIA_WIDTH,
} from '../src/living-world-light-relay-media.js';
import {
  getLivingWorldLightRelayCopy,
  livingWorldLightRelayKeyParity,
} from '../src/living-world-light-relay-i18n.js';

const NOW = 2_000_000_000_000;
let sequence = 50000;

class MemoryStorage {
  constructor(initial = {}) { this.map = new Map(Object.entries(initial)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

function opaque(prefix) {
  return `${prefix}_${String(sequence++).padStart(24, '0')}`;
}

function chapter(progress = 3) {
  const predecessor = createLivingWorldEvent({ duration: '24h', target: 12 }, {
    now: NOW,
    cryptoLike: webcrypto,
    eventId: opaque('event'),
    creatorName: 'Noura',
    progress: 12,
  });
  return createLivingWorldChapter(predecessor, { duration: '24h' }, {
    now: NOW,
    cryptoLike: webcrypto,
    chapterId: opaque('chapter'),
    progress,
  });
}

function decodeToken(token) {
  return Buffer.from(token, 'base64url').toString('utf8');
}

function encodeToken(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

test('creates one exact partial relay and round-trips fragment-only transport', () => {
  const value = createLivingWorldLightRelay(chapter(3), 3, { now: NOW });
  assert.deepEqual(Object.keys(value).sort(), ['chapter', 'kind', 'progress', 'targetIndex', 'v'].sort());
  assert.equal(value.kind, 'carry-light');
  assert.equal(value.targetIndex, 3);
  assert.equal(decodeLightRelayChapter(value, { now: NOW }).progress, 3);

  const token = encodeLivingWorldLightRelay(value, { now: NOW });
  assert.deepEqual(decodeLivingWorldLightRelay(token, { now: NOW }), value);
  const url = buildLivingWorldLightRelayUrl(value, {
    baseUrl: 'https://example.test/path?discard=1',
    now: NOW,
  });
  const parsed = new URL(url);
  assert.equal(parsed.search, '');
  assert.match(parsed.hash, /^#world-relay=/u);
  assert.equal(lightRelayFromLocation(parsed.hash, { now: NOW }).status, 'ready');
  assert.equal(lightRelayFromLocation(`?world-relay=${token}`, { now: NOW }).status, 'none');
});

test('rejects completed, altered, duplicate, unknown, hostile, and expired relay values', () => {
  assert.throws(() => createLivingWorldLightRelay(chapter(7), 8, { now: NOW }), /INVALID_LIGHT_RELAY_PROGRESS/u);
  const value = createLivingWorldLightRelay(chapter(3), 3, { now: NOW });
  assert.throws(() => encodeLivingWorldLightRelay({ ...value, targetIndex: 4 }, { now: NOW }), /INVALID_LIGHT_RELAY_BINDING/u);
  assert.throws(() => encodeLivingWorldLightRelay({ ...value, kind: 'referral' }, { now: NOW }), /INVALID_LIGHT_RELAY_KIND/u);
  assert.equal(lightRelayFromLocation('#world-relay=broken', { now: NOW }).status, 'invalid');

  const original = decodeToken(encodeLivingWorldLightRelay(value, { now: NOW }));
  assert.throws(() => decodeLivingWorldLightRelay(encodeToken(`${original}&progress=3`), { now: NOW }), /INVALID_LIGHT_RELAY_SHAPE/u);
  assert.throws(() => decodeLivingWorldLightRelay(encodeToken(`${original}&__proto__=x`), { now: NOW }), /INVALID_LIGHT_RELAY_SHAPE/u);
  assert.equal(lightRelayFromLocation(`#world-relay=${encodeLivingWorldLightRelay(value, { now: NOW })}`, {
    now: decodeLightRelayChapter(value, { now: NOW }).expiresAt + 1,
  }).status, 'expired');
});

test('fresh relay activates exactly its bound lantern once and duplicates become stale', () => {
  const storage = new MemoryStorage();
  const value = createLivingWorldLightRelay(chapter(3), 3, { now: NOW });
  assert.deepEqual(resolveLivingWorldLightRelay(storage, value, { now: NOW }), {
    status: 'ready',
    relay: value,
    chapter: decodeLightRelayChapter(value, { now: NOW }),
    progress: 3,
    completed: false,
  });
  const accepted = commitLivingWorldLightRelayContribution(storage, value, { now: NOW });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.progress, 4);
  assert.equal(accepted.activatedIndex, 3);
  assert.equal(accepted.completed, false);
  assert.equal(commitLivingWorldLightRelayContribution(storage, value, { now: NOW }).status, 'stale');
  const stored = JSON.parse(storage.getItem(LIVING_WORLD_CHAPTER_STORAGE_KEY));
  assert.equal(stored.chapters.length, 1);
  assert.equal(stored.chapters[0].progress, 4);
});

test('stale and malformed local state never roll progress backward or activate another lantern', () => {
  const chapterValue = chapter(3);
  const value = createLivingWorldLightRelay(chapterValue, 3, { now: NOW });
  const predecessorEventId = new URLSearchParams(decodeToken(chapterValue.predecessor)).get('eventId');
  const staleStorage = new MemoryStorage({
    [LIVING_WORLD_CHAPTER_STORAGE_KEY]: JSON.stringify({
      version: 1,
      chapters: [{
        chapterId: chapterValue.chapterId,
        predecessorEventId,
        target: 8,
        progress: 4,
        contributed: true,
      }],
    }),
  });
  const stale = resolveLivingWorldLightRelay(staleStorage, value, { now: NOW });
  assert.equal(stale.status, 'stale');
  assert.equal(stale.progress, 4);
  assert.equal(commitLivingWorldLightRelayContribution(staleStorage, value, { now: NOW }).status, 'stale');
  assert.equal(JSON.parse(staleStorage.getItem(LIVING_WORLD_CHAPTER_STORAGE_KEY)).chapters[0].progress, 4);

  const malformed = new MemoryStorage({ [LIVING_WORLD_CHAPTER_STORAGE_KEY]: '{not-json' });
  assert.equal(resolveLivingWorldLightRelay(malformed, value, { now: NOW }).status, 'storage-error');
  assert.equal(commitLivingWorldLightRelayContribution(malformed, value, { now: NOW }).status, 'storage-error');
  assert.equal(malformed.getItem(LIVING_WORLD_CHAPTER_STORAGE_KEY), '{not-json');
});

test('seventh relay completes the chapter and no onward target is fabricated', () => {
  const storage = new MemoryStorage();
  const value = createLivingWorldLightRelay(chapter(7), 7, { now: NOW });
  const accepted = commitLivingWorldLightRelayContribution(storage, value, { now: NOW });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.progress, 8);
  assert.equal(accepted.completed, true);
  assert.throws(() => createLivingWorldLightRelay(accepted.chapter, 8, { now: NOW }), /INVALID_LIGHT_RELAY_PROGRESS/u);
});

test('relay lantern projection distinguishes active, target, connected, and dormant structure', () => {
  const value = createLivingWorldLightRelay(chapter(3), 3, { now: NOW });
  const ready = deriveLightRelayLanterns(value, { progress: 3, phase: 'ready', now: NOW });
  assert.equal(ready.filter(item => item.active).length, 3);
  assert.equal(ready.find(item => item.target)?.index, 3);
  const impact = deriveLightRelayLanterns(value, { progress: 4, phase: 'impact', now: NOW });
  assert.equal(impact.find(item => item.connected)?.index, 3);
  assert.equal(evaluateLightRelayLocks([true, false, true]).accepted, true);
  assert.equal(evaluateLightRelayLocks([false, false, true]).accepted, false);
});

test('portrait media and share payload remain bounded, generic, and relay-specific', () => {
  const value = createLivingWorldLightRelay(chapter(5), 5, { now: NOW });
  for (const locale of ['en', 'ar']) {
    const model = createLivingWorldLightRelayMediaModel(value, locale, { now: NOW });
    assert.equal(model.width, LIVING_WORLD_LIGHT_RELAY_MEDIA_WIDTH);
    assert.equal(model.height, LIVING_WORLD_LIGHT_RELAY_MEDIA_HEIGHT);
    assert.equal(model.filename, LIVING_WORLD_LIGHT_RELAY_MEDIA_FILENAME);
    assert.equal(model.targetIndex, 5);
    assert.ok(model.sceneRatio >= 0.68);
    assert.doesNotMatch(JSON.stringify(model), /event_|chapter_|targetIndex=|world-relay=/u);
    const url = buildLivingWorldLightRelayUrl(value, { baseUrl: 'https://example.test/', now: NOW });
    assert.match(createLivingWorldLightRelaySharePayload(model, url).url, /#world-relay=/u);
    assert.throws(() => createLivingWorldLightRelaySharePayload(model, 'https://example.test/#world-chapter=x'), /INVALID_LIGHT_RELAY_MEDIA_URL/u);
  }
});

test('Arabic and English relay keys, copy budgets, and forbidden pressure language remain synchronized', () => {
  assert.equal(livingWorldLightRelayKeyParity().equal, true);
  const forbidden = /sender|recipient|waiting|your turn|score|rank|streak|chain|referral|مرسل|مستلم|بانتظارك|دورك|نتيجة|ترتيب|سلسلة|إحالة/iu;
  for (const locale of ['en', 'ar']) {
    const value = getLivingWorldLightRelayCopy(locale);
    assert.ok(value.world.title.split(/\s+/u).length <= 6);
    assert.ok(value.world.action.split(/\s+/u).length <= 3);
    assert.ok(value.result.share.split(/\s+/u).length <= 3);
    assert.doesNotMatch(JSON.stringify(value), forbidden);
  }
});
