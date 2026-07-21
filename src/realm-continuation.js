import { createOpaqueIdentifier } from './completion-receipt.js';
import {
  getPendingCreatorMission,
  getSingleCreatorRealm,
  issueCreatorMission,
} from './creator-ledger.js';
import { MISSION_TEMPLATE_IDS, normalizeMissionTemplateId } from './mission-templates.js';
import { MISSION_SCHEDULE_IDS, normalizeMissionScheduleId, toEpochMinute } from './mission-schedule.js';
import { buildPrototypeInviteUrl, createPrototypeInvite } from './prototype-invite.js';

export const REALM_CONTINUATION_DRAFT_KEY = 'creatorverse-realm-continuation-draft-v1';
export const REALM_CONTINUATION_DRAFT_VERSION = 1;
const DRAFT_FIELDS = new Set(['version', 'realmId', 'open', 'missionId', 'scheduleId']);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{16,64}$/u;
const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function exactObject(value, fields) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === fields.size
    && Object.keys(value).every(key => fields.has(key));
}

function validIdentifier(value) {
  return typeof value === 'string' && !CONTROL_OR_BIDI.test(value) && IDENTIFIER_PATTERN.test(value);
}

function defaultDraft(realmId) {
  return {
    version: REALM_CONTINUATION_DRAFT_VERSION,
    realmId,
    open: false,
    missionId: MISSION_TEMPLATE_IDS[0],
    scheduleId: MISSION_SCHEDULE_IDS[0],
  };
}

export function restoreRealmContinuationDraft(value, realmId) {
  if (!validIdentifier(realmId) || !exactObject(value, DRAFT_FIELDS)) return defaultDraft(realmId);
  if (value.version !== REALM_CONTINUATION_DRAFT_VERSION
    || value.realmId !== realmId
    || typeof value.open !== 'boolean') {
    return defaultDraft(realmId);
  }
  try {
    return {
      version: REALM_CONTINUATION_DRAFT_VERSION,
      realmId,
      open: value.open,
      missionId: normalizeMissionTemplateId(value.missionId, { fallback: false }),
      scheduleId: normalizeMissionScheduleId(value.scheduleId),
    };
  } catch {
    return defaultDraft(realmId);
  }
}

export function readRealmContinuationDraft(storage, realmId) {
  try {
    return restoreRealmContinuationDraft(JSON.parse(storage?.getItem(REALM_CONTINUATION_DRAFT_KEY) || 'null'), realmId);
  } catch {
    return defaultDraft(realmId);
  }
}

export function writeRealmContinuationDraft(storage, draft) {
  const restored = restoreRealmContinuationDraft(draft, draft?.realmId);
  storage.setItem(REALM_CONTINUATION_DRAFT_KEY, JSON.stringify(restored));
  return structuredClone(restored);
}

export function clearRealmContinuationDraft(storage) {
  storage?.removeItem(REALM_CONTINUATION_DRAFT_KEY);
}

function buildInvite(realm, mission, { now = Date.now(), baseUrl } = {}) {
  const token = createPrototypeInvite({
    name: realm.name,
    theme: realm.theme,
    promise: '',
    realmId: realm.id,
    missionInstanceId: mission.id,
    missionId: mission.missionId,
    scheduleId: mission.scheduleId,
    createdAtMinute: mission.createdAtMinute,
  }, { now });
  return Object.freeze({
    token,
    url: baseUrl ? buildPrototypeInviteUrl(baseUrl, token, { now }) : null,
    realm: structuredClone(realm),
    mission: structuredClone(mission),
  });
}

export function restorePendingRealmContinuationInvite(storage, options = {}) {
  const single = getSingleCreatorRealm(storage);
  if (single.status !== 'ready') return { status: single.status };
  const mission = getPendingCreatorMission(storage, single.realm.id);
  if (!mission) return { status: 'none', realm: single.realm };
  try {
    return { status: 'ready', ...buildInvite(single.realm, mission, options) };
  } catch {
    return { status: 'invalid-storage' };
  }
}

export function createRealmContinuationInvite(storage, input = {}, options = {}) {
  const single = getSingleCreatorRealm(storage);
  if (single.status !== 'ready') return { status: single.status };
  let missionId;
  let scheduleId;
  try {
    missionId = normalizeMissionTemplateId(input.missionId, { fallback: false });
    scheduleId = normalizeMissionScheduleId(input.scheduleId);
  } catch {
    return { status: 'invalid' };
  }

  const pending = getPendingCreatorMission(storage, single.realm.id);
  if (pending) {
    try {
      return { status: 'ready', reused: true, ...buildInvite(single.realm, pending, options) };
    } catch {
      return { status: 'invalid-storage' };
    }
  }

  let missionInstanceId;
  let createdAtMinute;
  try {
    missionInstanceId = createOpaqueIdentifier(options.cryptoLike);
    createdAtMinute = toEpochMinute(options.now ?? Date.now());
  } catch {
    return { status: 'unavailable' };
  }
  const mission = { id: missionInstanceId, missionId, scheduleId, createdAtMinute, consumed: false };
  let invite;
  try {
    invite = buildInvite(single.realm, mission, options);
  } catch {
    return { status: 'invalid' };
  }

  const issued = issueCreatorMission(storage, {
    realmId: single.realm.id,
    missionInstanceId,
    missionId,
    scheduleId,
    createdAtMinute,
  });
  if (issued.status === 'pending') {
    try {
      return { status: 'ready', reused: true, ...buildInvite(issued.realm, issued.mission, options) };
    } catch {
      return { status: 'invalid-storage' };
    }
  }
  if (issued.status !== 'success') return { status: issued.status };
  return { status: 'ready', reused: false, ...invite, realm: issued.realm };
}
