import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getMissionResultCopy } from '../src/mission-result-i18n.js';

function flatten(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' ? flatten(child, path) : [[path, child]];
  });
}

const english = new Map(flatten(getMissionResultCopy('en')));
const arabic = new Map(flatten(getMissionResultCopy('ar')));
assert.deepEqual([...arabic.keys()].sort(), [...english.keys()].sort(), 'Mission-result Arabic and English keys must match exactly.');
for (const [key, value] of [...english, ...arabic]) {
  assert.equal(typeof value, 'string', `${key} must be a string.`);
  assert.ok(value.trim(), `${key} must not be empty.`);
}

const viewSource = await readFile(new URL('../src/mission-result-view.js', import.meta.url), 'utf8');
const forbidden = [
  /textContent\s*=\s*['"`][A-Za-z][^'"`]*['"`]/,
  /innerHTML\s*=\s*['"`][A-Za-z][^'"`]*['"`]/,
  /aria-label=["'][A-Za-z][^"']*["']/,
];
for (const pattern of forbidden) {
  assert.doesNotMatch(viewSource, pattern, 'New mission-result visible copy must come from mission-result-i18n.js.');
}

console.log(`i18n parity passed for ${english.size} mission-result keys.`);
