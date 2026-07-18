import { appendFile } from 'node:fs/promises';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function compatibleSha(actual, expected) {
  return Boolean(actual && expected && (actual === expected || actual.startsWith(expected) || expected.startsWith(actual)));
}

export function verifyIdentity(version, { expectedSha, expectedRef, productionUrl, candidate }) {
  if (!compatibleSha(String(version.commitSha || ''), expectedSha)) throw new Error(`Preview commit ${version.commitSha || '<missing>'} does not match ${expectedSha}`);
  if (String(version.environment || '').toLowerCase() === 'production') throw new Error('Preview reports the production environment.');
  if (version.branch !== expectedRef) throw new Error(`Preview branch ${version.branch || '<missing>'} does not match ${expectedRef}`);
  if (candidate.replace(/\/$/, '') === productionUrl.replace(/\/$/, '')) throw new Error('Production cannot be used as Preview.');
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), ...options });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { response, body, text };
}

export async function verifyCandidate(candidate, context) {
  const base = candidate.replace(/\/$/, '');
  const health = await requestJson(`${base}/health`);
  const version = await requestJson(`${base}/version`);
  if (!health.response.ok || health.body?.status !== 'ok') throw new Error(`Preview health failed with HTTP ${health.response.status}`);
  if (!version.response.ok || typeof version.body !== 'object') throw new Error(`Preview version failed with HTTP ${version.response.status}`);
  verifyIdentity(version.body, { ...context, candidate: base });
  return { base, health: health.body, version: version.body };
}

async function githubJson(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15_000),
  });
  return response.ok ? response.json() : [];
}

function railwayUrls(value) {
  return [...String(value || '').matchAll(/https?:\/\/[A-Za-z0-9.-]+\.up\.railway\.app/g)].map(match => match[0]);
}

export function expectedPrDomain(prNumber) {
  return `https://creatorverse-app-creatorverse-pr-${prNumber}.up.railway.app`;
}

export async function discoverCandidates({ repository, sha, ref, prNumber, token, stagingUrl }) {
  const candidates = new Set([expectedPrDomain(prNumber)]);
  const deployments = await githubJson(`/repos/${repository}/deployments?sha=${encodeURIComponent(sha)}&per_page=100`, token);
  const metadata = [deployments];
  for (const deployment of Array.isArray(deployments) ? deployments : []) {
    if (deployment.sha !== sha && deployment.ref !== ref) continue;
    metadata.push(await githubJson(`/repos/${repository}/deployments/${deployment.id}/statuses?per_page=100`, token));
  }
  metadata.push(await githubJson(`/repos/${repository}/commits/${sha}/status`, token));
  metadata.push(await githubJson(`/repos/${repository}/commits/${sha}/check-runs?per_page=100`, token));
  metadata.push(await githubJson(`/repos/${repository}/issues/${prNumber}/comments?per_page=100`, token));
  for (const url of railwayUrls(JSON.stringify(metadata))) candidates.add(url);
  if (stagingUrl) candidates.add(stagingUrl);
  return [...candidates];
}

async function main() {
  const context = {
    expectedSha: process.env.EXPECTED_SHA,
    expectedRef: process.env.EXPECTED_REF,
    productionUrl: process.env.PRODUCTION_URL,
  };
  const discovery = {
    repository: process.env.GITHUB_REPOSITORY,
    sha: context.expectedSha,
    ref: context.expectedRef,
    prNumber: process.env.PR_NUMBER,
    token: process.env.GITHUB_TOKEN,
    stagingUrl: process.env.STAGING_URL,
  };
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const candidates = await discoverCandidates(discovery);
    for (const candidate of candidates) {
      try {
        const result = await verifyCandidate(candidate, context);
        await appendFile(process.env.GITHUB_OUTPUT || '/tmp/railway-preview-output', `preview_url=${result.base}\n`);
        console.log(JSON.stringify(result, null, 2));
        return;
      } catch (error) {
        console.log(`${candidate}: ${error.message}`);
      }
    }
    console.log(`Preview discovery attempt ${attempt}/30 did not find ${context.expectedRef}@${context.expectedSha}`);
    await sleep(20_000);
  }
  throw new Error('No isolated Railway environment is publicly serving the exact PR branch and commit.');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error); process.exit(1); });
