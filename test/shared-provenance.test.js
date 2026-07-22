import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CREATOR_LEDGER_KEY,
  CREATOR_SHARED_PROVENANCE_VERSION,
  importCompletionReceipt,
  inspectCreatorLedger,
} from '../src/creator-ledger.js';
import { deriveRealmChronicle } from '../src/realm-chronicle.js';
import { getRealmChronicleCopy, getRealmChronicleKeySets } from '../src/realm-chronicle-i18n.js';
import { REALM_COLLABORATION_KEY } from '../src/realm-collaboration.js';
import {
  SHARED_RECEIPT_PREVIEW_KEY,
  resolvePendingSharedContributionProvenance,
} from '../src/shared-contribution-provenance.js';
import { importSharedMissionReceipt } from '../src/shared-mission.js';

const LOCAL = { id: 'realm_local_00000001', name: 'Signal Atlas', theme: 'cosmic' };
const PARTNER = { id: 'realm_partner_000001', name: 'Canopy Relay', theme: 'wild' };
const RELATIONSHIP_ID = 'proposal_000000000000000000000018';
const SHARED_MISSION_ID = 'mission_000000000000000000000018';

function memoryStorage(entries = [], { failLedgerWrites = false } = {}) {
  const values = new Map(entries);
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (failLedgerWrites && key === CREATOR_LEDGER_KEY && values.has(key)) throw new Error('quota');
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
  };
}

function realm(receipts = []) {
  return {
    ...LOCAL,
    total: receipts.length * 3,
    districtId: 'beacon-district',
    unlocked: receipts.length > 0,
    receipts,
  };
}

function ledger(receipts = []) {
  return { version: 1, realms: [realm(receipts)] };
}

function collaboration() {
  return {
    version: 1,
    localRealmId: LOCAL.id,
    sourceRealmId: PARTNER.id,
    proposalId: RELATIONSHIP_ID,
    sourceName: PARTNER.name,
    sourceTheme: PARTNER.theme,
  };
}

function sharedReceipt(overrides = {}) {
  return {
    version: 1,
    sharedMissionId: SHARED_MISSION_ID,
    completionId: 'completion_00000000000000000018',
    receiptId: 'receipt_000000000000000000018',
    relationshipId: RELATIONSHIP_ID,
    initiatorRealmId: LOCAL.id,
    initiatorName: LOCAL.name,
    initiatorTheme: LOCAL.theme,
    linkedRealmId: PARTNER.id,
    linkedName: PARTNER.name,
    linkedTheme: PARTNER.theme,
    targetRealmId: LOCAL.id,
    missionId: 'route-choice',
    roleId: 'builder',
    routeId: 'sky',
    contribution: 3,
    districtId: 'beacon-district',
    ...overrides,
  };
}

function genericReceipt(overrides = {}) {
  return {
    realmId: LOCAL.id,
    receiptId: SHARED_MISSION_ID,
    missionId: 'route-choice',
    roleId: 'builder',
    routeId: 'sky',
    contribution: 3,
    districtId: 'beacon-district',
    ...overrides,
  };
}

