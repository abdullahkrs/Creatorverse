import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createLivingWorldEvent } from '../src/living-world-event.js';
import {
  createLivingWorldChapter,
  LIVING_WORLD_CHAPTER_OWNER_KEY,
  LIVING_WORLD_CHAPTER_STORAGE_KEY,
} from '../src/living-world-chapter.js';
import {
  buildLivingWorldSkywellUrl,
  commitLivingWorldSkywellContribution,
  createLivingWorldSkywell,
  createOrResumeLivingWorldSkywell,
  decodeLivingWorldSkywell,
  deriveLivingWorldSkywellRibs,
  encodeLivingWorldSkywell,
  evaluateLivingWorldSkywellLocks,
  isLivingWorldSkywellLaunchEligible,
  LIVING_WORLD_SKYWELL_LAUNCH_KEY,
  LIVING_WORLD_SKYWELL_STORAGE_KEY,
  readLivingWorldSkywellState,
  resolveLivingWorldSkywell,
  skywellFromLocation,
} from '../src/living-world-skywell.js';
import {
  getLivingWorldSkywellCopy,
  livingWorldSkywellKeyParity,
} from '../src/living-world-skywell-i18n.js';
import {
  createLivingWorldSkywellMediaModel,
  createLivingWorldSkywellSharePayload,
  LIVING_WORLD_SKYWELL_MEDIA_FILENAME,
  LIVING_WORLD_SKYWELL_MEDIA_HEIGHT,
  LIVING_WORLD_SKYWELL_MEDIA_TYPE,
  LIVING_WORLD_SKYWELL_MEDIA_WIDTH,
} from '../src/living-world-skywell-media.js';

const NOW = 1_900_000_000_000;
let sequence = 1;

function opaque(prefix) {
  return `${prefix}_${String(sequence++).padStart(24, '0')}`;
}
function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}
function completedChapter() {
  const predecessor = createLivingWorldEvent({ duration: '6h', target: 12 }, {
    now: NOW,
    cryptoLike: webcrypto,
    eventId: opaque('event'),
    creatorName: 'Noura',
    progress: 12,
  });
  const chapter = createLivingWorldChapter(predecessor, { duration: '6h' }, {
    now: NOW,
    cryptoLike: webcrypto,
    chapterId: opaque('chapter'),
    progress: 8,
  });
  return { predecessor, chapter };
}
function eligibleStores(chapter, predecessor) {
  const local = storage({
    [LIVING_WORLD_CHAPTER_STORAGE_KEY]: JSON.stringify({
      version: 1,
      chapters: [{
        chapterId: chapter.chapterId,
        predecessorEventId: predecessor.eventId,
        target: 8,
        progress: 8,
        contributed: true,
      }],
    }),
  });
  const session = storage({ [LIVING_WORLD_CHAPTER_OWNER_KEY]: chapter.chapterId });
  return { local, session };
}
function mutateToken(token, mutation) {
  const decoded = Buffer.from(token, 'base64url').toString('utf8');
  return Buffer.from(mutation(decoded)).toString('base64url');
}

test('completed local creator context launches exactly one bounded Skywell event', () => {
  const { predecessor, chapter } = completedChapter();
  const { local, session } = eligibleStores(chapter, predecessor);
  assert.equal(isLivingWorldSkywellLaunchEligible(local, session, chapter, { now: NOW }), true);
  const created = createOrResumeLivingWorldSkywell(local, session, chapter, {
    now: NOW,
    cryptoLike: webcrypto,
    eventId: opaque('sky'),
  });
  assert.equal(created.status, 'created');
  assert.equal(created.event.progress, 0);
  assert.equal(created.event.target, 6);
  assert.equal(created.event.duration, '6h');
  const resumed = createOrResumeLivingWorldSkywell(local, session, chapter, { now: NOW });
  assert.equal(resumed.status, 'resumed');
  assert.deepEqual(resumed.event, created.event);
  assert.equal(JSON.parse(local.getItem(LIVING_WORLD_SKYWELL_LAUNCH_KEY)).launches.length, 1);
});

