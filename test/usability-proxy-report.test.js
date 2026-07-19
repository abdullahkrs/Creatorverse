import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRED_PROXY_PROFILES,
  REQUIRED_PROXY_STATES,
  USABILITY_PROXY_EVIDENCE_TYPE,
  renderUsabilityProxyMarkdown,
  validateUsabilityProxyReport,
} from '../scripts/usability-proxy-report.mjs';

const NOW = new Date('2026-07-19T19:30:00.000Z');
const SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const BRANCH = 'feature/cv-mvp-005a-usability-proxy';
const PREVIEW = 'https://creatorverse-app-creatorverse-pr-18.up.railway.app';

function createReport() {
  return {
    schemaVersion: 1,
    evidenceType: USABILITY_PROXY_EVIDENCE_TYPE,
    disclaimer: 'Engineering automation only; no people were recruited or observed.',
    decision: 'AUTOMATED_PROXY_PASS',
    generatedAt: '2026-07-19T19:29:00.000Z',
    identity: {
      headSha: SHA,
      branch: BRANCH,
      previewUrl: PREVIEW,
      healthStatus: 'ok',
      versionCommitSha: SHA,
      versionBranch: BRANCH,
    },
    profiles: REQUIRED_PROXY_PROFILES.map(id => ({
      id,
      status: 'PASS',
      steps: 9,
      stepBudget: 14,
      elapsedMs: 1200,
      checks: ['visible-controls', 'accessible-names'],
      screenshots: [`screenshots/${id}.png`],
    })),
    states: REQUIRED_PROXY_STATES.map(id => ({
      id,
      status: 'PASS',
      recovery: 'A visible named action restored a safe usable state.',
    })),
  };
}

function validate(report, overrides = {}) {
  return validateUsabilityProxyReport(report, {
    expectedSha: SHA,
    expectedRef: BRANCH,
    expectedPreviewUrl: PREVIEW,
    now: NOW,
    ...overrides,
  });
}

test('accepts one fresh exact-head automated proxy report', () => {
  const report = createReport();
  assert.equal(validate(report), report);
  const markdown = renderUsabilityProxyMarkdown(report);
  assert.match(markdown, /AUTOMATED_PROXY_PASS/u);
  assert.match(markdown, new RegExp(SHA, 'u'));
  assert.match(markdown, /fresh-session-recovery/u);
});

test('rejects missing profiles, missing states, and failed decision mismatch', () => {
  const missingProfile = createReport();
  missingProfile.profiles.pop();
  assert.throws(() => validate(missingProfile), /missing fresh-session-recovery|exactly 5/u);

  const missingState = createReport();
  missingState.states = missingState.states.filter(state => state.id !== 'recoverable-copy-failure');
  assert.throws(() => validate(missingState), /missing recoverable-copy-failure|exactly 6/u);

  const failedProfile = createReport();
  failedProfile.profiles[0].status = 'FAIL';
  assert.throws(() => validate(failedProfile), /decision does not match/u);
  failedProfile.decision = 'AUTOMATED_PROXY_FAIL';
  assert.doesNotThrow(() => validate(failedProfile));
});

test('rejects stale, wrong-SHA, wrong-branch, and Production evidence', () => {
  const stale = createReport();
  stale.generatedAt = '2026-07-18T00:00:00.000Z';
  assert.throws(() => validate(stale), /stale/u);

  const wrongSha = createReport();
  wrongSha.identity.headSha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  wrongSha.identity.versionCommitSha = wrongSha.identity.headSha;
  assert.throws(() => validate(wrongSha), /does not match/u);

  const wrongBranch = createReport();
  wrongBranch.identity.branch = 'main';
  wrongBranch.identity.versionBranch = 'main';
  assert.throws(() => validate(wrongBranch), /branch .* does not match/u);

  const production = createReport();
  production.identity.previewUrl = 'https://creatorverse-app-production.up.railway.app';
  assert.throws(() => validate(production), /isolated Railway PR environment|Production/u);
});

test('rejects automated evidence mislabeled as research or people-based findings', () => {
  for (const claim of [
    'Five participants understood the loop.',
    'Human validation passed.',
    'This usability study proves retention.',
    'أثبت المشاركون فهم المنتج.',
  ]) {
    const report = createReport();
    report.claim = claim;
    assert.throws(() => validate(report), /prohibited research claim/u);
  }
});
