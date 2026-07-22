const TOKEN_LIMIT = 1400;
const NAME_LIMIT = 28;
const EVENT_ID = /^event_[a-z0-9]{20,40}$/;
const SAFE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,27}$/u;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const ALLOWED_FIELDS = ['v', 'eventId', 'creatorName', 'motif', 'landmark', 'duration', 'target', 'progress', 'expiresAt'];
const DURATIONS = new Set(['6h', '24h']);
const TARGETS = new Set([12, 24, 48]);
const MOTIF = 'folded-horizon';
const LANDMARK = 'loombridge';

export const LIVING_WORLD_FRAGMENT = 'world-event';
export const LIVING_WORLD_STORAGE_KEY = 'creatorverse-living-world-v1';
export const LIVING_WORLD_SOUND_KEY = 'creatorverse-living-world-sound-v1';

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64url');
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('INVALID_EVENT_TOKEN');
  if (typeof Buffer !== 'undefined') return new TextDecoder().decode(Buffer.from(value, 'base64url'));
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
}

function assertExactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(code);
}

function boundedInteger(value, minimum, maximum, code) {
  if (typeof value === 'string' && !/^(0|[1-9]\d*)$/u.test(value)) throw new Error(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(code);
  return parsed;
}

function validateName(value) {
  if (typeof value !== 'string' || value.length > NAME_LIMIT || UNSAFE_TEXT.test(value) || !SAFE_NAME.test(value)) {
    throw new Error('INVALID_CREATOR_NAME');
  }
  return value;
}

function validateEventShape(event, { now = Date.now(), allowExpired = false } = {}) {
  assertExactKeys(event, ALLOWED_FIELDS, 'INVALID_EVENT_SHAPE');
  if (event.v !== 1) throw new Error('UNSUPPORTED_EVENT_VERSION');
  if (!EVENT_ID.test(event.eventId)) throw new Error('INVALID_EVENT_ID');
  validateName(event.creatorName);
  if (event.motif !== MOTIF || event.landmark !== LANDMARK) throw new Error('INVALID_WORLD_IDENTITY');
  if (!DURATIONS.has(event.duration)) throw new Error('INVALID_EVENT_DURATION');
  const target = boundedInteger(event.target, 12, 48, 'INVALID_EVENT_TARGET');
  if (!TARGETS.has(target)) throw new Error('INVALID_EVENT_TARGET');
  const progress = boundedInteger(event.progress, 0, target, 'INVALID_EVENT_PROGRESS');
  const expiresAt = boundedInteger(event.expiresAt, 1, Number.MAX_SAFE_INTEGER, 'INVALID_EVENT_EXPIRY');
  const maximumLifetime = event.duration === '6h' ? 6 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  if (!allowExpired && expiresAt <= now) throw new Error('EVENT_EXPIRED');
  if (expiresAt > now + maximumLifetime + 5 * 60 * 1000) throw new Error('INVALID_EVENT_EXPIRY');
  return { ...event, target, progress, expiresAt };
}

function randomEventId(cryptoLike = globalThis.crypto) {
  if (!cryptoLike?.getRandomValues) throw new Error('CRYPTO_UNAVAILABLE');
  const bytes = new Uint8Array(15);
  cryptoLike.getRandomValues(bytes);
  return `event_${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function createLivingWorldEvent({ duration = '6h', target = 24 } = {}, options = {}) {
  if (!DURATIONS.has(duration)) throw new Error('INVALID_EVENT_DURATION');
  if (!TARGETS.has(target)) throw new Error('INVALID_EVENT_TARGET');
  const now = options.now ?? Date.now();
  const lifetime = duration === '6h' ? 6 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const event = {
    v: 1,
    eventId: options.eventId || randomEventId(options.cryptoLike),
    creatorName: options.creatorName || 'Noura',
    motif: MOTIF,
    landmark: LANDMARK,
    duration,
    target,
    progress: options.progress ?? 0,
    expiresAt: now + lifetime,
  };
  return validateEventShape(event, { now });
}

export function encodeLivingWorldEvent(event, options = {}) {
  const validated = validateEventShape(event, options);
  const params = new URLSearchParams();
  for (const key of ALLOWED_FIELDS) params.append(key, String(validated[key]));
  return encodeBase64Url(params.toString());
}

export function decodeLivingWorldEvent(token, options = {}) {
  if (typeof token !== 'string' || token.length < 20 || token.length > TOKEN_LIMIT) throw new Error('INVALID_EVENT_TOKEN');
  const params = new URLSearchParams(decodeBase64Url(token));
  const keys = [...params.keys()];
  if (keys.length !== ALLOWED_FIELDS.length) throw new Error('INVALID_EVENT_SHAPE');
  for (const key of keys) {
    if (!ALLOWED_FIELDS.includes(key) || params.getAll(key).length !== 1) throw new Error('INVALID_EVENT_SHAPE');
  }
  return validateEventShape({
    v: boundedInteger(params.get('v'), 1, 1, 'UNSUPPORTED_EVENT_VERSION'),
    eventId: params.get('eventId'),
    creatorName: params.get('creatorName'),
    motif: params.get('motif'),
    landmark: params.get('landmark'),
    duration: params.get('duration'),
    target: boundedInteger(params.get('target'), 12, 48, 'INVALID_EVENT_TARGET'),
    progress: boundedInteger(params.get('progress'), 0, 48, 'INVALID_EVENT_PROGRESS'),
    expiresAt: boundedInteger(params.get('expiresAt'), 1, Number.MAX_SAFE_INTEGER, 'INVALID_EVENT_EXPIRY'),
  }, options);
}

export function eventFromLocation(hash, options = {}) {
  const prefix = `#${LIVING_WORLD_FRAGMENT}=`;
  if (typeof hash !== 'string' || !hash.startsWith(prefix)) return { status: 'none' };
  try {
    return { status: 'ready', event: decodeLivingWorldEvent(hash.slice(prefix.length), options) };
  } catch (error) {
    return { status: error.message === 'EVENT_EXPIRED' ? 'expired' : 'invalid', code: error.message };
  }
}

export function buildLivingWorldUrl(event, {
  progress = event.progress,
  baseUrl = globalThis.location?.href || 'https://example.test/',
  now = Date.now(),
} = {}) {
  const url = new URL(baseUrl);
  url.hash = `${LIVING_WORLD_FRAGMENT}=${encodeLivingWorldEvent({ ...event, progress }, { now })}`;
  return url.toString();
}

function validateStoredRecord(record) {
  assertExactKeys(record, ['eventId', 'target', 'progress', 'contributed'], 'INVALID_EVENT_STORAGE');
  if (!EVENT_ID.test(record.eventId)) throw new Error('INVALID_EVENT_STORAGE');
  const target = boundedInteger(record.target, 12, 48, 'INVALID_EVENT_STORAGE');
  if (!TARGETS.has(target)) throw new Error('INVALID_EVENT_STORAGE');
  const progress = boundedInteger(record.progress, 0, target, 'INVALID_EVENT_STORAGE');
  if (typeof record.contributed !== 'boolean') throw new Error('INVALID_EVENT_STORAGE');
  return { eventId: record.eventId, target, progress, contributed: record.contributed };
}

function readStore(storage) {
  const serialized = storage?.getItem?.(LIVING_WORLD_STORAGE_KEY);
  if (!serialized) return { serialized: null, data: { version: 1, events: [] } };
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw new Error('INVALID_EVENT_STORAGE'); }
  assertExactKeys(parsed, ['version', 'events'], 'INVALID_EVENT_STORAGE');
  if (parsed.version !== 1 || !Array.isArray(parsed.events) || parsed.events.length > 8) throw new Error('INVALID_EVENT_STORAGE');
  const events = parsed.events.map(validateStoredRecord);
  if (new Set(events.map(record => record.eventId)).size !== events.length) throw new Error('INVALID_EVENT_STORAGE');
  return { serialized, data: { version: 1, events } };
}

