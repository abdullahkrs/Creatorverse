import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const findings = readFileSync(
  new URL('../docs/usability-findings-cv-mvp-005.md', import.meta.url),
  'utf8',
);

const participants = ['P01', 'P02', 'P03', 'P04', 'P05'];
const taskLabels = [
  '1. Explain realm purpose',
  '2. Complete creator onboarding',
  '3. Identify safe share item',
  '4. Enter follower realm',
  '5. Choose and explain role',
  '6. Complete mission under one minute',
  '7. Explain visible realm change',
  '8. Explain safe share value',
  '9. Switch language and direction',
  '10. Complete keyboard basics',
];

function occurrences(value, token) {
  return value.split(token).length - 1;
}

test('evidence packet remains incomplete until five real sessions are recorded', () => {
  assert.match(findings, /\*\*Status:\*\* `INCOMPLETE`/);
  assert.match(findings, /- Decision: `INCOMPLETE`/);
  assert.match(findings, /five real sessions have not yet been recorded/i);
  assert.match(findings, /AI simulations[\s\S]*do not count as participant evidence/i);
  assert.doesNotMatch(findings, /- Decision: `(PASS|FAIL|INCONCLUSIVE)`/);
});

test('packet contains exactly five anonymous scorecards and the fixed ten-task order', () => {
  assert.equal(occurrences(findings, '## Scorecard P'), 5);

  for (const participant of participants) {
    assert.equal(
      occurrences(findings, `## Scorecard ${participant}`),
      1,
      `${participant} must have exactly one scorecard`,
    );
  }

  for (const task of taskLabels) {
    assert.equal(
      occurrences(findings, `| ${task} |`),
      6,
      `${task} must appear in all five scorecards and once in the aggregate table`,
    );
  }
});

test('planned allocation guarantees bilingual RTL and LTR coverage', () => {
  assert.match(findings, /\| P01 \| AR \| RTL \|/);
  assert.match(findings, /\| P02 \| AR \| RTL \|/);
  assert.match(findings, /\| P03 \| EN \| LTR \|/);
  assert.match(findings, /\| P04 \| EN \| LTR \|/);
  assert.match(findings, /\| P05 \| EN \| LTR \|/);
});

test('privacy and released-build identity gates are explicit', () => {
  for (const requiredField of [
    'Public test URL',
    'Released `main` commit SHA',
    '`/health` result',
    '`/version` commit SHA',
    'Voluntary consent confirmed',
    'Adult confirmed',
    'No recording confirmed',
  ]) {
    assert.ok(findings.includes(requiredField), `${requiredField} must remain present`);
  }

  assert.doesNotMatch(
    findings,
    /\|\s*(Name|Email|Phone|Account handle|Precise location|Device ID)\s*\|/i,
  );
  assert.match(findings, /Required threshold: `4\/5`/);
  assert.match(findings, /Invalid or expired invite/);
  assert.match(findings, /Recoverable service failure/);
});
