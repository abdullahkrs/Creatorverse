import test from 'node:test';
import assert from 'node:assert/strict';
import { CREATOR_LEDGER_KEY, getSingleCreatorRealm, saveCreatorRealm } from '../src/creator-ledger.js';
import { REALM_COLLABORATION_KEY } from '../src/realm-collaboration.js';
import {
  SHARED_MISSION_INVITE_FRAGMENT,
  SHARED_MISSION_RECEIPT_FRAGMENT,
  createSharedMissionInvite,
  createSharedMissionReceipts,
  decodeSharedMissionInvite,
  decodeSharedMissionReceipt,
  encodeSharedMissionInvite,
  encodeSharedMissionReceipt,
  importSharedMissionReceipt,
  inspectSharedMissionReceiptForCreator,
  isValidSharedMissionInvite,
  isValidSharedMissionReceipt,
  parseSharedMissionInviteFragment,
  parseSharedMissionReceiptFragment,
  sharedMissionLimits,
} from '../src/shared-mission.js';
import { getSharedMissionCopy } from '../src/shared-mission-i18n.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
    this.failKey = '';
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    if (key === this.failKey) throw new Error('STORAGE_WRITE_FAILED');
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function deterministicCrypto(start = 1) {
  let counter = start;
  return {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = (counter + index) % 256;
      }
      counter += bytes.length + 1;
      return bytes;
    },
  };
}

const NOW = Date.UTC(2026, 6, 22, 5, 0, 0);
const REALM_A = Object.freeze({ id: 'realm_A_0000000000000001', name: 'North Signal', theme: 'cosmic' });
const REALM_B = Object.freeze({ id: 'realm_B_0000000000000002', name: 'Green Relay', theme: 'wild' });
const RELATIONSHIP_ID = 'proposal_000000000000000000000001';

function collaboration(local, source) {
  return Object.freeze({
    version: 1,
    localRealmId: local.id,
    sourceRealmId: source.id,
    proposalId: RELATIONSHIP_ID,
    sourceName: source.name,
    sourceTheme: source.theme,
  });
}

function creatorStorage(local, source) {
  const storage = new MemoryStorage();
  saveCreatorRealm(storage, { realmId: local.id, name: local.name, theme: local.theme });
  storage.setItem(REALM_COLLABORATION_KEY, JSON.stringify(collaboration(local, source)));
  return storage;
}

function createFixture() {
  const storage = creatorStorage(REALM_A, REALM_B);
  const outcome = createSharedMissionInvite(storage, REALM_A, collaboration(REALM_A, REALM_B), {
    missionId: 'route-choice',
    scheduleId: 'now-1h',
  }, {
    now: NOW,
    cryptoLike: deterministicCrypto(1),
    baseUrl: 'https://preview.example.test/app',
  });
  assert.equal(outcome.status, 'ready');
  return { storage, outcome };
}

function rawToken(prefix, payload) {
  return `${prefix}${Buffer.from(payload, 'utf8').toString('base64url')}`;
}

test('shared invite is exact, bounded, opaque, and fragment-only', () => {
  const { outcome } = createFixture();
  assert.match(outcome.invite.missionInstanceId, /^[A-Za-z0-9_-]{16,64}$/u);
  assert.notEqual(outcome.invite.missionInstanceId, RELATIONSHIP_ID);
  assert.ok(outcome.token.length <= sharedMissionLimits.maxInviteTokenLength);
  assert.equal(new URL(outcome.url).search, '');
  assert.match(new URL(outcome.url).hash, new RegExp(`^#${SHARED_MISSION_INVITE_FRAGMENT}=`));

  const parsed = parseSharedMissionInviteFragment(new URL(outcome.url).hash, { now: NOW });
  assert.equal(parsed.status, 'valid');
  assert.deepEqual(parsed.invite, outcome.invite);
  assert.deepEqual(decodeSharedMissionInvite(encodeSharedMissionInvite(outcome.invite), { now: NOW }), outcome.invite);
});

