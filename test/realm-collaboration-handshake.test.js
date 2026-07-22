import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REALM_COLLABORATION_KEY,
  acceptRealmCollaboration,
  createRealmCollaborationProposal,
  inspectRealmCollaboration,
} from '../src/realm-collaboration.js';
import {
  REALM_COLLABORATION_CONFIRMATION_MAX_FRAGMENT,
  REALM_COLLABORATION_CONFIRMATION_PREVIEW_KEY,
  REALM_COLLABORATION_PENDING_KEY,
  clearRealmCollaborationConfirmationPreview,
  confirmRealmCollaboration,
  createPendingRealmCollaboration,
  createRealmCollaborationConfirmation,
  decodeRealmCollaborationConfirmation,
  discardPendingRealmCollaboration,
  encodeRealmCollaborationConfirmation,
  inspectPendingRealmCollaboration,
  parseRealmCollaborationConfirmationHash,
  readRealmCollaborationConfirmationPreview,
  resumePendingRealmCollaboration,
  storePendingRealmCollaboration,
  writeRealmCollaborationConfirmationPreview,
} from '../src/realm-collaboration-handshake.js';
import { getRealmCollaborationCopy, getRealmCollaborationKeySets } from '../src/realm-collaboration-i18n.js';

const A = Object.freeze({ id: 'realm_source_00000001', name: 'Signal Atlas', theme: 'cosmic' });
const B = Object.freeze({ id: 'realm_local_000000002', name: 'Canopy Relay', theme: 'wild' });
const C = Object.freeze({ id: 'realm_other_000000002', name: 'Circuit Haven', theme: 'future' });

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
    this.failSetFor = new Set();
    this.failRemoveFor = new Set();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    if (this.failSetFor.has(key)) throw new Error('SET_FAILED');
    this.values.set(key, String(value));
  }

  removeItem(key) {
    if (this.failRemoveFor.has(key)) throw new Error('REMOVE_FAILED');
    this.values.delete(key);
  }
}

function cryptoLike(value = '12345678-1234-4234-9234-123456789abc') {
  return { randomUUID: () => value };
}

function proposal(realm = A, uuid) {
  return createRealmCollaborationProposal(realm, {
    cryptoLike: cryptoLike(uuid),
    baseUrl: 'https://preview.example.test/',
  });
}

function rawToken(serialized) {
  const bytes = new TextEncoder().encode(serialized);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

test('stores one strict pending proposal and resumes the same bounded fragment', () => {
  const storage = new MemoryStorage({ 'creatorverse-creator-ledger-v1': 'unchanged' });
  const created = createPendingRealmCollaboration(storage, A, {
    cryptoLike: cryptoLike(),
    baseUrl: 'https://preview.example.test/',
  });
  assert.equal(created.status, 'ready');
  assert.match(created.url, /#collab=/u);
  assert.equal(created.url.includes(A.id), false);
  assert.equal(created.url.includes(A.name), false);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(REALM_COLLABORATION_PENDING_KEY))).sort(), [
    'proposalId', 'sourceName', 'sourceRealmId', 'sourceTheme', 'version',
  ]);
  assert.equal(storage.getItem('creatorverse-creator-ledger-v1'), 'unchanged');

  const resumed = createPendingRealmCollaboration(storage, A, {
    cryptoLike: cryptoLike('abcdefab-cdef-4abc-9def-abcdefabcdef'),
    baseUrl: 'https://preview.example.test/',
  });
  assert.equal(resumed.status, 'ready');
  assert.equal(resumed.proposal.proposalId, created.proposal.proposalId);
  assert.equal(resumePendingRealmCollaboration(created.proposal, { baseUrl: 'https://preview.example.test/' }).url, created.url);

  const different = proposal(A, 'abcdefab-cdef-4abc-9def-abcdefabcdef').proposal;
  assert.equal(storePendingRealmCollaboration(storage, different).status, 'conflict');
  assert.equal(inspectPendingRealmCollaboration(storage, A.id).proposal.proposalId, created.proposal.proposalId);
});

test('discard removes only the matched pending record and restores on failure', () => {
  const pending = proposal().proposal;
  const storage = new MemoryStorage({
    [REALM_COLLABORATION_PENDING_KEY]: JSON.stringify(pending),
    'creatorverse-unrelated': 'keep',
  });
  assert.equal(discardPendingRealmCollaboration(storage, A.id).status, 'discarded');
  assert.equal(storage.getItem(REALM_COLLABORATION_PENDING_KEY), null);
  assert.equal(storage.getItem('creatorverse-unrelated'), 'keep');

  const failed = new MemoryStorage({ [REALM_COLLABORATION_PENDING_KEY]: JSON.stringify(pending) });
  failed.failRemoveFor.add(REALM_COLLABORATION_PENDING_KEY);
  assert.equal(discardPendingRealmCollaboration(failed, A.id).status, 'storage-error');
  assert.equal(failed.getItem(REALM_COLLABORATION_PENDING_KEY), JSON.stringify(pending));
});

