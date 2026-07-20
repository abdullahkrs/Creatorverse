import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ReleaseIdentityError,
  buildAttestation,
  ensureReleaseLedger,
  extractVerifiedEvidence,
  renderLedgerComment,
  renderSummary,
  upsertEvidenceComment,
  validateAttestation,
  verifyReleaseOnce,
  verifyReleaseWithRetry,
} from '../scripts/verify-railway-release.mjs';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const STAGING_SHA = 'c'.repeat(40);
const PRODUCTION_URL = 'https://creatorverse-app-production.up.railway.app';
const STAGING_URL = 'https://creatorverse-app-staging.up.railway.app';
const WORKFLOW_URL = 'https://github.com/abdullahkrs/Creatorverse/actions/runs/123456';
const NOW = new Date('2026-07-20T00:00:00.000Z');

function jsonResponse(body, { status = 200, malformed = false } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      if (malformed) throw new SyntaxError('malformed');
      return body;
    },
  };
}

function endpointFetch({
  productionHealth = { status: 'ok' },
  productionVersion = { environment: 'production', commitSha: SHA },
  stagingHealth = { status: 'ok' },
  stagingVersion = { environment: 'staging', commitSha: STAGING_SHA },
  overrides = {},
} = {}) {
  const responses = new Map([
    [`${PRODUCTION_URL}/health`, jsonResponse(productionHealth)],
    [`${PRODUCTION_URL}/version`, jsonResponse(productionVersion)],
    [`${STAGING_URL}/health`, jsonResponse(stagingHealth)],
    [`${STAGING_URL}/version`, jsonResponse(stagingVersion)],
    ...Object.entries(overrides),
  ]);
  return async url => responses.get(url) || jsonResponse({}, { status: 404 });
}

function validVerification() {
  return {
    attempts: 2,
    production: {
      origin: PRODUCTION_URL,
      environment: 'production',
      health: 'ok',
      commitSha: SHA,
    },
    staging: {
      origin: STAGING_URL,
      environment: 'staging',
      health: 'ok',
      commitSha: STAGING_SHA,
    },
  };
}

function validAttestation() {
  return buildAttestation(validVerification(), {
    sha: SHA,
    workflowUrl: WORKFLOW_URL,
    now: () => NOW,
  });
}

function assertReleaseError(error, code) {
  assert.equal(error instanceof ReleaseIdentityError, true);
  assert.equal(error.code, code);
  return true;
}

test('verifies healthy exact Production identity and distinct healthy Staging', async () => {
  const result = await verifyReleaseOnce({
    sha: SHA,
    productionUrl: PRODUCTION_URL,
    stagingUrl: STAGING_URL,
    fetchImpl: endpointFetch(),
  });

  assert.deepEqual(result.production, {
    origin: PRODUCTION_URL,
    environment: 'production',
    health: 'ok',
    commitSha: SHA,
  });
  assert.equal(result.staging.environment, 'staging');
  assert.equal(result.staging.commitSha, STAGING_SHA);
});

test('rejects a wrong Production SHA', async () => {
  await assert.rejects(
    verifyReleaseOnce({
      sha: SHA,
      productionUrl: PRODUCTION_URL,
      stagingUrl: STAGING_URL,
      fetchImpl: endpointFetch({ productionVersion: { environment: 'production', commitSha: OTHER_SHA } }),
    }),
    error => assertReleaseError(error, 'PRODUCTION_SHA_MISMATCH'),
  );
});

test('rejects wrong environment identity', async () => {
  await assert.rejects(
    verifyReleaseOnce({
      sha: SHA,
      productionUrl: PRODUCTION_URL,
      stagingUrl: STAGING_URL,
      fetchImpl: endpointFetch({ stagingVersion: { environment: 'production', commitSha: STAGING_SHA } }),
    }),
    error => assertReleaseError(error, 'WRONG_ENVIRONMENT'),
  );
});

test('rejects identical Production and Staging origins before network access', async () => {
  let calls = 0;
  await assert.rejects(
    verifyReleaseOnce({
      sha: SHA,
      productionUrl: PRODUCTION_URL,
      stagingUrl: PRODUCTION_URL,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({});
      },
    }),
    error => assertReleaseError(error, 'ORIGIN_COLLISION'),
  );
  assert.equal(calls, 0);
});

test('rejects unhealthy and malformed endpoint responses', async () => {
  await assert.rejects(
    verifyReleaseOnce({
      sha: SHA,
      productionUrl: PRODUCTION_URL,
      stagingUrl: STAGING_URL,
      fetchImpl: endpointFetch({ productionHealth: { status: 'degraded' } }),
    }),
    error => assertReleaseError(error, 'UNHEALTHY_ENDPOINT'),
  );

  await assert.rejects(
    verifyReleaseOnce({
      sha: SHA,
      productionUrl: PRODUCTION_URL,
      stagingUrl: STAGING_URL,
      fetchImpl: endpointFetch({
        overrides: {
          [`${STAGING_URL}/version`]: jsonResponse({}, { malformed: true }),
        },
      }),
    }),
    error => assertReleaseError(error, 'MALFORMED_RESPONSE'),
  );
});