test('fresh, follower, incomplete, malformed and storage-failure contexts cannot launch', () => {
  const { predecessor, chapter } = completedChapter();
  const { local } = eligibleStores(chapter, predecessor);
  assert.equal(isLivingWorldSkywellLaunchEligible(local, storage(), chapter, { now: NOW }), false);
  assert.equal(isLivingWorldSkywellLaunchEligible(storage(), storage({ [LIVING_WORLD_CHAPTER_OWNER_KEY]: chapter.chapterId }), chapter, { now: NOW }), false);
  assert.equal(isLivingWorldSkywellLaunchEligible(local, storage({ [LIVING_WORLD_CHAPTER_OWNER_KEY]: 'chapter_wrong000000000000000000' }), chapter, { now: NOW }), false);
  const failing = { getItem() { throw new Error('blocked'); } };
  assert.equal(isLivingWorldSkywellLaunchEligible(failing, storage({ [LIVING_WORLD_CHAPTER_OWNER_KEY]: chapter.chapterId }), chapter, { now: NOW }), false);
});

test('strict fragment transport round-trips, strips query state and rejects hostile shape changes', () => {
  const { chapter } = completedChapter();
  const event = createLivingWorldSkywell(chapter, {
    now: NOW,
    cryptoLike: webcrypto,
    eventId: opaque('sky'),
    progress: 2,
  });
  const token = encodeLivingWorldSkywell(event, { now: NOW });
  assert.deepEqual(decodeLivingWorldSkywell(token, { now: NOW }), event);
  const url = new URL(buildLivingWorldSkywellUrl(event, {
    now: NOW,
    baseUrl: 'https://example.test/path?private=value#old',
  }));
  assert.equal(url.search, '');
  assert.match(url.hash, /^#skywell=[A-Za-z0-9_-]+$/u);
  assert.equal(skywellFromLocation(url.hash, { now: NOW }).status, 'ready');
  assert.equal(skywellFromLocation('?skywell=bad', { now: NOW }).status, 'none');
  assert.throws(() => decodeLivingWorldSkywell(mutateToken(token, value => `${value}&extra=x`), { now: NOW }), /INVALID_SKYWELL_SHAPE/u);
  assert.throws(() => decodeLivingWorldSkywell(mutateToken(token, value => `${value}&progress=2`), { now: NOW }), /INVALID_SKYWELL_SHAPE/u);
  assert.throws(() => decodeLivingWorldSkywell(mutateToken(token, value => value.replace('target=6', 'target=5')), { now: NOW }), /INVALID_SKYWELL_TARGET/u);
  assert.throws(() => decodeLivingWorldSkywell(`${token}\u202e`, { now: NOW }), /INVALID_SKYWELL_TOKEN/u);
});

test('one accepted contribution opens exactly the next rib once and duplicate state stays neutral', () => {
  const { chapter } = completedChapter();
  const event = createLivingWorldSkywell(chapter, {
    now: NOW,
    cryptoLike: webcrypto,
    eventId: opaque('sky'),
    progress: 3,
  });
  const local = storage();
  assert.equal(resolveLivingWorldSkywell(local, event, { now: NOW }).status, 'ready');
  const committed = commitLivingWorldSkywellContribution(local, event, { now: NOW });
  assert.deepEqual({ status: committed.status, progress: committed.progress, activatedIndex: committed.activatedIndex }, {
    status: 'accepted', progress: 4, activatedIndex: 3,
  });
  const duplicate = commitLivingWorldSkywellContribution(local, event, { now: NOW });
  assert.equal(duplicate.status, 'stale');
  assert.equal(duplicate.progress, 4);
  const stored = JSON.parse(local.getItem(LIVING_WORLD_SKYWELL_STORAGE_KEY));
  assert.equal(stored.events.length, 1);
  assert.equal(stored.events[0].progress, 4);
  const ribs = deriveLivingWorldSkywellRibs(4);
  assert.equal(ribs.filter(rib => rib.open).length, 4);
  assert.equal(ribs.find(rib => rib.target)?.index, 4);
  assert.equal(ribs.filter(rib => rib.target).length, 1);
});

test('failure and failed storage never mutate progress', () => {
  const { chapter } = completedChapter();
  const event = createLivingWorldSkywell(chapter, {
    now: NOW,
    cryptoLike: webcrypto,
    eventId: opaque('sky'),
    progress: 1,
  });
  const local = storage();
  assert.equal(evaluateLivingWorldSkywellLocks([true, false, false]).accepted, false);
  assert.equal(readLivingWorldSkywellState(local, event, { now: NOW }).progress, 1);
  assert.equal(local.getItem(LIVING_WORLD_SKYWELL_STORAGE_KEY), null);
  const failing = {
    getItem() { return null; },
    setItem() { throw new Error('blocked'); },
    removeItem() {},
  };
  const failed = commitLivingWorldSkywellContribution(failing, event, { now: NOW });
  assert.equal(failed.status, 'storage-error');
  assert.equal(failed.progress, 1);
});

test('sixth accepted rib completes the authored aperture without a score model', () => {
  const { chapter } = completedChapter();
  const event = createLivingWorldSkywell(chapter, {
    now: NOW,
    cryptoLike: webcrypto,
    eventId: opaque('sky'),
    progress: 5,
  });
  const committed = commitLivingWorldSkywellContribution(storage(), event, { now: NOW });
  assert.equal(committed.status, 'accepted');
  assert.equal(committed.progress, 6);
  assert.equal(committed.completed, true);
  const ribs = deriveLivingWorldSkywellRibs(6);
  assert.equal(ribs.every(rib => rib.open), true);
  assert.equal(ribs.some(rib => rib.target), false);
});

test('Arabic and English stay synchronized and visible copy remains within the issue budget', () => {
  assert.equal(livingWorldSkywellKeyParity().equal, true);
  const words = value => value.trim().split(/\s+/u).length;
  for (const localized of [getLivingWorldSkywellCopy('en'), getLivingWorldSkywellCopy('ar')]) {
    assert.ok(words(localized.launch.context) <= 4);
    assert.ok(words(localized.launch.title) <= 6);
    assert.ok(words(localized.launch.action) <= 3);
    assert.ok(words(localized.world.title) <= 6);
    assert.ok(words(localized.world.goal) <= 8);
    assert.ok(words(localized.world.action) <= 3);
    assert.ok(words(localized.active.status) <= 2);
    assert.ok(words(localized.result.changed) <= 6);
    assert.ok(words(localized.result.impact) <= 8);
    assert.ok(localized.result.unavailable.length <= 72);
  }
});

test('portrait media models are deterministic, bounded and exclude event identifiers from share copy', () => {
  const { chapter } = completedChapter();
  const event = createLivingWorldSkywell(chapter, {
    now: NOW,
    cryptoLike: webcrypto,
    eventId: opaque('sky'),
    progress: 2,
  });
  const partial = createLivingWorldSkywellMediaModel(event, 3, 'en', { now: NOW });
  const completed = createLivingWorldSkywellMediaModel(event, 6, 'ar', { now: NOW });
  assert.equal(partial.width, LIVING_WORLD_SKYWELL_MEDIA_WIDTH);
  assert.equal(partial.height, LIVING_WORLD_SKYWELL_MEDIA_HEIGHT);
  assert.equal(partial.type, LIVING_WORLD_SKYWELL_MEDIA_TYPE);
  assert.equal(partial.filename, LIVING_WORLD_SKYWELL_MEDIA_FILENAME);
  assert.equal(partial.complete, false);
  assert.equal(completed.complete, true);
  assert.notEqual(partial.alternative, completed.alternative);
  for (const model of [partial, completed]) {
    assert.doesNotMatch(JSON.stringify(model), /sky_[a-z0-9]{20,40}|chapter_[a-z0-9]{20,40}|event_[a-z0-9]{20,40}/u);
  }
  const url = buildLivingWorldSkywellUrl({ ...event, progress: 3 }, { now: NOW, baseUrl: 'https://example.test/' });
  const payload = createLivingWorldSkywellSharePayload(partial, url);
  assert.equal(payload.title, partial.eventTitle);
  assert.equal(payload.text, partial.invitation);
  assert.match(payload.url, /#skywell=/u);
  assert.doesNotMatch(`${payload.title} ${payload.text}`, /sky_|chapter_|event_/u);
});
