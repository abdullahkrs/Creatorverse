import { completionReceiptLimits } from './completion-receipt.js';
import { DISTRICT_CONTRIBUTION, DISTRICT_ID } from './district-progress.js';

export const CREATOR_LEDGER_KEY = 'creatorverse-creator-ledger-v1';
export const CREATOR_LEDGER_VERSION = 1;
export const CREATOR_LEDGER_LIMIT = 24;
const REALM_LIMIT = 8;
const THEMES = new Set(['cosmic', 'wild', 'future']);
const MISSIONS = new Set(['route-choice', 'relay-sequence', 'signal-match']);
const ROLES = new Set(['builder', 'explorer', 'guardian']);
const ROUTES = new Set(['sky', 'ocean']);
const STATE_FIELDS = new Set(['version', 'realms']);
const REALM_FIELDS = new Set(['id', 'name', 'theme', 'total', 'districtId', 'unlocked', 'receipts']);
const ENTRY_FIELDS = new Set(['id', 'missionId', 'roleId', 'routeId', 'districtId', 'contribution']);
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

function validEntry(entry) {
  return plainObject(entry, ENTRY_FIELDS)
    && validIdentifier(entry.id)
    && MISSIONS.has(entry.missionId)
    && ROLES.has(entry.roleId)
    && ROUTES.has(entry.routeId)
    && entry.districtId === DISTRICT_ID
    && entry.contribution === DISTRICT_CONTRIBUTION;
}

function validRealm(realm) {
  return plainObject(realm, REALM_FIELDS)
    && validIdentifier(realm.id)
    && validName(realm.name)
    && THEMES.has(realm.theme)
    && Number.isInteger(realm.total)
    && realm.total >= 0
    && realm.total <= CREATOR_LEDGER_LIMIT * DISTRICT_CONTRIBUTION
    && realm.districtId === DISTRICT_ID
    && typeof realm.unlocked === 'boolean'
    && Array.isArray(realm.receipts)
    && realm.receipts.length <= CREATOR_LEDGER_LIMIT
    && realm.receipts.every(validEntry)
    && new Set(realm.receipts.map(entry => entry.id)).size === realm.receipts.length
    && realm.total === realm.receipts.length * DISTRICT_CONTRIBUTION
    && realm.unlocked === (realm.total >= DISTRICT_CONTRIBUTION);
}

function emptyState() {
  return { version: CREATOR_LEDGER_VERSION, realms: [] };
}

export function restoreCreatorLedger(value) {
  if (!plainObject(value, STATE_FIELDS) || value.version !== CREATOR_LEDGER_VERSION || !Array.isArray(value.realms)) {
    return emptyState();
  }
  if (value.realms.length > REALM_LIMIT || !value.realms.every(validRealm)) return emptyState();
  if (new Set(value.realms.map(realm => realm.id)).size !== value.realms.length) return emptyState();
  return structuredClone(value);
}

export function readCreatorLedger(storage = globalThis.localStorage) {
  try {
    return restoreCreatorLedger(JSON.parse(storage?.getItem(CREATOR_LEDGER_KEY) || 'null'));
  } catch {
    return emptyState();
  }
}

function writeCreatorLedger(storage, state) {
  storage.setItem(CREATOR_LEDGER_KEY, JSON.stringify(restoreCreatorLedger(state)));
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

export function importCompletionReceipt(storage, receipt) {
  if (!receipt || typeof receipt !== 'object') return { status: 'invalid' };
  if (!validIdentifier(receipt.realmId) || !validIdentifier(receipt.receiptId)) return { status: 'invalid' };
  if (!MISSIONS.has(receipt.missionId) || !ROLES.has(receipt.roleId) || !ROUTES.has(receipt.routeId)) {
    return { status: 'invalid' };
  }
  if (receipt.districtId !== DISTRICT_ID || receipt.contribution !== DISTRICT_CONTRIBUTION) {
    return { status: 'invalid' };
  }

  const state = readCreatorLedger(storage);
  const realmIndex = state.realms.findIndex(realm => realm.id === receipt.realmId);
  if (realmIndex < 0) return { status: 'mismatch' };
  const realm = state.realms[realmIndex];
  if (realm.receipts.some(entry => entry.id === receipt.receiptId)) {
    return { status: 'duplicate', realm: structuredClone(realm) };
  }
  if (realm.receipts.length >= CREATOR_LEDGER_LIMIT) {
    return { status: 'full', realm: structuredClone(realm) };
  }

  const entry = {
    id: receipt.receiptId,
    missionId: receipt.missionId,
    roleId: receipt.roleId,
    routeId: receipt.routeId,
    districtId: receipt.districtId,
    contribution: DISTRICT_CONTRIBUTION,
  };
  const updatedRealm = {
    ...realm,
    total: realm.total + DISTRICT_CONTRIBUTION,
    unlocked: true,
    receipts: [...realm.receipts, entry],
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
