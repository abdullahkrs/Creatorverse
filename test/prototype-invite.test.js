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

const CREATED_MINUTE = 30_000_000;
const NOW = CREATED_MINUTE * 60_000;

function encodePayload(payload) {
  return `v1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

function safePayload(overrides = {}) {
  return { v: 1, n: 'Nova', t: 'cosmic', m: 'route-choice', w: 'now-30m', c: CREATED_MINUTE, ...overrides };
}

test('creates a minimal versioned scheduled invite without creator identity', () => {
  const token = createPrototypeInvite({
    name: '  Nova   Guild  ',
    theme: 'cosmic',
    promise: 'A community built around bold ideas.',
    missionId: 'relay-sequence',
    scheduleId: 'in-1h-30m',
    createdAtMinute: CREATED_MINUTE,
  }, { now: NOW });
  const parsed = parsePrototypeInviteToken(token, { now: NOW });

  assert.deepEqual(parsed, {
    status: 'valid',
    invite: {
      name: 'Nova Guild',
      theme: 'cosmic',
      promise: 'A community built around bold ideas.',
      missionId: 'relay-sequence',
      scheduleId: 'in-1h-30m',
      createdAtMinute: CREATED_MINUTE,
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
  assert.throws(() => createPrototypeInvite({ name: 'Nova', theme: 'cosmic', promise: 'Safe', creator: '@private' }), /INVITE_FIELDS_INVALID/);
  assert.throws(() => createPrototypeInvite({ name: 'Nova', theme: 'cosmic', scheduleId: 'custom-date' }), /INVITE_SCHEDULE_INVALID/);
});

test('rejects bare domains and external URL schemes during creation and parsing', () => {
  assert.throws(() => createPrototypeInvite({ name: 'example.com', theme: 'cosmic', promise: 'Safe' }), /INVITE_PRIVATE_OR_EXTERNAL_TEXT/);
  for (const externalText of ['Visit example.com', 'Join discord.gg/room', 'Open ftp://example.com', 'Open custom+realm://example.com/path', 'Use mailto:team@example.com']) {
    assert.throws(() => createPrototypeInvite({ name: 'Nova', theme: 'cosmic', promise: externalText }), /INVITE_PRIVATE_OR_EXTERNAL_TEXT/);
  }
  const crafted = encodePayload(safePayload({ p: 'Visit example.com' }));
  assert.deepEqual(parsePrototypeInviteToken(crafted, { now: NOW }), { status: 'invalid' });
});

test('parses exactly one invite fragment and rejects malformed or hidden fields', () => {
  const token = createPrototypeInvite({
    name: 'Harbor Lab', theme: 'future', promise: 'Build a calm fictional signal.', missionId: 'signal-match',
    scheduleId: 'in-24h-24h', createdAtMinute: CREATED_MINUTE,
  }, { now: NOW });
  assert.equal(parsePrototypeInviteFragment('', { now: NOW }).status, 'none');
  assert.equal(parsePrototypeInviteFragment('#section=join', { now: NOW }).status, 'none');
  assert.deepEqual(parsePrototypeInviteFragment(`#invite=${token}`, { now: NOW }), parsePrototypeInviteToken(token, { now: NOW }));
  assert.equal(parsePrototypeInviteFragment(`#noise=discard&invite=${token}`, { now: NOW }).status, 'invalid');
  assert.equal(parsePrototypeInviteFragment(`#invite=${token}&invite=${token}`, { now: NOW }).status, 'invalid');
  assert.equal(parsePrototypeInviteFragment('#invite=v1.not-base64!', { now: NOW }).status, 'invalid');
  assert.equal(parsePrototypeInviteFragment(`#invite=${'x'.repeat(600)}`, { now: NOW }).status, 'invalid');
  assert.equal(parsePrototypeInviteToken(encodePayload(safePayload({ m: 'unsafe' })), { now: NOW }).status, 'invalid');
});

test('rejects missing, unknown, unsupported, future, and stale schedule fields', () => {
  assert.deepEqual(parsePrototypeInviteToken(encodePayload({ ...safePayload(), extra: 'hidden' }), { now: NOW }), { status: 'invalid' });
  assert.deepEqual(parsePrototypeInviteToken(encodePayload({ v: 1, n: 'Nova', t: 'cosmic', m: 'route-choice', c: CREATED_MINUTE }), { now: NOW }), { status: 'invalid' });
  assert.deepEqual(parsePrototypeInviteToken(encodePayload({ v: 1, n: 'Nova', t: 'cosmic', m: 'route-choice', w: 'now-30m' }), { now: NOW }), { status: 'invalid' });
  assert.deepEqual(parsePrototypeInviteToken(encodePayload(safePayload({ w: 'free-date' })), { now: NOW }), { status: 'invalid' });
  assert.deepEqual(parsePrototypeInviteToken(encodePayload(safePayload({ c: CREATED_MINUTE + 1 })), { now: NOW }), { status: 'invalid' });
  assert.deepEqual(parsePrototypeInviteToken(encodePayload(safePayload({ c: CREATED_MINUTE - 2881 })), { now: NOW }), { status: 'invalid' });
  assert.deepEqual(prototypeInviteLimits.schedules, ['now-30m', 'in-1h-30m', 'in-24h-24h']);
  assert.equal(getPrototypeInviteCopy('en').featuredPromise, 'A community built around bold ideas.');
  assert.equal(getPrototypeInviteCopy('ar').featuredPromise, 'مجتمع مبني حول أفكار جريئة.');
});

test('strips query data from the same-origin public invite URL', () => {
  const token = createPrototypeInvite({
    name: 'Nova Guild', theme: 'cosmic', promise: 'Safe fictional routes.', createdAtMinute: CREATED_MINUTE,
  }, { now: NOW });
  const url = buildPrototypeInviteUrl('https://creatorverse.example/play?token=secret#old', token, { now: NOW });
  assert.equal(url, `https://creatorverse.example/play#invite=${token}`);
  assert.doesNotMatch(url, /secret|token=/u);
  assert.throws(() => buildPrototypeInviteUrl('javascript:alert(1)', token, { now: NOW }), /INVITE_BASE_URL_INVALID/);
  assert.throws(() => buildPrototypeInviteUrl('https://user:pass@example.com/', token, { now: NOW }), /INVITE_BASE_URL_INVALID/);
});

test('escapes dynamic values and keeps Arabic and English invite keys synchronized', () => {
  assert.equal(escapeInviteHtml(`<Nova & "Friends">`), '&lt;Nova &amp; &quot;Friends&quot;&gt;');
  const keys = getPrototypeInviteKeySets();
  assert.deepEqual(keys.ar, keys.en);
  assert.ok(getPrototypeInviteCopy('ar-AE').receiptTitle.length > 0);
  assert.ok(getPrototypeInviteCopy('en-US').receiptTitle.length > 0);
});
