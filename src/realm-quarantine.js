const STORAGE_KEY = 'creatorverse-realm-quarantine-v1';
const SCHEMA_VERSION = 1;
const MAX_RECORDS = 24;
const MAX_SERIALIZED_LENGTH = 6144;
const OPAQUE_REALM_ID = /^[A-Za-z0-9_-]{16,64}$/u;
const REASONS = Object.freeze([
  'unsafe-real-world',
  'harassment-hateful',
  'personal-private-information',
]);
const REASON_SET = new Set(REASONS);
const ROOT_FIELDS = new Set(['v', 'records']);
const RECORD_FIELDS = new Set(['v', 'r', 'q']);

function quarantineError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function exactFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.size && keys.every(key => fields.has(key));
}

function assertNoDuplicateJsonKeys(json) {
  const stack = [];
  let index = 0;

  while (index < json.length) {
    const character = json[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }

    if (character === '{') {
      stack.push({ type: 'object', keys: new Set(), expectingKey: true });
      index += 1;
      continue;
    }
    if (character === '[') {
      stack.push({ type: 'array' });
      index += 1;
      continue;
    }
    if (character === '}' || character === ']') {
      stack.pop();
      index += 1;
      continue;
    }
    if (character === ',') {
      const current = stack.at(-1);
      if (current?.type === 'object') current.expectingKey = true;
      index += 1;
      continue;
    }

    if (character !== '"') {
      index += 1;
      continue;
    }

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
    if (json[index - 1] !== '"') throw quarantineError('QUARANTINE_JSON_INVALID');

    const context = stack.at(-1);
    if (context?.type !== 'object' || !context.expectingKey) continue;
    let cursor = index;
    while (/\s/u.test(json[cursor] || '')) cursor += 1;
    if (json[cursor] !== ':') continue;
    const key = JSON.parse(json.slice(start, index));
    if (context.keys.has(key)) throw quarantineError('QUARANTINE_DUPLICATE_FIELD');
    context.keys.add(key);
    context.expectingKey = false;
  }
}

export function normalizeQuarantineRealmId(value) {
  if (typeof value !== 'string' || !OPAQUE_REALM_ID.test(value)) {
    throw quarantineError('QUARANTINE_REALM_INVALID');
  }
  return value;
}

export function normalizeQuarantineReason(value) {
  if (typeof value !== 'string' || !REASON_SET.has(value)) {
    throw quarantineError('QUARANTINE_REASON_INVALID');
  }
  return value;
}

function normalizeRecord(value) {
  if (!exactFields(value, RECORD_FIELDS) || value.v !== SCHEMA_VERSION) {
    throw quarantineError('QUARANTINE_RECORD_INVALID');
  }
  return Object.freeze({
    v: SCHEMA_VERSION,
    r: normalizeQuarantineRealmId(value.r),
    q: normalizeQuarantineReason(value.q),
  });
}

function candidateRealmId(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  try {
    return normalizeQuarantineRealmId(value.r);
  } catch {
    return '';
  }
}

export function parseRealmQuarantine(serialized) {
  if (serialized == null || serialized === '') {
    return Object.freeze({ status: 'empty', records: Object.freeze([]) });
  }
  if (typeof serialized !== 'string' || serialized.length > MAX_SERIALIZED_LENGTH) {
    return Object.freeze({ status: 'malformed', records: Object.freeze([]) });
  }

  try {
    assertNoDuplicateJsonKeys(serialized);
    const value = JSON.parse(serialized);
    if (!exactFields(value, ROOT_FIELDS) || value.v !== SCHEMA_VERSION || !Array.isArray(value.records)) {
      throw quarantineError('QUARANTINE_ROOT_INVALID');
    }

    let recovered = value.records.length > MAX_RECORDS;
    const records = [];
    const realmIds = new Set();
    const invalidRealmIds = new Set();
    for (const candidate of value.records) {
      try {
        const record = normalizeRecord(candidate);
        if (invalidRealmIds.has(record.r)) {
          recovered = true;
          continue;
        }
        if (realmIds.has(record.r)) {
          recovered = true;
          invalidRealmIds.add(record.r);
          realmIds.delete(record.r);
          const existingIndex = records.findIndex(existing => existing.r === record.r);
          if (existingIndex >= 0) records.splice(existingIndex, 1);
          continue;
        }
        if (records.length >= MAX_RECORDS) {
          recovered = true;
          continue;
        }
        realmIds.add(record.r);
        records.push(record);
      } catch {
        recovered = true;
        const invalidRealmId = candidateRealmId(candidate);
        if (invalidRealmId) {
          invalidRealmIds.add(invalidRealmId);
          realmIds.delete(invalidRealmId);
          const existingIndex = records.findIndex(existing => existing.r === invalidRealmId);
          if (existingIndex >= 0) records.splice(existingIndex, 1);
        }
      }
    }

    return Object.freeze({
      status: recovered ? 'recovered' : 'valid',
      records: Object.freeze(records),
    });
  } catch {
    return Object.freeze({ status: 'malformed', records: Object.freeze([]) });
  }
}

export function serializeRealmQuarantine(records) {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) {
    throw quarantineError('QUARANTINE_RECORDS_INVALID');
  }
  const realmIds = new Set();
  const normalized = records.map(candidate => {
    const record = normalizeRecord(candidate);
    if (realmIds.has(record.r)) throw quarantineError('QUARANTINE_REALM_DUPLICATE');
    realmIds.add(record.r);
    return record;
  });
  return JSON.stringify({ v: SCHEMA_VERSION, records: normalized });
}

export function readRealmQuarantine(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    throw quarantineError('QUARANTINE_STORAGE_UNAVAILABLE');
  }
  return parseRealmQuarantine(storage.getItem(STORAGE_KEY));
}

export function repairRealmQuarantine(storage, state) {
  if (state?.status !== 'recovered') return state;
  storage.setItem(STORAGE_KEY, serializeRealmQuarantine(state.records));
  return Object.freeze({ status: 'valid', records: state.records });
}

export function isRealmQuarantined(state, realmId) {
  let normalized;
  try {
    normalized = normalizeQuarantineRealmId(realmId);
  } catch {
    return false;
  }
  return Boolean(state?.records?.some(record => record.r === normalized));
}

export function quarantineRealm(storage, { realmId, reason }) {
  const normalizedRealmId = normalizeQuarantineRealmId(realmId);
  const normalizedReason = normalizeQuarantineReason(reason);
  const state = readRealmQuarantine(storage);
  const records = [...state.records].filter(record => record.r !== normalizedRealmId);
  while (records.length >= MAX_RECORDS) records.shift();
  records.push(Object.freeze({ v: SCHEMA_VERSION, r: normalizedRealmId, q: normalizedReason }));
  storage.setItem(STORAGE_KEY, serializeRealmQuarantine(records));
  return Object.freeze({ status: 'valid', records: Object.freeze(records) });
}

export function restoreQuarantinedRealm(storage, realmId) {
  const normalizedRealmId = normalizeQuarantineRealmId(realmId);
  const state = readRealmQuarantine(storage);
  const records = state.records.filter(record => record.r !== normalizedRealmId);
  storage.setItem(STORAGE_KEY, serializeRealmQuarantine(records));
  return Object.freeze({ status: 'valid', records: Object.freeze(records) });
}

export const realmQuarantineContract = Object.freeze({
  storageKey: STORAGE_KEY,
  schemaVersion: SCHEMA_VERSION,
  maxRecords: MAX_RECORDS,
  maxSerializedLength: MAX_SERIALIZED_LENGTH,
  reasons: REASONS,
});
