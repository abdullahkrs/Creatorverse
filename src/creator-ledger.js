import { completionReceiptLimits } from './completion-receipt.js';
import { DISTRICT_CONTRIBUTION, DISTRICT_ID } from './district-progress.js';
import { MISSION_TEMPLATE_IDS } from './mission-templates.js';
import { MISSION_SCHEDULE_IDS, classifyMissionSchedule } from './mission-schedule.js';

export const CREATOR_LEDGER_KEY = 'creatorverse-creator-ledger-v1';
export const CREATOR_LEDGER_VERSION = 1;
export const CREATOR_LEDGER_LIMIT = 24;
export const CREATOR_MISSION_LIMIT = 24;
const REALM_LIMIT = 8;
const THEMES = new Set(['cosmic', 'wild', 'future']);
const MISSIONS = new Set(MISSION_TEMPLATE_IDS);
const SCHEDULES = new Set(MISSION_SCHEDULE_IDS);
const ROLES = new Set(['builder', 'explorer', 'guardian']);
const ROUTES = new Set(['sky', 'ocean']);
const STATE_FIELDS = new Set(['version', 'realms']);
const LEGACY_REALM_FIELDS = new Set(['id', 'name', 'theme', 'total', 'districtId', 'unlocked', 'receipts']);
const EXTENDED_REALM_FIELDS = new Set([...LEGACY_REALM_FIELDS, 'missions']);
const LEGACY_ENTRY_FIELDS = new Set(['id', 'missionId', 'roleId', 'routeId', 'districtId', 'contribution']);
const EXTENDED_ENTRY_FIELDS = new Set([...LEGACY_ENTRY_FIELDS, 'missionInstanceId']);
const MISSION_FIELDS = new Set(['id', 'missionId', 'scheduleId', 'createdAtMinute', 'consumed']);
const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

function plainObject(value, fields) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === fields.size
    && Object.keys(value).every(key => fields.has(key));
}

function validIdentifier(value) {
  return typeof value === 'string'
    && !CONTROL_OR_BIDI.test(value)
    && completionReceiptLimits.identifierPattern.test(value);
}

function validName(value) {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 28
    && !CONTROL_OR_BIDI.test(value)
    && !/[<>]/u.test(value);
}

function validMissionInstance(mission) {
  return plainObject(mission, MISSION_FIELDS)
    && validIdentifier(mission.id)
    && MISSIONS.has(mission.missionId)
    && SCHEDULES.has(mission.scheduleId)
    && Number.isSafeInteger(mission.createdAtMinute)
    && mission.createdAtMinute >= 0
    && typeof mission.consumed === 'boolean';
}

function isPendingMission(mission, now = Date.now()) {
  if (mission.consumed) return false;
  try {
    return classifyMissionSchedule({
      scheduleId: mission.scheduleId,
      createdAtMinute: mission.createdAtMinute,
    }, now).state !== 'expired';
  } catch {
    return false;
  }
}

function validEntry(entry) {
  const fields = Object.hasOwn(entry || {}, 'missionInstanceId') ? EXTENDED_ENTRY_FIELDS : LEGACY_ENTRY_FIELDS;
  return plainObject(entry, fields)
    && validIdentifier(entry.id)
    && (!Object.hasOwn(entry, 'missionInstanceId') || validIdentifier(entry.missionInstanceId))
    && MISSIONS.has(entry.missionId)
    && ROLES.has(entry.roleId)
    && ROUTES.has(entry.routeId)
    && entry.districtId === DISTRICT_ID
    && entry.contribution === DISTRICT_CONTRIBUTION;
}

function validRealm(realm) {
  const hasMissions = Object.hasOwn(realm || {}, 'missions');
  const fields = hasMissions ? EXTENDED_REALM_FIELDS : LEGACY_REALM_FIELDS;
  if (!plainObject(realm, fields)
    || !validIdentifier(realm.id)
    || !validName(realm.name)
    || !THEMES.has(realm.theme)
    || !Number.isInteger(realm.total)
    || realm.total < 0
    || realm.total > CREATOR_LEDGER_LIMIT * DISTRICT_CONTRIBUTION
    || realm.districtId !== DISTRICT_ID
    || typeof realm.unlocked !== 'boolean'
    || !Array.isArray(realm.receipts)
    || realm.receipts.length > CREATOR_LEDGER_LIMIT
    || !realm.receipts.every(validEntry)
    || new Set(realm.receipts.map(entry => entry.id)).size !== realm.receipts.length
    || realm.total !== realm.receipts.length * DISTRICT_CONTRIBUTION
    || realm.unlocked !== (realm.total >= DISTRICT_CONTRIBUTION)) {
    return false;
  }

  const instanceEntries = realm.receipts.filter(entry => Object.hasOwn(entry, 'missionInstanceId'));
  if (!hasMissions) return instanceEntries.length === 0;
  if (!Array.isArray(realm.missions)
    || realm.missions.length > CREATOR_MISSION_LIMIT
    || !realm.missions.every(validMissionInstance)
    || new Set(realm.missions.map(mission => mission.id)).size !== realm.missions.length) {
    return false;
  }
  const byInstance = new Map(instanceEntries.map(entry => [entry.missionInstanceId, entry]));
  if (byInstance.size !== instanceEntries.length) return false;
  return realm.missions.every(mission => {
    const entry = byInstance.get(mission.id);
    return mission.consumed
      ? Boolean(entry && entry.missionId === mission.missionId)
      : !entry;
  }) && instanceEntries.every(entry => realm.missions.some(mission => mission.id === entry.missionInstanceId));
}

