import { completionReceiptLimits } from './completion-receipt.js';
import {
  REALM_COLLABORATION_KEY,
  inspectRealmCollaboration,
} from './realm-collaboration.js';

export const SHARED_RECEIPT_PREVIEW_KEY = 'creatorverse-shared-mission-receipt-v1';
export const SHARED_PROVENANCE_VERSION = 1;

const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const THEMES = new Set(['cosmic', 'wild', 'future']);
const MISSIONS = new Set(['route-choice', 'relay-sequence', 'signal-match']);
const ROLES = new Set(['builder', 'explorer', 'guardian']);
const ROUTES = new Set(['sky', 'ocean']);
const RECEIPT_FIELDS = new Set([
  'version', 'sharedMissionId', 'completionId', 'receiptId', 'relationshipId',
  'initiatorRealmId', 'initiatorName', 'initiatorTheme', 'linkedRealmId', 'linkedName',
  'linkedTheme', 'targetRealmId', 'missionId', 'roleId', 'routeId', 'contribution', 'districtId',
]);

function exactObject(value, fields) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === fields.size
    && Object.keys(value).every(key => fields.has(key));
}

function validIdentifier(value) {
  return typeof value === 'string'
    && completionReceiptLimits.identifierPattern.test(value)
    && !CONTROL_OR_BIDI.test(value);
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

function hasDuplicateObjectKeys(json) {
  const stack = [];
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
      if (json[index - 1] !== '"') return true;
      let cursor = index;
      while (/\s/u.test(json[cursor] || '')) cursor += 1;
      if (json[cursor] === ':') {
        const frame = stack.at(-1);
        if (!(frame instanceof Set)) return true;
        let key;
        try { key = JSON.parse(json.slice(start, index)); } catch { return true; }
        if (frame.has(key)) return true;
        frame.add(key);
      }
      continue;
    }
    if (character === '{') stack.push(new Set());
    else if (character === '[') stack.push(null);
    else if (character === '}' || character === ']') stack.pop();
    index += 1;
  }
  return false;
}

function validSharedReceipt(value) {
  return exactObject(value, RECEIPT_FIELDS)
    && value.version === 1
    && validIdentifier(value.sharedMissionId)
    && validIdentifier(value.completionId)
    && validIdentifier(value.receiptId)
    && validIdentifier(value.relationshipId)
    && validIdentifier(value.initiatorRealmId)
    && validName(value.initiatorName)
    && THEMES.has(value.initiatorTheme)
    && validIdentifier(value.linkedRealmId)
    && validName(value.linkedName)
    && THEMES.has(value.linkedTheme)
    && value.initiatorRealmId !== value.linkedRealmId
    && [value.initiatorRealmId, value.linkedRealmId].includes(value.targetRealmId)
    && MISSIONS.has(value.missionId)
    && ROLES.has(value.roleId)
    && ROUTES.has(value.routeId)
    && value.contribution === 3
    && value.districtId === 'beacon-district';
}

function readPendingSharedReceipt(previewStorage) {
  let serialized;
  try { serialized = previewStorage?.getItem(SHARED_RECEIPT_PREVIEW_KEY); } catch { return { status: 'invalid' }; }
  if (!serialized) return { status: 'none' };
  if (serialized.length > 4096 || hasDuplicateObjectKeys(serialized)) return { status: 'invalid' };
  try {
    const receipt = JSON.parse(serialized);
    return validSharedReceipt(receipt) ? { status: 'ready', receipt } : { status: 'invalid' };
  } catch {
    return { status: 'invalid' };
  }
}

function matchingGenericReceipt(receipt, pending) {
  return receipt.realmId === pending.targetRealmId
    && receipt.receiptId === pending.sharedMissionId
    && receipt.missionId === pending.missionId
    && receipt.roleId === pending.roleId
    && receipt.routeId === pending.routeId
    && receipt.contribution === pending.contribution
    && receipt.districtId === pending.districtId;
}

function partnerFor(receipt, realm) {
  if (realm.id === receipt.initiatorRealmId
    && realm.name === receipt.initiatorName
    && realm.theme === receipt.initiatorTheme) {
    return {
      id: receipt.linkedRealmId,
      name: receipt.linkedName,
      theme: receipt.linkedTheme,
    };
  }
  if (realm.id === receipt.linkedRealmId
    && realm.name === receipt.linkedName
    && realm.theme === receipt.linkedTheme) {
    return {
      id: receipt.initiatorRealmId,
      name: receipt.initiatorName,
      theme: receipt.initiatorTheme,
    };
  }
  return null;
}

export function resolvePendingSharedContributionProvenance(storage, receipt, realm, {
  previewStorage = globalThis.sessionStorage,
} = {}) {
  const pending = readPendingSharedReceipt(previewStorage);
  if (pending.status === 'none') return pending;
  if (pending.status !== 'ready') return { status: 'invalid' };

  const candidate = pending.receipt;
  const related = candidate.sharedMissionId === receipt?.receiptId
    || candidate.targetRealmId === receipt?.realmId;
  if (!related) return { status: 'none' };
  if (!matchingGenericReceipt(receipt, candidate)) return { status: 'invalid' };

  const partner = partnerFor(candidate, realm);
  if (!partner || partner.id === realm.id) return { status: 'invalid' };
  const collaboration = inspectRealmCollaboration(storage, realm.id);
  if (collaboration.status !== 'ready') return { status: 'invalid' };
  if (collaboration.record.proposalId !== candidate.relationshipId
    || collaboration.record.sourceRealmId !== partner.id
    || collaboration.record.sourceName !== partner.name
    || collaboration.record.sourceTheme !== partner.theme) return { status: 'invalid' };

  return {
    status: 'ready',
    provenance: Object.freeze({
      version: SHARED_PROVENANCE_VERSION,
      sourceKind: 'shared',
      relationshipId: candidate.relationshipId,
      partnerRealmId: partner.id,
      partnerName: partner.name,
      sharedMissionId: candidate.sharedMissionId,
    }),
  };
}

export function sharedProvenanceStorageKeys() {
  return Object.freeze({ preview: SHARED_RECEIPT_PREVIEW_KEY, collaboration: REALM_COLLABORATION_KEY });
}