function installPreview(t, receipt) {
  const previous = globalThis.sessionStorage;
  globalThis.sessionStorage = memoryStorage([[SHARED_RECEIPT_PREVIEW_KEY, JSON.stringify(receipt)]]);
  t.after(() => {
    if (previous === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = previous;
  });
}

test('validated shared receipt persists one bounded provenance record and one +3 only', t => {
  const receipt = sharedReceipt();
  installPreview(t, receipt);
  const storage = memoryStorage([
    [CREATOR_LEDGER_KEY, JSON.stringify(ledger())],
    [REALM_COLLABORATION_KEY, JSON.stringify(collaboration())],
  ]);

  const outcome = importSharedMissionReceipt(storage, receipt);
  assert.equal(outcome.status, 'success');
  assert.equal(outcome.realm.total, 3);
  assert.equal(outcome.realm.receipts.length, 1);
  assert.deepEqual(outcome.entry.provenance, {
    version: CREATOR_SHARED_PROVENANCE_VERSION,
    sourceKind: 'shared',
    relationshipId: RELATIONSHIP_ID,
    partnerRealmId: PARTNER.id,
    partnerName: PARTNER.name,
    sharedMissionId: SHARED_MISSION_ID,
  });

  const chronicle = deriveRealmChronicle(outcome.realm);
  assert.equal(chronicle.status, 'ready');
  assert.deepEqual(chronicle.entries[0].provenance, {
    sourceKind: 'shared',
    partnerName: PARTNER.name,
  });
  assert.equal(JSON.stringify(chronicle).includes(PARTNER.id), false);
  assert.equal(JSON.stringify(chronicle).includes(RELATIONSHIP_ID), false);
  assert.equal(JSON.stringify(chronicle).includes(SHARED_MISSION_ID), false);
});

test('duplicate shared import stays exact-once and relationship removal preserves accepted history', t => {
  const receipt = sharedReceipt();
  installPreview(t, receipt);
  const storage = memoryStorage([
    [CREATOR_LEDGER_KEY, JSON.stringify(ledger())],
    [REALM_COLLABORATION_KEY, JSON.stringify(collaboration())],
  ]);
  assert.equal(importSharedMissionReceipt(storage, receipt).status, 'success');
  assert.equal(importSharedMissionReceipt(storage, receipt).status, 'duplicate');
  storage.removeItem(REALM_COLLABORATION_KEY);

  const inspected = inspectCreatorLedger(storage);
  assert.equal(inspected.status, 'ready');
  assert.equal(inspected.state.realms[0].total, 3);
  assert.equal(inspected.state.realms[0].receipts.length, 1);
  assert.equal(inspected.state.realms[0].receipts[0].provenance.partnerName, PARTNER.name);
  assert.equal(deriveRealmChronicle(inspected.state.realms[0]).entries[0].provenance.partnerName, PARTNER.name);
});

test('legacy and solo entries remain valid without a provenance line', () => {
  const solo = {
    id: 'receipt_solo_00000001',
    missionId: 'signal-match',
    roleId: 'guardian',
    routeId: 'ocean',
    districtId: 'beacon-district',
    contribution: 3,
  };
  const storage = memoryStorage([[CREATOR_LEDGER_KEY, JSON.stringify(ledger([solo]))]]);
  const inspected = inspectCreatorLedger(storage);
  assert.equal(inspected.status, 'ready');
  const chronicle = deriveRealmChronicle(inspected.state.realms[0]);
  assert.equal(chronicle.status, 'ready');
  assert.equal(Object.hasOwn(chronicle.entries[0], 'provenance'), false);
});

test('pending preview must bind target, relationship, partner, mission and contribution', () => {
  const storage = memoryStorage([
    [CREATOR_LEDGER_KEY, JSON.stringify(ledger())],
    [REALM_COLLABORATION_KEY, JSON.stringify(collaboration())],
  ]);
  const hostile = [
    sharedReceipt({ targetRealmId: PARTNER.id }),
    sharedReceipt({ relationshipId: 'proposal_000000000000000000000999' }),
    sharedReceipt({ linkedName: 'Altered Realm' }),
    sharedReceipt({ contribution: 6 }),
    sharedReceipt({ missionId: 'unknown' }),
  ];
  for (const candidate of hostile) {
    const previewStorage = memoryStorage([[SHARED_RECEIPT_PREVIEW_KEY, JSON.stringify(candidate)]]);
    const result = resolvePendingSharedContributionProvenance(storage, genericReceipt(), realm(), { previewStorage });
    assert.notEqual(result.status, 'ready');
  }
});

test('unknown, oversized, self-linked and hostile provenance fails closed without mutation', () => {
  const base = genericReceipt();
  const valid = {
    version: 1,
    sourceKind: 'shared',
    relationshipId: RELATIONSHIP_ID,
    partnerRealmId: PARTNER.id,
    partnerName: PARTNER.name,
    sharedMissionId: SHARED_MISSION_ID,
  };
  const hostile = [
    { ...valid, unknown: true },
    { ...valid, partnerName: 'X'.repeat(29) },
    { ...valid, partnerName: 'Unsafe\u202eName' },
    { ...valid, partnerRealmId: LOCAL.id },
    { ...valid, sharedMissionId: 'mission_000000000000000000000999' },
  ];
  for (const provenance of hostile) {
    const storage = memoryStorage([[CREATOR_LEDGER_KEY, JSON.stringify(ledger())]]);
    const before = storage.getItem(CREATOR_LEDGER_KEY);
    assert.equal(importCompletionReceipt(storage, { ...base, provenance }).status, 'invalid');
    assert.equal(storage.getItem(CREATOR_LEDGER_KEY), before);
  }
});

test('duplicate nested provenance keys in persisted JSON fail closed', () => {
  const raw = `{"version":1,"realms":[{"id":"${LOCAL.id}","name":"${LOCAL.name}","theme":"${LOCAL.theme}","total":3,"districtId":"beacon-district","unlocked":true,"receipts":[{"id":"${SHARED_MISSION_ID}","missionId":"route-choice","roleId":"builder","routeId":"sky","districtId":"beacon-district","contribution":3,"provenance":{"version":1,"sourceKind":"shared","relationshipId":"${RELATIONSHIP_ID}","partnerRealmId":"${PARTNER.id}","partnerName":"${PARTNER.name}","partnerName":"Altered","sharedMissionId":"${SHARED_MISSION_ID}"}}]}]}`;
  const storage = memoryStorage([[CREATOR_LEDGER_KEY, raw]]);
  assert.equal(inspectCreatorLedger(storage).status, 'invalid');
});

test('ledger write failure preserves the previous valid state', t => {
  const receipt = sharedReceipt();
  installPreview(t, receipt);
  const serialized = JSON.stringify(ledger());
  const storage = memoryStorage([
    [CREATOR_LEDGER_KEY, serialized],
    [REALM_COLLABORATION_KEY, JSON.stringify(collaboration())],
  ], { failLedgerWrites: true });
  const outcome = importSharedMissionReceipt(storage, receipt);
  assert.equal(outcome.status, 'storage-error');
  assert.equal(storage.getItem(CREATOR_LEDGER_KEY), serialized);
});

test('Arabic and English shared provenance copy stays synchronized and bounded', () => {
  const keys = getRealmChronicleKeySets();
  assert.deepEqual(keys.ar, keys.en);
  assert.equal(getRealmChronicleCopy('en').sharedMission, 'Shared mission');
  assert.equal(getRealmChronicleCopy('ar').sharedMission, 'مهمة مشتركة');
  assert.ok(getRealmChronicleCopy('en').sharedMission.split(/\s+/u).length <= 2);
  assert.ok(getRealmChronicleCopy('ar').sharedMission.split(/\s+/u).length <= 2);
});
