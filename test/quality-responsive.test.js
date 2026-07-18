import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const responsive = readFileSync(new URL('../src/quality-responsive.css', import.meta.url), 'utf8');

const authoritativeSelectors = [
  'body .nav',
  'body .nav-actions',
  'body .role-grid',
  'body .role-card',
  'body .mission-actions',
  'body .realm-stats',
  'body .signal-result-facts',
  'body .mission-heading',
  'body .realm-heading',
  'body .mission-status',
  'body .level',
  'body .role-copy strong',
];

test('mobile text-pressure rules outrank later base component rules', () => {
  assert.match(responsive, /@media \(max-width: 30rem\)/);

  for (const selector of authoritativeSelectors) {
    assert.ok(
      responsive.includes(selector),
      `${selector} must retain narrow component-level specificity`,
    );
  }

  assert.match(responsive, /body \.role-grid\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(responsive, /body \.mission-actions,[\s\S]*?body \.signal-result-facts\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap;/);
});

test('cascade repair preserves natural wrapping without hidden-overflow shortcuts', () => {
  assert.match(responsive, /overflow-wrap:\s*normal;/);
  assert.match(responsive, /word-break:\s*normal;/);
  assert.doesNotMatch(responsive, /!important/);
  assert.doesNotMatch(responsive, /overflow(?:-inline|-x)?\s*:\s*hidden/);
  assert.doesNotMatch(responsive, /text-overflow\s*:\s*ellipsis/);
});
