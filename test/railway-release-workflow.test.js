import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const WORKFLOW_PATH = new URL('../.github/workflows/railway-health-verification.yml', import.meta.url);
const RETIRED_WORKFLOW_PATH = new URL('../.github/workflows/production-smoke.yml', import.meta.url);

async function workflowSource() {
  return readFile(WORKFLOW_PATH, 'utf8');
}

test('release identity writes only from trusted main events', async () => {
  const source = await workflowSource();

  assert.match(source, /push:\s*\n\s+branches:\s*\[main\]/);
  assert.match(source, /schedule:\s*\n\s+- cron:/);
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /if:\s*github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(source, /^\s*pull_request(?:_target)?:/m);
});

test('release identity uses minimal explicit write permissions and locked installation', async () => {
  const source = await workflowSource();

  assert.match(source, /permissions:\s*\n\s+contents:\s*read\s*\n\s+issues:\s*write\s*\n\s+statuses:\s*write/);
  assert.match(source, /persist-credentials:\s*false/);
  assert.match(source, /node-version:\s*22\.12/);
  assert.match(source, /run:\s*npm ci/);
  assert.match(source, /run:\s*node scripts\/verify-railway-release\.mjs/);
  assert.doesNotMatch(source, /secrets\./);
});

test('one bounded workflow replaces the weaker duplicate Production smoke path', async () => {
  const source = await workflowSource();

  assert.match(source, /timeout-minutes:\s*12/);
  assert.match(source, /MAX_ATTEMPTS:\s*18/);
  assert.match(source, /RETRY_DELAY_MS:\s*20000/);
  assert.match(source, /HTTP_TIMEOUT_MS:\s*12000/);

  await assert.rejects(
    access(RETIRED_WORKFLOW_PATH, constants.F_OK),
    error => error?.code === 'ENOENT',
  );
});
