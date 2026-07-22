import test from 'node:test';
import assert from 'node:assert/strict';
import { getSingleCreatorRealm, saveCreatorRealm } from '../src/creator-ledger.js';
import { REALM_COLLABORATION_KEY } from '../src/realm-collaboration.js';
import { createSharedMissionInvite, createSharedMissionReceipts, importSharedMissionReceipt } from '../src/shared-mission.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function deterministicCrypto(start) {
  let counter = start;
  return {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = (counter + index) % 256;
      counter += bytes.length + 1;
      return bytes;
    },
  };
}

const NOW = Date.UTC(2026, 6, 22, 5, 0, 0);
const A = { id: 'realm_A_0000000000000001', name: 'North Signal', theme: 'cosmic' };
const B = { id: 'realm_B_0000000000000002', name: 'Green Relay', theme: 'wild' };
const REL = 'proposal_000000000000000000000001';

function record(local, source) {
  return {
    version: 1,
    localRealmId: local.id,
    sourceRealmId: source.id,
    proposalId: REL,
    sourceName: source.name,
    sourceTheme: source.theme,
  };
}

function creatorStorage() {
  const storage = new MemoryStorage();
  saveCreatorRealm(storage, { realmId: A.id, name: A.name, theme: A.theme });
  storage.setItem(REALM_COLLABORATION_KEY, JSON.stringify(record(A, B)));
  return storage;
}

test('reusing one shared invite cannot credit the same target realm twice', () => {
  const invitationStorage = creatorStorage();
  const invitation = createSharedMissionInvite(invitationStorage, A, record(A, B), {
    missionId: 'route-choice',
    scheduleId: 'now-1h',
  }, {
    now: NOW,
    cryptoLike: deterministicCrypto(1),
    baseUrl: 'https://preview.example.test/app',
  });
  assert.equal(invitation.status, 'ready');

  const firstCompletion = createSharedMissionReceipts(invitation.invite, { roleId: 'builder', routeId: 'sky' }, {
    now: NOW + 1_000,
    cryptoLike: deterministicCrypto(50),
    baseUrl: 'https://preview.example.test/app',
  });
  const replayedCompletion = createSharedMissionReceipts(invitation.invite, { roleId: 'builder', routeId: 'sky' }, {
    now: NOW + 2_000,
    cryptoLike: deterministicCrypto(100),
    baseUrl: 'https://preview.example.test/app',
  });
  assert.notEqual(firstCompletion.completionId, replayedCompletion.completionId);

  const firstReceipt = firstCompletion.receipts.find(item => item.targetRealmId === A.id).receipt;
  const replayedReceipt = replayedCompletion.receipts.find(item => item.targetRealmId === A.id).receipt;
  assert.notEqual(firstReceipt.receiptId, replayedReceipt.receiptId);
  assert.equal(firstReceipt.sharedMissionId, replayedReceipt.sharedMissionId);

  const targetStorage = creatorStorage();
  assert.equal(importSharedMissionReceipt(targetStorage, firstReceipt).status, 'success');
  assert.equal(importSharedMissionReceipt(targetStorage, replayedReceipt).status, 'duplicate');
  assert.equal(getSingleCreatorRealm(targetStorage).realm.total, 3);
  assert.equal(getSingleCreatorRealm(targetStorage).realm.receipts.length, 1);
  assert.equal(getSingleCreatorRealm(targetStorage).realm.receipts[0].id, invitation.invite.missionInstanceId);
});
