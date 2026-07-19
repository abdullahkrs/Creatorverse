import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const USABILITY_PROXY_EVIDENCE_TYPE = 'AUTOMATED_ENGINEERING_USABILITY_PROXY';
export const USABILITY_PROXY_DECISIONS = Object.freeze([
  'AUTOMATED_PROXY_PASS',
  'AUTOMATED_PROXY_FAIL',
]);

export const REQUIRED_PROXY_PROFILES = Object.freeze([
  'ar-rtl-touch-320x568',
  'ar-rtl-keyboard-390x844',
  'en-ltr-touch-320x568',
  'en-ltr-keyboard-390x844',
  'fresh-session-recovery',
]);

export const REQUIRED_PROXY_STATES = Object.freeze([
  'loading',
  'empty-content',
  'invalid-invite',
  'recoverable-mission-failure',
  'recoverable-copy-failure',
  'network-service-error',
]);

const FORBIDDEN_RESEARCH_CLAIMS = [
  /\bparticipants?\b/iu,
  /\bhuman\s+(?:research|validation|evidence|comprehension)\b/iu,
  /\busability\s+(?:study|interview|survey)\b/iu,
  /\b(?:retention|market demand|user preference)\b/iu,
  /(?:مشاركون|مشاركين|بحث بشري|دراسة مستخدمين|مقابلات|استبيان|الاحتفاظ|طلب السوق|تفضيلات المستخدمين)/u,
];

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizedUrl(value) {
  try {
    const url = new URL(String(value));
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/u, '');
  } catch {
    return '';
  }
}

function assertExactSet(actual, expected, label) {
  assertCondition(Array.isArray(actual), `${label} must be an array.`);
  const unique = [...new Set(actual)];
  assertCondition(unique.length === actual.length, `${label} must not contain duplicates.`);
  assertCondition(unique.length === expected.length, `${label} must contain exactly ${expected.length} entries.`);
  for (const item of expected) assertCondition(unique.includes(item), `${label} is missing ${item}.`);
}

export function validateUsabilityProxyReport(report, {
  expectedSha,
  expectedRef,
  expectedPreviewUrl,
  now = new Date(),
  maxAgeMs = 6 * 60 * 60 * 1000,
} = {}) {
  assertCondition(report && typeof report === 'object' && !Array.isArray(report), 'Proxy report must be an object.');
  assertCondition(report.schemaVersion === 1, 'Proxy report schemaVersion must be 1.');
  assertCondition(report.evidenceType === USABILITY_PROXY_EVIDENCE_TYPE, 'Proxy report evidence type is invalid.');
  assertCondition(USABILITY_PROXY_DECISIONS.includes(report.decision), 'Proxy report decision is invalid.');
  assertCondition(report.disclaimer === 'Engineering automation only; no people were recruited or observed.', 'Proxy report disclaimer is missing or changed.');

  const serialized = JSON.stringify(report);
  for (const forbidden of FORBIDDEN_RESEARCH_CLAIMS) {
    assertCondition(!forbidden.test(serialized), `Proxy report contains a prohibited research claim: ${forbidden}`);
  }

  const generatedAt = new Date(report.generatedAt);
  assertCondition(Number.isFinite(generatedAt.getTime()), 'Proxy report generatedAt is invalid.');
  const age = now.getTime() - generatedAt.getTime();
  assertCondition(age >= -60_000, 'Proxy report generatedAt is unexpectedly in the future.');
  assertCondition(age <= maxAgeMs, 'Proxy report is stale.');

  assertCondition(report.identity && typeof report.identity === 'object', 'Proxy report identity is missing.');
  assertCondition(/^[0-9a-f]{7,40}$/iu.test(report.identity.headSha || ''), 'Proxy report head SHA is invalid.');
  assertCondition(typeof report.identity.branch === 'string' && report.identity.branch.length > 0, 'Proxy report branch is missing.');
  const previewUrl = normalizedUrl(report.identity.previewUrl);
  assertCondition(previewUrl.startsWith('https://'), 'Proxy report Preview URL must use HTTPS.');
  assertCondition(/-pr-\d+\.up\.railway\.app$/iu.test(new URL(previewUrl).hostname), 'Proxy report must use an isolated Railway PR environment.');
  assertCondition(!/production/iu.test(previewUrl), 'Production cannot be used as usability proxy Preview.');
  assertCondition(report.identity.healthStatus === 'ok', 'Proxy report health status must be ok.');
  assertCondition(report.identity.versionCommitSha === report.identity.headSha, 'Proxy report /version SHA must equal the report head SHA.');
  assertCondition(report.identity.versionBranch === report.identity.branch, 'Proxy report /version branch must equal the report branch.');

  if (expectedSha) assertCondition(report.identity.headSha === expectedSha, `Proxy report SHA ${report.identity.headSha} does not match ${expectedSha}.`);
  if (expectedRef) assertCondition(report.identity.branch === expectedRef, `Proxy report branch ${report.identity.branch} does not match ${expectedRef}.`);
  if (expectedPreviewUrl) assertCondition(previewUrl === normalizedUrl(expectedPreviewUrl), 'Proxy report Preview URL does not match the verified candidate.');

  assertCondition(Array.isArray(report.profiles), 'Proxy report profiles are missing.');
  assertExactSet(report.profiles.map(profile => profile.id), REQUIRED_PROXY_PROFILES, 'Proxy profile IDs');
  for (const profile of report.profiles) {
    assertCondition(profile.status === 'PASS' || profile.status === 'FAIL', `${profile.id} status is invalid.`);
    assertCondition(Number.isInteger(profile.steps) && profile.steps > 0, `${profile.id} step count is invalid.`);
    assertCondition(Number.isInteger(profile.stepBudget) && profile.stepBudget >= profile.steps, `${profile.id} exceeded its interaction budget.`);
    assertCondition(Number.isFinite(profile.elapsedMs) && profile.elapsedMs >= 0, `${profile.id} elapsed time is invalid.`);
    assertCondition(Array.isArray(profile.checks) && profile.checks.length > 0, `${profile.id} checks are missing.`);
    assertCondition(Array.isArray(profile.screenshots), `${profile.id} screenshots are missing.`);
  }

  assertCondition(Array.isArray(report.states), 'Proxy report states are missing.');
  assertExactSet(report.states.map(state => state.id), REQUIRED_PROXY_STATES, 'Proxy state IDs');
  for (const state of report.states) {
    assertCondition(state.status === 'PASS' || state.status === 'FAIL', `${state.id} status is invalid.`);
    assertCondition(typeof state.recovery === 'string' && state.recovery.length > 0, `${state.id} recovery evidence is missing.`);
  }

  const allPassed = report.profiles.every(profile => profile.status === 'PASS')
    && report.states.every(state => state.status === 'PASS');
  assertCondition(
    report.decision === (allPassed ? 'AUTOMATED_PROXY_PASS' : 'AUTOMATED_PROXY_FAIL'),
    'Proxy report decision does not match profile and state results.',
  );

  return report;
}

