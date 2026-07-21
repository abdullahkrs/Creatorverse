import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isRealmQuarantined,
  parseRealmQuarantine,
  quarantineRealm,
  readRealmQuarantine,
  realmQuarantineContract,
  restoreQuarantinedRealm,
  serializeRealmQuarantine,
} from '../src/realm-quarantine.js';
import { getRealmQuarantineCopy } from '../src/realm-quarantine-i18n.js';

class MemoryStorage {
  constructor(initial = null) {
    this.value = initial;
    this.failWrites = false;
  }

  getItem(key) {
    assert.equal(key, realmQuarantineContract.storageKey);
    return this.value;
  }

  setItem(key, value) {
    assert.equal(key, realmQuarantineContract.storageKey);
    if (this.failWrites) throw new Error('quota');
    this.value = value;
  }
}

const realmId = index => `Realm_${String(index).padStart(16, '0')}`;

function record(index, reason = 'unsafe-real-world') {
  return { v: 1, r: realmId(index), q: reason };
}

test('quarantine records are strict, bounded, exact-scope, and reversible', () => {
  const storage = new MemoryStorage();
  let state = quarantineRealm(storage, { realmId: realmId(1), reason: 'unsafe-real-world' });
  assert.equal(state.records.length, 1);
  assert.equal(isRealmQuarantined(state, realmId(1)), true);
  assert.equal(isRealmQuarantined(state, realmId(2)), false);

  state = quarantineRealm(storage, { realmId: realmId(1), reason: 'harassment-hateful' });
  assert.equal(state.records.length, 1);
  assert.equal(state.records[0].q, 'harassment-hateful');

  state = restoreQuarantinedRealm(storage, realmId(1));
  assert.equal(state.records.length, 0);
  assert.equal(isRealmQuarantined(state, realmId(1)), false);
});

test('the twenty-fifth record deterministically replaces the first without timestamps', () => {
  const storage = new MemoryStorage();
  for (let index = 0; index < realmQuarantineContract.maxRecords + 1; index += 1) {
    quarantineRealm(storage, { realmId: realmId(index), reason: 'personal-private-information' });
  }
  const state = readRealmQuarantine(storage);
  assert.equal(state.records.length, 24);
  assert.equal(state.records[0].r, realmId(1));
  assert.equal(state.records.at(-1).r, realmId(24));
  assert.equal(storage.value.includes('timestamp'), false);
  assert.equal(storage.value.includes('invite'), false);
  assert.equal(storage.value.includes('receipt'), false);
});

test('malformed, duplicate, oversized, unknown, and non-allowlisted state fails closed', () => {
  const invalid = [
    '{"v":1,"v":1,"records":[]}',
    JSON.stringify({ v: 1, records: [record(1), record(1)] }),
    JSON.stringify({ v: 1, records: [{ ...record(1), extra: '<script>' }] }),
    JSON.stringify({ v: 1, records: [{ ...record(1), q: 'custom' }] }),
    JSON.stringify({ v: 1, records: [{ ...record(1), r: '__proto__' }] }),
    JSON.stringify({ v: 1, records: [], extra: 'raw-secret' }),
    'x'.repeat(realmQuarantineContract.maxSerializedLength + 1),
  ];

  for (const serialized of invalid) {
    const state = parseRealmQuarantine(serialized);
    assert.equal(isRealmQuarantined(state, realmId(1)), false);
    assert.equal(JSON.stringify(state).includes('raw-secret'), false);
    assert.equal(JSON.stringify(state).includes('<script>'), false);
  }
});

test('safe recovery preserves unrelated valid records and removes invalid entries', () => {
  const serialized = JSON.stringify({
    v: 1,
    records: [
      record(1),
      { v: 1, r: 'bad', q: 'unsafe-real-world' },
      record(2, 'harassment-hateful'),
    ],
  });
  const state = parseRealmQuarantine(serialized);
  assert.equal(state.status, 'recovered');
  assert.deepEqual(state.records.map(item => item.r), [realmId(1), realmId(2)]);
  assert.doesNotThrow(() => serializeRealmQuarantine(state.records));
});

test('write failures do not mutate the prior durable state', () => {
  const original = serializeRealmQuarantine([record(1)]);
  const storage = new MemoryStorage(original);
  storage.failWrites = true;
  assert.throws(
    () => quarantineRealm(storage, { realmId: realmId(2), reason: 'unsafe-real-world' }),
    /quota/,
  );
  assert.equal(storage.value, original);
});

test('Arabic and English quarantine copy keys remain synchronized and bounded', () => {
  const en = getRealmQuarantineCopy('en');
  const ar = getRealmQuarantineCopy('ar');
  assert.deepEqual(Object.keys(ar).sort(), Object.keys(en).sort());
  assert.ok(en.choiceSupport.length <= 100);
  assert.ok(ar.choiceSupport.length <= 100);
  for (const localeCopy of [en, ar]) {
    for (const key of ['unsafeRealWorld', 'harassmentHateful', 'personalPrivate']) {
      assert.ok(localeCopy[key].length <= 42);
    }
    for (const key of ['hide', 'cancel', 'returnHome', 'showAgain', 'retrySave']) {
      assert.ok(localeCopy[key].split(/\s+/u).length <= 3);
    }
  }
});
