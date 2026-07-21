import {
  DEFAULT_MISSION_TEMPLATE_ID,
  MISSION_TEMPLATE_IDS,
  normalizeMissionTemplateId,
} from './mission-templates.js';
import {
  MISSION_SCHEDULE_IDS,
  createMissionSchedule,
  normalizeMissionScheduleWindow,
  toEpochMinute,
} from './mission-schedule.js';

const INVITE_VERSION = 1;
const TOKEN_PREFIX = 'v1.';
const MAX_TOKEN_LENGTH = 560;
const MAX_DECODED_BYTES = 360;
const MAX_REALM_NAME = 28;
const MAX_PROMISE = 90;
const ALLOWED_THEMES = new Set(['cosmic', 'wild', 'future']);
const CREATE_FIELDS = new Set(['name', 'theme', 'promise', 'missionId', 'realmId', 'scheduleId', 'createdAtMinute']);
const PAYLOAD_FIELDS = new Set(['v', 'n', 't', 'p', 'm', 'r', 'c', 's', 'e']);
const SCHEDULE_PAYLOAD_FIELDS = Object.freeze(['c', 's', 'e']);
const OPAQUE_ID = /^[A-Za-z0-9_-]{16,64}$/u;

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

function assertNoDuplicateTopLevelKeys(json) {
  const keys = new Set();
  let depth = 0;
  let index = 0;

  while (index < json.length) {
    const character = json[index];
    if (character === '"') {
      const start = index;
      index += 1;
      let escaped = false;
      while (index < json.length) {
        const current = json[index];
        if (escaped) {
          escaped = false;
          index += 1;
          continue;
        }
        if (current === '\\') {
          escaped = true;
          index += 1;
          continue;
        }
        if (current === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      if (json[index - 1] !== '"') throw inviteError('INVITE_JSON_INVALID');
      let cursor = index;
      while (/\s/u.test(json[cursor] || '')) cursor += 1;
      if (depth === 1 && json[cursor] === ':') {
        const key = JSON.parse(json.slice(start, index));
        if (keys.has(key)) throw inviteError('INVITE_FIELDS_DUPLICATE');
        keys.add(key);
      }
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    index += 1;
  }
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value);
}

function toBase64Url(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64url');
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

function normalizeRealmId(value, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw inviteError('INVITE_REALM_INVALID');
    return null;
  }
  if (typeof value !== 'string' || CONTROL_OR_BIDI.test(value) || !OPAQUE_ID.test(value)) {
    throw inviteError('INVITE_REALM_INVALID');
  }
  return value;
}

function normalizeCreatedSchedule(scheduleId, createdAtMinute, now) {
  try {
    return createMissionSchedule(scheduleId, createdAtMinute, { now });
  } catch {
    throw inviteError('INVITE_SCHEDULE_INVALID');
  }
}

function normalizeParsedSchedule(payload, now) {
  const present = SCHEDULE_PAYLOAD_FIELDS.filter(field => Object.hasOwn(payload, field));
  if (present.length === 0) return null;
  if (present.length !== SCHEDULE_PAYLOAD_FIELDS.length) throw inviteError('INVITE_SCHEDULE_INVALID');
  try {
    return normalizeMissionScheduleWindow({
      createdAtMinute: payload.c,
      startMinute: payload.s,
      endMinute: payload.e,
    }, { now });
  } catch {
    throw inviteError('INVITE_SCHEDULE_INVALID');
  }
}

export function createPrototypeInvite(input = {}, { now = Date.now() } = {}) {
  assertObjectWithAllowedFields(input, CREATE_FIELDS, 'INVITE_FIELDS_INVALID');
  const { name, theme, promise, missionId, realmId } = input;
  const normalizedName = normalizeInviteText(name, { field: 'name', maxLength: MAX_REALM_NAME });
  if (!ALLOWED_THEMES.has(theme)) throw inviteError('INVITE_THEME_INVALID');
  const normalizedPromise = normalizeInviteText(promise ?? '', {
    field: 'promise', maxLength: MAX_PROMISE, required: false,
  });
  const normalizedRealmId = normalizeRealmId(realmId);
  let normalizedMission;
  try {
    normalizedMission = normalizeMissionTemplateId(
      missionId ?? globalThis.__creatorverseMissionTemplateId ?? DEFAULT_MISSION_TEMPLATE_ID,
      { fallback: false },
    );
  } catch {
    throw inviteError('INVITE_MISSION_INVALID');
  }

  const schedule = normalizeCreatedSchedule(
    input.scheduleId ?? globalThis.__creatorverseMissionScheduleId ?? MISSION_SCHEDULE_IDS[0],
    input.createdAtMinute ?? toEpochMinute(now),
    now,
  );
  const payload = {
    v: INVITE_VERSION,
    n: normalizedName,
    t: theme,
    m: normalizedMission,
    c: schedule.createdAtMinute,
    s: schedule.startMinute,
    e: schedule.endMinute,
  };
  if (normalizedPromise) payload.p = normalizedPromise;
  if (normalizedRealmId) payload.r = normalizedRealmId;

  const encoded = toBase64Url(utf8Bytes(JSON.stringify(payload)));
  const token = `${TOKEN_PREFIX}${encoded}`;
  if (token.length > MAX_TOKEN_LENGTH) throw inviteError('INVITE_TOKEN_TOO_LONG');
  return token;
}

export function parsePrototypeInviteToken(token, { now = Date.now() } = {}) {
  try {
    if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX) || token.length > MAX_TOKEN_LENGTH) {
      throw inviteError('INVITE_TOKEN_INVALID');
    }
    const bytes = fromBase64Url(token.slice(TOKEN_PREFIX.length));
    if (!bytes.length || bytes.length > MAX_DECODED_BYTES) throw inviteError('INVITE_PAYLOAD_SIZE_INVALID');
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assertNoDuplicateTopLevelKeys(json);
    const payload = JSON.parse(json);
    assertObjectWithAllowedFields(payload, PAYLOAD_FIELDS, 'INVITE_FIELDS_INVALID');
    if (payload.v !== INVITE_VERSION) throw inviteError('INVITE_VERSION_INVALID');

    const name = normalizeInviteText(payload.n, { field: 'name', maxLength: MAX_REALM_NAME });
    if (!ALLOWED_THEMES.has(payload.t)) throw inviteError('INVITE_THEME_INVALID');
    const promise = normalizeInviteText(payload.p ?? '', {
      field: 'promise', maxLength: MAX_PROMISE, required: false,
    });
    const missionId = normalizeMissionTemplateId(payload.m ?? DEFAULT_MISSION_TEMPLATE_ID, { fallback: false });
    const realmId = normalizeRealmId(payload.r);
    const schedule = normalizeParsedSchedule(payload, now);
    const invite = { name, theme: payload.t, promise, missionId };
    if (realmId) invite.realmId = realmId;
    if (schedule) {
      invite.scheduleId = schedule.scheduleId;
      invite.createdAtMinute = schedule.createdAtMinute;
      invite.startMinute = schedule.startMinute;
      invite.endMinute = schedule.endMinute;
    }
    return { status: 'valid', invite: Object.freeze(invite) };
  } catch {
    return { status: 'invalid' };
  }
}

export function parsePrototypeInviteFragment(fragment, options = {}) {
  const raw = String(fragment ?? '').replace(/^#/u, '');
  if (!raw) return { status: 'none' };
  const parameters = new URLSearchParams(raw);
  const keys = [...parameters.keys()];
  const invites = parameters.getAll('invite');
  if (invites.length === 0) return { status: 'none' };
  if (invites.length !== 1 || keys.length !== 1 || keys[0] !== 'invite') return { status: 'invalid' };
  return parsePrototypeInviteToken(invites[0], options);
}

export function buildPrototypeInviteUrl(baseUrl, token, options = {}) {
  const parsedToken = parsePrototypeInviteToken(token, options);
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
  schedules: MISSION_SCHEDULE_IDS,
});
