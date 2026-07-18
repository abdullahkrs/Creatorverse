export const PROTOTYPE_INVITE_VERSION = 1;
export const PROTOTYPE_INVITE_RECEIPT_KEY = 'creatorverse-prototype-invite-receipt-v1';

const MAX_TOKEN_LENGTH = 512;
const MAX_DECODED_BYTES = 384;
const THEMES = new Set(['cosmic', 'wild', 'future']);
const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const SAFE_TEXT = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}\p{Zs}.,'’!?،؟:;()-]*$/u;
const CONTACT_OR_URL = /(?:https?:\/\/|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|@[\p{L}\p{N}_]{2,}|\+?\d(?:[\s().-]*\d){7,})/iu;
const REAL_WORLD_RISK = /(?:\b(?:president|government|election|parliament|military|war|boycott|brigade|harass|attack|raid|mass report|political party)\b|(?:رئيس|حكومة|انتخابات|برلمان|جيش|حرب|مقاطعة|تحريض|مهاجمة|مداهمة|تبليغ جماعي|حزب سياسي))/iu;

let regionNames;

export class PrototypeInviteError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PrototypeInviteError';
    this.code = code;
  }
}

function normalizeSearchText(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getRegionNames() {
  if (regionNames) return regionNames;
  const names = new Set();
  const alph = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const displays = [
    new Intl.DisplayNames(['en'], { type: 'region' }),
    new Intl.DisplayNames(['ar'], { type: 'region' }),
  ];

  for (const first of alph) {
    for (const second of alph) {
      const code = `${first}${second}`;
      for (const display of displays) {
        const name = display.of(code);
        if (!name || name === code || name.length < 4) continue;
        names.add(normalizeSearchText(name));
      }
    }
  }

  regionNames = [...names].filter(Boolean);
  return regionNames;
}

function containsRegionName(value) {
  const normalized = ` ${normalizeSearchText(value)} `;
  return getRegionNames().some(name => normalized.includes(` ${name} `));
}

function normalizeBoundedText(value, { field, min, max }) {
  if (typeof value !== 'string') throw new PrototypeInviteError(`${field}_TYPE`);
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const length = [...normalized].length;

  if (length < min || length > max) throw new PrototypeInviteError(`${field}_LENGTH`);
  if (CONTROL_OR_BIDI.test(normalized)) throw new PrototypeInviteError(`${field}_CONTROL`);
  if (!SAFE_TEXT.test(normalized)) throw new PrototypeInviteError(`${field}_CHARACTERS`);
  if (CONTACT_OR_URL.test(normalized)) throw new PrototypeInviteError(`${field}_CONTACT`);
  if (REAL_WORLD_RISK.test(normalized) || containsRegionName(normalized)) {
    throw new PrototypeInviteError(`${field}_REAL_WORLD`);
  }

  return normalized;
}

function normalizeTheme(value) {
  if (typeof value !== 'string' || !THEMES.has(value)) {
    throw new PrototypeInviteError('THEME_UNSUPPORTED');
  }
  return value;
}

function encodeBase64Url(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64url');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(token) {
  if (!/^[A-Za-z0-9_-]+$/u.test(token)) throw new PrototypeInviteError('TOKEN_CHARACTERS');
  const padding = '='.repeat((4 - (token.length % 4)) % 4);
  const base64 = token.replaceAll('-', '+').replaceAll('_', '/') + padding;

  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(base64, 'base64'));
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function createPrototypeInvite({ realmName, theme, communityPromise }) {
  return Object.freeze({
    version: PROTOTYPE_INVITE_VERSION,
    realmName: normalizeBoundedText(realmName, { field: 'REALM_NAME', min: 2, max: 28 }),
    theme: normalizeTheme(theme),
    communityPromise: normalizeBoundedText(communityPromise, { field: 'COMMUNITY_PROMISE', min: 3, max: 90 }),
  });
}

export function serializePrototypeInvite(invite) {
  const safe = createPrototypeInvite(invite);
  const payload = JSON.stringify({
    v: safe.version,
    n: safe.realmName,
    t: safe.theme,
    p: safe.communityPromise,
  });
  const bytes = new TextEncoder().encode(payload);
  if (bytes.byteLength > MAX_DECODED_BYTES) throw new PrototypeInviteError('PAYLOAD_TOO_LARGE');
  const token = encodeBase64Url(bytes);
  if (token.length > MAX_TOKEN_LENGTH) throw new PrototypeInviteError('TOKEN_TOO_LARGE');
  return token;
}

export function parsePrototypeInviteToken(token) {
  try {
    if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH) {
      throw new PrototypeInviteError('TOKEN_LENGTH');
    }

    const bytes = decodeBase64Url(token);
    if (!bytes.byteLength || bytes.byteLength > MAX_DECODED_BYTES) {
      throw new PrototypeInviteError('PAYLOAD_SIZE');
    }

    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new PrototypeInviteError('PAYLOAD_TYPE');
    }
    if (payload.v !== PROTOTYPE_INVITE_VERSION) throw new PrototypeInviteError('VERSION_UNSUPPORTED');

    const invite = {
      version: PROTOTYPE_INVITE_VERSION,
      realmName: normalizeBoundedText(payload.n, { field: 'REALM_NAME', min: 2, max: 28 }),
      theme: normalizeTheme(payload.t),
      communityPromise: payload.p === undefined
        ? null
        : normalizeBoundedText(payload.p, { field: 'COMMUNITY_PROMISE', min: 3, max: 90 }),
    };

    return { status: 'valid', invite: Object.freeze(invite) };
  } catch (error) {
    return {
      status: 'invalid',
      reason: error instanceof PrototypeInviteError ? error.code : 'PAYLOAD_INVALID',
    };
  }
}

export function parsePrototypeInviteFragment(fragment) {
  const raw = String(fragment || '').replace(/^#/u, '');
  if (!raw) return { status: 'none' };

  const params = new URLSearchParams(raw);
  const tokens = params.getAll('invite');
  if (!tokens.length) return { status: 'none' };
  if (tokens.length !== 1 || !tokens[0]) return { status: 'invalid', reason: 'TOKEN_COUNT' };
  return parsePrototypeInviteToken(tokens[0]);
}

export function buildPrototypeInviteUrl(locationLike, token) {
  const parsed = parsePrototypeInviteToken(token);
  if (parsed.status !== 'valid') throw new PrototypeInviteError('TOKEN_INVALID');

  const source = typeof locationLike === 'string'
    ? new URL(locationLike)
    : new URL(locationLike?.href || `${locationLike?.origin || ''}${locationLike?.pathname || '/'}`);
  if (!['http:', 'https:'].includes(source.protocol)) throw new PrototypeInviteError('ORIGIN_UNSUPPORTED');

  source.username = '';
  source.password = '';
  source.search = '';
  source.hash = `invite=${token}`;
  return source.toString();
}
