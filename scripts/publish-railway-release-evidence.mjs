import { appendFile } from 'node:fs/promises';

import {
  LEDGER_TITLE,
  ReleaseIdentityError,
  VERIFIED_MARKER,
  assertExactSha,
  buildAttestation,
  buildFailureRecord,
  chooseCanonicalLedger,
  chooseEvidenceComments,
  createGithubClient,
  extractVerifiedEvidence,
  publishCommitStatus,
  renderLedgerComment,
  renderSummary,
  verifyReleaseOnce,
} from './verify-railway-release.mjs';

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 100;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function fail(code, message) {
  throw new ReleaseIdentityError(code, message);
}

function boundedInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function encodedRepository(repository) {
  if (!REPOSITORY_PATTERN.test(String(repository || ''))) {
    fail('INVALID_REPOSITORY', 'GitHub repository must use owner/name form.');
  }
  return repository.split('/').map(encodeURIComponent).join('/');
}

function workflowRunUrl(repository, runId) {
  if (!REPOSITORY_PATTERN.test(String(repository || ''))) {
    fail('INVALID_REPOSITORY', 'GITHUB_REPOSITORY is invalid.');
  }
  if (!/^\d+$/.test(String(runId || ''))) {
    fail('INVALID_WORKFLOW_URL', 'GITHUB_RUN_ID is invalid.');
  }
  return `https://github.com/${repository}/actions/runs/${runId}`;
}

export async function listAllPages(client, path, {
  perPage = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
} = {}) {
  const pageSize = boundedInteger(perPage, DEFAULT_PAGE_SIZE, { min: 1, max: 100 });
  const pageLimit = boundedInteger(maxPages, DEFAULT_MAX_PAGES, { min: 1, max: 100 });
  const separator = path.includes('?') ? '&' : '?';
  const items = [];

  for (let page = 1; page <= pageLimit; page += 1) {
    const batch = await client.request('GET', `${path}${separator}per_page=${pageSize}&page=${page}`);
    if (!Array.isArray(batch)) {
      fail('GITHUB_API_ERROR', `GitHub API GET ${path.split('?')[0]} did not return a list.`);
    }
    items.push(...batch);
    if (batch.length < pageSize) return items;
  }

  fail('PAGINATION_LIMIT', `GitHub API GET ${path.split('?')[0]} exceeded ${pageLimit} pages.`);
}

export async function assertRepositoryCommit(client, sha) {
  const normalizedSha = assertExactSha(sha, 'Staging /version commitSha');
  const repo = encodedRepository(client.repository);
  let commit;

  try {
    commit = await client.request('GET', `/repos/${repo}/commits/${normalizedSha}`);
  } catch (error) {
    if (
      error instanceof ReleaseIdentityError
      && error.code === 'GITHUB_API_ERROR'
      && /HTTP 404\b/.test(error.message)
    ) {
      fail('STAGING_SHA_NOT_IN_REPOSITORY', `Staging reports ${normalizedSha}, but GitHub does not recognize that commit in ${client.repository}.`);
    }
    throw error;
  }

  const returnedSha = String(commit?.sha || '').trim().toLowerCase();
  if (returnedSha !== normalizedSha) {
    fail('STAGING_SHA_NOT_IN_REPOSITORY', `Staging reports ${normalizedSha}, but GitHub did not return the same commit from ${client.repository}.`);
  }
  return normalizedSha;
}

export async function verifyReleaseAndRepositoryWithRetry({
  client,
  maxAttempts = 18,
  retryDelayMs = 20_000,
  sleepFn = sleep,
  onAttempt = () => {},
  ...context
} = {}) {
  if (!client?.repository || typeof client.request !== 'function') {
    fail('INVALID_GITHUB_CLIENT', 'A scoped GitHub client is required for Staging commit validation.');
  }

  const attempts = boundedInteger(maxAttempts, 18, { min: 1, max: 30 });
  const delay = boundedInteger(retryDelayMs, 20_000, { min: 0, max: 60_000 });
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const verification = await verifyReleaseOnce(context);
      await assertRepositoryCommit(client, verification.staging.commitSha);
      return { ...verification, attempts: attempt };
    } catch (error) {
      lastError = error instanceof ReleaseIdentityError
        ? error
        : new ReleaseIdentityError('VERIFICATION_ERROR', 'Release identity verification failed.');
      onAttempt({ attempt, maxAttempts: attempts, code: lastError.code, message: lastError.message });
      if (attempt < attempts) await sleepFn(delay);
    }
  }

  throw new ReleaseIdentityError(
    lastError?.code || 'VERIFICATION_TIMEOUT',
    `${lastError?.message || 'Release identity verification failed.'} Bounded verification exhausted ${attempts} attempt${attempts === 1 ? '' : 's'}.`,
  );
}

