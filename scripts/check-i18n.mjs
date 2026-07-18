import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getMissionResultCopy } from '../src/mission-result-i18n.js';
import { getPrototypeInviteCopy } from '../src/prototype-invite-i18n.js';

function flatten(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' ? flatten(child, path) : [[path, child]];
  });
}

function assertCopyParity(name, englishCopy, arabicCopy) {
  const english = new Map(flatten(englishCopy));
  const arabic = new Map(flatten(arabicCopy));
  assert.deepEqual([...arabic.keys()].sort(), [...english.keys()].sort(), `${name} Arabic and English keys must match exactly.`);
  for (const [key, value] of [...english, ...arabic]) {
    assert.equal(typeof value, 'string', `${name}.${key} must be a string.`);
    assert.ok(value.trim(), `${name}.${key} must not be empty.`);
  }
  return english.size;
}

const missionKeyCount = assertCopyParity('Mission result', getMissionResultCopy('en'), getMissionResultCopy('ar'));
const inviteKeyCount = assertCopyParity('Prototype invite', getPrototypeInviteCopy('en'), getPrototypeInviteCopy('ar'));

const sourceChecks = [
  ['mission-result-view.js', await readFile(new URL('../src/mission-result-view.js', import.meta.url), 'utf8')],
  ['prototype-invite-view.js', await readFile(new URL('../src/prototype-invite-view.js', import.meta.url), 'utf8')],
];
const forbidden = [
  /textContent\s*=\s*['"`][A-Za-z][^'"`]*['"`]/,
  /innerHTML\s*=\s*['"`][A-Za-z][^'"`]*['"`]/,
  /aria-label=["'][A-Za-z][^"']*["']/,
];
for (const [file, source] of sourceChecks) {
  for (const pattern of forbidden) {
    assert.doesNotMatch(source, pattern, `Visible copy in ${file} must come from its localization module.`);
  }
}

console.log(`i18n parity passed for ${missionKeyCount} mission-result keys and ${inviteKeyCount} prototype-invite keys.`);
