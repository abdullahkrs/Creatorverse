import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REALM_COLLABORATION_KEY,
  REALM_COLLABORATION_MAX_FRAGMENT,
  REALM_COLLABORATION_PREVIEW_KEY,
  acceptRealmCollaboration,
  clearRealmCollaborationPreview,
  createRealmCollaborationProposal,
  decodeRealmCollaborationProposal,
  encodeRealmCollaborationProposal,
  inspectRealmCollaboration,
  parseRealmCollaborationHash,
  readRealmCollaborationPreview,
  removeRealmCollaboration,
  writeRealmCollaborationPreview,
} from '../src/realm-collaboration.js';
import {
  getRealmCollaborationCopy,
  getRealmCollaborationKeySets,
} from '../src/realm-collaboration-i18n.js';

const SOURCE = Object.freeze({
  id: 'realm_source_00000001',
  name: 'Signal Atlas',
  theme: 'cosmic',
});
const LOCAL = Object.freeze({
  id: 'realm_local_000000002',
  name: 'Canopy Relay',
  theme: 'wild',
});
const OTHER = Object.freeze({
  id: 'realm_other_000000002',
  name: 'Circuit Haven',
  theme: 'future',
});

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
    this.failSet = false;
    this.failRemove = false;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    if (this.failSet) throw new Error('SET_FAILED');
    this.values.set(key, String(value));
  }

  removeItem(key) {
    if (this.failRemove) throw new Error('REMOVE_FAILED');
    this.values.delete(key);
  }
}

function cryptoLike() {
  return { randomUUID: () => '12345678-1234-4234-9234-123456789abc' };
}

function proposal() {
  return createRealmCollaborationProposal(SOURCE, {
    cryptoLike: cryptoLike(),
    baseUrl: 'https://preview.example.test/',
  });
}

