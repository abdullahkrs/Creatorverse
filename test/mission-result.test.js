import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClipboardText,
  buildMissionSharePayload,
  createMissionResult,
  createMissionResultActionController,
  getPublicHttpUrl,
  sanitizeResultText,
} from '../src/mission-result.js';

const result = createMissionResult({
  roleId: 'builder',
  routeId: 'sky',
  energyBefore: 72,
  target: 100,
  district: 'Signal Harbor',
});

test('creates allowlisted, bounded result data', () => {
  assert.deepEqual(result, {
    roleId: 'builder',
    routeId: 'sky',
    energyAdded: 3,
    energyBefore: 72,
    energyAfter: 75,
    target: 100,
    district: 'Signal Harbor',
  });
  const capped = createMissionResult({
    roleId: 'builder',
    routeId: 'sky',
    energyBefore: 99,
    energyAdded: 3,
    target: 100,
    district: 'Signal Harbor',
  });
  assert.equal(capped.energyAdded, 3);
  assert.equal(capped.energyBefore, 99);
  assert.equal(capped.energyAfter, 100);

  assert.throws(() => createMissionResult({ roleId: 'admin', routeId: 'sky' }), /INVALID_ROLE/);
  assert.throws(() => createMissionResult({ roleId: 'builder', routeId: 'external' }), /INVALID_ROUTE/);
  assert.equal(sanitizeResultText('<b>Harbor</b>\n\u0000'), 'b Harbor /b');
});

test('builds concise localized payloads and rejects unsafe URLs', () => {
  const english = buildMissionSharePayload(result, {
    locale: 'en',
    publicUrl: 'https://creatorverse.example/play?token=secret#state',
  });
  assert.equal(english.url, 'https://creatorverse.example/play');
  assert.match(english.text, /Builder/);
  assert.match(english.text, /Sky route/);
  assert.match(english.text, /Signal Harbor/);
  assert.doesNotMatch(english.text, /secret|token/);

  const arabic = buildMissionSharePayload(result, {
    locale: 'ar-AE',
    publicUrl: 'https://creatorverse.example/',
  });
  assert.match(arabic.text, /البنّاء/);
  assert.match(arabic.text, /المسار السماوي/);
  assert.match(arabic.text, /ميناء الإشارة/);
  assert.match(arabic.text, /\u2066?72/u);

  assert.equal(getPublicHttpUrl('javascript:alert(1)'), null);
  assert.equal(getPublicHttpUrl('https://user:pass@example.com/'), null);
  assert.throws(() => buildMissionSharePayload(result, { publicUrl: 'data:text/plain,x' }), /INVALID_PUBLIC_URL/);
});

test('uses native share and classifies success, cancel, denial, and failure', async () => {
  const payload = buildMissionSharePayload(result, { publicUrl: 'https://creatorverse.example/' });
  let calls = 0;
  const success = createMissionResultActionController({
    navigatorLike: { share: async value => { calls += 1; assert.equal(value, payload); } },
    payload,
  });
  assert.deepEqual(await success.activate(), { status: 'shared', mode: 'share' });
  assert.equal(calls, 1);

  for (const [name, status] of [['AbortError', 'cancelled'], ['NotAllowedError', 'denied'], ['TypeError', 'failed']]) {
    const controller = createMissionResultActionController({
      navigatorLike: { share: async () => { const error = new Error(name); error.name = name; throw error; } },
      payload,
    });
    assert.deepEqual(await controller.activate(), { status, mode: 'share' });
  }
});

test('uses clipboard fallback, reports failure, and blocks repeated activation', async () => {
  const payload = buildMissionSharePayload(result, { publicUrl: 'https://creatorverse.example/' });
  let copied = '';
  const copyController = createMissionResultActionController({
    navigatorLike: {},
    payload,
    copyText: async value => { copied = value; },
  });
  assert.deepEqual(await copyController.activate(), { status: 'copied', mode: 'copy' });
  assert.equal(copied, buildClipboardText(payload));
  assert.match(copied, /https:\/\/creatorverse\.example\//);

  const failedCopy = createMissionResultActionController({
    navigatorLike: {},
    payload,
    copyText: async () => { throw new Error('denied'); },
  });
  assert.deepEqual(await failedCopy.activate(), { status: 'failed', mode: 'copy' });

  let resolveShare;
  let shareCalls = 0;
  const repeated = createMissionResultActionController({
    navigatorLike: { share: () => { shareCalls += 1; return new Promise(resolve => { resolveShare = resolve; }); } },
    payload,
  });
  const first = repeated.activate();
  const second = repeated.activate();
  assert.deepEqual(await second, { status: 'ignored', mode: 'share' });
  resolveShare();
  assert.deepEqual(await first, { status: 'shared', mode: 'share' });
  assert.equal(shareCalls, 1);

  const unsupported = createMissionResultActionController({ navigatorLike: {}, payload });
  assert.deepEqual(await unsupported.activate(), { status: 'unsupported', mode: 'copy' });
});
