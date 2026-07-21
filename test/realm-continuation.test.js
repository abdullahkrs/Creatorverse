import test from 'node:test';
import assert from 'node:assert/strict';

import { createCompletionReceipt, parseCompletionReceiptToken } from '../src/completion-receipt.js';
import {
  CREATOR_LEDGER_KEY,
  getCreatorRealm,
  importCompletionReceipt,
  inspectCreatorLedger,
  saveCreatorRealm,
} from '../src/creator-ledger.js';
import { parsePrototypeInviteToken } from '../src/prototype-invite.js';
import {
  createRealmContinuationInvite,
  readRealmContinuationDraft,
  restorePendingRealmContinuationInvite,
  restoreRealmContinuationDraft,
  writeRealmContinuationDraft,
} from '../src/realm-continuation.js';
import { getRealmContinuationCopy, getRealmContinuationKeySets } from '../src/realm-continuation-i18n.js';

const REALM_ID = 'realm_abcdefghijklmnop';
const START_MINUTE = 30_000_000;

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  let failWrites = false;
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (failWrites) throw new Error('QUOTA');
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
    setFailWrites(value) { failWrites = value; },
    snapshot() { return new Map(values); },
  };
}

function deterministicCrypto() {
  let counter = 0;
  return {
    getRandomValues(bytes) {
      counter += 1;
      bytes.fill(counter);
      return bytes;
    },
  };
}

function seedRealm(storage) {
  return saveCreatorRealm(storage, { realmId: REALM_ID, name: 'Nova Guild', theme: 'cosmic' });
}

function validReceipt(mission, index = 1, overrides = {}) {
  return {
    realmId: REALM_ID,
    receiptId: `receipt_${String(index).padStart(16, '0')}`,
    missionInstanceId: mission.id,
    missionId: mission.missionId,
    roleId: 'builder',
    routeId: 'sky',
    contribution: 3,
    districtId: 'beacon-district',
    ...overrides,
  };
}

test('restores only an exact same-realm continuation draft', () => {
  const storage = memoryStorage();
  const fallback = readRealmContinuationDraft(storage, REALM_ID);
  assert.deepEqual(fallback, {
    version: 1,
    realmId: REALM_ID,
    open: false,
    missionId: 'route-choice',
    scheduleId: 'now-1h',
  });

  writeRealmContinuationDraft(storage, {
    ...fallback,
    open: true,
    missionId: 'signal-match',
    scheduleId: 'now-24h',
  });
  assert.equal(readRealmContinuationDraft(storage, REALM_ID).open, true);
  assert.equal(readRealmContinuationDraft(storage, REALM_ID).missionId, 'signal-match');
  assert.equal(restoreRealmContinuationDraft({ ...fallback, realmId: 'realm_qrstuvwxyzABCDE' }, REALM_ID).open, false);
  assert.equal(restoreRealmContinuationDraft({ ...fallback, extra: 'hidden' }, REALM_ID).open, false);
});

test('creates one fresh mission instance without changing progress and restores retries idempotently', () => {
  const storage = memoryStorage();
  seedRealm(storage);
  const now = START_MINUTE * 60_000;
  const cryptoLike = deterministicCrypto();
  const created = createRealmContinuationInvite(storage, {
    missionId: 'relay-sequence',
    scheduleId: 'now-24h',
  }, { now, cryptoLike, baseUrl: 'https://creatorverse.example/play?private=1' });

  assert.equal(created.status, 'ready');
  assert.equal(created.reused, false);
  assert.equal(created.realm.id, REALM_ID);
  assert.equal(created.realm.total, 0);
  assert.equal(created.realm.receipts.length, 0);
  assert.equal(created.realm.missions.length, 1);
  assert.equal(created.realm.missions[0].consumed, false);
  assert.equal(created.url, `https://creatorverse.example/play#invite=${created.token}`);
  assert.doesNotMatch(created.url, /private=1/u);

  const parsed = parsePrototypeInviteToken(created.token, { now });
  assert.equal(parsed.status, 'valid');
  assert.equal(parsed.invite.realmId, REALM_ID);
  assert.equal(parsed.invite.missionInstanceId, created.mission.id);
  assert.equal(parsed.invite.missionId, 'relay-sequence');

  const restored = restorePendingRealmContinuationInvite(storage, { now, baseUrl: 'https://creatorverse.example/play' });
  assert.equal(restored.status, 'ready');
  assert.equal(restored.mission.id, created.mission.id);
  assert.equal(restored.token, created.token);

  const retried = createRealmContinuationInvite(storage, {
    missionId: 'signal-match',
    scheduleId: 'in-1h-24h',
  }, { now, cryptoLike, baseUrl: 'https://creatorverse.example/play' });
  assert.equal(retried.status, 'ready');
  assert.equal(retried.reused, true);
  assert.equal(retried.mission.id, created.mission.id);
  assert.equal(getCreatorRealm(storage, REALM_ID).missions.length, 1);
});

