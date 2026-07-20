import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCreatorRealmUpdateManualText,
  buildCreatorRealmUpdatePayload,
  createCreatorRealmUpdateActionController,
  deriveCreatorRealmUpdate,
} from '../src/creator-realm-update.js';
import {
  getCreatorRealmUpdateCopy,
  getCreatorRealmUpdateKeySets,
} from '../src/creator-realm-update-i18n.js';

const REALM_ID = 'realm_abcdefghijklmnop';

function entry(index = 0, overrides = {}) {
  return {
    id: `receipt_${String(index).padStart(16, '0')}`,
    missionId: 'route-choice',
    roleId: 'builder',
    routeId: 'sky',
    districtId: 'beacon-district',
    contribution: 3,
    ...overrides,
  };
}

function realm(count = 1, overrides = {}) {
  const receipts = Array.from({ length: count }, (_, index) => entry(index));
  return {
    id: REALM_ID,
    name: 'Private realm name',
    theme: 'cosmic',
    total: count * 3,
    districtId: 'beacon-district',
    unlocked: count > 0,
    receipts,
    ...overrides,
  };
}

test('derives only bounded allowlisted facts for one through twenty-four entries', () => {
  const first = deriveCreatorRealmUpdate(realm(1));
  assert.deepEqual(first, {
    status: 'ready',
    archetypeId: 'cosmic',
    districtId: 'beacon-district',
    contributionCount: 1,
    totalEnergy: 3,
    latestContribution: 3,
  });
  assert.equal('id' in first, false);
  assert.equal('name' in first, false);
  assert.equal('receipts' in first, false);

  const maximum = deriveCreatorRealmUpdate(realm(24));
  assert.equal(maximum.status, 'ready');
  assert.equal(maximum.contributionCount, 24);
  assert.equal(maximum.totalEnergy, 72);
});

test('fails closed for empty, malformed, duplicate, cross-rule, and clamped-looking ledgers', () => {
  assert.equal(deriveCreatorRealmUpdate(realm(0)).status, 'unavailable');
  assert.equal(deriveCreatorRealmUpdate(realm(25)).status, 'unavailable');
  assert.equal(deriveCreatorRealmUpdate(realm(1, { total: 72 })).status, 'unavailable');
  assert.equal(deriveCreatorRealmUpdate(realm(1, { unlocked: false })).status, 'unavailable');
  assert.equal(deriveCreatorRealmUpdate(realm(1, { districtId: 'other-district' })).status, 'unavailable');
  assert.equal(deriveCreatorRealmUpdate({ ...realm(1), extra: 'hidden' }).status, 'unavailable');
  assert.equal(deriveCreatorRealmUpdate(realm(2, { receipts: [entry(0), entry(0)], total: 6 })).status, 'unavailable');
  assert.equal(deriveCreatorRealmUpdate(realm(1, { receipts: [entry(0, { contribution: 6 })] })).status, 'unavailable');
  assert.equal(deriveCreatorRealmUpdate(realm(1, { receipts: [entry(0, { creator: 'hidden' })] })).status, 'unavailable');
});

test('builds localized allowlisted payloads with one canonical public URL', () => {
  const update = deriveCreatorRealmUpdate(realm(2));
  for (const locale of ['en', 'ar']) {
    const payload = buildCreatorRealmUpdatePayload(update, {
      locale,
      publicUrl: 'https://creatorverse.example/play?private=1#receipt=secret',
    });
    assert.equal(payload.url, 'https://creatorverse.example/play');
    assert.ok(payload.text.length <= 180);
    assert.doesNotMatch(payload.text, /realm_abcdefghijklmnop|receipt_|Private realm name|route-choice|builder|sky/iu);
    assert.doesNotMatch(payload.text, /verified|authentic|owner|popular|rank|approved|guaranteed/iu);
    const manual = buildCreatorRealmUpdateManualText(payload);
    assert.match(manual, /^.+\nhttps:\/\/creatorverse\.example\/play$/su);
    assert.doesNotMatch(manual, /private=1|#receipt/iu);
  }

  assert.throws(
    () => buildCreatorRealmUpdatePayload(update, { publicUrl: 'https://user:pass@creatorverse.example/play' }),
    /REALM_UPDATE_URL_INVALID/,
  );
  assert.throws(
    () => buildCreatorRealmUpdatePayload({ status: 'unavailable' }, { publicUrl: 'https://creatorverse.example' }),
    /REALM_UPDATE_UNAVAILABLE/,
  );
});

test('keeps one pending-safe share or copy action with neutral cancellation', async () => {
  const payload = buildCreatorRealmUpdatePayload(deriveCreatorRealmUpdate(realm(1)), {
    publicUrl: 'https://creatorverse.example/play',
  });
  let copied = '';
  const copyController = createCreatorRealmUpdateActionController({
    navigatorLike: {},
    payload,
    copyText: async value => { copied = value; },
  });
  assert.equal(copyController.mode, 'copy');
  assert.equal((await copyController.activate()).status, 'copied');
  assert.match(copied, /https:\/\/creatorverse\.example\/play/u);

  let releaseShare;
  const shareController = createCreatorRealmUpdateActionController({
    navigatorLike: {
      share: () => new Promise(resolve => { releaseShare = resolve; }),
    },
    payload,
  });
  const pending = shareController.activate();
  assert.equal((await shareController.activate()).status, 'ignored');
  releaseShare();
  assert.equal((await pending).status, 'shared');

  const cancelled = createCreatorRealmUpdateActionController({
    navigatorLike: {
      share: async () => { throw new DOMException('cancelled', 'AbortError'); },
    },
    payload,
  });
  assert.equal((await cancelled.activate()).status, 'cancelled');
});

test('keeps Arabic and English keys synchronized and within the issue copy budget', () => {
  const keys = getCreatorRealmUpdateKeySets();
  assert.deepEqual(keys.ar, keys.en);
  for (const locale of ['en', 'ar']) {
    const copy = getCreatorRealmUpdateCopy(locale);
    assert.ok(copy.title.split(/\s+/u).length >= 3);
    assert.ok(copy.title.split(/\s+/u).length <= 6);
    assert.ok(copy.shareAction.split(/\s+/u).length <= 3);
    assert.ok(copy.copyAction.split(/\s+/u).length <= 3);
    assert.ok(copy.waitingBody.length <= 80);
    assert.ok(copy.denied.length <= 80);
    assert.match(copy.changeTemplate, /\u2066\{total\}\u2069/u);
    const changed = copy.changeTemplate
      .replace('{district}', copy.districts['beacon-district'])
      .replace('{total}', '72');
    assert.ok(changed.length <= 70);
    const summary = `${copy.contributions}: 24 · ${copy.energy}: 72`;
    assert.ok(summary.length <= 45);
  }
});
