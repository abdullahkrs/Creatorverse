import { getSingleCreatorRealm, importCompletionReceipt } from './creator-ledger.js';
import { completionReceiptLimits, createOpaqueIdentifier } from './completion-receipt.js';
import { DISTRICT_CONTRIBUTION, DISTRICT_ID } from './district-progress.js';
import { MISSION_SCHEDULE_IDS, classifyMissionSchedule, createMissionSchedule, normalizeMissionScheduleWindow, toEpochMinute } from './mission-schedule.js';
import { MISSION_TEMPLATE_IDS } from './mission-templates.js';
import { inspectRealmCollaboration, isValidRealmCollaborationRecord } from './realm-collaboration.js';

export const SHARED_MISSION_VERSION = 1;
export const SHARED_MISSION_INVITE_KEY = 'creatorverse-shared-mission-invite-v1';
export const SHARED_MISSION_PROGRESS_KEY = 'creatorverse-shared-mission-progress-v1';
export const SHARED_MISSION_RECEIPT_KEY = 'creatorverse-shared-mission-receipt-v1';
export const SHARED_MISSION_ISSUED_KEY = 'creatorverse-shared-mission-issued-v1';
export const SHARED_MISSION_INVITE_FRAGMENT = 'shared-mission';
export const SHARED_MISSION_RECEIPT_FRAGMENT = 'shared-receipt';

const INVITE_PREFIX = 'csm1.';
const RECEIPT_PREFIX = 'csr1.';
const MAX_INVITE_TOKEN_LENGTH = 1536;
const MAX_RECEIPT_TOKEN_LENGTH = 1792;
const MAX_DECODED_BYTES = 1280;
const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const IDENTIFIER_PATTERN = completionReceiptLimits.identifierPattern;
const THEMES = new Set(['cosmic', 'wild', 'future']);
const MISSIONS = new Set(MISSION_TEMPLATE_IDS);
const SCHEDULES = new Set(MISSION_SCHEDULE_IDS);
const ROLES = new Set(['builder', 'explorer', 'guardian']);
const ROUTES = new Set(['sky', 'ocean']);

const INVITE_FIELDS = new Set([
  'version', 'missionInstanceId', 'initiatorRealmId', 'initiatorName', 'initiatorTheme',
  'linkedRealmId', 'linkedName', 'linkedTheme', 'relationshipId', 'missionId',
  'scheduleId', 'createdAtMinute', 'startMinute', 'endMinute',
]);
const RECEIPT_FIELDS = new Set([
  'version', 'sharedMissionId', 'completionId', 'receiptId', 'relationshipId',
  'initiatorRealmId', 'initiatorName', 'initiatorTheme', 'linkedRealmId', 'linkedName',
  'linkedTheme', 'targetRealmId', 'missionId', 'roleId', 'routeId', 'contribution', 'districtId',
]);
const PROGRESS_FIELDS = new Set(['version', 'missionInstanceId', 'roleId', 'step', 'completed', 'routeId', 'result']);
const RESULT_FIELDS = new Set(['completionId', 'receipts']);
const RESULT_RECEIPT_FIELDS = new Set(['targetRealmId', 'targetName', 'token', 'url']);

function sharedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function exactObject(value, fields) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === fields.size
    && Object.keys(value).every(key => fields.has(key));
}

function validIdentifier(value) {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value) && !CONTROL_OR_BIDI.test(value);
}

function validName(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 28
    && value === value.normalize('NFKC')
    && value.trim() === value
    && !/\s{2,}/u.test(value)
    && !CONTROL_OR_BIDI.test(value)
    && !/[<>]/u.test(value);
}

function validTheme(value) {
  return THEMES.has(value);
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
        if (escaped) escaped = false;
        else if (current === '\\') escaped = true;
        else if (current === '"') { index += 1; break; }
        index += 1;
      }
      if (json[index - 1] !== '"') throw sharedError('SHARED_JSON_INVALID');
      let cursor = index;
      while (/\s/u.test(json[cursor] || '')) cursor += 1;
      if (depth === 1 && json[cursor] === ':') {
        const key = JSON.parse(json.slice(start, index));
        if (keys.has(key)) throw sharedError('SHARED_FIELDS_DUPLICATE');
        keys.add(key);
      }
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    index += 1;
  }
}