test('binds a returned receipt to the issued mission and imports exactly once', () => {
  const storage = memoryStorage();
  seedRealm(storage);
  const now = START_MINUTE * 60_000;
  const created = createRealmContinuationInvite(storage, {
    missionId: 'signal-match', scheduleId: 'now-1h',
  }, { now, cryptoLike: deterministicCrypto() });
  assert.equal(created.status, 'ready');

  const token = createCompletionReceipt(validReceipt(created.mission));
  const parsed = parseCompletionReceiptToken(token);
  assert.equal(parsed.status, 'valid');
  assert.equal(parsed.receipt.missionInstanceId, created.mission.id);

  const imported = importCompletionReceipt(storage, parsed.receipt);
  assert.equal(imported.status, 'success');
  assert.equal(imported.realm.total, 3);
  assert.equal(imported.realm.receipts.length, 1);
  assert.equal(imported.realm.missions[0].consumed, true);

  const replay = importCompletionReceipt(storage, validReceipt(created.mission, 2));
  assert.equal(replay.status, 'duplicate');
  assert.equal(getCreatorRealm(storage, REALM_ID).total, 3);
  assert.equal(getCreatorRealm(storage, REALM_ID).receipts.length, 1);
});

test('rejects unsupported, cross-realm, and inconsistent mission instances without mutation', () => {
  const storage = memoryStorage();
  seedRealm(storage);
  const created = createRealmContinuationInvite(storage, {
    missionId: 'route-choice', scheduleId: 'now-1h',
  }, { now: START_MINUTE * 60_000, cryptoLike: deterministicCrypto() });
  const before = storage.getItem(CREATOR_LEDGER_KEY);

  assert.equal(importCompletionReceipt(storage, validReceipt(created.mission, 1, {
    missionInstanceId: 'instance_unknown000000',
  })).status, 'mismatch');
  assert.equal(importCompletionReceipt(storage, validReceipt(created.mission, 2, {
    realmId: 'realm_qrstuvwxyzABCDE',
  })).status, 'mismatch');
  assert.equal(importCompletionReceipt(storage, validReceipt(created.mission, 3, {
    missionId: 'signal-match',
  })).status, 'mismatch');
  assert.equal(storage.getItem(CREATOR_LEDGER_KEY), before);
});

test('fails closed when mission persistence fails and leaves the realm byte-for-byte unchanged', () => {
  const storage = memoryStorage();
  seedRealm(storage);
  const before = storage.getItem(CREATOR_LEDGER_KEY);
  storage.setFailWrites(true);
  const outcome = createRealmContinuationInvite(storage, {
    missionId: 'route-choice', scheduleId: 'now-1h',
  }, { now: START_MINUTE * 60_000, cryptoLike: deterministicCrypto() });
  assert.equal(outcome.status, 'storage-error');
  assert.equal(storage.getItem(CREATOR_LEDGER_KEY), before);
});

test('seven deterministic mission instances and receipts add exactly +21 engineering regression energy', () => {
  const storage = memoryStorage();
  seedRealm(storage);
  const cryptoLike = deterministicCrypto();
  const missions = ['route-choice', 'relay-sequence', 'signal-match'];
  const schedules = ['now-1h', 'now-24h', 'in-1h-24h'];

  for (let index = 0; index < 7; index += 1) {
    const now = (START_MINUTE + index) * 60_000;
    const created = createRealmContinuationInvite(storage, {
      missionId: missions[index % missions.length],
      scheduleId: schedules[index % schedules.length],
    }, { now, cryptoLike });
    assert.equal(created.status, 'ready');
    assert.equal(created.reused, false);
    const imported = importCompletionReceipt(storage, validReceipt(created.mission, index + 1, {
      roleId: ['builder', 'explorer', 'guardian'][index % 3],
      routeId: index % 2 ? 'ocean' : 'sky',
    }));
    assert.equal(imported.status, 'success');
    assert.equal(imported.realm.total, (index + 1) * 3);
  }

  const realm = getCreatorRealm(storage, REALM_ID);
  assert.equal(realm.total, 21);
  assert.equal(realm.receipts.length, 7);
  assert.equal(realm.missions.length, 7);
  assert.ok(realm.missions.every(mission => mission.consumed));
});

test('fails closed for malformed saved realms and keeps bilingual continuation keys synchronized', () => {
  const storage = memoryStorage({
    [CREATOR_LEDGER_KEY]: JSON.stringify({ version: 1, realms: [{ id: REALM_ID, extra: '<script>' }] }),
  });
  assert.equal(inspectCreatorLedger(storage).status, 'invalid');
  assert.equal(createRealmContinuationInvite(storage, {
    missionId: 'route-choice', scheduleId: 'now-1h',
  }, { now: START_MINUTE * 60_000, cryptoLike: deterministicCrypto() }).status, 'invalid');

  const keys = getRealmContinuationKeySets();
  assert.deepEqual(keys.ar, keys.en);
  assert.equal(getRealmContinuationCopy('en').title, 'Launch next mission');
  assert.equal(getRealmContinuationCopy('ar').title, 'أطلق المهمة التالية');
  assert.ok(getRealmContinuationCopy('en').support.length <= 72);
  assert.ok(getRealmContinuationCopy('ar').support.length <= 72);
});