export async function ensureReleaseLedgerPaginated(client) {
  const repo = encodedRepository(client.repository);
  const issues = await listAllPages(client, `/repos/${repo}/issues?state=all`);
  const ledgers = chooseCanonicalLedger(issues);
  let primary = ledgers[0];

  if (!primary) {
    primary = await client.request('POST', `/repos/${repo}/issues`, {
      title: LEDGER_TITLE,
      body: 'Automated operational evidence for Railway Production and Staging identity. Entries are machine-generated deployment checks only.',
    });
  } else if (primary.state !== 'open') {
    primary = await client.request('PATCH', `/repos/${repo}/issues/${primary.number}`, { state: 'open' });
  }

  for (const duplicate of ledgers.slice(1)) {
    if (duplicate.state === 'open') {
      await client.request('PATCH', `/repos/${repo}/issues/${duplicate.number}`, {
        state: 'closed',
        state_reason: 'not_planned',
      });
    }
  }

  return primary;
}

export async function upsertEvidenceCommentPaginated(client, issueNumber, sha, body) {
  const repo = encodedRepository(client.repository);
  const comments = await listAllPages(client, `/repos/${repo}/issues/${issueNumber}/comments`);
  const existing = chooseEvidenceComments(comments, sha);
  let comment;

  if (existing.length === 0) {
    comment = await client.request('POST', `/repos/${repo}/issues/${issueNumber}/comments`, { body });
  } else {
    comment = await client.request('PATCH', `/repos/${repo}/issues/comments/${existing[0].id}`, { body });
    for (const duplicate of existing.slice(1)) {
      await client.request('DELETE', `/repos/${repo}/issues/comments/${duplicate.id}`);
    }
  }

  return comment;
}

async function appendSummary(summary) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

export async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = assertExactSha(process.env.EXPECTED_SHA || process.env.GITHUB_SHA, 'Expected main SHA');
  const runUrl = workflowRunUrl(repository, process.env.GITHUB_RUN_ID);
  const productionUrl = process.env.PRODUCTION_URL;
  const stagingUrl = process.env.STAGING_URL;
  const client = createGithubClient({ repository, token: process.env.GITHUB_TOKEN });
  let ledger;

  try {
    await publishCommitStatus(client, sha, {
      state: 'pending',
      description: 'Verifying Railway Production identity and distinct Staging health',
      targetUrl: runUrl,
    });

    const verification = await verifyReleaseAndRepositoryWithRetry({
      client,
      sha,
      productionUrl,
      stagingUrl,
      maxAttempts: process.env.MAX_ATTEMPTS,
      retryDelayMs: process.env.RETRY_DELAY_MS,
      timeoutMs: boundedInteger(process.env.HTTP_TIMEOUT_MS, 12_000, { min: 1_000, max: 30_000 }),
      onAttempt: ({ attempt, maxAttempts, code }) => console.log(`Verification attempt ${attempt}/${maxAttempts}: ${code}`),
    });
    const attestation = buildAttestation(verification, { sha, workflowUrl: runUrl });
    const commentBody = renderLedgerComment('verified', attestation);
    extractVerifiedEvidence(commentBody, sha);

    ledger = await ensureReleaseLedgerPaginated(client);
    await upsertEvidenceCommentPaginated(client, ledger.number, sha, commentBody);
    await publishCommitStatus(client, sha, {
      state: 'success',
      description: 'Production exact SHA and distinct healthy Staging verified',
      targetUrl: runUrl,
    });
    await appendSummary(renderSummary({ state: 'success', sha, record: attestation, ledgerNumber: ledger.number }));
    console.log(`Published ${VERIFIED_MARKER}:${sha} to release ledger #${ledger.number}.`);
  } catch (error) {
    const failure = buildFailureRecord(error, {
      sha,
      workflowUrl: runUrl,
      productionUrl,
      stagingUrl,
    });

    try {
      ledger = ledger || await ensureReleaseLedgerPaginated(client);
      await upsertEvidenceCommentPaginated(client, ledger.number, sha, renderLedgerComment('failed', failure));
      await publishCommitStatus(client, sha, {
        state: 'failure',
        description: `${failure.reason.code}: Railway release identity not verified`,
        targetUrl: runUrl,
      });
    } catch (publishError) {
      console.error(`Evidence publication failed: ${publishError.code || 'GITHUB_API_ERROR'}`);
    }

    await appendSummary(renderSummary({ state: 'failure', sha, record: failure, ledgerNumber: ledger?.number }));
    console.error(`${failure.reason.code}: ${failure.reason.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`${error.code || 'VERIFICATION_ERROR'}: ${error.message || 'Release identity verification failed.'}`);
    process.exit(1);
  });
}
