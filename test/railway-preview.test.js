import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibleSha, expectedPrDomain, verifyIdentity } from '../scripts/verify-railway-preview.mjs';

test('accepts exact and compatible short SHAs', () => {
  assert.equal(compatibleSha('abcdef123456', 'abcdef1234567890'), true);
  assert.equal(compatibleSha('abcdef1234567890', 'abcdef123456'), true);
  assert.equal(compatibleSha('deadbeef', 'abcdef12'), false);
});

test('derives the repository PR domain deterministically', () => {
  assert.equal(expectedPrDomain(10), 'https://creatorverse-app-creatorverse-pr-10.up.railway.app');
});

test('rejects production, wrong branch, and wrong commit', () => {
  const base = {
    expectedSha: 'abcdef1234567890',
    expectedRef: 'feature/test',
    productionUrl: 'https://creatorverse-app-production.up.railway.app',
    candidate: expectedPrDomain(10),
  };
  assert.doesNotThrow(() => verifyIdentity({ commitSha: 'abcdef1234567890', branch: 'feature/test', environment: 'pr-10' }, base));
  assert.throws(() => verifyIdentity({ commitSha: 'deadbeef', branch: 'feature/test', environment: 'pr-10' }, base), /does not match/);
  assert.throws(() => verifyIdentity({ commitSha: 'abcdef1234567890', branch: 'wrong', environment: 'pr-10' }, base), /branch/);
  assert.throws(() => verifyIdentity({ commitSha: 'abcdef1234567890', branch: 'feature/test', environment: 'production' }, base), /production/i);
  assert.throws(() => verifyIdentity({ commitSha: 'abcdef1234567890', branch: 'feature/test', environment: 'staging' }, { ...base, candidate: base.productionUrl }), /Production cannot/);
});
