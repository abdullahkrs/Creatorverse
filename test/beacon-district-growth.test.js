import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BEACON_DISTRICT_MAX_ENERGY,
  compareBeaconDistrictGrowth,
  deriveBeaconDistrictGrowth,
} from '../src/beacon-district-growth.js';
import {
  getBeaconDistrictGrowthCopy,
  getBeaconDistrictGrowthKeySets,
} from '../src/beacon-district-growth-i18n.js';
import {
  CREATOR_LEDGER_KEY,
  importCompletionReceipt,
  inspectCreatorLedger,
} from '../src/creator-ledger.js';

const REALM_ID = 'realm_abcdefghijklmnop';

function receiptEntry(index, overrides = {}) {
  return {
    id: `receipt_${String(index).padStart(16, '0')}`,
    missionId: 'route-choice',
    roleId: 'builder',
    routeId: 'sky',
    districtId: 'beacon-district',
    contribution: 3,
    ...overrides,
  };
}

function realm(count = 0, overrides = {}) {
  const receipts = Array.from({ length: count }, (_, index) => receiptEntry(index));
  return {
    id: REALM_ID,
    name: 'Synthetic realm',
    theme: 'cosmic',
    total: count * 3,
    districtId: 'beacon-district',
    unlocked: count > 0,
    receipts,
    ...overrides,
  };
}

class MemoryStorage {
  constructor(value) {
    this.values = new Map(value ? [[CREATOR_LEDGER_KEY, JSON.stringify(value)]] : []);
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

const THRESHOLDS = [
  [0, 'locked', 3],
  [1, 'outpost', 9],
  [2, 'outpost', 9],
  [3, 'connected', 18],
  [5, 'connected', 18],
  [6, 'illuminated', null],
  [24, 'illuminated', null],
];

test('derives every bounded threshold from the strict ledger without a second source of truth', () => {
  for (const [count, stageId, nextThreshold] of THRESHOLDS) {
    const growth = deriveBeaconDistrictGrowth(realm(count));
    assert.equal(growth.status, 'ready');
    assert.equal(growth.stageId, stageId);
    assert.equal(growth.totalEnergy, count * 3);
    assert.equal(growth.contributionCount, count);
    assert.equal(growth.nextThreshold, nextThreshold);
    assert.equal(growth.maxEnergy, BEACON_DISTRICT_MAX_ENERGY);
    assert.equal(growth.complete, stageId === 'illuminated');
  }
});

test('fails closed for malformed, inconsistent, duplicate, non-divisible, and over-limit progress', () => {
  const invalidRealms = [
    realm(1, { total: 4 }),
    realm(1, { total: 72 }),
    realm(0, { unlocked: true }),
    realm(1, { unlocked: false }),
    realm(1, { districtId: 'other-district' }),
    realm(2, { receipts: [receiptEntry(0), receiptEntry(0)], total: 6 }),
    realm(1, { receipts: [receiptEntry(0, { contribution: 6 })] }),
    realm(24, { total: 75 }),
    { ...realm(1), hidden: 'value' },
  ];
  for (const candidate of invalidRealms) {
    assert.equal(deriveBeaconDistrictGrowth(candidate).status, 'unavailable');
  }
});

test('recognizes only an exact +3 transition and reports stage changes deterministically', () => {
  const locked = deriveBeaconDistrictGrowth(realm(0));
  const three = deriveBeaconDistrictGrowth(realm(1));
  const six = deriveBeaconDistrictGrowth(realm(2));
  const nine = deriveBeaconDistrictGrowth(realm(3));
  const eighteen = deriveBeaconDistrictGrowth(realm(6));

  assert.deepEqual(compareBeaconDistrictGrowth(locked, three), {
    status: 'ready',
    advanced: true,
    fromStageId: 'locked',
    toStageId: 'outpost',
    totalEnergy: 3,
  });
  assert.equal(compareBeaconDistrictGrowth(three, six).advanced, false);
  assert.equal(compareBeaconDistrictGrowth(six, nine).advanced, true);
  assert.equal(compareBeaconDistrictGrowth(nine, eighteen).status, 'unavailable');
  assert.equal(compareBeaconDistrictGrowth({ status: 'unavailable' }, three).status, 'unavailable');
});

test('imports one valid receipt exactly once and restores the same derived stage without replay state', () => {
  const storage = new MemoryStorage({ version: 1, realms: [realm(2)] });
  const receipt = {
    realmId: REALM_ID,
    receiptId: 'receipt_new0000000001',
    missionId: 'route-choice',
    roleId: 'guardian',
    routeId: 'ocean',
    districtId: 'beacon-district',
    contribution: 3,
  };

  const before = inspectCreatorLedger(storage).state.realms[0];
  assert.equal(deriveBeaconDistrictGrowth(before).stageId, 'outpost');

  const imported = importCompletionReceipt(storage, receipt);
  assert.equal(imported.status, 'success');
  assert.equal(imported.realm.total, 9);
  assert.equal(deriveBeaconDistrictGrowth(imported.realm).stageId, 'connected');

  const serializedAfterFirst = storage.getItem(CREATOR_LEDGER_KEY);
  const duplicate = importCompletionReceipt(storage, receipt);
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(storage.getItem(CREATOR_LEDGER_KEY), serializedAfterFirst);

  const restored = inspectCreatorLedger(storage).state.realms[0];
  const restoredGrowth = deriveBeaconDistrictGrowth(restored);
  assert.equal(restoredGrowth.stageId, 'connected');
  assert.equal(restoredGrowth.totalEnergy, 9);
  assert.equal(storage.getItem(CREATOR_LEDGER_KEY), serializedAfterFirst);
});

test('keeps Arabic and English keys synchronized and copy inside the issue budget', () => {
  const keys = getBeaconDistrictGrowthKeySets();
  assert.deepEqual(keys.ar, keys.en);
  for (const locale of ['en', 'ar']) {
    const copy = getBeaconDistrictGrowthCopy(locale);
    for (const stage of Object.values(copy.stages)) {
      const words = stage.title.trim().split(/\s+/u).length;
      assert.ok(words >= 2 && words <= 5);
      assert.ok(stage.support.length <= 90);
    }
    assert.ok(copy.thresholdTemplate.replace('{threshold}', '18').length <= 70);
    assert.ok(copy.transitionTemplate.replace('{district}', copy.districtName).replace('{stage}', copy.stages.illuminated.title).replace('{total}', '18').length <= 90);
  }
});
