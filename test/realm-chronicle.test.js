import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveRealmChronicle,
  deriveRealmChronicleFromState,
  REALM_CHRONICLE_MAX_ENTRIES,
  REALM_CHRONICLE_RECENT_LIMIT,
} from '../src/realm-chronicle.js';
import {
  getRealmChronicleCopy,
  getRealmChronicleKeySets,
} from '../src/realm-chronicle-i18n.js';
import {
  CREATOR_LEDGER_KEY,
  importCompletionReceipt,
} from '../src/creator-ledger.js';

const REALM_ID = 'realm_abcdefghijklmnop';
const MISSIONS = ['route-choice', 'relay-sequence', 'signal-match'];
const ROLES = ['builder', 'explorer', 'guardian'];
const ROUTES = ['sky', 'ocean'];

function entry(index, overrides = {}) {
  return {
    id: `receipt_${String(index).padStart(16, '0')}`,
    missionId: MISSIONS[index % MISSIONS.length],
    roleId: ROLES[index % ROLES.length],
    routeId: ROUTES[index % ROUTES.length],
    districtId: 'beacon-district',
    contribution: 3,
    ...overrides,
  };
}

function realm(count = 0, overrides = {}) {
  return {
    id: REALM_ID,
    name: 'Synthetic realm',
    theme: 'cosmic',
    total: count * 3,
    districtId: 'beacon-district',
    unlocked: count > 0,
    receipts: Array.from({ length: count }, (_, index) => entry(index)),
    ...overrides,
  };
}

function state(count = 0, overrides = {}) {
  return { version: 1, realms: [realm(count, overrides)] };
}

class MemoryStorage {
  constructor(value) {
    this.values = new Map([[CREATOR_LEDGER_KEY, JSON.stringify(value)]]);
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

test('derives bounded newest-first history and exact totals for 0, 1, 7, 8, and 24 entries', () => {
  for (const count of [0, 1, 7, 8, 24]) {
    const chronicle = deriveRealmChronicle(realm(count));
    assert.equal(chronicle.status, 'ready');
    assert.equal(chronicle.contributionCount, count);
    assert.equal(chronicle.totalEnergy, count * 3);
    assert.equal(chronicle.entries.length, count);
    assert.equal(Object.isFrozen(chronicle), true);
    assert.equal(Object.isFrozen(chronicle.entries), true);
    if (count > 0) {
      assert.deepEqual(chronicle.entries[0], {
        missionId: MISSIONS[(count - 1) % MISSIONS.length],
        roleId: ROLES[(count - 1) % ROLES.length],
        routeId: ROUTES[(count - 1) % ROUTES.length],
        contribution: 3,
        totalEnergy: count * 3,
        stageId: count >= 6 ? 'illuminated' : count >= 3 ? 'connected' : 'outpost',
      });
      assert.equal(chronicle.entries.at(-1).totalEnergy, 3);
    }
  }
  assert.equal(REALM_CHRONICLE_RECENT_LIMIT, 7);
  assert.equal(REALM_CHRONICLE_MAX_ENTRIES, 24);
});

test('projects the exact Beacon District stages at all required totals', () => {
  const cases = [
    [0, 'locked'],
    [1, 'outpost'],
    [2, 'outpost'],
    [3, 'connected'],
    [5, 'connected'],
    [6, 'illuminated'],
    [7, 'illuminated'],
    [24, 'illuminated'],
  ];
  for (const [count, stageId] of cases) {
    assert.equal(deriveRealmChronicle(realm(count)).stageId, stageId);
  }
});

test('fails closed for hostile persisted state without partial entries', () => {
  const controls = `receipt_${'0'.repeat(15)}\u202e`;
  const invalidStates = [
    { ...state(1), version: 2 },
    { ...state(1), unknown: true },
    { version: 1, realms: [{ ...realm(1), hidden: 'value' }] },
    state(1, { total: 6 }),
    state(1, { unlocked: false }),
    state(1, { districtId: 'other-district' }),
    state(1, { receipts: [entry(0, { contribution: 6 })] }),
    state(1, { receipts: [entry(0, { id: controls })] }),
    state(2, { receipts: [entry(0), entry(0)], total: 6 }),
    state(1, { receipts: [entry(0, { missionId: 'unknown-mission' })] }),
    state(1, { receipts: [entry(0, { roleId: 'unknown-role' })] }),
    state(1, { receipts: [entry(0, { routeId: 'unknown-route' })] }),
    state(24, { receipts: [...realm(24).receipts, entry(24)], total: 75 }),
  ];

  for (const candidate of invalidStates) {
    const result = deriveRealmChronicleFromState(candidate);
    assert.equal(result.status, 'invalid');
    assert.equal(Object.hasOwn(result, 'entries'), false);
  }
});

test('duplicate receipt import is idempotent and never reorders or replays history', () => {
  const storage = new MemoryStorage(state(7));
  const receipt = {
    realmId: REALM_ID,
    receiptId: 'receipt_new0000000001',
    missionId: 'route-choice',
    roleId: 'guardian',
    routeId: 'ocean',
    districtId: 'beacon-district',
    contribution: 3,
  };

  const imported = importCompletionReceipt(storage, receipt);
  assert.equal(imported.status, 'success');
  const afterFirst = storage.getItem(CREATOR_LEDGER_KEY);
  const firstChronicle = deriveRealmChronicle(imported.realm);
  assert.equal(firstChronicle.contributionCount, 8);
  assert.equal(firstChronicle.entries[0].totalEnergy, 24);

  const duplicate = importCompletionReceipt(storage, receipt);
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(storage.getItem(CREATOR_LEDGER_KEY), afterFirst);
  assert.deepEqual(deriveRealmChronicle(duplicate.realm), firstChronicle);
});

test('keeps Arabic and English copy synchronized and inside the issue copy budget', () => {
  const keys = getRealmChronicleKeySets();
  assert.deepEqual(keys.ar, keys.en);
  for (const locale of ['en', 'ar']) {
    const copy = getRealmChronicleCopy(locale);
    assert.ok(copy.title.trim().split(/\s+/u).length <= 4);
    assert.ok(copy.summaryTemplate.replace('{count}', '24').replace('{total}', '72').replace('{stage}', copy.stages.illuminated).trim().split(/\s+/u).length <= 18);
    assert.ok(copy.empty.trim().split(/\s+/u).length <= 24);
    assert.ok(copy.showAll.trim().split(/\s+/u).length <= 3);
    assert.ok(copy.showRecent.trim().split(/\s+/u).length <= 3);
  }
});
