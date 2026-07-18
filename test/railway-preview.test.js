import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibleSha, expectedPrDomain, isAllowedPrCandidate, verifyIdentity } from '../scripts/verify-railway-preview.mjs';

test('accepts exact and compatible non-empty SHAs', () => {
  assert.equal(compatibleSha('abcdef123456', 'abcdef1234567890'), true);
  assert.equal(compatibleSha('abcdef1234567890', 'abcdef123456'), true);
  assert.equal(compatibleSha('deadbeef', 'abcdef12'), false);
  assert.equal(compatibleSha('', 'abcdef12'), false);
  assert.equal(compatibleSha('abcdef12', ''), false);
});

test('derives and allowlists only the isolated repository PR domain', () => {
  const preview = expectedPrDomain(10);
  assert.equal(preview, 'https://creatorverse-app-creatorverse-pr-10.up.railway.app');
  assert.equal(isAllowedPrCandidate(preview, 10), true);
  assert.equal(isAllowedPrCandidate(`${preview}/`, 10), true);
  assert.equal(isAllowedPrCandidate('https://creatorverse-app-staging.up.railway.app', 10), false);
  assert.equal(isAllowedPrCandidate('https://creatorverse-app-production.up.railway.app', 10), false);
  assert.equal(isAllowedPrCandidate('https://creatorverse-app-creatorverse-pr-11.up.railway.app', 10), false);
  assert.equal(isAllowedPrCandidate('http://creatorverse-app-creatorverse-pr-10.up.railway.app', 10), false);
  assert.equal(isAllowedPrCandidate(`${preview}/health`, 10), false);
});

test('rejects production, shared staging, wrong branch, and wrong commit', () => {
  const base = {
    expectedSha: 'abcdef1234567890',
    expectedRef: 'feature/test',
    productionUrl: 'https://creatorverse-app-production.up.railway.app',
    candidate: expectedPrDomain(10),
    prNumber: 10,
  };
  assert.doesNotThrow(() => verifyIdentity({ commitSha: 'abcdef1234567890', branch: 'feature/test', environment: 'pr-10' }, base));
  assert.throws(() => verifyIdentity({ commitSha: '', branch: 'feature/test', environment: 'pr-10' }, base), /does not match/);
  assert.throws(() => verifyIdentity({ commitSha: 'deadbeef', branch: 'feature/test', environment: 'pr-10' }, base), /does not match/);
  assert.throws(() => verifyIdentity({ commitSha: 'abcdef1234567890', branch: 'wrong', environment: 'pr-10' }, base), /branch/);
  assert.throws(() => verifyIdentity({ commitSha: 'abcdef1234567890', branch: 'feature/test', environment: 'production' }, base), /production/i);
  assert.throws(() => verifyIdentity({ commitSha: 'abcdef1234567890', branch: 'feature/test', environment: 'staging' }, { ...base, candidate: 'https://creatorverse-app-staging.up.railway.app' }), /isolated Railway PR environment/);
});