export function readLivingWorldState(storage, event, options = {}) {
  const validated = validateEventShape(event, {
    allowExpired: true,
    now: options.now ?? Date.now(),
  });
  try {
    const { data } = readStore(storage);
    const record = data.events.find(item => item.eventId === validated.eventId);
    if (!record) return { status: 'ready', progress: validated.progress, contributed: false };
    if (record.target !== validated.target || record.progress < validated.progress) return { status: 'storage-error', progress: validated.progress, contributed: false };
    return { status: record.contributed ? 'duplicate' : 'ready', progress: record.progress, contributed: record.contributed };
  } catch {
    return { status: 'storage-error', progress: validated.progress, contributed: false };
  }
}

export function commitLivingWorldContribution(storage, event, options = {}) {
  let validated;
  try {
    validated = validateEventShape(event, { now: options.now ?? Date.now() });
  } catch {
    const progress = Number.isSafeInteger(event?.progress) && event.progress >= 0 && event.progress <= 48
      ? event.progress
      : 0;
    return { status: 'storage-error', progress };
  }

  let store;
  try { store = readStore(storage); } catch { return { status: 'storage-error', progress: validated.progress }; }
  const existing = store.data.events.find(record => record.eventId === validated.eventId);
  if (existing && (existing.target !== validated.target || existing.progress < validated.progress)) {
    return { status: 'storage-error', progress: validated.progress };
  }
  if (existing?.contributed) return { status: 'duplicate', progress: existing.progress, completed: existing.progress === validated.target };

  const progress = Math.min(validated.target, Math.max(validated.progress, existing?.progress || 0) + 1);
  const record = { eventId: validated.eventId, target: validated.target, progress, contributed: true };
  const events = [record, ...store.data.events.filter(item => item.eventId !== validated.eventId)].slice(0, 8);
  const serialized = JSON.stringify({ version: 1, events });

  try {
    storage.setItem(LIVING_WORLD_STORAGE_KEY, serialized);
    if (storage.getItem(LIVING_WORLD_STORAGE_KEY) !== serialized) throw new Error('WRITE_NOT_VERIFIED');
  } catch {
    try {
      if (store.serialized === null) storage.removeItem(LIVING_WORLD_STORAGE_KEY);
      else storage.setItem(LIVING_WORLD_STORAGE_KEY, store.serialized);
    } catch {}
    return { status: 'storage-error', progress: validated.progress };
  }

  return { status: 'accepted', progress, completed: progress === validated.target };
}

export function deriveLoombridgeSlats(progress, target) {
  const boundedTarget = boundedInteger(target, 1, 48, 'INVALID_EVENT_TARGET');
  const boundedProgress = boundedInteger(progress, 0, boundedTarget, 'INVALID_EVENT_PROGRESS');
  return Math.min(12, Math.floor((boundedProgress / boundedTarget) * 12));
}

export function evaluateThreadLocks(locks) {
  if (!Array.isArray(locks) || locks.length !== 3 || locks.some(value => typeof value !== 'boolean')) {
    throw new Error('INVALID_LOCK_RESULTS');
  }
  const successfulLocks = locks.filter(Boolean).length;
  return { successfulLocks, accepted: successfulLocks >= 2, perfect: successfulLocks === 3 };
}