export function renderUsabilityProxyMarkdown(report) {
  const profileRows = report.profiles
    .map(profile => `| \`${profile.id}\` | ${profile.status} | ${profile.steps}/${profile.stepBudget} | ${Math.round(profile.elapsedMs)} ms |`)
    .join('\n');
  const stateRows = report.states
    .map(state => `| \`${state.id}\` | ${state.status} | ${state.recovery.replaceAll('|', '\\|')} |`)
    .join('\n');

  return `# Creatorverse automated usability proxy\n\n- Evidence: \`${report.evidenceType}\`\n- Decision: \`${report.decision}\`\n- Generated: \`${report.generatedAt}\`\n- Head: \`${report.identity.headSha}\`\n- Branch: \`${report.identity.branch}\`\n- Preview: \`${report.identity.previewUrl}\`\n- Notice: ${report.disclaimer}\n\n## Scenario profiles\n\n| Profile | Result | Steps | Browser time |\n|---|---:|---:|---:|\n${profileRows}\n\n## Controlled states\n\n| State | Result | Safe recovery evidence |\n|---|---:|---|\n${stateRows}\n`;
}

export async function writeUsabilityProxyReport(report, {
  jsonPath = 'test-results/usability-proxy/report.json',
  markdownPath = 'test-results/usability-proxy/report.md',
  validation = {},
} = {}) {
  validateUsabilityProxyReport(report, validation);
  await mkdir(dirname(jsonPath), { recursive: true });
  await mkdir(dirname(markdownPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderUsabilityProxyMarkdown(report), 'utf8');
  return { jsonPath, markdownPath };
}

async function verifyFromCli() {
  const jsonPath = process.env.USABILITY_PROXY_REPORT || 'test-results/usability-proxy/report.json';
  const markdownPath = process.env.USABILITY_PROXY_MARKDOWN || 'test-results/usability-proxy/report.md';
  const report = JSON.parse(await readFile(jsonPath, 'utf8'));
  validateUsabilityProxyReport(report, {
    expectedSha: process.env.USABILITY_PROXY_SHA,
    expectedRef: process.env.USABILITY_PROXY_REF,
    expectedPreviewUrl: process.env.USABILITY_PROXY_URL,
  });
  const markdown = await readFile(markdownPath, 'utf8');
  for (const token of [report.evidenceType, report.decision, report.identity.headSha, report.identity.branch, report.identity.previewUrl]) {
    assertCondition(markdown.includes(token), `Proxy Markdown summary is missing ${token}.`);
  }
  console.log(`Verified ${report.decision} for ${report.identity.branch}@${report.identity.headSha}.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  verifyFromCli().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
