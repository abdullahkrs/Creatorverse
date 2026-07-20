import {
  DEFAULT_MISSION_TEMPLATE_ID,
  MISSION_TEMPLATE_IDS,
  normalizeMissionTemplateId,
} from './mission-templates.js';

const INVITE_VERSION = 1;
const TOKEN_PREFIX = 'v1.';
const MAX_TOKEN_LENGTH = 480;
const MAX_DECODED_BYTES = 320;
const MAX_REALM_NAME = 28;
const MAX_PROMISE = 90;
const ALLOWED_THEMES = new Set(['cosmic', 'wild', 'future']);
const CREATE_FIELDS = new Set(['name', 'theme', 'promise', 'missionId']);
const PAYLOAD_FIELDS = new Set(['v', 'n', 't', 'p', 'm']);

const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const URL_CONTACT_OR_HANDLE = /(?:[a-z][a-z0-9+.-]*:\/\/|(?:mailto|tel|sms|data|javascript|file):|www\.|(?:^|[^\p{L}\p{N}._%+-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[\p{L}]{2,63}(?::\d{1,5})?(?:[/?#][^\s]*)?|\b[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}\b|(^|\s)@[\p{L}\p{N}_]{2,}|\+?\d[\d\s().-]{7,}\d)/iu;
const REAL_WORLD_TARGET = /(?:\b(?:united states|usa|united kingdom|uk|israel|palestine|russia|ukraine|iran|government|president|election|political party|army|war|flag)\b|(?:إسرائيل|فلسطين|روسيا|أوكرانيا|اوكرانيا|إيران|ايران|حكومة|رئيس|انتخابات|حزب|جيش|حرب|علم))/iu;
const HOSTILITY_OR_MOBILIZATION = /(?:\b(?:attack|harass|brigade|mass report|report raid|boycott|target them|dox|threaten)\b|(?:هاجم|تحرش|حملة بلاغات|إبلاغ جماعي|ابلاغ جماعي|مقاطعة|استهدفهم|فضح|هدد))/iu;

function inviteError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function assertObjectWithAllowedFields(value, allowedFields, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw inviteError(code);
  if (Object.keys(value).some(key => !allowedFields.has(key))) throw inviteError(code);
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value);
}

function toBase64Url(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64url');
  }

  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw inviteError('INVITE_ENCODING_INVALID');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64url'));

  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function escapeInviteHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function normalizeInviteText(value, { field = 'value', maxLength, required = true } = {}) {
  if (typeof value !== 'string') throw inviteError(`INVITE_${field.toUpperCase()}_INVALID`);

  const normalized = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (required && !normalized) throw inviteError(`INVITE_${field.toUpperCase()}_REQUIRED`);
  if (!normalized) return null;
  if (normalized.length > maxLength) throw inviteError(`INVITE_${field.toUpperCase()}_TOO_LONG`);
  if (CONTROL_OR_BIDI.test(normalized)) throw inviteError('INVITE_UNSAFE_CONTROL');
  if (URL_CONTACT_OR_HANDLE.test(normalized)) throw inviteError('INVITE_PRIVATE_OR_EXTERNAL_TEXT');
  if (REAL_WORLD_TARGET.test(normalized)) throw inviteError('INVITE_REAL_WORLD_TARGET');
  if (HOSTILITY_OR_MOBILIZATION.test(normalized)) throw inviteError('INVITE_HOSTILITY');
  return normalized;
}

export function createPrototypeInvite(input = {}) {
  assertObjectWithAllowedFields(input, CREATE_FIELDS, 'INVITE_FIELDS_INVALID');
  const { name, theme, promise, missionId } = input;
  const normalizedName = normalizeInviteText(name, { field: 'name', maxLength: MAX_REALM_NAME });
  if (!ALLOWED_THEMES.has(theme)) throw inviteError('INVITE_THEME_INVALID');
  const normalizedPromise = normalizeInviteText(promise ?? '', {
    field: 'promise',
    maxLength: MAX_PROMISE,
    required: false,
  });
  let normalizedMission;
  try {
    normalizedMission = normalizeMissionTemplateId(
      missionId ?? globalThis.__creatorverseMissionTemplateId ?? DEFAULT_MISSION_TEMPLATE_ID,
      { fallback: false },
    );
  } catch {
    throw inviteError('INVITE_MISSION_INVALID');
  }

  const payload = { v: INVITE_VERSION, n: normalizedName, t: theme, m: normalizedMission };
  if (normalizedPromise) payload.p = normalizedPromise;

  const encoded = toBase64Url(utf8Bytes(JSON.stringify(payload)));
  const token = `${TOKEN_PREFIX}${encoded}`;
  if (token.length > MAX_TOKEN_LENGTH) throw inviteError('INVITE_TOKEN_TOO_LONG');
  return token;
}

export function parsePrototypeInviteToken(token) {
  try {
    if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX) || token.length > MAX_TOKEN_LENGTH) {
      throw inviteError('INVITE_TOKEN_INVALID');
    }

    const bytes = fromBase64Url(token.slice(TOKEN_PREFIX.length));
    if (!bytes.length || bytes.length > MAX_DECODED_BYTES) throw inviteError('INVITE_PAYLOAD_SIZE_INVALID');

    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const payload = JSON.parse(json);
    assertObjectWithAllowedFields(payload, PAYLOAD_FIELDS, 'INVITE_FIELDS_INVALID');
    if (payload.v !== INVITE_VERSION) throw inviteError('INVITE_VERSION_INVALID');

    const name = normalizeInviteText(payload.n, { field: 'name', maxLength: MAX_REALM_NAME });
    if (!ALLOWED_THEMES.has(payload.t)) throw inviteError('INVITE_THEME_INVALID');
    const promise = normalizeInviteText(payload.p ?? '', {
      field: 'promise',
      maxLength: MAX_PROMISE,
      required: false,
    });
    const missionId = normalizeMissionTemplateId(payload.m ?? DEFAULT_MISSION_TEMPLATE_ID, { fallback: false });

    return {
      status: 'valid',
      invite: Object.freeze({ name, theme: payload.t, promise, missionId }),
    };
  } catch {
    return { status: 'invalid' };
  }
}

export function parsePrototypeInviteFragment(fragment) {
  const raw = String(fragment ?? '').replace(/^#/u, '');
  if (!raw) return { status: 'none' };

  const parameters = new URLSearchParams(raw);
  const invites = parameters.getAll('invite');
  if (invites.length === 0) return { status: 'none' };
  if (invites.length !== 1) return { status: 'invalid' };
  return parsePrototypeInviteToken(invites[0]);
}

export function buildPrototypeInviteUrl(baseUrl, token) {
  const parsedToken = parsePrototypeInviteToken(token);
  if (parsedToken.status !== 'valid') throw inviteError('INVITE_TOKEN_INVALID');

  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw inviteError('INVITE_BASE_URL_INVALID');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw inviteError('INVITE_BASE_URL_INVALID');
  }

  url.search = '';
  url.hash = `invite=${token}`;
  return url.toString();
}

export const prototypeInviteLimits = Object.freeze({
  maxTokenLength: MAX_TOKEN_LENGTH,
  maxDecodedBytes: MAX_DECODED_BYTES,
  maxRealmName: MAX_REALM_NAME,
  maxPromise: MAX_PROMISE,
  themes: Object.freeze([...ALLOWED_THEMES]),
  missions: MISSION_TEMPLATE_IDS,
});