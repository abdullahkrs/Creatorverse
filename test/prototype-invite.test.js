import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PrototypeInviteError,
  buildPrototypeInviteUrl,
  createPrototypeInvite,
  parsePrototypeInviteFragment,
  parsePrototypeInviteToken,
  serializePrototypeInvite,
} from '../src/prototype-invite.js';

const safeInput = Object.freeze({
  realmName: 'Nova Guild',
  theme: 'cosmic',
  communityPromise: 'A fictional community building clear routes together.',
});

function tokenFor(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

test('creates a deterministic bounded invite and round-trips required fields', () => {
  const invite = createPrototypeInvite(safeInput);
  const token = serializePrototypeInvite(invite);
  const parsed = parsePrototypeInviteToken(token);

  assert.equal(parsed.status, 'valid');
  assert.deepEqual(parsed.invite, {
    version: 1,
    realmName: safeInput.realmName,
    theme: safeInput.theme,
    communityPromise: safeInput.communityPromise,
  });
  assert.equal(serializePrototypeInvite(invite), token);
});

test('accepts only allowlisted fields, ignores unrelated fragment data, and supports a localized fallback promise', () => {
  const token = tokenFor({ v: 1, n: 'Quiet Circuit', t: 'future', ignored: 'never rendered' });
  const parsed = parsePrototypeInviteFragment(`#source=discarded&invite=${token}&campaign=discarded`);

  assert.equal(parsed.status, 'valid');
  assert.deepEqual(parsed.invite, {
    version: 1,
    realmName: 'Quiet Circuit',
    theme: 'future',
    communityPromise: null,
  });
  assert.equal(Object.hasOwn(parsed.invite, 'ignored'), false);
});

test('rejects malformed, duplicate, oversized, control, bidi, markup, contact, URL, political, and real-country input', () => {
  const invalidInputs = [
    { ...safeInput, realmName: '<script>alert(1)</script>' },
    { ...safeInput, realmName: `Nova\u202eGuild` },
    { ...safeInput, communityPromise: 'Join https://example.com now.' },
    { ...safeInput, communityPromise: 'Message @someone for access.' },
    { ...safeInput, communityPromise: 'Support the election campaign.' },
    { ...safeInput, realmName: 'Oman Signal' },
    { ...safeInput, communityPromise: 'x'.repeat(91) },
    { ...safeInput, theme: 'unknown' },
  ];

  for (const input of invalidInputs) {
    assert.throws(() => createPrototypeInvite(input), PrototypeInviteError);
  }

  assert.equal(parsePrototypeInviteFragment('#invite=bad+token').status, 'invalid');
  assert.equal(parsePrototypeInviteFragment('#invite=one&invite=two').status, 'invalid');
  assert.equal(parsePrototypeInviteToken('a'.repeat(513)).status, 'invalid');
  assert.equal(parsePrototypeInviteToken(tokenFor({ v: 2, n: 'Nova Guild', t: 'cosmic' })).status, 'invalid');
});

test('builds a fragment-only invite URL and removes query, credentials, and stale fragment data', () => {
  const token = serializePrototypeInvite(createPrototypeInvite(safeInput));
  const result = new URL(buildPrototypeInviteUrl('https://user:pass@example.test/play?secret=1#old', token));

  assert.equal(result.origin, 'https://example.test');
  assert.equal(result.pathname, '/play');
  assert.equal(result.search, '');
  assert.equal(result.hash, `#invite=${token}`);
  assert.equal(result.username, '');
  assert.equal(result.password, '');
});

test('treats a normal product fragment as empty rather than an invite error', () => {
  assert.deepEqual(parsePrototypeInviteFragment(''), { status: 'none' });
  assert.deepEqual(parsePrototypeInviteFragment('#join'), { status: 'none' });
});
