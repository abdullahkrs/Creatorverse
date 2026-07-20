import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompletionReceiptUrl,
  createCompletionReceipt,
  createOpaqueIdentifier,
  parseCompletionReceiptFragment,
  parseCompletionReceiptToken,
} from '../src/completion-receipt.js';
import {
  CREATOR_LEDGER_KEY,
  CREATOR_LEDGER_LIMIT,
  getCreatorRealm,
  importCompletionReceipt,
  readCreatorLedger,
  saveCreatorRealm,
} from '../src/creator-ledger.js';
import { getCompletionReceiptCopy, getCompletionReceiptKeySets } from '../src/completion-receipt-i18n.js';
import { buildClipboardText } from '../src/mission-result.js';

const realmId = 'realm_abcdefghijklmnop';
const receiptId = 'receipt_abcdefghijklmn';

function memoryStorage({ failWrites = false } = {}) {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (failWrites) throw new Error('QUOTA');
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
    snapshot() { return new Map(values); },
  };
}

function validReceipt(overrides = {}) {
  return {
    realmId,
    receiptId,
    missionId: 'route-choice',
    roleId: 'builder',
    routeId: 'sky',
    contribution: 3,
    districtId: 'beacon-district',
    ...overrides,
  };
}

function encode(payload) {
  return `cr1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

test('creates an opaque bounded receipt with no identity, query data, or arbitrary value', () => {
  const token = createCompletionReceipt(validReceipt());
  const parsed = parseCompletionReceiptToken(token);
  assert.deepEqual(parsed, { status: 'valid', receipt: validReceipt() });
  assert.doesNotMatch(token, /creator|follower|@|https|timestamp/iu);
  const url = buildCompletionReceiptUrl('https://creatorverse.example/play?secret=1#old', token);
  assert.equal(url, `https://creatorverse.example/play#receipt=${token}`);
  assert.doesNotMatch(url, /secret=1/u);
});

test('clipboard fallback preserves only one validated receipt fragment', () => {
  const token = createCompletionReceipt(validReceipt());
  const copied = buildClipboardText({
    text: 'Mission complete',
    url: `https://creatorverse.example/play?secret=1#receipt=${token}`,
  });
  assert.equal(copied, `Mission complete\nhttps://creatorverse.example/play#receipt=${token}`);
  assert.doesNotMatch(copied, /secret=1/u);

  assert.equal(
    buildClipboardText({ text: 'Mission complete', url: `https://creatorverse.example/play#receipt=${token}&extra=hidden` }),
    'Mission complete\nhttps://creatorverse.example/play',
  );
  assert.equal(
    buildClipboardText({ text: 'Mission complete', url: 'https://creatorverse.example/play#receipt=cr1.invalid' }),
    'Mission complete\nhttps://creatorverse.example/play',
  );
});

test('rejects malformed, duplicate, unknown, oversized, bidi, and non-fixed contribution input', () => {
  const token = createCompletionReceipt(validReceipt());
  assert.equal(parseCompletionReceiptFragment(`#receipt=${token}&receipt=duplicate`).status, 'invalid');
  assert.equal(parseCompletionReceiptFragment(`#receipt=${token}&creator=hidden`).status, 'invalid');
  assert.equal(parseCompletionReceiptFragment(`#creator=hidden&receipt=${token}`).status, 'invalid');
  assert.equal(parseCompletionReceiptFragment('#receipt=cr1.not-base64!').status, 'invalid');
  assert.equal(parseCompletionReceiptFragment(`#receipt=${'x'.repeat(700)}`).status, 'invalid');
  assert.equal(parseCompletionReceiptToken(encode({ v: 1, rid: realmId, id: receiptId, m: 'route-choice', ro: 'builder', rt: 'sky', c: 3, d: 'beacon-district', extra: 'hidden' })).status, 'invalid');
  assert.equal(parseCompletionReceiptToken(encode({ v: 1, rid: `${realmId}\u202e`, id: receiptId, m: 'route-choice', ro: 'builder', rt: 'sky', c: 3, d: 'beacon-district' })).status, 'invalid');
  assert.throws(() => createCompletionReceipt(validReceipt({ contribution: 6 })), /RECEIPT_CONTRIBUTION_INVALID/);
  assert.throws(() => createCompletionReceipt(validReceipt({ missionId: 'open-text' })), /RECEIPT_MISSION_INVALID/);
  assert.throws(() => buildCompletionReceiptUrl('javascript:alert(1)', createCompletionReceipt(validReceipt())), /RECEIPT_BASE_URL_INVALID/);
});

