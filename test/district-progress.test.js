import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DISTRICT_CONTRIBUTION,
  DISTRICT_ID,
  DISTRICT_RESULT_KEY,
  DISTRICT_TARGET,
  completeDistrictProgress,
  createDistrictScope,
  createLockedDistrictProgress,
  districtResultInput,
  restoreDistrictProgress,
  serializeDistrictProgress,
} from '../src/district-progress.js';
import {
  districtProgressLocaleKeys,
  getDistrictProgressCopy,
} from '../src/district-progress-i18n.js';

const scope = createDistrictScope('#invite=v1.safe', 'valid');

function complete(templateId = 'route-choice') {
  const locked = createLockedDistrictProgress(scope);
  return completeDistrictProgress(locked, {
    scope,
    roleId: 'builder',
    routeId: templateId === 'signal-match' ? 'ocean' : 'sky',
    templateId,
  });
}

test('starts locked at 0 / 3 and unlocks with one equal fixed +3 contribution', () => {
  const locked = createLockedDistrictProgress(scope);
  assert.deepEqual(locked, {
    version: 1,
    scope,
    districtId: DISTRICT_ID,
    unlocked: false,
    contribution: 0,
    roleId: '',
    routeId: '',
    templateId: '',
  });
  assert.equal(DISTRICT_TARGET, 3);
  assert.equal(DISTRICT_CONTRIBUTION, 3);

  for (const templateId of ['route-choice', 'relay-sequence', 'signal-match']) {
    const unlocked = complete(templateId);
    assert.equal(unlocked.unlocked, true);
    assert.equal(unlocked.contribution, 3);
    assert.deepEqual(districtResultInput(unlocked), {
      roleId: 'builder',
      routeId: templateId === 'signal-match' ? 'ocean' : 'sky',
      templateId,
      energyBefore: 0,
      energyAdded: 3,
      target: 3,
      district: DISTRICT_RESULT_KEY,
    });
  }
});

test('completion is idempotent and cannot unlock a second district', () => {
  const first = complete('relay-sequence');
  const repeated = completeDistrictProgress(first, {
    scope,
    roleId: 'guardian',
    routeId: 'ocean',
    templateId: 'signal-match',
  });
  assert.deepEqual(repeated, first);
  assert.equal(repeated.districtId, DISTRICT_ID);
  assert.equal(repeated.contribution, 3);
});

test('session restoration is scoped, exact, and fails closed when malformed', () => {
  const unlocked = complete();
  const serialized = serializeDistrictProgress(unlocked, { scope });
  assert.deepEqual(restoreDistrictProgress(JSON.parse(serialized), { scope }), unlocked);

  const otherScope = createDistrictScope('#invite=v1.other', 'valid');
  assert.equal(restoreDistrictProgress(unlocked, { scope: otherScope }).unlocked, false);
  assert.equal(restoreDistrictProgress({ ...unlocked, extra: 'hidden' }, { scope }).unlocked, false);
  assert.equal(restoreDistrictProgress({ ...unlocked, contribution: 6 }, { scope }).unlocked, false);
  assert.equal(restoreDistrictProgress({ ...unlocked, districtId: 'second-district' }, { scope }).unlocked, false);
  assert.equal(restoreDistrictProgress(null, { scope }).unlocked, false);
  assert.equal(createDistrictScope('#invite=broken', 'invalid'), '');
});

test('Arabic and English district copy remain synchronized and within the issue budget', () => {
  assert.deepEqual(districtProgressLocaleKeys.en, districtProgressLocaleKeys.ar);
  const en = getDistrictProgressCopy('en');
  const ar = getDistrictProgressCopy('ar');
  for (const copy of [en, ar]) {
    assert.ok(copy.districtName.length <= 24);
    assert.ok(copy.unlockedSupport.length <= 90);
    assert.ok(copy.lockedStatus.length <= 60);
    assert.ok(copy.unlockedStatus.length <= 60);
  }
  assert.match(en.unlockedSupport, /\+3/u);
  assert.match(ar.unlockedSupport, /\+٣/u);
});

test('rejects invalid completion identities', () => {
  const locked = createLockedDistrictProgress(scope);
  assert.throws(() => completeDistrictProgress(locked, { scope, roleId: 'owner', routeId: 'sky', templateId: 'route-choice' }), /INVALID_DISTRICT_ROLE/);
  assert.throws(() => completeDistrictProgress(locked, { scope, roleId: 'builder', routeId: 'external', templateId: 'route-choice' }), /INVALID_DISTRICT_ROUTE/);
  assert.throws(() => completeDistrictProgress(locked, { scope, roleId: 'builder', routeId: 'sky', templateId: 'free-text' }), /INVALID_DISTRICT_TEMPLATE/);
  assert.throws(() => districtResultInput(locked), /DISTRICT_NOT_UNLOCKED/);
});
