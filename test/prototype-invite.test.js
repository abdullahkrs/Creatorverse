import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPrototypeInviteUrl,
  createPrototypeInvite,
  escapeInviteHtml,
  parsePrototypeInviteFragment,
  parsePrototypeInviteToken,
  prototypeInviteLimits,
} from '../src/prototype-invite.js';
import { getPrototypeInviteCopy, getPrototypeInviteKeySets } from '../src/prototype-invite-i18n.js';

function encodePayload(payload) {
  return `v1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

test('creates a minimal versioned invite without creator identity', () => {
  const token = createPrototypeInvite({
    name: '  Nova   Guild  ',
    theme: 'cosmic',
    promise: 'A community built around bold ideas.',
    missionId: 'relay-sequence',
    creator: '@creator',
    secret: 'ignored',
  });
  const parsed = parsePrototypeInviteToken(token);

  assert.deepEqual(parsed, {
    status: 'valid',
    invite: {
      name: 'Nova Guild',
      theme: 'cosmic',
      promise: 'A community built around bold ideas.',
      missionId: 'relay-sequence',
    },
  });
  assert.ok(token.length <= prototypeInviteLimits.maxTokenLength);
  assert.doesNotMatch(token, /creator|secret|@/iu);
});

test('accepts only allowlisted bounded fictional fields', () => {
  assert.throws(() => createPrototypeInvite({ name: '', theme: 'cosmic', promise: 'Safe' }), /INVITE_NAME_REQUIRED/);
  assert.throws(() => createPrototypeInvite({ name: 'N'.repeat(29), theme: 'cosmic', promise: 'Safe' }), /INVITE_NAME_TOO_LONG/);
  assert.throws(() => createPrototypeInvite({ name: 'Nova', theme: 'political', promise: 'Safe' }), /INVITE_THEME_INVALID/);
  assert.throws(() => createPrototypeInvite({ name: 'Nova', theme: 'cosmic', promise: 'Safe', missionId: 'open-text' }), /INVITE_MISSION_INVALID/);
  assert.throws(() => createPrototypeInvite({ name: 'Nova', theme: 'cosmic', promise: 'P'.repeat(91) }), /INVITE_PROMISE_TOO_LONG/);
  assert.throws(() => createPrototypeInvite({ name: 'Nova', theme: 'cosmic', promise: 'Join https://example.com' }), /INVITE_PRIVATE_OR_EXTERNAL_TEXT/);
  assert.throws(() => createPrototypeInvite({ name: 'Nova', theme: 'cosmic', promise: 'Contact team@example.com' }), /INVITE_PRIVATE_OR_EXTERNAL_TEXT/);
  assert.throws(() => createPrototypeInvite({ name: 'USA Guild', theme: 'cosmic', promise: 'Safe' }), /INVITE_REAL_WORLD_TARGET/);
  assert.throws(() => createPrototypeInvite({ name: 'Nova', theme: 'cosmic', promise: 'Mass report them' }), /INVITE_HOSTILITY/);
  assert.throws(() => createPrototypeInvite({ name: 'Nova\u202E', theme: 'cosmic', promise: 'Safe' }), /INVITE_UNSAFE_CONTROL/);
});

test('rejects bare domains and external URL schemes during creation and parsing', () => {
  assert.throws(() => createPrototypeInvite({ name: 'example.com', theme: 'cosmic', promise: 'Safe' }), /INVITE_PRIVATE_OR_EXTERNAL_TEXT/);

  for (const externalText of [
    'Visit example.com',
    'Join discord.gg/room',
    'Open ftp://example.com',
    'Open custom+realm://example.com/path',
    'Use mailto:team@example.com',
  ]) {
    assert.throws(
      () => createPrototypeInvite({ name: 'Nova', theme: 'cosmic', promise: externalText }),
      /INVITE_PRIVATE_OR_EXTERNAL_TEXT/,
    );
  }

  const crafted = encodePayload({ v: 1, n: 'Nova', t: 'cosmic', p: 'Visit example.com' });
  assert.deepEqual(parsePrototypeInviteToken(crafted), { status: 'invalid' });
});

test('parses one invite fragment, ignores unrelated data, and rejects malformed input', () => {
  const token = createPrototypeInvite({ name: 'Harbor Lab', theme: 'future', promise: 'Build a calm fictional signal.', missionId: 'signal-match' });
  assert.equal(parsePrototypeInviteFragment('').status, 'none');
  assert.equal(parsePrototypeInviteFragment('#section=join').status, 'none');
  assert.deepEqual(parsePrototypeInviteFragment(`#noise=discard&invite=${token}&campaign=discard`), parsePrototypeInviteToken(token));
  assert.equal(parsePrototypeInviteFragment(`#invite=${token}&invite=${token}`).status, 'invalid');
  assert.equal(parsePrototypeInviteFragment('#invite=v1.not-base64!').status, 'invalid');
  assert.equal(parsePrototypeInviteFragment(`#invite=${'x'.repeat(600)}`).status, 'invalid');
  assert.equal(parsePrototypeInviteToken(encodePayload({ v: 1, n: 'Nova', t: 'cosmic', m: 'unsafe' })).status, 'invalid');
});

test('ignores unknown payload keys and safely defaults legacy invites to route choice', () => {
  const token = encodePayload({
    v: 1,
    n: 'Canopy Works',
    t: 'wild',
    extra: '<script>alert(1)</script>',
    creator: '@private',
  });
  assert.deepEqual(parsePrototypeInviteToken(token), {
    status: 'valid',
    invite: { name: 'Canopy Works', theme: 'wild', promise: null, missionId: 'route-choice' },
  });
  assert.equal(getPrototypeInviteCopy('en').featuredPromise, 'A community built around bold ideas.');
  assert.equal(getPrototypeInviteCopy('ar').featuredPromise, 'مجتمع مبني حول أفكار جريئة.');
  assert.deepEqual(prototypeInviteLimits.missions, ['route-choice', 'relay-sequence', 'signal-match']);
});

test('strips query data from the same-origin public invite URL', () => {
  const token = createPrototypeInvite({ name: 'Nova Guild', theme: 'cosmic', promise: 'Safe fictional routes.' });
  const url = buildPrototypeInviteUrl('https://creatorverse.example/play?token=secret#old', token);
  assert.equal(url, `https://creatorverse.example/play#invite=${token}`);
  assert.doesNotMatch(url, /secret|token=/u);
  assert.throws(() => buildPrototypeInviteUrl('javascript:alert(1)', token), /INVITE_BASE_URL_INVALID/);
  assert.throws(() => buildPrototypeInviteUrl('https://user:pass@example.com/', token), /INVITE_BASE_URL_INVALID/);
});

test('escapes dynamic values and keeps Arabic and English invite keys synchronized', () => {
  assert.equal(escapeInviteHtml(`<Nova & "Friends">`), '&lt;Nova &amp; &quot;Friends&quot;&gt;');
  const keys = getPrototypeInviteKeySets();
  assert.deepEqual(keys.ar, keys.en);
  assert.ok(getPrototypeInviteCopy('ar-AE').receiptTitle.length > 0);
  assert.ok(getPrototypeInviteCopy('en-US').receiptTitle.length > 0);
});
