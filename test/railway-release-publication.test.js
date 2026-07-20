import test from 'node:test';
import assert from 'node:assert/strict';

import { ReleaseIdentityError } from '../scripts/verify-railway-release.mjs';
import {
  assertRepositoryCommit,
  ensureReleaseLedgerPaginated,
  upsertEvidenceCommentPaginated,
  verifyReleaseAndRepositoryWithRetry,
} from '../scripts/publish-railway-release-evidence.mjs';

const SHA = 'a'.repeat(40);
const STAGING_SHA = 'c'.repeat(40);
const UNKNOWN_SHA = 'd'.repeat(40);
const PRODUCTION_URL = 'https://creatorverse-app-production.up.railway.app';
const STAGING_URL = 'https://creatorverse-app-staging.up.railway.app';

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function endpointFetch({ stagingSha = STAGING_SHA } = {}) {
  const responses = new Map([
    [`${PRODUCTION_URL}/health`, jsonResponse({ status: 'ok' })],
    [`${PRODUCTION_URL}/version`, jsonResponse({ environment: 'production', commitSha: SHA })],
    [`${STAGING_URL}/health`, jsonResponse({ status: 'ok' })],
    [`${STAGING_URL}/version`, jsonResponse({ environment: 'staging', commitSha: stagingSha })],
  ]);
  return async url => responses.get(url) || jsonResponse({}, { status: 404 });
}

function assertReleaseError(error, code) {
  assert.equal(error instanceof ReleaseIdentityError, true);
  assert.equal(error.code, code);
  return true;
}

test('accepts Staging only when GitHub returns the exact repository commit', async () => {
  const calls = [];
  const client = {
    repository: 'abdullahkrs/Creatorverse',
    async request(method, path) {
      calls.push({ method, path });
      return { sha: STAGING_SHA };
    },
  };

  const verification = await verifyReleaseAndRepositoryWithRetry({
    client,
    sha: SHA,
    productionUrl: PRODUCTION_URL,
    stagingUrl: STAGING_URL,
    fetchImpl: endpointFetch(),
    maxAttempts: 1,
  });

  assert.equal(verification.staging.commitSha, STAGING_SHA);
  assert.deepEqual(calls, [{
    method: 'GET',
    path: `/repos/abdullahkrs/Creatorverse/commits/${STAGING_SHA}`,
  }]);
});

test('rejects a full-length Staging SHA that is not a repository commit', async () => {
  const client = {
    repository: 'abdullahkrs/Creatorverse',
    async request() {
      throw new ReleaseIdentityError(
        'GITHUB_API_ERROR',
        'GitHub API GET /repos/abdullahkrs/Creatorverse/commits returned HTTP 404.',
      );
    },
  };

  await assert.rejects(
    verifyReleaseAndRepositoryWithRetry({
      client,
      sha: SHA,
      productionUrl: PRODUCTION_URL,
      stagingUrl: STAGING_URL,
      fetchImpl: endpointFetch({ stagingSha: UNKNOWN_SHA }),
      maxAttempts: 1,
    }),
    error => {
      assertReleaseError(error, 'STAGING_SHA_NOT_IN_REPOSITORY');
      assert.match(error.message, new RegExp(UNKNOWN_SHA));
      return true;
    },
  );
});

test('assertRepositoryCommit rejects a mismatched GitHub response', async () => {
  const client = {
    repository: 'abdullahkrs/Creatorverse',
    async request() {
      return { sha: SHA };
    },
  };

  await assert.rejects(
    assertRepositoryCommit(client, STAGING_SHA),
    error => assertReleaseError(error, 'STAGING_SHA_NOT_IN_REPOSITORY'),
  );
});

test('finds and updates a canonical marker after the first 100 comments', async () => {
  const calls = [];
  const unrelated = Array.from({ length: 100 }, (_, index) => ({
    id: index + 1,
    body: `unrelated-${index + 1}`,
  }));
  const marker = { id: 501, body: `RAILWAY-IDENTITY-VERIFIED:${SHA}` };
  const client = {
    repository: 'abdullahkrs/Creatorverse',
    async request(method, path, body) {
      calls.push({ method, path, body });
      if (method === 'GET' && path.endsWith('per_page=100&page=1')) return unrelated;
      if (method === 'GET' && path.endsWith('per_page=100&page=2')) return [marker];
      if (method === 'PATCH' && path.endsWith('/501')) return { ...marker, body: body.body };
      throw new Error(`Unexpected request ${method} ${path}`);
    },
  };

  await upsertEvidenceCommentPaginated(client, 12, SHA, 'replacement');

  assert.equal(calls.some(call => call.method === 'POST'), false);
  assert.equal(calls.filter(call => call.method === 'GET').length, 2);
  assert.deepEqual(calls.at(-1), {
    method: 'PATCH',
    path: '/repos/abdullahkrs/Creatorverse/issues/comments/501',
    body: { body: 'replacement' },
  });
});

test('finds the canonical ledger after the first 100 issues without creating a duplicate', async () => {
  const calls = [];
  const unrelated = Array.from({ length: 100 }, (_, index) => ({
    number: index + 1,
    title: `Issue ${index + 1}`,
    state: 'closed',
  }));
  const ledger = {
    number: 301,
    title: '[Ledger] Railway release identity evidence',
    state: 'open',
  };
  const client = {
    repository: 'abdullahkrs/Creatorverse',
    async request(method, path, body) {
      calls.push({ method, path, body });
      if (method === 'GET' && path.endsWith('per_page=100&page=1')) return unrelated;
      if (method === 'GET' && path.endsWith('per_page=100&page=2')) return [ledger];
      throw new Error(`Unexpected request ${method} ${path}`);
    },
  };

  const result = await ensureReleaseLedgerPaginated(client);

  assert.equal(result.number, 301);
  assert.equal(calls.some(call => call.method === 'POST'), false);
});