function toBase64Url(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64url');
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) throw sharedError('SHARED_ENCODING_INVALID');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64url'));
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function encodePayload(prefix, payload, maximum) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const token = `${prefix}${toBase64Url(bytes)}`;
  if (token.length > maximum) throw sharedError('SHARED_TOKEN_TOO_LARGE');
  return token;
}

function decodePayload(token, prefix, maximum) {
  if (typeof token !== 'string' || !token.startsWith(prefix) || token.length > maximum) {
    throw sharedError('SHARED_TOKEN_INVALID');
  }
  const bytes = fromBase64Url(token.slice(prefix.length));
  if (!bytes.length || bytes.length > MAX_DECODED_BYTES) throw sharedError('SHARED_PAYLOAD_SIZE_INVALID');
  const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assertNoDuplicateTopLevelKeys(json);
  return JSON.parse(json);
}

function exactFragment(hash, key) {
  const raw = String(hash ?? '').replace(/^#/u, '');
  if (!raw) return { status: 'none' };
  const parameters = new URLSearchParams(raw);
  const values = parameters.getAll(key);
  const entries = [...parameters.entries()];
  if (values.length === 0) return { status: 'none' };
  if (values.length !== 1 || entries.length !== 1 || entries[0][0] !== key) return { status: 'invalid' };
  return { status: 'token', token: values[0] };
}

function safeUrl(baseUrl, fragmentKey, token) {
  let url;
  try { url = new URL(baseUrl); } catch { throw sharedError('SHARED_BASE_URL_INVALID'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw sharedError('SHARED_BASE_URL_INVALID');
  }
  url.search = '';
  url.hash = `${fragmentKey}=${token}`;
  return url.toString();
}

function invitePayload(invite) {
  return {
    v: invite.version,
    mi: invite.missionInstanceId,
    ai: invite.initiatorRealmId,
    an: invite.initiatorName,
    at: invite.initiatorTheme,
    bi: invite.linkedRealmId,
    bn: invite.linkedName,
    bt: invite.linkedTheme,
    rel: invite.relationshipId,
    m: invite.missionId,
    s: invite.scheduleId,
    c: invite.createdAtMinute,
    st: invite.startMinute,
    e: invite.endMinute,
  };
}

function receiptPayload(receipt) {
  return {
    v: receipt.version,
    sm: receipt.sharedMissionId,
    co: receipt.completionId,
    id: receipt.receiptId,
    rel: receipt.relationshipId,
    ai: receipt.initiatorRealmId,
    an: receipt.initiatorName,
    at: receipt.initiatorTheme,
    bi: receipt.linkedRealmId,
    bn: receipt.linkedName,
    bt: receipt.linkedTheme,
    tr: receipt.targetRealmId,
    m: receipt.missionId,
    ro: receipt.roleId,
    rt: receipt.routeId,
    c: receipt.contribution,
    d: receipt.districtId,
  };
}

export function isValidSharedMissionInvite(value, { now = Date.now(), allowExpired = true } = {}) {
  if (!exactObject(value, INVITE_FIELDS)
    || value.version !== SHARED_MISSION_VERSION
    || !validIdentifier(value.missionInstanceId)
    || !validIdentifier(value.initiatorRealmId)
    || !validName(value.initiatorName)
    || !validTheme(value.initiatorTheme)
    || !validIdentifier(value.linkedRealmId)
    || !validName(value.linkedName)
    || !validTheme(value.linkedTheme)
    || value.initiatorRealmId === value.linkedRealmId
    || !validIdentifier(value.relationshipId)
    || !MISSIONS.has(value.missionId)
    || !SCHEDULES.has(value.scheduleId)) return false;
  try {
    const schedule = normalizeMissionScheduleWindow(value, { now });
    if (schedule.scheduleId !== value.scheduleId || schedule.createdAtMinute !== value.createdAtMinute) return false;
    return allowExpired || classifyMissionSchedule(value, now).state !== 'expired';
  } catch {
    return false;
  }
}

export function encodeSharedMissionInvite(invite) {
  if (!isValidSharedMissionInvite(invite)) throw sharedError('SHARED_INVITE_INVALID');
  return encodePayload(INVITE_PREFIX, invitePayload(invite), MAX_INVITE_TOKEN_LENGTH);
}

export function decodeSharedMissionInvite(token, { now = Date.now() } = {}) {
  const payload = decodePayload(token, INVITE_PREFIX, MAX_INVITE_TOKEN_LENGTH);
  if (!exactObject(payload, new Set(['v', 'mi', 'ai', 'an', 'at', 'bi', 'bn', 'bt', 'rel', 'm', 's', 'c', 'st', 'e']))) {
    throw sharedError('SHARED_INVITE_FIELDS_INVALID');
  }
  const invite = Object.freeze({
    version: payload.v,
    missionInstanceId: payload.mi,
    initiatorRealmId: payload.ai,
    initiatorName: payload.an,
    initiatorTheme: payload.at,
    linkedRealmId: payload.bi,
    linkedName: payload.bn,
    linkedTheme: payload.bt,
    relationshipId: payload.rel,
    missionId: payload.m,
    scheduleId: payload.s,
    createdAtMinute: payload.c,
    startMinute: payload.st,
    endMinute: payload.e,
  });
  if (!isValidSharedMissionInvite(invite, { now })) throw sharedError('SHARED_INVITE_INVALID');
  return invite;
}

export function parseSharedMissionInviteFragment(hash, options = {}) {
  const fragment = exactFragment(hash, SHARED_MISSION_INVITE_FRAGMENT);
  if (fragment.status !== 'token') return fragment;
  try { return { status: 'valid', invite: decodeSharedMissionInvite(fragment.token, options) }; }
  catch { return { status: 'invalid' }; }
}

export function createSharedMissionInvite(storage, realm, collaboration, input = {}, {
  now = Date.now(),
  cryptoLike = globalThis.crypto,
  baseUrl = globalThis.location ? `${globalThis.location.origin}${globalThis.location.pathname}` : '',
} = {}) {
  if (!isValidRealmCollaborationRecord(collaboration)
    || collaboration.localRealmId !== realm?.id
    || collaboration.sourceRealmId === realm?.id
    || collaboration.sourceName === realm?.name && collaboration.sourceRealmId === realm?.id) return { status: 'ineligible' };
  const inspected = inspectRealmCollaboration(storage, realm.id);
  if (inspected.status !== 'ready') return { status: inspected.status === 'empty' ? 'ineligible' : 'invalid-storage' };
  if (JSON.stringify(inspected.record) !== JSON.stringify(collaboration)) return { status: 'mismatch' };
  if (!validIdentifier(realm.id) || !validName(realm.name) || !validTheme(realm.theme)) return { status: 'invalid' };
  if (!MISSIONS.has(input.missionId) || !SCHEDULES.has(input.scheduleId)) return { status: 'invalid' };
  try {
    const createdAtMinute = toEpochMinute(now);
    const schedule = createMissionSchedule(input.scheduleId, createdAtMinute, { now });
    const invite = Object.freeze({
      version: SHARED_MISSION_VERSION,
      missionInstanceId: createOpaqueIdentifier(cryptoLike),
      initiatorRealmId: realm.id,
      initiatorName: realm.name,
      initiatorTheme: realm.theme,
      linkedRealmId: collaboration.sourceRealmId,
      linkedName: collaboration.sourceName,
      linkedTheme: collaboration.sourceTheme,
      relationshipId: collaboration.proposalId,
      missionId: input.missionId,
      scheduleId: input.scheduleId,
      createdAtMinute,
      startMinute: schedule.startMinute,
      endMinute: schedule.endMinute,
    });
    const token = encodeSharedMissionInvite(invite);
    return Object.freeze({ status: 'ready', invite, token, url: safeUrl(baseUrl, SHARED_MISSION_INVITE_FRAGMENT, token) });
  } catch {
    return { status: 'invalid' };
  }
}

export function classifySharedMissionInvite(invite, now = Date.now()) {
  if (!isValidSharedMissionInvite(invite, { now })) return { status: 'invalid' };
  try { return { status: 'ready', state: classifyMissionSchedule(invite, now).state }; }
  catch { return { status: 'invalid' }; }
}

export function isValidSharedMissionReceipt(value) {
  if (!exactObject(value, RECEIPT_FIELDS)
    || value.version !== SHARED_MISSION_VERSION
    || !validIdentifier(value.sharedMissionId)
    || !validIdentifier(value.completionId)
    || !validIdentifier(value.receiptId)
    || !validIdentifier(value.relationshipId)
    || !validIdentifier(value.initiatorRealmId)
    || !validName(value.initiatorName)
    || !validTheme(value.initiatorTheme)
    || !validIdentifier(value.linkedRealmId)
    || !validName(value.linkedName)
    || !validTheme(value.linkedTheme)
    || value.initiatorRealmId === value.linkedRealmId
    || ![value.initiatorRealmId, value.linkedRealmId].includes(value.targetRealmId)
    || !MISSIONS.has(value.missionId)
    || !ROLES.has(value.roleId)
    || !ROUTES.has(value.routeId)
    || value.contribution !== DISTRICT_CONTRIBUTION
    || value.districtId !== DISTRICT_ID) return false;
  return true;
}

export function encodeSharedMissionReceipt(receipt) {
  if (!isValidSharedMissionReceipt(receipt)) throw sharedError('SHARED_RECEIPT_INVALID');
  return encodePayload(RECEIPT_PREFIX, receiptPayload(receipt), MAX_RECEIPT_TOKEN_LENGTH);
}

export function decodeSharedMissionReceipt(token) {
  const payload = decodePayload(token, RECEIPT_PREFIX, MAX_RECEIPT_TOKEN_LENGTH);
  if (!exactObject(payload, new Set(['v', 'sm', 'co', 'id', 'rel', 'ai', 'an', 'at', 'bi', 'bn', 'bt', 'tr', 'm', 'ro', 'rt', 'c', 'd']))) {
    throw sharedError('SHARED_RECEIPT_FIELDS_INVALID');
  }
  const receipt = Object.freeze({
    version: payload.v,
    sharedMissionId: payload.sm,
    completionId: payload.co,
    receiptId: payload.id,
    relationshipId: payload.rel,
    initiatorRealmId: payload.ai,
    initiatorName: payload.an,
    initiatorTheme: payload.at,
    linkedRealmId: payload.bi,
    linkedName: payload.bn,
    linkedTheme: payload.bt,
    targetRealmId: payload.tr,
    missionId: payload.m,
    roleId: payload.ro,
    routeId: payload.rt,
    contribution: payload.c,
    districtId: payload.d,
  });
  if (!isValidSharedMissionReceipt(receipt)) throw sharedError('SHARED_RECEIPT_INVALID');
  return receipt;
}

export function parseSharedMissionReceiptFragment(hash) {
  const fragment = exactFragment(hash, SHARED_MISSION_RECEIPT_FRAGMENT);
  if (fragment.status !== 'token') return fragment;
  try { return { status: 'valid', receipt: decodeSharedMissionReceipt(fragment.token) }; }
  catch { return { status: 'invalid' }; }
}

function targetReceipt(invite, targetRealmId, completionId, receiptId, roleId, routeId) {
  return Object.freeze({
    version: SHARED_MISSION_VERSION,
    sharedMissionId: invite.missionInstanceId,
    completionId,
    receiptId,
    relationshipId: invite.relationshipId,
    initiatorRealmId: invite.initiatorRealmId,
    initiatorName: invite.initiatorName,
    initiatorTheme: invite.initiatorTheme,
    linkedRealmId: invite.linkedRealmId,
    linkedName: invite.linkedName,
    linkedTheme: invite.linkedTheme,
    targetRealmId,
    missionId: invite.missionId,
    roleId,
    routeId,
    contribution: DISTRICT_CONTRIBUTION,
    districtId: DISTRICT_ID,
  });
}

export function createSharedMissionReceipts(invite, { roleId, routeId } = {}, {
  cryptoLike = globalThis.crypto,
  baseUrl = globalThis.location ? `${globalThis.location.origin}${globalThis.location.pathname}` : '',
  now = Date.now(),
} = {}) {
  if (!isValidSharedMissionInvite(invite, { now }) || classifySharedMissionInvite(invite, now).state !== 'active') {
    return { status: 'inactive' };
  }
  if (!ROLES.has(roleId) || !ROUTES.has(routeId)) return { status: 'invalid' };
  try {
    const completionId = createOpaqueIdentifier(cryptoLike);
    const firstId = createOpaqueIdentifier(cryptoLike);
    const secondId = createOpaqueIdentifier(cryptoLike);
    if (new Set([completionId, firstId, secondId, invite.missionInstanceId]).size !== 4) throw sharedError('SHARED_IDENTIFIERS_REUSED');
    const first = targetReceipt(invite, invite.initiatorRealmId, completionId, firstId, roleId, routeId);
    const second = targetReceipt(invite, invite.linkedRealmId, completionId, secondId, roleId, routeId);
    const firstToken = encodeSharedMissionReceipt(first);
    const secondToken = encodeSharedMissionReceipt(second);
    return Object.freeze({
      status: 'ready',
      completionId,
      receipts: Object.freeze([
        Object.freeze({ targetRealmId: first.targetRealmId, targetName: invite.initiatorName, receipt: first, token: firstToken, url: safeUrl(baseUrl, SHARED_MISSION_RECEIPT_FRAGMENT, firstToken) }),
        Object.freeze({ targetRealmId: second.targetRealmId, targetName: invite.linkedName, receipt: second, token: secondToken, url: safeUrl(baseUrl, SHARED_MISSION_RECEIPT_FRAGMENT, secondToken) }),
      ]),
    });
  } catch {
    return { status: 'invalid' };
  }
}

function matchingPair(receipt, realm, collaboration) {
  if (receipt.targetRealmId !== realm.id || collaboration.localRealmId !== realm.id) return false;
  if (collaboration.proposalId !== receipt.relationshipId) return false;
  if (realm.id === receipt.initiatorRealmId) {
    return realm.name === receipt.initiatorName
      && realm.theme === receipt.initiatorTheme
      && collaboration.sourceRealmId === receipt.linkedRealmId
      && collaboration.sourceName === receipt.linkedName
      && collaboration.sourceTheme === receipt.linkedTheme;
  }
  if (realm.id === receipt.linkedRealmId) {
    return realm.name === receipt.linkedName
      && realm.theme === receipt.linkedTheme
      && collaboration.sourceRealmId === receipt.initiatorRealmId
      && collaboration.sourceName === receipt.initiatorName
      && collaboration.sourceTheme === receipt.initiatorTheme;
  }
  return false;
}

export function inspectSharedMissionReceiptForCreator(storage, receipt) {
  if (!isValidSharedMissionReceipt(receipt)) return { status: 'invalid' };
  const single = getSingleCreatorRealm(storage);
  if (single.status !== 'ready') return { status: single.status === 'invalid' ? 'invalid-storage' : 'no-realm' };
  if (single.realm.id !== receipt.targetRealmId) return { status: 'wrong-realm', realm: single.realm };
  const collaboration = inspectRealmCollaboration(storage, single.realm.id);
  if (collaboration.status === 'empty') return { status: 'collaboration-removed', realm: single.realm };
  if (collaboration.status !== 'ready') return { status: 'invalid-storage', realm: single.realm };
  if (!matchingPair(receipt, single.realm, collaboration.record)) return { status: 'mismatch', realm: single.realm };
  return { status: 'ready', realm: single.realm, collaboration: collaboration.record };
}

export function importSharedMissionReceipt(storage, receipt) {
  const inspected = inspectSharedMissionReceiptForCreator(storage, receipt);
  if (inspected.status !== 'ready') return inspected;
  const outcome = importCompletionReceipt(storage, {
    realmId: receipt.targetRealmId,
    receiptId: receipt.receiptId,
    missionId: receipt.missionId,
    roleId: receipt.roleId,
    routeId: receipt.routeId,
    contribution: receipt.contribution,
    districtId: receipt.districtId,
  });
  return outcome.status === 'mismatch' ? { status: 'mismatch', realm: outcome.realm } : outcome;
}

export function writeSharedMissionInvitePreview(storage, invite) {
  if (!isValidSharedMissionInvite(invite)) throw sharedError('SHARED_INVITE_INVALID');
  storage.setItem(SHARED_MISSION_INVITE_KEY, JSON.stringify(invite));
}

export function readSharedMissionInvitePreview(storage, { now = Date.now() } = {}) {
  try {
    const parsed = JSON.parse(storage?.getItem(SHARED_MISSION_INVITE_KEY) || 'null');
    return isValidSharedMissionInvite(parsed, { now }) ? Object.freeze(parsed) : null;
  } catch { return null; }
}

export function writeSharedMissionReceiptPreview(storage, receipt) {
  if (!isValidSharedMissionReceipt(receipt)) throw sharedError('SHARED_RECEIPT_INVALID');
  storage.setItem(SHARED_MISSION_RECEIPT_KEY, JSON.stringify(receipt));
}

export function readSharedMissionReceiptPreview(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(SHARED_MISSION_RECEIPT_KEY) || 'null');
    return isValidSharedMissionReceipt(parsed) ? Object.freeze(parsed) : null;
  } catch { return null; }
}

