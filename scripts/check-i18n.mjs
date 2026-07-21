import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getMissionResultCopy } from '../src/mission-result-i18n.js';
import { getCreatorRealmUpdateCopy } from '../src/creator-realm-update-i18n.js';
import { getRealmQuarantineCopy } from '../src/realm-quarantine-i18n.js';

function flatten(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' ? flatten(child, path) : [[path, child]];
  });
}

function assertParity(name, getCopy) {
  const english = new Map(flatten(getCopy('en')));
  const arabic = new Map(flatten(getCopy('ar')));
  assert.deepEqual([...arabic.keys()].sort(), [...english.keys()].sort(), `${name} Arabic and English keys must match exactly.`);
  for (const [key, value] of [...english, ...arabic]) {
    assert.equal(typeof value, 'string', `${name}.${key} must be a string.`);
    assert.ok(value.trim(), `${name}.${key} must not be empty.`);
  }
  return english.size;
}

const missionResultKeys = assertParity('Mission result', getMissionResultCopy);
const creatorRealmUpdateKeys = assertParity('Creator realm update', getCreatorRealmUpdateCopy);
const realmQuarantineKeys = assertParity('Realm quarantine', getRealmQuarantineCopy);

const forbidden = [
  /textContent\s*=\s*['"`][A-Za-z][^'"`]*['"`]/,
  /innerHTML\s*=\s*['"`][A-Za-z][^'"`]*['"`]/,
  /aria-label=["'][A-Za-z][^"']*["']/,
];

for (const path of [
  '../src/mission-result-view.js',
  '../src/completion-receipt-view.js',
  '../src/realm-quarantine-view.js',
]) {
  const viewSource = await readFile(new URL(path, import.meta.url), 'utf8');
  for (const pattern of forbidden) {
    assert.doesNotMatch(viewSource, pattern, `Visible copy in ${path} must come from a localization module.`);
  }
}

console.log(`i18n parity passed for ${missionResultKeys} mission-result keys, ${creatorRealmUpdateKeys} creator-update keys, and ${realmQuarantineKeys} quarantine keys.`);
