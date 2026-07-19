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
    assert.equal(
      occurrences(findings, `| Anonymous participant ID | \`${participant}\` |`),
      1,
      `${participant} must be preassigned only to its own anonymous scorecard`,
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

test('every scorecard preserves the approved protocol fields and scoring meanings', () => {
  const taskHeader =
    '| Task | Outcome | Duration band | First wrong turn | Critical friction | Participant explanation/evidence |';

  assert.equal(occurrences(findings, taskHeader), 5);
  assert.match(
    findings,
    /Task outcome must be exactly `Pass unassisted`, `Pass assisted`, or `Fail`/,
  );
  assert.match(findings, /Duration band must be exactly `<30s`, `30–60s`, or `>60s`/);
  assert.match(findings, /Pass assisted` never counts as unassisted evidence/);
  assert.match(findings, /<severity>: <concise observable friction>/);
  assert.match(findings, /`Critical`, `High`, `Medium`, or `Low`/);

  for (const requiredField of [
    'Date band',
    'Voluntary consent confirmed',
    'No recording confirmed',
    'Adult/approved process confirmed',
    'Raw-note deletion due',
    'Contradiction to another observation',
  ]) {
    assert.equal(
      occurrences(findings, `| ${requiredField} |`),
      5,
      `${requiredField} must appear once in each scorecard`,
    );
  }
});

test('planned allocation guarantees bilingual RTL and LTR coverage', () => {
  assert.match(findings, /\| P01 \| AR \| RTL \|/);
  assert.match(findings, /\| P02 \| AR \| RTL \|/);
  assert.match(findings, /\| P03 \| EN \| LTR \|/);
  assert.match(findings, /\| P04 \| EN \| LTR \|/);
  assert.match(findings, /\| P05 \| EN \| LTR \|/);

  assert.equal(occurrences(findings, '| Session language | `AR` |'), 2);
  assert.equal(occurrences(findings, '| Direction verified | `RTL` |'), 2);
  assert.equal(occurrences(findings, '| Session language | `EN` |'), 3);
  assert.equal(occurrences(findings, '| Direction verified | `LTR` |'), 3);
});

test('privacy, released-build identity, and controlled-state gates are explicit', () => {
  for (const requiredField of [
    'Public test URL',
    'Released `main` commit SHA',
    '`/health` result',
    '`/version` commit SHA',
  ]) {
    assert.ok(findings.includes(requiredField), `${requiredField} must remain present`);
  }

  assert.doesNotMatch(
    findings,
    /\|\s*(Name|Email|Phone|Account handle|Precise location|Device ID)\s*\|/i,
  );

  for (const state of [
    'Loading',
    'Empty content',
    'Invalid/expired link',
    'Recoverable mission failure',
    'Network/service error',
    'Recoverable copy failure',
  ]) {
    assert.equal(
      occurrences(findings, `| ${state} |`),
      6,
      `${state} must appear in five scorecards and the aggregate summary`,
    );
  }

  assert.match(findings, /Required threshold: `4\/5`/);
});