export function clearSharedMissionPreviews(storage) {
  try {
    storage?.removeItem(SHARED_MISSION_INVITE_KEY);
    storage?.removeItem(SHARED_MISSION_RECEIPT_KEY);
    storage?.removeItem(SHARED_MISSION_PROGRESS_KEY);
  } catch {}
}

export function isValidSharedMissionProgress(value, invite) {
  if (!exactObject(value, PROGRESS_FIELDS)
    || value.version !== SHARED_MISSION_VERSION
    || value.missionInstanceId !== invite?.missionInstanceId
    || !['', ...ROLES].includes(value.roleId)
    || !Number.isInteger(value.step)
    || value.step < 0
    || value.step > 3
    || typeof value.completed !== 'boolean'
    || !['', ...ROUTES].includes(value.routeId)) return false;
  if (value.result === null) return !value.completed;
  if (!value.completed || !exactObject(value.result, RESULT_FIELDS) || !validIdentifier(value.result.completionId)) return false;
  if (!Array.isArray(value.result.receipts) || value.result.receipts.length !== 2) return false;
  return value.result.receipts.every(item => exactObject(item, RESULT_RECEIPT_FIELDS)
    && validIdentifier(item.targetRealmId)
    && validName(item.targetName)
    && typeof item.token === 'string'
    && typeof item.url === 'string'
    && parseSharedMissionReceiptFragment(`#${SHARED_MISSION_RECEIPT_FRAGMENT}=${item.token}`).status === 'valid');
}