function emptyState() {
  return { version: CREATOR_LEDGER_VERSION, realms: [] };
}

function validateState(value) {
  return plainObject(value, STATE_FIELDS)
    && value.version === CREATOR_LEDGER_VERSION
    && Array.isArray(value.realms)
    && value.realms.length <= REALM_LIMIT
    && value.realms.every(validRealm)
    && new Set(value.realms.map(realm => realm.id)).size === value.realms.length;
}

export function restoreCreatorLedger(value) {
  return validateState(value) ? structuredClone(value) : emptyState();
}

export function inspectCreatorLedger(storage = globalThis.localStorage) {
  try {
    const serialized = storage?.getItem(CREATOR_LEDGER_KEY);
    if (!serialized) return { status: 'empty', state: emptyState() };
    const parsed = JSON.parse(serialized);
    if (!validateState(parsed)) return { status: 'invalid', state: emptyState() };
    return { status: 'ready', state: structuredClone(parsed) };
  } catch {
    return { status: 'invalid', state: emptyState() };
  }
}

export function readCreatorLedger(storage = globalThis.localStorage) {
  return inspectCreatorLedger(storage).state;
}

function writeCreatorLedger(storage, state) {
  if (!validateState(state)) throw new TypeError('INVALID_CREATOR_LEDGER_STATE');
  storage.setItem(CREATOR_LEDGER_KEY, JSON.stringify(state));
}

export function saveCreatorRealm(storage, { realmId, name, theme }) {
  if (!validIdentifier(realmId)) throw new TypeError('INVALID_REALM_ID');
  const normalizedName = String(name ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!validName(normalizedName)) throw new TypeError('INVALID_REALM_NAME');
  if (!THEMES.has(theme)) throw new TypeError('INVALID_REALM_THEME');

  const state = readCreatorLedger(storage);
  const existingIndex = state.realms.findIndex(realm => realm.id === realmId);
  if (existingIndex >= 0) {
    const existing = state.realms[existingIndex];
    state.realms[existingIndex] = { ...existing, name: normalizedName, theme };
  } else {
    state.realms.push({
      id: realmId,
      name: normalizedName,
      theme,
      total: 0,
      districtId: DISTRICT_ID,
      unlocked: false,
      receipts: [],
    });
    if (state.realms.length > REALM_LIMIT) state.realms.splice(0, state.realms.length - REALM_LIMIT);
  }
  writeCreatorLedger(storage, state);
  return getCreatorRealm(storage, realmId);
}

export function getCreatorRealm(storage, realmId) {
  if (!validIdentifier(realmId)) return null;
  const state = readCreatorLedger(storage);
  const realm = state.realms.find(candidate => candidate.id === realmId);
  return realm ? structuredClone(realm) : null;
}

export function getSingleCreatorRealm(storage = globalThis.localStorage) {
  const inspected = inspectCreatorLedger(storage);
  if (inspected.status !== 'ready' || inspected.state.realms.length !== 1) {
    return { status: inspected.status === 'invalid' ? 'invalid' : 'unavailable', realm: null };
  }
  return { status: 'ready', realm: structuredClone(inspected.state.realms[0]) };
}

export function getPendingCreatorMission(storage, realmId, { now = Date.now() } = {}) {
  const realm = getCreatorRealm(storage, realmId);
  if (!realm || !Array.isArray(realm.missions)) return null;
  const pending = [...realm.missions].reverse().find(mission => isPendingMission(mission, now));
  return pending ? structuredClone(pending) : null;
}