test('shared invite rejects duplicate, unknown, query, self-pair, hostile, and oversized state', () => {
  const { outcome } = createFixture();
  const compact = {
    v: 1,
    mi: outcome.invite.missionInstanceId,
    ai: outcome.invite.initiatorRealmId,
    an: outcome.invite.initiatorName,
    at: outcome.invite.initiatorTheme,
    bi: outcome.invite.linkedRealmId,
    bn: outcome.invite.linkedName,
    bt: outcome.invite.linkedTheme,
    rel: outcome.invite.relationshipId,
    m: outcome.invite.missionId,
    s: outcome.invite.scheduleId,
    c: outcome.invite.createdAtMinute,
    st: outcome.invite.startMinute,
    e: outcome.invite.endMinute,
  };
  const unknown = rawToken('csm1.', JSON.stringify({ ...compact, extra: 'x' }));
  assert.equal(parseSharedMissionInviteFragment(`#${SHARED_MISSION_INVITE_FRAGMENT}=${unknown}`, { now: NOW }).status, 'invalid');

  const duplicateJson = JSON.stringify(compact).replace('{', '{"v":1,');
  const duplicate = rawToken('csm1.', duplicateJson);
  assert.equal(parseSharedMissionInviteFragment(`#${SHARED_MISSION_INVITE_FRAGMENT}=${duplicate}`, { now: NOW }).status, 'invalid');
  assert.equal(parseSharedMissionInviteFragment(`#${SHARED_MISSION_INVITE_FRAGMENT}=${outcome.token}&x=1`, { now: NOW }).status, 'invalid');
  assert.equal(parseSharedMissionInviteFragment(`?${SHARED_MISSION_INVITE_FRAGMENT}=${outcome.token}`, { now: NOW }).status, 'none');
  assert.equal(parseSharedMissionInviteFragment(`#${SHARED_MISSION_INVITE_FRAGMENT}=${'a'.repeat(sharedMissionLimits.maxInviteTokenLength + 1)}`, { now: NOW }).status, 'invalid');

  assert.equal(isValidSharedMissionInvite({ ...outcome.invite, linkedRealmId: outcome.invite.initiatorRealmId }, { now: NOW }), false);
  assert.equal(isValidSharedMissionInvite({ ...outcome.invite, linkedName: 'Unsafe\u202eName' }, { now: NOW }), false);
  assert.equal(isValidSharedMissionInvite({ ...outcome.invite, missionId: 'unknown' }, { now: NOW }), false);
});

test('one completion derives exactly two target-specific +3 receipts with one completion identity', () => {
  const { outcome } = createFixture();
  const completed = createSharedMissionReceipts(outcome.invite, {
    roleId: 'builder',
    routeId: 'sky',
  }, {
    now: NOW + 1_000,
    cryptoLike: deterministicCrypto(50),
    baseUrl: 'https://preview.example.test/app',
  });
  assert.equal(completed.status, 'ready');
  assert.equal(completed.receipts.length, 2);
  assert.deepEqual(new Set(completed.receipts.map(item => item.targetRealmId)), new Set([REALM_A.id, REALM_B.id]));
  assert.equal(new Set(completed.receipts.map(item => item.receipt.receiptId)).size, 2);
  assert.ok(completed.receipts.every(item => item.receipt.completionId === completed.completionId));
  assert.ok(completed.receipts.every(item => item.receipt.sharedMissionId === outcome.invite.missionInstanceId));
  assert.ok(completed.receipts.every(item => item.receipt.contribution === 3));
  assert.ok(completed.receipts.every(item => new URL(item.url).hash.startsWith(`#${SHARED_MISSION_RECEIPT_FRAGMENT}=`)));
  assert.ok(completed.receipts.every(item => isValidSharedMissionReceipt(decodeSharedMissionReceipt(item.token))));
});

test('each creator independently imports only the matching receipt exactly once', () => {
  const { outcome } = createFixture();
  const completed = createSharedMissionReceipts(outcome.invite, { roleId: 'explorer', routeId: 'ocean' }, {
    now: NOW + 1_000,
    cryptoLike: deterministicCrypto(90),
    baseUrl: 'https://preview.example.test/app',
  });
  const receiptA = completed.receipts.find(item => item.targetRealmId === REALM_A.id).receipt;
  const receiptB = completed.receipts.find(item => item.targetRealmId === REALM_B.id).receipt;
  const storageA = creatorStorage(REALM_A, REALM_B);
  const storageB = creatorStorage(REALM_B, REALM_A);

  assert.equal(inspectSharedMissionReceiptForCreator(storageA, receiptA).status, 'ready');
  assert.equal(inspectSharedMissionReceiptForCreator(storageB, receiptB).status, 'ready');
  assert.equal(importSharedMissionReceipt(storageA, receiptA).status, 'success');
  assert.equal(importSharedMissionReceipt(storageB, receiptB).status, 'success');
  assert.equal(getSingleCreatorRealm(storageA).realm.total, 3);
  assert.equal(getSingleCreatorRealm(storageB).realm.total, 3);
  assert.equal(getSingleCreatorRealm(storageA).realm.receipts.length, 1);
  assert.equal(getSingleCreatorRealm(storageB).realm.receipts.length, 1);
  assert.equal(importSharedMissionReceipt(storageA, receiptA).status, 'duplicate');
  assert.equal(importSharedMissionReceipt(storageB, receiptB).status, 'duplicate');
  assert.equal(getSingleCreatorRealm(storageA).realm.total, 3);
  assert.equal(getSingleCreatorRealm(storageB).realm.total, 3);
});