test('confirmation codec accepts exact bounded fields and rejects hostile variants', () => {
  const candidate = Object.freeze({
    version: 1,
    proposalId: 'proposal_12345678123442349234123456789abc',
    sourceRealmId: A.id,
    acceptingRealmId: B.id,
    acceptingName: B.name,
    acceptingTheme: B.theme,
  });
  const token = encodeRealmCollaborationConfirmation(candidate);
  assert.ok(token.length <= REALM_COLLABORATION_CONFIRMATION_MAX_FRAGMENT);
  assert.deepEqual(decodeRealmCollaborationConfirmation(token), candidate);
  assert.deepEqual(parseRealmCollaborationConfirmationHash(`#collab-confirm=${token}`), {
    status: 'ready',
    confirmation: candidate,
  });
  assert.equal(parseRealmCollaborationConfirmationHash(`#collab-confirm=${token}&x=1`).status, 'invalid');
  assert.equal(parseRealmCollaborationConfirmationHash(`#collab-confirm=${token}&collab-confirm=${token}`).status, 'invalid');
  assert.equal(parseRealmCollaborationConfirmationHash(`#collab=${token}`).status, 'invalid');
  assert.throws(() => decodeRealmCollaborationConfirmation('a'.repeat(REALM_COLLABORATION_CONFIRMATION_MAX_FRAGMENT + 1)));
  assert.throws(() => encodeRealmCollaborationConfirmation({ ...candidate, unknown: true }));

  const hostile = [
    'v=1&pid=proposal_12345678123442349234123456789abc&sid=realm_source_00000001&aid=realm_local_000000002&n=Unsafe%E2%80%AEName&t=wild',
    'v=2&pid=proposal_12345678123442349234123456789abc&sid=realm_source_00000001&aid=realm_local_000000002&n=Canopy+Relay&t=wild',
    'v=1&pid=proposal_12345678123442349234123456789abc&sid=realm_source_00000001&aid=realm_source_00000001&n=Canopy+Relay&t=wild',
    'v=1&pid=proposal_12345678123442349234123456789abc&sid=realm_source_00000001&aid=realm_local_000000002&n=Canopy+Relay&t=wild&__proto__=x',
  ];
  for (const serialized of hostile) assert.throws(() => decodeRealmCollaborationConfirmation(rawToken(serialized)));
});

