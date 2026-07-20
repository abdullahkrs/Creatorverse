export const ATTESTATION_SCHEMA_VERSION = 1;
export const LEDGER_TITLE = '[Ledger] Railway release identity evidence';
export const STATUS_CONTEXT = 'railway-production-identity';
export const VERIFIED_MARKER = 'RAILWAY-IDENTITY-VERIFIED';
export const FAILED_MARKER = 'RAILWAY-IDENTITY-FAILED';

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PROHIBITED_CLAIM_PATTERN = /human research|human validation|user comprehension|market validation|market evidence|demand evidence|retention evidence|preference evidence/i;
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;
const DEFAULT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 100;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class ReleaseIdentityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ReleaseIdentityError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ReleaseIdentityError(code, message);
}

function safeInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function encodedRepository(repository) {
  if (!REPOSITORY_PATTERN.test(String(repository || ''))) {
    fail('INVALID_REPOSITORY', 'GitHub repository must use owner/name form.');
  }
  return repository.split('/').map(encodeURIComponent).join('/');
}

export function assertExactSha(value, label = 'SHA') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!SHA_PATTERN.test(normalized)) {
    fail('INVALID_SHA', `${label} must be a full 40-character Git commit SHA.`);
  }
  return normalized;
}

export function normalizeRailwayOrigin(value, label = 'Railway origin') {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    fail('INVALID_ORIGIN', `${label} must be a valid HTTPS Railway origin.`);
  }

  const validPath = url.pathname === '/' || url.pathname === '';
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.port
    || !validPath
    || url.search
    || url.hash
    || !url.hostname.toLowerCase().endsWith('.up.railway.app')
  ) {
    fail(
      'INVALID_ORIGIN',
      `${label} must be a public HTTPS *.up.railway.app origin without credentials, port, path, query, or fragment.`,
    );
  }

  return url.origin;
}

export function assertDistinctOrigins(productionOrigin, stagingOrigin) {
  if (productionOrigin === stagingOrigin) {
    fail('ORIGIN_COLLISION', 'Production and Staging origins must be distinct.');
  }
}

export function validateWorkflowRunUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    fail('INVALID_WORKFLOW_URL', 'Workflow run URL must be a valid GitHub Actions URL.');
  }

  if (
    url.protocol !== 'https:'
    || url.hostname !== 'github.com'
    || !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/.test(url.pathname)
    || url.search
    || url.hash
  ) {
    fail('INVALID_WORKFLOW_URL', 'Workflow run URL must identify one GitHub Actions run.');
  }
  return url.toString();
}