test('wrong realm, removed collaboration, altered bindings, and altered contribution fail closed', () => {
  const { outcome } = createFixture();
  const completed = createSharedMissionReceipts(outcome.invite, { roleId: 'guardian', routeId: 'sky' }, {
    now: NOW + 1_000,
    cryptoLike: deterministicCrypto(130),
    baseUrl: 'https://preview.example.test/app',
  });
  const receiptA = completed.receipts.find(item => item.targetRealmId === REALM_A.id).receipt;
  const storageA = creatorStorage(REALM_A, REALM_B);
  const storageB = creatorStorage(REALM_B, REALM_A);

  assert.equal(inspectSharedMissionReceiptForCreator(storageB, receiptA).status, 'wrong-realm');
  storageA.removeItem(REALM_COLLABORATION_KEY);
  assert.equal(inspectSharedMissionReceiptForCreator(storageA, receiptA).status, 'collaboration-removed');
  assert.equal(getSingleCreatorRealm(storageA).realm.total, 0);

  const mismatchedStorage = creatorStorage(REALM_A, REALM_B);
  const mismatched = { ...receiptA, relationshipId: 'proposal_999999999999999999999999' };
  assert.equal(isValidSharedMissionReceipt(mismatched), true);
  assert.equal(inspectSharedMissionReceiptForCreator(mismatchedStorage, mismatched).status, 'mismatch');
  assert.equal(isValidSharedMissionReceipt({ ...receiptA, contribution: 6 }), false);
  assert.throws(() => encodeSharedMissionReceipt({ ...receiptA, contribution: 6 }), /SHARED_RECEIPT_INVALID/u);
  assert.equal(getSingleCreatorRealm(mismatchedStorage).realm.total, 0);
});

test('ledger storage failure creates no partial progress and preserves retry', () => {
  const { outcome } = createFixture();
  const completed = createSharedMissionReceipts(outcome.invite, { roleId: 'builder', routeId: 'sky' }, {
    now: NOW + 1_000,
    cryptoLike: deterministicCrypto(170),
    baseUrl: 'https://preview.example.test/app',
  });
  const receiptA = completed.receipts.find(item => item.targetRealmId === REALM_A.id).receipt;
  const storage = creatorStorage(REALM_A, REALM_B);
  const before = storage.getItem(CREATOR_LEDGER_KEY);
  storage.failKey = CREATOR_LEDGER_KEY;
  assert.equal(importSharedMissionReceipt(storage, receiptA).status, 'storage-error');
  assert.equal(storage.getItem(CREATOR_LEDGER_KEY), before);
  assert.equal(getSingleCreatorRealm(storage).realm.total, 0);
  storage.failKey = '';
  assert.equal(importSharedMissionReceipt(storage, receiptA).status, 'success');
  assert.equal(getSingleCreatorRealm(storage).realm.total, 3);
});

test('receipt codec rejects duplicate, unknown, malformed, and oversized payloads', () => {
  const { outcome } = createFixture();
  const completed = createSharedMissionReceipts(outcome.invite, { roleId: 'builder', routeId: 'sky' }, {
    now: NOW + 1_000,
    cryptoLike: deterministicCrypto(210),
    baseUrl: 'https://preview.example.test/app',
  });
  const item = completed.receipts[0];
  assert.deepEqual(decodeSharedMissionReceipt(encodeSharedMissionReceipt(item.receipt)), item.receipt);
  assert.equal(parseSharedMissionReceiptFragment(`#${SHARED_MISSION_RECEIPT_FRAGMENT}=${item.token}&extra=1`).status, 'invalid');
  assert.equal(parseSharedMissionReceiptFragment(`#${SHARED_MISSION_RECEIPT_FRAGMENT}=${'x'.repeat(sharedMissionLimits.maxReceiptTokenLength + 1)}`).status, 'invalid');

  const compact = JSON.parse(Buffer.from(item.token.slice('csr1.'.length), 'base64url').toString('utf8'));
  const unknown = rawToken('csr1.', JSON.stringify({ ...compact, extra: 'x' }));
  assert.equal(parseSharedMissionReceiptFragment(`#${SHARED_MISSION_RECEIPT_FRAGMENT}=${unknown}`).status, 'invalid');
  const duplicate = rawToken('csr1.', JSON.stringify(compact).replace('{', '{"v":1,'));
  assert.equal(parseSharedMissionReceiptFragment(`#${SHARED_MISSION_RECEIPT_FRAGMENT}=${duplicate}`).status, 'invalid');
});

test('Arabic and English copy remain synchronized and within the focused copy budget', () => {
  const english = getSharedMissionCopy('en');
  const arabic = getSharedMissionCopy('ar');
  assert.deepEqual(Object.keys(arabic).sort(), Object.keys(english).sort());
  assert.ok(english.action.split(/\s+/u).length <= 3);
  assert.ok(arabic.action.split(/\s+/u).length <= 3);
  assert.ok(english.title.split(/\s+/u).length >= 3 && english.title.split(/\s+/u).length <= 6);
  assert.ok(arabic.title.split(/\s+/u).length >= 3 && arabic.title.split(/\s+/u).length <= 6);
  assert.ok(english.support.length <= 90);
  assert.ok(arabic.support.length <= 90);
  assert.doesNotMatch(`${english.completeSupport} ${arabic.completeSupport}`, /delivered|online|synchron/iuy);
});