test('recipient returns a bounded confirmation and proposer completes exactly once', () => {
  const proposerStorage = new MemoryStorage({ 'creatorverse-creator-ledger-v1': 'proposer-ledger' });
  const recipientStorage = new MemoryStorage({ 'creatorverse-creator-ledger-v1': 'recipient-ledger' });
  const created = createPendingRealmCollaboration(proposerStorage, A, {
    cryptoLike: cryptoLike(),
    baseUrl: 'https://preview.example.test/',
  });
  assert.equal(acceptRealmCollaboration(recipientStorage, B, created.proposal).status, 'success');
  const recipientRecord = inspectRealmCollaboration(recipientStorage, B.id).record;
  const returned = createRealmCollaborationConfirmation(B, recipientRecord, {
    baseUrl: 'https://preview.example.test/',
  });
  assert.equal(returned.status, 'ready');
  assert.match(returned.url, /#collab-confirm=/u);
  assert.equal(returned.url.includes(A.id), false);
  assert.equal(returned.url.includes(B.id), false);
  assert.deepEqual(Object.keys(returned.confirmation).sort(), [
    'acceptingName', 'acceptingRealmId', 'acceptingTheme', 'proposalId', 'sourceRealmId', 'version',
  ]);

  const completed = confirmRealmCollaboration(proposerStorage, A, returned.confirmation);
  assert.equal(completed.status, 'success');
  assert.deepEqual(Object.keys(completed.record).sort(), [
    'localRealmId', 'proposalId', 'sourceName', 'sourceRealmId', 'sourceTheme', 'version',
  ]);
  assert.equal(completed.record.localRealmId, A.id);
  assert.equal(completed.record.sourceRealmId, B.id);
  assert.equal(completed.record.sourceName, B.name);
  assert.equal(proposerStorage.getItem(REALM_COLLABORATION_PENDING_KEY), null);
  assert.equal(proposerStorage.getItem('creatorverse-creator-ledger-v1'), 'proposer-ledger');
  assert.equal(recipientStorage.getItem('creatorverse-creator-ledger-v1'), 'recipient-ledger');

  const serialized = proposerStorage.getItem(REALM_COLLABORATION_KEY);
  assert.equal(confirmRealmCollaboration(proposerStorage, A, returned.confirmation).status, 'duplicate');
  assert.equal(proposerStorage.getItem(REALM_COLLABORATION_KEY), serialized);
});

test('mismatch, no-pending, second-link, and storage failures fail closed', () => {
  const pending = proposal().proposal;
  const otherPending = proposal(A, 'abcdefab-cdef-4abc-9def-abcdefabcdef').proposal;
  const recipientStorage = new MemoryStorage();
  acceptRealmCollaboration(recipientStorage, B, pending);
  const confirmation = createRealmCollaborationConfirmation(B, inspectRealmCollaboration(recipientStorage, B.id).record).confirmation;

  assert.equal(confirmRealmCollaboration(new MemoryStorage(), A, confirmation).status, 'no-pending');
  const mismatchStorage = new MemoryStorage({ [REALM_COLLABORATION_PENDING_KEY]: JSON.stringify(otherPending) });
  assert.equal(confirmRealmCollaboration(mismatchStorage, A, confirmation).status, 'mismatch');
  assert.equal(mismatchStorage.getItem(REALM_COLLABORATION_KEY), null);

  const linkedStorage = new MemoryStorage({ [REALM_COLLABORATION_PENDING_KEY]: JSON.stringify(pending) });
  const cProposal = proposal(C, 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee').proposal;
  assert.equal(acceptRealmCollaboration(linkedStorage, A, cProposal).status, 'success');
  assert.equal(confirmRealmCollaboration(linkedStorage, A, confirmation).status, 'already-linked');

  const failWrite = new MemoryStorage({ [REALM_COLLABORATION_PENDING_KEY]: JSON.stringify(pending) });
  failWrite.failSetFor.add(REALM_COLLABORATION_KEY);
  assert.equal(confirmRealmCollaboration(failWrite, A, confirmation).status, 'storage-error');
  assert.equal(failWrite.getItem(REALM_COLLABORATION_KEY), null);
  assert.equal(failWrite.getItem(REALM_COLLABORATION_PENDING_KEY), JSON.stringify(pending));

  const failRemove = new MemoryStorage({ [REALM_COLLABORATION_PENDING_KEY]: JSON.stringify(pending) });
  failRemove.failRemoveFor.add(REALM_COLLABORATION_PENDING_KEY);
  assert.equal(confirmRealmCollaboration(failRemove, A, confirmation).status, 'storage-error');
  assert.equal(failRemove.getItem(REALM_COLLABORATION_KEY), null);
  assert.equal(failRemove.getItem(REALM_COLLABORATION_PENDING_KEY), JSON.stringify(pending));
});

test('validated confirmation preview survives reload scope and clears explicitly', () => {
  const storage = new MemoryStorage();
  const proposalA = proposal().proposal;
  const recipient = new MemoryStorage();
  acceptRealmCollaboration(recipient, B, proposalA);
  const confirmation = createRealmCollaborationConfirmation(B, inspectRealmCollaboration(recipient, B.id).record).confirmation;
  writeRealmCollaborationConfirmationPreview(storage, confirmation);
  assert.deepEqual(readRealmCollaborationConfirmationPreview(storage), confirmation);
  assert.ok(storage.getItem(REALM_COLLABORATION_CONFIRMATION_PREVIEW_KEY));
  clearRealmCollaborationConfirmationPreview(storage);
  assert.equal(readRealmCollaborationConfirmationPreview(storage), null);
});

test('Arabic and English handshake copy remain synchronized and bounded', () => {
  const keys = getRealmCollaborationKeySets();
  assert.deepEqual(keys.ar, keys.en);
  for (const locale of ['en', 'ar']) {
    const copy = getRealmCollaborationCopy(locale);
    assert.ok(copy.completeTitle.trim().split(/\s+/u).length <= 6);
    assert.ok(copy.completeSupport.length <= 90);
    assert.ok(copy.pendingSupport.length <= 90);
    assert.ok(copy.confirmLink.trim().split(/\s+/u).length <= 3);
    assert.ok(copy.returnConfirmation.trim().split(/\s+/u).length <= 3);
    assert.ok(copy.removed.length <= 80);
  }
});
