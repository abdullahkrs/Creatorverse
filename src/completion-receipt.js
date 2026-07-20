import { MISSION_TEMPLATE_IDS } from './mission-templates.js';
import { DISTRICT_CONTRIBUTION, DISTRICT_ID } from './district-progress.js';

const RECEIPT_VERSION = 1;
const TOKEN_PREFIX = 'cr1.';
const MAX_TOKEN_LENGTH = 512;
const MAX_DECODED_BYTES = 320;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{16,64}$/u;
const ROLE_IDS = new Set(['builder', 'explorer', 'guardian']);
const ROUTE_IDS = new Set(['sky', 'ocean']);
const TEMPLATE_IDS = new Set(MISSION_TEMPLATE_IDS);
const INPUT_FIELDS = new Set([
  'realmId',
  'receiptId',
  'missionId',
  'roleId',
  'routeId',
  'contribution',
  'districtId',
]);
const PAYLOAD_FIELDS = new Set(['v', 'rid', 'id', 'm', 'ro', 'rt', 'c', 'd']);
const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function receiptError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function assertPlainObject(value, allowedFields, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw receiptError(code);
  const keys = Object.keys(value);
  if (keys.some(key => !allowedFields.has(key))) throw receiptError(code);
}

function validateIdentifier(value, code) {
  if (typeof value !== 'string' || CONTROL_OR_BIDI.test(value) || !IDENTIFIER_PATTERN.test(value)) {
    throw receiptError(code);
  }
  return value;
}

function toBase64Url(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64url');
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw receiptError('RECEIPT_ENCODING_INVALID');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64url'));
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value);
}

export function createOpaqueIdentifier(cryptoLike = globalThis.crypto) {
  if (!cryptoLike || typeof cryptoLike.getRandomValues !== 'function') {
    throw receiptError('SECURE_RANDOM_UNAVAILABLE');
  }
  const bytes = new Uint8Array(18);
  cryptoLike.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function createCompletionReceipt(input = {}) {
  assertPlainObject(input, INPUT_FIELDS, 'RECEIPT_FIELDS_INVALID');
  const realmId = validateIdentifier(input.realmId, 'RECEIPT_REALM_INVALID');
  const receiptId = validateIdentifier(input.receiptId ?? createOpaqueIdentifier(), 'RECEIPT_ID_INVALID');
  if (!TEMPLATE_IDS.has(input.missionId)) throw receiptError('RECEIPT_MISSION_INVALID');
  if (!ROLE_IDS.has(input.roleId)) throw receiptError('RECEIPT_ROLE_INVALID');
  if (!ROUTE_IDS.has(input.routeId)) throw receiptError('RECEIPT_ROUTE_INVALID');
  if ((input.contribution ?? DISTRICT_CONTRIBUTION) !== DISTRICT_CONTRIBUTION) {
    throw receiptError('RECEIPT_CONTRIBUTION_INVALID');
  }
  if ((input.districtId ?? DISTRICT_ID) !== DISTRICT_ID) throw receiptError('RECEIPT_DISTRICT_INVALID');

  const payload = {
    v: RECEIPT_VERSION,
    rid: realmId,
    id: receiptId,
    m: input.missionId,
    ro: input.roleId,
    rt: input.routeId,
    c: DISTRICT_CONTRIBUTION,
    d: DISTRICT_ID,
  };
  const encoded = toBase64Url(utf8Bytes(JSON.stringify(payload)));
  const token = `${TOKEN_PREFIX}${encoded}`;
  if (token.length > MAX_TOKEN_LENGTH) throw receiptError('RECEIPT_TOKEN_TOO_LONG');
  return token;
}

export function parseCompletionReceiptToken(token) {
  try {
    if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX) || token.length > MAX_TOKEN_LENGTH) {
      throw receiptError('RECEIPT_TOKEN_INVALID');
    }
    const bytes = fromBase64Url(token.slice(TOKEN_PREFIX.length));
    if (!bytes.length || bytes.length > MAX_DECODED_BYTES) throw receiptError('RECEIPT_PAYLOAD_SIZE_INVALID');
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const payload = JSON.parse(json);
    assertPlainObject(payload, PAYLOAD_FIELDS, 'RECEIPT_FIELDS_INVALID');
    if (Object.keys(payload).length !== PAYLOAD_FIELDS.size) throw receiptError('RECEIPT_FIELDS_INVALID');
    if (payload.v !== RECEIPT_VERSION) throw receiptError('RECEIPT_VERSION_INVALID');
    const realmId = validateIdentifier(payload.rid, 'RECEIPT_REALM_INVALID');
    const receiptId = validateIdentifier(payload.id, 'RECEIPT_ID_INVALID');
    if (!TEMPLATE_IDS.has(payload.m)) throw receiptError('RECEIPT_MISSION_INVALID');
    if (!ROLE_IDS.has(payload.ro)) throw receiptError('RECEIPT_ROLE_INVALID');
    if (!ROUTE_IDS.has(payload.rt)) throw receiptError('RECEIPT_ROUTE_INVALID');
    if (payload.c !== DISTRICT_CONTRIBUTION) throw receiptError('RECEIPT_CONTRIBUTION_INVALID');
    if (payload.d !== DISTRICT_ID) throw receiptError('RECEIPT_DISTRICT_INVALID');

    return {
      status: 'valid',
      receipt: Object.freeze({
        realmId,
        receiptId,
        missionId: payload.m,
        roleId: payload.ro,
        routeId: payload.rt,
        contribution: payload.c,
        districtId: payload.d,
      }),
    };
  } catch {
    return { status: 'invalid' };
  }
}

export function parseCompletionReceiptFragment(fragment) {
  const raw = String(fragment ?? '').replace(/^#/u, '');
  if (!raw) return { status: 'none' };
  const parameters = new URLSearchParams(raw);
  const receipts = parameters.getAll('receipt');
  if (receipts.length === 0) return { status: 'none' };
  if (receipts.length !== 1) return { status: 'invalid' };
  for (const key of new Set(parameters.keys())) {
    if (parameters.getAll(key).length > 1) return { status: 'invalid' };
  }
  return parseCompletionReceiptToken(receipts[0]);
}

export function buildCompletionReceiptUrl(baseUrl, token) {
  const parsed = parseCompletionReceiptToken(token);
  if (parsed.status !== 'valid') throw receiptError('RECEIPT_TOKEN_INVALID');
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw receiptError('RECEIPT_BASE_URL_INVALID');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw receiptError('RECEIPT_BASE_URL_INVALID');
  }
  url.search = '';
  url.hash = `receipt=${token}`;
  return url.toString();
}

export const completionReceiptLimits = Object.freeze({
  maxTokenLength: MAX_TOKEN_LENGTH,
  maxDecodedBytes: MAX_DECODED_BYTES,
  identifierPattern: IDENTIFIER_PATTERN,
});