function rawToken(serialized) {
  const bytes = new TextEncoder().encode(serialized);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

test('creates a bounded opaque fragment with only allowlisted proposal fields', () => {
  const outcome = proposal();
  assert.equal(outcome.status, 'ready');
  assert.match(outcome.url, /^https:\/\/preview\.example\.test\/#collab=/u);
  assert.ok(outcome.token.length <= REALM_COLLABORATION_MAX_FRAGMENT);
  assert.deepEqual(Object.keys(outcome.proposal).sort(), [
    'proposalId',
    'sourceName',
    'sourceRealmId',
    'sourceTheme',
    'version',
  ]);
  assert.equal(outcome.proposal.proposalId, 'proposal_12345678123442349234123456789abc');
  assert.equal(outcome.url.includes(SOURCE.id), false);
  assert.equal(outcome.url.includes(SOURCE.name), false);
  assert.deepEqual(decodeRealmCollaborationProposal(outcome.token), outcome.proposal);
  assert.deepEqual(parseRealmCollaborationHash(`#collab=${outcome.token}`), {
    status: 'ready',
    proposal: outcome.proposal,
  });
});

test('rejects malformed, duplicated, unknown, oversized, hostile, and unsupported payloads', () => {
  const valid = proposal().proposal;
  const cases = [
    'v=1&pid=proposal_12345678123442349234123456789abc&rid=realm_source_00000001&n=Signal+Atlas&t=cosmic&x=1',
    'v=1&v=1&pid=proposal_12345678123442349234123456789abc&rid=realm_source_00000001&n=Signal+Atlas&t=cosmic',
    'v=2&pid=proposal_12345678123442349234123456789abc&rid=realm_source_00000001&n=Signal+Atlas&t=cosmic',
    'v=1&pid=short&rid=realm_source_00000001&n=Signal+Atlas&t=cosmic',
    'v=1&pid=proposal_12345678123442349234123456789abc&rid=realm_source_00000001&n=Signal%3CAtlas&t=cosmic',
    'v=1&pid=proposal_12345678123442349234123456789abc&rid=realm_source_00000001&n=Signal%E2%80%AEAtlas&t=cosmic',
    'v=1&pid=proposal_12345678123442349234123456789abc&rid=realm_source_00000001&n=Signal+Atlas&t=unknown',
  ];
  for (const serialized of cases) {
    assert.throws(() => decodeRealmCollaborationProposal(rawToken(serialized)));
  }
  assert.throws(() => decodeRealmCollaborationProposal('a'.repeat(REALM_COLLABORATION_MAX_FRAGMENT + 1)));
  assert.equal(parseRealmCollaborationHash('#collab=bad&collab=again').status, 'invalid');
  assert.equal(parseRealmCollaborationHash('#collab=bad&next=https%3A%2F%2Fevil.test').status, 'invalid');
  assert.equal(parseRealmCollaborationHash('#other=value').status, 'invalid');
  assert.throws(() => encodeRealmCollaborationProposal({ ...valid, extra: true }));
});

test('accepts one different realm exactly once and blocks self-link or silent replacement', () => {
  const storage = new MemoryStorage({
    'creatorverse-creator-ledger-v1': JSON.stringify({ marker: 'unchanged' }),
  });
  const candidate = proposal().proposal;
  const ledgerBefore = storage.getItem('creatorverse-creator-ledger-v1');

  const accepted = acceptRealmCollaboration(storage, LOCAL, candidate);
  assert.equal(accepted.status, 'success');
  assert.deepEqual(Object.keys(accepted.record).sort(), [
    'localRealmId',
    'proposalId',
    'sourceName',
    'sourceRealmId',
    'sourceTheme',
    'version',
  ]);
  assert.equal(storage.getItem('creatorverse-creator-ledger-v1'), ledgerBefore);
  assert.equal(inspectRealmCollaboration(storage, LOCAL.id).status, 'ready');

  const serialized = storage.getItem(REALM_COLLABORATION_KEY);
  assert.equal(acceptRealmCollaboration(storage, LOCAL, candidate).status, 'duplicate');
  assert.equal(storage.getItem(REALM_COLLABORATION_KEY), serialized);

  const second = createRealmCollaborationProposal(OTHER, {
    cryptoLike: { randomUUID: () => 'abcdefab-cdef-4abc-9def-abcdefabcdef' },
    baseUrl: 'https://preview.example.test/',
  }).proposal;
  assert.equal(acceptRealmCollaboration(storage, LOCAL, second).status, 'already-linked');
  assert.equal(storage.getItem(REALM_COLLABORATION_KEY), serialized);
  assert.equal(acceptRealmCollaboration(new MemoryStorage(), SOURCE, candidate).status, 'self-link');
});

test('write failure is atomic and removal isolates the collaboration record', () => {
  const candidate = proposal().proposal;
  const failed = new MemoryStorage({
    'creatorverse-creator-ledger-v1': 'ledger-snapshot',
  });
  failed.failSet = true;
  assert.equal(acceptRealmCollaboration(failed, LOCAL, candidate).status, 'storage-error');
  assert.equal(failed.getItem(REALM_COLLABORATION_KEY), null);
  assert.equal(failed.getItem('creatorverse-creator-ledger-v1'), 'ledger-snapshot');

  const storage = new MemoryStorage({
    'creatorverse-creator-ledger-v1': 'ledger-snapshot',
    'creatorverse-unrelated': 'keep',
  });
  assert.equal(acceptRealmCollaboration(storage, LOCAL, candidate).status, 'success');
  assert.equal(removeRealmCollaboration(storage, LOCAL.id).status, 'removed');
  assert.equal(storage.getItem(REALM_COLLABORATION_KEY), null);
  assert.equal(storage.getItem('creatorverse-creator-ledger-v1'), 'ledger-snapshot');
  assert.equal(storage.getItem('creatorverse-unrelated'), 'keep');
  assert.equal(removeRealmCollaboration(storage, LOCAL.id).status, 'empty');
});

test('invalid persisted records fail closed and are never silently repaired', () => {
  const invalidRecords = [
    { version: 2, localRealmId: LOCAL.id, sourceRealmId: SOURCE.id, proposalId: 'proposal_12345678123442349234123456789abc', sourceName: SOURCE.name, sourceTheme: SOURCE.theme },
    { version: 1, localRealmId: LOCAL.id, sourceRealmId: LOCAL.id, proposalId: 'proposal_12345678123442349234123456789abc', sourceName: SOURCE.name, sourceTheme: SOURCE.theme },
    { version: 1, localRealmId: LOCAL.id, sourceRealmId: SOURCE.id, proposalId: 'proposal_12345678123442349234123456789abc', sourceName: 'Unsafe\u202eName', sourceTheme: SOURCE.theme },
    { version: 1, localRealmId: LOCAL.id, sourceRealmId: SOURCE.id, proposalId: 'proposal_12345678123442349234123456789abc', sourceName: SOURCE.name, sourceTheme: SOURCE.theme, unknown: true },
  ];
  for (const record of invalidRecords) {
    const storage = new MemoryStorage({ [REALM_COLLABORATION_KEY]: JSON.stringify(record) });
    assert.equal(inspectRealmCollaboration(storage, LOCAL.id).status, 'invalid');
    assert.equal(acceptRealmCollaboration(storage, LOCAL, proposal().proposal).status, 'invalid-storage');
    assert.equal(removeRealmCollaboration(storage, LOCAL.id).status, 'invalid-storage');
  }
});

test('validated preview state survives reload scope and clears explicitly', () => {
  const storage = new MemoryStorage();
  const candidate = proposal().proposal;
  writeRealmCollaborationPreview(storage, candidate);
  assert.deepEqual(readRealmCollaborationPreview(storage), candidate);
  assert.ok(storage.getItem(REALM_COLLABORATION_PREVIEW_KEY));
  clearRealmCollaborationPreview(storage);
  assert.equal(readRealmCollaborationPreview(storage), null);
});

test('keeps Arabic and English keys synchronized within the copy budget', () => {
  const keys = getRealmCollaborationKeySets();
  assert.deepEqual(keys.ar, keys.en);
  for (const locale of ['en', 'ar']) {
    const copy = getRealmCollaborationCopy(locale);
    assert.ok(copy.title.trim().split(/\s+/u).length <= 6);
    assert.ok(copy.support.length <= 90);
    assert.ok(copy.previewSupport.length <= 90);
    assert.ok(copy.action.trim().split(/\s+/u).length <= 3);
    assert.ok(copy.accept.trim().split(/\s+/u).length <= 3);
    assert.ok(copy.remove.trim().split(/\s+/u).length <= 3);
  }
});