async function requestJson(origin, path, label, {
  fetchImpl = fetch,
  timeoutMs = 12_000,
} = {}) {
  let response;
  try {
    response = await fetchImpl(`${origin}${path}`, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const suffix = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? ' timed out'
      : ' was unavailable';
    fail('ENDPOINT_UNAVAILABLE', `${label}${suffix}.`);
  }

  if (!response?.ok) {
    fail('UNHEALTHY_ENDPOINT', `${label} returned HTTP ${response?.status || 'unknown'}.`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    fail('MALFORMED_RESPONSE', `${label} did not return valid JSON.`);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail('MALFORMED_RESPONSE', `${label} returned an invalid JSON object.`);
  }
  return body;
}

function assertHealthy(health, label) {
  if (health.status !== 'ok') {
    fail('UNHEALTHY_ENDPOINT', `${label} did not report status ok.`);
  }
}

function assertEnvironment(version, expected, label) {
  const actual = String(version.environment || '').trim().toLowerCase();
  if (actual !== expected) {
    fail('WRONG_ENVIRONMENT', `${label} reported environment ${actual || '<missing>'}; expected ${expected}.`);
  }
}

export async function verifyReleaseOnce({
  sha,
  productionUrl,
  stagingUrl,
  fetchImpl = fetch,
  timeoutMs = 12_000,
} = {}) {
  const expectedSha = assertExactSha(sha, 'Expected commit SHA');
  const productionOrigin = normalizeRailwayOrigin(productionUrl, 'Production origin');
  const stagingOrigin = normalizeRailwayOrigin(stagingUrl, 'Staging origin');
  assertDistinctOrigins(productionOrigin, stagingOrigin);

  const [productionHealth, productionVersion, stagingHealth, stagingVersion] = await Promise.all([
    requestJson(productionOrigin, '/health', 'Production /health', { fetchImpl, timeoutMs }),
    requestJson(productionOrigin, '/version', 'Production /version', { fetchImpl, timeoutMs }),
    requestJson(stagingOrigin, '/health', 'Staging /health', { fetchImpl, timeoutMs }),
    requestJson(stagingOrigin, '/version', 'Staging /version', { fetchImpl, timeoutMs }),
  ]);

  assertHealthy(productionHealth, 'Production /health');
  assertHealthy(stagingHealth, 'Staging /health');
  assertEnvironment(productionVersion, 'production', 'Production /version');
  assertEnvironment(stagingVersion, 'staging', 'Staging /version');

  const productionSha = assertExactSha(productionVersion.commitSha, 'Production /version commitSha');
  if (productionSha !== expectedSha) {
    fail('PRODUCTION_SHA_MISMATCH', `Production serves ${productionSha}; expected ${expectedSha}.`);
  }

  const stagingSha = assertExactSha(stagingVersion.commitSha, 'Staging /version commitSha');
  return {
    production: {
      origin: productionOrigin,
      environment: 'production',
      health: 'ok',
      commitSha: productionSha,
    },
    staging: {
      origin: stagingOrigin,
      environment: 'staging',
      health: 'ok',
      commitSha: stagingSha,
    },
  };
}

export async function verifyReleaseWithRetry({
  maxAttempts = 18,
  retryDelayMs = 20_000,
  sleepFn = sleep,
  onAttempt = () => {},
  ...context
} = {}) {
  const attempts = safeInteger(maxAttempts, 18, { min: 1, max: 30 });
  const delay = safeInteger(retryDelayMs, 20_000, { min: 0, max: 60_000 });
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await verifyReleaseOnce(context);
      return { ...result, attempts: attempt };
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

export function buildAttestation(verification, {
  sha,
  workflowUrl,
  now = () => new Date(),
} = {}) {
  const expectedSha = assertExactSha(sha, 'Attestation SHA');
  const attestation = {
    schemaVersion: ATTESTATION_SCHEMA_VERSION,
    evidenceKind: 'operational-deployment-identity',
    sha: expectedSha,
    verifiedAt: now().toISOString(),
    workflowRunUrl: validateWorkflowRunUrl(workflowUrl),
    attempts: safeInteger(verification?.attempts, 1, { min: 1, max: 30 }),
    production: {
      origin: normalizeRailwayOrigin(verification?.production?.origin, 'Attested Production origin'),
      environment: verification?.production?.environment,
      health: verification?.production?.health,
      commitSha: assertExactSha(verification?.production?.commitSha, 'Attested Production commit SHA'),
    },
    staging: {
      origin: normalizeRailwayOrigin(verification?.staging?.origin, 'Attested Staging origin'),
      environment: verification?.staging?.environment,
      health: verification?.staging?.health,
      commitSha: assertExactSha(verification?.staging?.commitSha, 'Attested Staging commit SHA'),
    },
  };
  validateAttestation(attestation, { expectedSha, now });
  return attestation;
}

export function validateAttestation(attestation, {
  expectedSha,
  now = () => new Date(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  futureToleranceMs = DEFAULT_FUTURE_TOLERANCE_MS,
} = {}) {
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
    fail('INVALID_ATTESTATION', 'Attestation must be a JSON object.');
  }
  if (attestation.schemaVersion !== ATTESTATION_SCHEMA_VERSION) {
    fail('INVALID_ATTESTATION', 'Attestation schema version is unsupported.');
  }
  if (attestation.evidenceKind !== 'operational-deployment-identity') {
    fail('INVALID_ATTESTATION', 'Attestation evidence kind is invalid.');
  }

  const normalizedExpectedSha = assertExactSha(expectedSha, 'Expected attestation SHA');
  const attestedSha = assertExactSha(attestation.sha, 'Attested SHA');
  if (attestedSha !== normalizedExpectedSha) {
    fail('ATTESTATION_SHA_MISMATCH', `Attestation is for ${attestedSha}; expected ${normalizedExpectedSha}.`);
  }

  const timestamp = Date.parse(attestation.verifiedAt);
  if (!Number.isFinite(timestamp)) {
    fail('INVALID_ATTESTATION_TIME', 'Attestation timestamp is invalid.');
  }
  const currentTime = now().getTime();
  if (timestamp > currentTime + futureToleranceMs) {
    fail('FUTURE_ATTESTATION', 'Attestation timestamp is too far in the future.');
  }
  if (currentTime - timestamp > maxAgeMs) {
    fail('STALE_ATTESTATION', 'Attestation timestamp is outside the accepted freshness window.');
  }

  validateWorkflowRunUrl(attestation.workflowRunUrl);
  const productionOrigin = normalizeRailwayOrigin(attestation.production?.origin, 'Attested Production origin');
  const stagingOrigin = normalizeRailwayOrigin(attestation.staging?.origin, 'Attested Staging origin');
  assertDistinctOrigins(productionOrigin, stagingOrigin);

  if (attestation.production?.environment !== 'production' || attestation.production?.health !== 'ok') {
    fail('INVALID_ATTESTATION', 'Attested Production identity is not healthy production.');
  }
  if (attestation.staging?.environment !== 'staging' || attestation.staging?.health !== 'ok') {
    fail('INVALID_ATTESTATION', 'Attested Staging identity is not healthy staging.');
  }
  if (assertExactSha(attestation.production?.commitSha, 'Attested Production commit SHA') !== normalizedExpectedSha) {
    fail('ATTESTATION_SHA_MISMATCH', 'Attested Production commit does not match the expected SHA.');
  }
  assertExactSha(attestation.staging?.commitSha, 'Attested Staging commit SHA');

  if (PROHIBITED_CLAIM_PATTERN.test(JSON.stringify(attestation))) {
    fail('PROHIBITED_CLAIM', 'Attestation wording overstates automated operational evidence.');
  }
  return true;
}

export function buildFailureRecord(error, {
  sha,
  workflowUrl,
  productionUrl,
  stagingUrl,
  now = () => new Date(),
} = {}) {
  const reason = error instanceof ReleaseIdentityError
    ? error
    : new ReleaseIdentityError('VERIFICATION_ERROR', 'Release identity verification failed.');

  const safeOrigin = (value, label) => {
    try {
      return normalizeRailwayOrigin(value, label);
    } catch {
      return '<invalid-origin>';
    }
  };

  return {
    schemaVersion: ATTESTATION_SCHEMA_VERSION,
    evidenceKind: 'operational-deployment-identity',
    sha: assertExactSha(sha, 'Failure record SHA'),
    failedAt: now().toISOString(),
    workflowRunUrl: validateWorkflowRunUrl(workflowUrl),
    productionOrigin: safeOrigin(productionUrl, 'Production origin'),
    stagingOrigin: safeOrigin(stagingUrl, 'Staging origin'),
    reason: {
      code: reason.code || 'VERIFICATION_ERROR',
      message: String(reason.message || 'Release identity verification failed.').slice(0, 500),
    },
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function renderLedgerComment(kind, record) {
  const marker = kind === 'verified' ? VERIFIED_MARKER : FAILED_MARKER;
  return `${marker}:${record.sha}\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\``;
}

export function extractVerifiedEvidence(commentBody, expectedSha, options = {}) {
  const normalizedSha = assertExactSha(expectedSha, 'Expected marker SHA');
  const marker = new RegExp(`^${VERIFIED_MARKER}:${escapeRegExp(normalizedSha)}$`, 'm');
  if (!marker.test(String(commentBody || ''))) {
    fail('MISSING_MARKER', 'Verified ledger marker is missing or belongs to another SHA.');
  }

  const match = String(commentBody || '').match(/```json\s*([\s\S]*?)\s*```/i);
  if (!match) {
    fail('INVALID_ATTESTATION', 'Ledger marker does not contain machine-readable JSON.');
  }

  let attestation;
  try {
    attestation = JSON.parse(match[1]);
  } catch {
    fail('INVALID_ATTESTATION', 'Ledger marker JSON is malformed.');
  }
  validateAttestation(attestation, { expectedSha: normalizedSha, ...options });
  return attestation;
}

function markerPatternForSha(sha) {
  return new RegExp(`^RAILWAY-IDENTITY-(?:VERIFIED|FAILED):${escapeRegExp(sha)}$`, 'm');
}

export function chooseCanonicalLedger(issues) {
  return (Array.isArray(issues) ? issues : [])
    .filter(issue => !issue.pull_request && issue.title === LEDGER_TITLE)
    .sort((left, right) => Number(left.number) - Number(right.number));
}

export function chooseEvidenceComments(comments, sha) {
  const pattern = markerPatternForSha(assertExactSha(sha, 'Comment SHA'));
  return (Array.isArray(comments) ? comments : [])
    .filter(comment => pattern.test(String(comment.body || '')))
    .sort((left, right) => Number(left.id) - Number(right.id));
}

export function createGithubClient({ repository, token, fetchImpl = fetch } = {}) {
  if (!REPOSITORY_PATTERN.test(String(repository || ''))) {
    fail('INVALID_REPOSITORY', 'GitHub repository must use owner/name form.');
  }
  if (!String(token || '').trim()) {
    fail('MISSING_GITHUB_TOKEN', 'GITHUB_TOKEN is required.');
  }

  async function request(method, path, body) {
    let response;
    try {
      response = await fetchImpl(`https://api.github.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      fail('GITHUB_API_UNAVAILABLE', `GitHub API ${method} ${path.split('?')[0]} was unavailable.`);
    }

    if (!response.ok) {
      fail('GITHUB_API_ERROR', `GitHub API ${method} ${path.split('?')[0]} returned HTTP ${response.status}.`);
    }
    if (response.status === 204) return null;

    try {
      return await response.json();
    } catch {
      fail('GITHUB_API_ERROR', `GitHub API ${method} ${path.split('?')[0]} returned malformed JSON.`);
    }
  }

  return { repository, request };
}

export async function listGithubPages(client, path, {
  perPage = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
} = {}) {
  const pageSize = safeInteger(perPage, DEFAULT_PAGE_SIZE, { min: 1, max: 100 });
  const pageLimit = safeInteger(maxPages, DEFAULT_MAX_PAGES, { min: 1, max: 100 });
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

export async function ensureReleaseLedger(client) {
  const repo = encodedRepository(client.repository);
  const issues = await listGithubPages(client, `/repos/${repo}/issues?state=all`);
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

export async function upsertEvidenceComment(client, issueNumber, sha, body) {
  const repo = encodedRepository(client.repository);
  const comments = await listGithubPages(client, `/repos/${repo}/issues/${issueNumber}/comments`);
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

export async function publishCommitStatus(client, sha, {
  state,
  description,
  targetUrl,
} = {}) {
  const normalizedSha = assertExactSha(sha, 'Status SHA');
  const allowedStates = new Set(['pending', 'success', 'failure', 'error']);
  if (!allowedStates.has(state)) {
    fail('INVALID_STATUS', 'Commit status state is invalid.');
  }

  const repo = encodedRepository(client.repository);
  return client.request('POST', `/repos/${repo}/statuses/${normalizedSha}`, {
    state,
    context: STATUS_CONTEXT,
    description: String(description || '').slice(0, 140),
    target_url: validateWorkflowRunUrl(targetUrl),
  });
}

export function renderSummary({ state, sha, record, ledgerNumber }) {
  const title = state === 'success' ? 'PASS' : 'FAIL';
  const production = state === 'success'
    ? `production / ok / ${record.production.commitSha}`
    : `failed / ${record.reason.code}`;
  const staging = state === 'success'
    ? 'staging / ok / distinct origin'
    : 'not attested';

  return [
    `## Railway release identity: ${title}`,
    `- SHA: \`${sha}\``,
    `- Production: ${production}`,
    `- Staging: ${staging}`,
    '- Evidence: operational deployment identity',
    `- Ledger: issue #${ledgerNumber || 'unavailable'}`,
    `- Result: ${state === 'success' ? 'stable status and canonical marker published' : record.reason.message}`,
  ].join('\n');
}