export function createEmptySharedMissionProgress(invite) {
  if (!isValidSharedMissionInvite(invite)) throw sharedError('SHARED_INVITE_INVALID');
  return Object.freeze({
    version: SHARED_MISSION_VERSION,
    missionInstanceId: invite.missionInstanceId,
    roleId: '',
    step: 0,
    completed: false,
    routeId: '',
    result: null,
  });
}

export function readSharedMissionProgress(storage, invite) {
  try {
    const parsed = JSON.parse(storage?.getItem(SHARED_MISSION_PROGRESS_KEY) || 'null');
    return isValidSharedMissionProgress(parsed, invite) ? Object.freeze(parsed) : createEmptySharedMissionProgress(invite);
  } catch { return createEmptySharedMissionProgress(invite); }
}

export function writeSharedMissionProgress(storage, progress, invite) {
  if (!isValidSharedMissionProgress(progress, invite)) throw sharedError('SHARED_PROGRESS_INVALID');
  storage.setItem(SHARED_MISSION_PROGRESS_KEY, JSON.stringify(progress));
}

export const sharedMissionLimits = Object.freeze({
  maxInviteTokenLength: MAX_INVITE_TOKEN_LENGTH,
  maxReceiptTokenLength: MAX_RECEIPT_TOKEN_LENGTH,
  maxDecodedBytes: MAX_DECODED_BYTES,
});