test('bounded retries stop after the configured attempt count', async () => {
  let networkCalls = 0;
  let sleeps = 0;
  const attempts = [];

  await assert.rejects(
    verifyReleaseWithRetry({
      sha: SHA,
      productionUrl: PRODUCTION_URL,
      stagingUrl: STAGING_URL,
      maxAttempts: 3,
      retryDelayMs: 1,
      fetchImpl: async () => {
        networkCalls += 1;
        throw new Error('offline');
      },
      sleepFn: async () => {
        sleeps += 1;
      },
      onAttempt: value => attempts.push(value.attempt),
    }),
    error => {
      assertReleaseError(error, 'ENDPOINT_UNAVAILABLE');
      assert.match(error.message, /exhausted 3 attempts/);
      return true;
    },
  );

  assert.equal(networkCalls, 12);
  assert.equal(sleeps, 2);
  assert.deepEqual(attempts, [1, 2, 3]);
});

test('verified marker round-trips through the integrity check', () => {
  const attestation = validAttestation();
  const comment = renderLedgerComment('verified', attestation);
  const extracted = extractVerifiedEvidence(comment, SHA, { now: () => NOW });
  assert.deepEqual(extracted, attestation);
});

test('integrity rejects another SHA, missing workflow URL, stale or future evidence, and overstated claims', () => {
  const base = validAttestation();

  assert.throws(
    () => validateAttestation({ ...base, sha: OTHER_SHA }, { expectedSha: SHA, now: () => NOW }),
    error => assertReleaseError(error, 'ATTESTATION_SHA_MISMATCH'),
  );
  assert.throws(
    () => validateAttestation({ ...base, workflowRunUrl: '' }, { expectedSha: SHA, now: () => NOW }),
    error => assertReleaseError(error, 'INVALID_WORKFLOW_URL'),
  );
  assert.throws(
    () => validateAttestation({ ...base, verifiedAt: '2026-07-19T22:00:00.000Z' }, { expectedSha: SHA, now: () => NOW }),
    error => assertReleaseError(error, 'STALE_ATTESTATION'),
  );
  assert.throws(
    () => validateAttestation({ ...base, verifiedAt: '2026-07-20T01:00:00.000Z' }, { expectedSha: SHA, now: () => NOW }),
    error => assertReleaseError(error, 'FUTURE_ATTESTATION'),
  );
  assert.throws(
    () => validateAttestation({ ...base, claim: 'human validation' }, { expectedSha: SHA, now: () => NOW }),
    error => assertReleaseError(error, 'PROHIBITED_CLAIM'),
  );
});

test('reuses one canonical ledger and closes duplicate open ledgers', async () => {
  const calls = [];
  const client = {
    repository: 'abdullahkrs/Creatorverse',
    async request(method, path, body) {
      calls.push({ method, path, body });
      if (method === 'GET') {
        return [
          { number: 12, title: '[Ledger] Railway release identity evidence', state: 'open' },
          { number: 15, title: '[Ledger] Railway release identity evidence', state: 'open' },
          { number: 16, title: '[Ledger] Railway release identity evidence', state: 'open', pull_request: {} },
        ];
      }
      if (method === 'PATCH' && path.endsWith('/15')) return { number: 15, state: 'closed' };
      throw new Error(`Unexpected request ${method} ${path}`);
    },
  };

  const ledger = await ensureReleaseLedger(client);
  assert.equal(ledger.number, 12);
  assert.equal(calls.some(call => call.method === 'POST' && call.path.endsWith('/issues')), false);
  assert.deepEqual(calls.at(-1), {
    method: 'PATCH',
    path: '/repos/abdullahkrs/Creatorverse/issues/15',
    body: { state: 'closed', state_reason: 'not_planned' },
  });
});

test('updates one canonical SHA comment and removes duplicates instead of spamming', async () => {
  const calls = [];
  const client = {
    repository: 'abdullahkrs/Creatorverse',
    async request(method, path, body) {
      calls.push({ method, path, body });
      if (method === 'GET') {
        return [
          { id: 90, body: `RAILWAY-IDENTITY-FAILED:${SHA}` },
          { id: 91, body: `RAILWAY-IDENTITY-VERIFIED:${SHA}` },
          { id: 92, body: `RAILWAY-IDENTITY-VERIFIED:${OTHER_SHA}` },
        ];
      }
      if (method === 'PATCH' && path.endsWith('/90')) return { id: 90, body: body.body };
      if (method === 'DELETE' && path.endsWith('/91')) return null;
      throw new Error(`Unexpected request ${method} ${path}`);
    },
  };

  await upsertEvidenceComment(client, 12, SHA, 'replacement');
  assert.equal(calls.some(call => call.method === 'POST'), false);
  assert.deepEqual(calls.slice(1), [
    {
      method: 'PATCH',
      path: '/repos/abdullahkrs/Creatorverse/issues/comments/90',
      body: { body: 'replacement' },
    },
    {
      method: 'DELETE',
      path: '/repos/abdullahkrs/Creatorverse/issues/comments/91',
      body: undefined,
    },
  ]);
});

test('GitHub summary remains within the eight-line copy budget', () => {
  const summary = renderSummary({
    state: 'success',
    sha: SHA,
    record: validAttestation(),
    ledgerNumber: 12,
  });
  assert.equal(summary.split('\n').length <= 8, true);
  assert.match(summary, /operational deployment identity/);
});