test('creates secure opaque identifiers through an injectable random source', () => {
  const identifier = createOpaqueIdentifier({
    getRandomValues(bytes) {
      bytes.fill(7);
      return bytes;
    },
  });
  assert.match(identifier, /^[A-Za-z0-9_-]{16,64}$/u);
  assert.throws(() => createOpaqueIdentifier({}), /SECURE_RANDOM_UNAVAILABLE/);
});

test('stores one matching local realm and imports one receipt atomically and idempotently', () => {
  const storage = memoryStorage();
  saveCreatorRealm(storage, { realmId, name: 'Nova Guild', theme: 'cosmic' });
  const first = importCompletionReceipt(storage, validReceipt());
  assert.equal(first.status, 'success');
  assert.equal(first.realm.total, 3);
  assert.equal(first.realm.unlocked, true);
  assert.equal(first.realm.receipts.length, 1);

  const duplicate = importCompletionReceipt(storage, validReceipt());
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(getCreatorRealm(storage, realmId).total, 3);
  assert.equal(getCreatorRealm(storage, realmId).receipts.length, 1);
});

test('rejects cross-realm and invalid receipt imports without mutation', () => {
  const storage = memoryStorage();
  saveCreatorRealm(storage, { realmId, name: 'Nova Guild', theme: 'cosmic' });
  const before = storage.getItem(CREATOR_LEDGER_KEY);
  assert.equal(importCompletionReceipt(storage, validReceipt({ realmId: 'realm_qrstuvwxyzABCDE' })).status, 'mismatch');
  assert.equal(importCompletionReceipt(storage, validReceipt({ contribution: 9 })).status, 'invalid');
  assert.equal(storage.getItem(CREATOR_LEDGER_KEY), before);
});

test('storage failure leaves both total and ledger unchanged and supports retry', () => {
  const stable = memoryStorage();
  saveCreatorRealm(stable, { realmId, name: 'Nova Guild', theme: 'cosmic' });
  const seeded = stable.getItem(CREATOR_LEDGER_KEY);
  const failing = {
    getItem(key) { return key === CREATOR_LEDGER_KEY ? seeded : null; },
    setItem() { throw new Error('QUOTA'); },
  };
  const failed = importCompletionReceipt(failing, validReceipt());
  assert.equal(failed.status, 'storage-error');
  assert.equal(failed.realm.total, 0);
  assert.equal(failed.realm.receipts.length, 0);

  const retried = importCompletionReceipt(stable, validReceipt());
  assert.equal(retried.status, 'success');
  assert.equal(getCreatorRealm(stable, realmId).total, 3);
});

test('bounds the local ledger at 24 and refuses a full-ledger mutation', () => {
  const storage = memoryStorage();
  saveCreatorRealm(storage, { realmId, name: 'Nova Guild', theme: 'cosmic' });
  for (let index = 0; index < CREATOR_LEDGER_LIMIT; index += 1) {
    const id = `receipt_${String(index).padStart(16, '0')}`;
    const outcome = importCompletionReceipt(storage, validReceipt({ receiptId: id }));
    assert.equal(outcome.status, 'success');
  }
  const before = storage.getItem(CREATOR_LEDGER_KEY);
  const full = importCompletionReceipt(storage, validReceipt({ receiptId: 'receipt_overflow000000' }));
  assert.equal(full.status, 'full');
  assert.equal(storage.getItem(CREATOR_LEDGER_KEY), before);
  assert.equal(getCreatorRealm(storage, realmId).receipts.length, CREATOR_LEDGER_LIMIT);
  assert.equal(getCreatorRealm(storage, realmId).total, 72);
});

test('fails closed for malformed persisted state and keeps Arabic and English keys synchronized', () => {
  const storage = memoryStorage();
  storage.setItem(CREATOR_LEDGER_KEY, JSON.stringify({ version: 1, realms: [{ id: realmId, extra: '<script>' }] }));
  assert.deepEqual(readCreatorLedger(storage), { version: 1, realms: [] });
  const keys = getCompletionReceiptKeySets();
  assert.deepEqual(keys.ar, keys.en);
  assert.ok(getCompletionReceiptCopy('en').previewTitle.length <= 24);
  assert.ok(getCompletionReceiptCopy('ar').previewTitle.length <= 24);
  assert.match(getCompletionReceiptCopy('en').ledgerLimit, /24/u);
  assert.match(getCompletionReceiptCopy('ar').ledgerLimit, /24/u);
});