export function issueCreatorMission(storage, input = {}, { now = Date.now() } = {}) {
  if (!validIdentifier(input.realmId) || !validIdentifier(input.missionInstanceId)) return { status: 'invalid' };
  if (!MISSIONS.has(input.missionId) || !SCHEDULES.has(input.scheduleId)) return { status: 'invalid' };
  if (!Number.isSafeInteger(input.createdAtMinute) || input.createdAtMinute < 0) return { status: 'invalid' };
  try {
    classifyMissionSchedule({
      scheduleId: input.scheduleId,
      createdAtMinute: input.createdAtMinute,
    }, now);
  } catch {
    return { status: 'invalid' };
  }

  const inspected = inspectCreatorLedger(storage);
  if (inspected.status !== 'ready') return { status: inspected.status === 'invalid' ? 'invalid-storage' : 'mismatch' };
  const realmIndex = inspected.state.realms.findIndex(realm => realm.id === input.realmId);
  if (realmIndex < 0) return { status: 'mismatch' };
  const realm = inspected.state.realms[realmIndex];
  const missions = Array.isArray(realm.missions) ? realm.missions : [];
  const pending = missions.find(mission => isPendingMission(mission, now));
  if (pending) return { status: 'pending', realm: structuredClone(realm), mission: structuredClone(pending) };
  if (missions.some(mission => mission.id === input.missionInstanceId)) return { status: 'duplicate', realm: structuredClone(realm) };
  if (missions.length >= CREATOR_MISSION_LIMIT) return { status: 'full', realm: structuredClone(realm) };

  const mission = {
    id: input.missionInstanceId,
    missionId: input.missionId,
    scheduleId: input.scheduleId,
    createdAtMinute: input.createdAtMinute,
    consumed: false,
  };
  const updatedRealm = { ...realm, missions: [...missions, mission] };
  const nextState = structuredClone(inspected.state);
  nextState.realms[realmIndex] = updatedRealm;
  try {
    writeCreatorLedger(storage, nextState);
  } catch {
    return { status: 'storage-error', realm: structuredClone(realm) };
  }
  return { status: 'success', realm: structuredClone(updatedRealm), mission: structuredClone(mission) };
}

export function importCompletionReceipt(storage, receipt) {
  if (!receipt || typeof receipt !== 'object') return { status: 'invalid' };
  if (!validIdentifier(receipt.realmId) || !validIdentifier(receipt.receiptId)) return { status: 'invalid' };
  if (Object.hasOwn(receipt, 'missionInstanceId') && !validIdentifier(receipt.missionInstanceId)) return { status: 'invalid' };
  if (!MISSIONS.has(receipt.missionId) || !ROLES.has(receipt.roleId) || !ROUTES.has(receipt.routeId)) {
    return { status: 'invalid' };
  }
  if (receipt.districtId !== DISTRICT_ID || receipt.contribution !== DISTRICT_CONTRIBUTION) {
    return { status: 'invalid' };
  }

  const inspected = inspectCreatorLedger(storage);
  if (inspected.status !== 'ready') return { status: inspected.status === 'invalid' ? 'invalid' : 'mismatch' };
  const state = inspected.state;
  const realmIndex = state.realms.findIndex(realm => realm.id === receipt.realmId);
  if (realmIndex < 0) return { status: 'mismatch' };
  const realm = state.realms[realmIndex];
  if (realm.receipts.some(entry => entry.id === receipt.receiptId)) {
    return { status: 'duplicate', realm: structuredClone(realm) };
  }
  if (realm.receipts.length >= CREATOR_LEDGER_LIMIT) {
    return { status: 'full', realm: structuredClone(realm) };
  }

  let missions = Array.isArray(realm.missions) ? realm.missions : null;
  let missionIndex = -1;
  if (receipt.missionInstanceId) {
    missionIndex = missions?.findIndex(mission => mission.id === receipt.missionInstanceId) ?? -1;
    if (missionIndex < 0 || missions[missionIndex].missionId !== receipt.missionId) {
      return { status: 'mismatch', realm: structuredClone(realm) };
    }
    if (missions[missionIndex].consumed
      || realm.receipts.some(entry => entry.missionInstanceId === receipt.missionInstanceId)) {
      return { status: 'duplicate', realm: structuredClone(realm) };
    }
  }

  const entry = {
    id: receipt.receiptId,
    missionId: receipt.missionId,
    roleId: receipt.roleId,
    routeId: receipt.routeId,
    districtId: receipt.districtId,
    contribution: DISTRICT_CONTRIBUTION,
  };
  if (receipt.missionInstanceId) entry.missionInstanceId = receipt.missionInstanceId;
  if (missionIndex >= 0) {
    missions = missions.map((mission, index) => index === missionIndex ? { ...mission, consumed: true } : mission);
  }
  const updatedRealm = {
    ...realm,
    total: realm.total + DISTRICT_CONTRIBUTION,
    unlocked: true,
    receipts: [...realm.receipts, entry],
    ...(missions ? { missions } : {}),
  };
  const nextState = structuredClone(state);
  nextState.realms[realmIndex] = updatedRealm;

  try {
    writeCreatorLedger(storage, nextState);
  } catch {
    return { status: 'storage-error', realm: structuredClone(realm) };
  }
  return { status: 'success', realm: structuredClone(updatedRealm), entry: structuredClone(entry) };
}
