import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getMissionResultCopy } from '../src/mission-result-i18n.js';
import { getCreatorRealmUpdateCopy } from '../src/creator-realm-update-i18n.js';
import { getRealmQuarantineCopy } from '../src/realm-quarantine-i18n.js';
import { getRealmContinuationCopy } from '../src/realm-continuation-i18n.js';
import { getBeaconDistrictGrowthCopy } from '../src/beacon-district-growth-i18n.js';
import { getRealmChronicleCopy } from '../src/realm-chronicle-i18n.js';
import { getRealmCollaborationCopy } from '../src/realm-collaboration-i18n.js';
import { getSharedMissionCopy } from '../src/shared-mission-i18n.js';
import { getLivingWorldCopy } from '../src/living-world-i18n.js';
import { getLivingWorldChapterCopy } from '../src/living-world-chapter-i18n.js';
import { getLivingWorldLightRelayCopy } from '../src/living-world-light-relay-i18n.js';
import { getReturningThreadCopy } from '../src/living-world-returning-thread-i18n.js';
import { getLivingWorldSkywellCopy } from '../src/living-world-skywell-i18n.js';

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
const realmContinuationKeys = assertParity('Realm continuation', getRealmContinuationCopy);
const beaconDistrictGrowthKeys = assertParity('Beacon District growth', getBeaconDistrictGrowthCopy);
const realmChronicleKeys = assertParity('Realm chronicle', getRealmChronicleCopy);
const realmCollaborationKeys = assertParity('Realm collaboration', getRealmCollaborationCopy);
const sharedMissionKeys = assertParity('Shared mission', getSharedMissionCopy);
const livingWorldKeys = assertParity('Living world', getLivingWorldCopy);
const livingWorldChapterKeys = assertParity('Living world chapter', getLivingWorldChapterCopy);
const lightRelayKeys = assertParity('Living world light relay', getLivingWorldLightRelayCopy);
const returningThreadKeys = assertParity('Returning thread', getReturningThreadCopy);
const skywellKeys = assertParity('Living world Skywell', getLivingWorldSkywellCopy);

const forbidden = [
  /textContent\s*=\s*['"`][A-Za-z][^'"`]*['"`]/,
  /innerHTML\s*=\s*['"`][A-Za-z][^'"`]*['"`]/,
  /aria-label=["'][A-Za-z][^"']*["']/,
];

for (const path of [
  '../src/mission-result-view.js',
  '../src/completion-receipt-view.js',
  '../src/realm-quarantine-view.js',
  '../src/realm-continuation-view.js',
  '../src/beacon-district-growth-view.js',
  '../src/beacon-district-growth-enhancement.js',
  '../src/realm-chronicle-view.js',
  '../src/realm-chronicle-enhancement.js',
  '../src/realm-collaboration-view.js',
  '../src/realm-collaboration-enhancement.js',
  '../src/realm-collaboration-handshake-view.js',
  '../src/realm-collaboration-handshake-enhancement.js',
  '../src/shared-mission-view.js',
  '../src/shared-mission-enhancement.js',
  '../src/living-world-enhancement.js',
  '../src/living-world-chapter-enhancement.js',
  '../src/living-world-light-relay-enhancement.js',
  '../src/living-world-returning-thread-enhancement.js',
  '../src/living-world-skywell-enhancement.js',
]) {
  const viewSource = await readFile(new URL(path, import.meta.url), 'utf8');
  for (const pattern of forbidden) {
    assert.doesNotMatch(viewSource, pattern, `Visible copy in ${path} must come from a localization module.`);
  }
}

console.log(`i18n parity passed for ${missionResultKeys} mission-result keys, ${creatorRealmUpdateKeys} creator-update keys, ${realmQuarantineKeys} quarantine keys, ${realmContinuationKeys} realm-continuation keys, ${beaconDistrictGrowthKeys} Beacon District growth keys, ${realmChronicleKeys} realm-chronicle keys, ${realmCollaborationKeys} realm-collaboration keys, ${sharedMissionKeys} shared-mission keys, ${livingWorldKeys} living-world keys, ${livingWorldChapterKeys} living-world-chapter keys, ${lightRelayKeys} light-relay keys, ${returningThreadKeys} returning-thread keys, and ${skywellKeys} Skywell keys.`);
