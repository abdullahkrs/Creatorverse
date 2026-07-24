import {
  decodeLivingWorldChapter,
  encodeLivingWorldChapter,
  evaluateSignalLocks,
  LIVING_WORLD_CHAPTER_OWNER_KEY,
  readLivingWorldChapterState,
} from './living-world-chapter.js';

const TOKEN_LIMIT = 4200;
const EVENT_KIND = 'open-skywell';
const TARGET = 6;
const DURATION = '6h';
const LIFETIME_MS = 6 * 60 * 60 * 1000;
const EVENT_ID = /^sky_[a-z0-9]{20,40}$/u;
const CHAPTER_ID = /^chapter_[a-z0-9]{20,40}$/u;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const FIELDS = Object.freeze([
  'v',
  'kind',
  'eventId',
  'predecessor',
  'creatorName',
  'duration',
  'target',
  'progress',
  'expiresAt',
]);

export const LIVING_WORLD_SKYWELL_FRAGMENT = 'skywell';
export const LIVING_WORLD_SKYWELL_SAFE_FRAGMENT = '#skywell';
export const LIVING_WORLD_SKYWELL_STORAGE_KEY = 'creatorverse-living-world-skywell-v1';
export const LIVING_WORLD_SKYWELL_LAUNCH_KEY = 'creatorverse-living-world-skywell-launch-v1';
export const LIVING_WORLD_SKYWELL_OWNER_KEY = 'creatorverse-living-world-skywell-owner-v1';
export const LIVING_WORLD_SKYWELL_ROUTE_KEY = 'creatorverse-living-world-skywell-route-v1';
export const LIVING_WORLD_SKYWELL_TARGET = TARGET;

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64url');
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('INVALID_SKYWELL_TOKEN');
  if (typeof Buffer !== 'undefined') return new TextDecoder().decode(Buffer.from(value, 'base64url'));
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) throw new Error(code);
}

function integer(value, minimum, maximum, code) {
  if (typeof value === 'string' && !/^(0|[1-9]\d*)$/u.test(value)) throw new Error(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(code);
  return parsed;
}

function randomEventId(cryptoLike = globalThis.crypto) {
  if (!cryptoLike?.getRandomValues) throw new Error('CRYPTO_UNAVAILABLE');
  const bytes = new Uint8Array(15);
  cryptoLike.getRandomValues(bytes);
  return `sky_${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function canonicalPredecessor(predecessor, { now = Date.now() } = {}) {
  const token = typeof predecessor === 'string'
    ? predecessor
    : encodeLivingWorldChapter(predecessor, { now, allowExpired: true });
  const chapter = decodeLivingWorldChapter(token, { now, allowExpired: true });
  if (
    chapter.motif !== 'folded-horizon'
    || chapter.landmark !== 'signal-grove'
    || chapter.chapter !== 'light-far-shore'
    || chapter.target !== 8
    || chapter.progress !== 8
  ) throw new Error('INVALID_SKYWELL_PREDECESSOR');
  return Object.freeze({ chapter, token: encodeLivingWorldChapter(chapter, { now, allowExpired: true }) });
}

function validateEventShape(value, { now = Date.now(), allowExpired = false } = {}) {
  exactKeys(value, FIELDS, 'INVALID_SKYWELL_SHAPE');
  if (value.v !== 1 || value.kind !== EVENT_KIND || !EVENT_ID.test(value.eventId)) {
    throw new Error('INVALID_SKYWELL_IDENTITY');
  }
  if (typeof value.predecessor !== 'string' || value.predecessor.length < 40 || value.predecessor.length > 3200) {
    throw new Error('INVALID_SKYWELL_PREDECESSOR');
  }
  const predecessor = canonicalPredecessor(value.predecessor, { now });
  if (
    typeof value.creatorName !== 'string'
    || value.creatorName !== predecessor.chapter.creatorName
    || value.creatorName.length > 28
    || UNSAFE_TEXT.test(value.creatorName)
  ) throw new Error('INVALID_SKYWELL_CREATOR');
  if (value.duration !== DURATION) throw new Error('INVALID_SKYWELL_DURATION');
  const target = integer(value.target, TARGET, TARGET, 'INVALID_SKYWELL_TARGET');
  const progress = integer(value.progress, 0, TARGET, 'INVALID_SKYWELL_PROGRESS');
  const expiresAt = integer(value.expiresAt, 1, Number.MAX_SAFE_INTEGER, 'INVALID_SKYWELL_EXPIRY');
  if (!allowExpired && expiresAt <= now) throw new Error('SKYWELL_EXPIRED');
  if (expiresAt > now + LIFETIME_MS + 5 * 60 * 1000) throw new Error('INVALID_SKYWELL_EXPIRY');
  return Object.freeze({
    v: 1,
    kind: EVENT_KIND,
    eventId: value.eventId,
    predecessor: predecessor.token,
    creatorName: value.creatorName,
    duration: DURATION,
    target,
    progress,
    expiresAt,
  });
}

export function createLivingWorldSkywell(predecessor, options = {}) {
  const now = options.now ?? Date.now();
  const canonical = canonicalPredecessor(predecessor, { now });
  return validateEventShape({
    v: 1,
    kind: EVENT_KIND,
    eventId: options.eventId || randomEventId(options.cryptoLike),
    predecessor: canonical.token,
    creatorName: canonical.chapter.creatorName,
    duration: DURATION,
    target: TARGET,
    progress: options.progress ?? 0,
    expiresAt: now + LIFETIME_MS,
  }, { now });
}

export function encodeLivingWorldSkywell(event, options = {}) {
  const validated = validateEventShape(event, options);
  const params = new URLSearchParams();
  for (const key of FIELDS) params.append(key, String(validated[key]));
  return encodeBase64Url(params.toString());
}

export function decodeLivingWorldSkywell(token, options = {}) {
  if (typeof token !== 'string' || token.length < 50 || token.length > TOKEN_LIMIT) throw new Error('INVALID_SKYWELL_TOKEN');
  const params = new URLSearchParams(decodeBase64Url(token));
  const keys = [...params.keys()];
  if (keys.length !== FIELDS.length) throw new Error('INVALID_SKYWELL_SHAPE');
  for (const key of keys) {
    if (!FIELDS.includes(key) || params.getAll(key).length !== 1) throw new Error('INVALID_SKYWELL_SHAPE');
  }
  return validateEventShape({
    v: integer(params.get('v'), 1, 1, 'UNSUPPORTED_SKYWELL_VERSION'),
    kind: params.get('kind'),
    eventId: params.get('eventId'),
    predecessor: params.get('predecessor'),
    creatorName: params.get('creatorName'),
    duration: params.get('duration'),
    target: integer(params.get('target'), TARGET, TARGET, 'INVALID_SKYWELL_TARGET'),
    progress: integer(params.get('progress'), 0, TARGET, 'INVALID_SKYWELL_PROGRESS'),
    expiresAt: integer(params.get('expiresAt'), 1, Number.MAX_SAFE_INTEGER, 'INVALID_SKYWELL_EXPIRY'),
  }, options);
}

export function skywellFromLocation(hash, options = {}) {
  const prefix = `#${LIVING_WORLD_SKYWELL_FRAGMENT}=`;
  if (typeof hash !== 'string' || !hash.startsWith(prefix)) return Object.freeze({ status: 'none' });
  try {
    return Object.freeze({ status: 'ready', event: decodeLivingWorldSkywell(hash.slice(prefix.length), options) });
  } catch (error) {
    return Object.freeze({
      status: error.message === 'SKYWELL_EXPIRED' ? 'expired' : 'invalid',
      code: error.message,
    });
  }
}

export function buildLivingWorldSkywellUrl(event, {
  progress = event.progress,
  baseUrl = globalThis.location?.href || 'https://example.test/',
  now = Date.now(),
} = {}) {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = `${LIVING_WORLD_SKYWELL_FRAGMENT}=${encodeLivingWorldSkywell({ ...event, progress }, { now })}`;
  return url.toString();
}

export function decodeSkywellPredecessor(event, options = {}) {
  const validated = validateEventShape(event, { ...options, allowExpired: options.allowExpired ?? true });
  return decodeLivingWorldChapter(validated.predecessor, { now: options.now ?? Date.now(), allowExpired: true });
}

function writeVerified(storage, key, serialized, previous) {
  try {
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) throw new Error('WRITE_NOT_VERIFIED');
    return true;
  } catch {
    try {
      if (previous === null) storage.removeItem(key);
      else storage.setItem(key, previous);
    } catch {}
    return false;
  }
}

function readLaunchStore(storage, now = Date.now()) {
  const serialized = storage?.getItem?.(LIVING_WORLD_SKYWELL_LAUNCH_KEY);
  if (!serialized) return { serialized: null, data: { version: 1, launches: [] } };
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw new Error('INVALID_SKYWELL_LAUNCH_STORAGE'); }
  exactKeys(parsed, ['version', 'launches'], 'INVALID_SKYWELL_LAUNCH_STORAGE');
  if (parsed.version !== 1 || !Array.isArray(parsed.launches) || parsed.launches.length > 4) {
    throw new Error('INVALID_SKYWELL_LAUNCH_STORAGE');
  }
  const launches = parsed.launches.map(entry => {
    exactKeys(entry, ['chapterId', 'event'], 'INVALID_SKYWELL_LAUNCH_STORAGE');
    if (!CHAPTER_ID.test(entry.chapterId)) throw new Error('INVALID_SKYWELL_LAUNCH_STORAGE');
    const event = validateEventShape(entry.event, { now, allowExpired: true });
    const predecessor = decodeSkywellPredecessor(event, { now, allowExpired: true });
    if (predecessor.chapterId !== entry.chapterId) throw new Error('INVALID_SKYWELL_LAUNCH_STORAGE');
    return { chapterId: entry.chapterId, event };
  });
  if (new Set(launches.map(entry => entry.chapterId)).size !== launches.length) throw new Error('INVALID_SKYWELL_LAUNCH_STORAGE');
  return { serialized, data: { version: 1, launches } };
}

export function isLivingWorldSkywellLaunchEligible(storage, session, predecessor, options = {}) {
  const now = options.now ?? Date.now();
  let canonical;
  try { canonical = canonicalPredecessor(predecessor, { now }).chapter; } catch { return false; }
  let owner = false;
  try { owner = session?.getItem?.(LIVING_WORLD_CHAPTER_OWNER_KEY) === canonical.chapterId; } catch { return false; }
  if (!owner) return false;
  const state = readLivingWorldChapterState(storage, canonical, { now });
  return state.status !== 'storage-error' && state.progress === 8;
}

export function createOrResumeLivingWorldSkywell(storage, session, predecessor, options = {}) {
  const now = options.now ?? Date.now();
  if (!isLivingWorldSkywellLaunchEligible(storage, session, predecessor, { now })) return Object.freeze({ status: 'ineligible' });
  const canonical = canonicalPredecessor(predecessor, { now }).chapter;
  let store;
  try { store = readLaunchStore(storage, now); } catch { return Object.freeze({ status: 'storage-error' }); }
  const existing = store.data.launches.find(entry => entry.chapterId === canonical.chapterId);
  if (existing) {
    try {
      const event = validateEventShape(existing.event, { now });
      return Object.freeze({ status: 'resumed', event });
    } catch {}
  }
  let event;
  try { event = createLivingWorldSkywell(canonical, { ...options, now }); } catch { return Object.freeze({ status: 'invalid' }); }
  const launches = [
    { chapterId: canonical.chapterId, event },
    ...store.data.launches.filter(entry => entry.chapterId !== canonical.chapterId),
  ].slice(0, 4);
  const serialized = JSON.stringify({ version: 1, launches });
  if (!writeVerified(storage, LIVING_WORLD_SKYWELL_LAUNCH_KEY, serialized, store.serialized)) {
    return Object.freeze({ status: 'storage-error' });
  }
  return Object.freeze({ status: 'created', event });
}

function validateStateRecord(record) {
  exactKeys(record, ['eventId', 'chapterId', 'target', 'progress', 'contributed'], 'INVALID_SKYWELL_STORAGE');
  if (!EVENT_ID.test(record.eventId) || !CHAPTER_ID.test(record.chapterId)) throw new Error('INVALID_SKYWELL_STORAGE');
  const target = integer(record.target, TARGET, TARGET, 'INVALID_SKYWELL_STORAGE');
  const progress = integer(record.progress, 0, TARGET, 'INVALID_SKYWELL_STORAGE');
  if (typeof record.contributed !== 'boolean') throw new Error('INVALID_SKYWELL_STORAGE');
  return { eventId: record.eventId, chapterId: record.chapterId, target, progress, contributed: record.contributed };
}

function readStateStore(storage) {
  const serialized = storage?.getItem?.(LIVING_WORLD_SKYWELL_STORAGE_KEY);
  if (!serialized) return { serialized: null, data: { version: 1, events: [] } };
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw new Error('INVALID_SKYWELL_STORAGE'); }
  exactKeys(parsed, ['version', 'events'], 'INVALID_SKYWELL_STORAGE');
  if (parsed.version !== 1 || !Array.isArray(parsed.events) || parsed.events.length > 8) throw new Error('INVALID_SKYWELL_STORAGE');
  const events = parsed.events.map(validateStateRecord);
  if (new Set(events.map(record => record.eventId)).size !== events.length) throw new Error('INVALID_SKYWELL_STORAGE');
  return { serialized, data: { version: 1, events } };
}

export function readLivingWorldSkywellState(storage, event, options = {}) {
  let validated;
  try { validated = validateEventShape(event, { now: options.now ?? Date.now(), allowExpired: true }); } catch {
    return Object.freeze({ status: 'storage-error', progress: Number.isSafeInteger(event?.progress) ? event.progress : 0, contributed: false });
  }
  const predecessor = decodeSkywellPredecessor(validated, { now: options.now ?? Date.now(), allowExpired: true });
  try {
    const { data } = readStateStore(storage);
    const record = data.events.find(entry => entry.eventId === validated.eventId);
    if (!record) return Object.freeze({ status: 'ready', progress: validated.progress, contributed: false });
    if (
      record.chapterId !== predecessor.chapterId
      || record.target !== TARGET
      || record.progress < validated.progress
    ) return Object.freeze({ status: 'storage-error', progress: validated.progress, contributed: false });
    return Object.freeze({
      status: record.contributed ? 'duplicate' : 'ready',
      progress: record.progress,
      contributed: record.contributed,
    });
  } catch {
    return Object.freeze({ status: 'storage-error', progress: validated.progress, contributed: false });
  }
}

export function resolveLivingWorldSkywell(storage, event, options = {}) {
  let validated;
  try { validated = validateEventShape(event, options); } catch (error) {
    return Object.freeze({ status: error.message === 'SKYWELL_EXPIRED' ? 'expired' : 'invalid' });
  }
  const state = readLivingWorldSkywellState(storage, validated, options);
  if (state.status === 'storage-error') return Object.freeze({ status: 'storage-error', event: validated, progress: validated.progress });
  if (state.progress > validated.progress || state.contributed) {
    return Object.freeze({
      status: 'stale',
      event: validated,
      progress: Math.max(state.progress, validated.progress),
      completed: Math.max(state.progress, validated.progress) >= TARGET,
    });
  }
  if (state.progress < validated.progress) {
    return Object.freeze({ status: 'ahead', event: validated, progress: state.progress });
  }
  return Object.freeze({ status: validated.progress >= TARGET ? 'completed' : 'ready', event: validated, progress: validated.progress, completed: validated.progress >= TARGET });
}

export function commitLivingWorldSkywellContribution(storage, event, options = {}) {
  const resolved = resolveLivingWorldSkywell(storage, event, options);
  if (resolved.status !== 'ready') return resolved;
  const now = options.now ?? Date.now();
  const predecessor = decodeSkywellPredecessor(resolved.event, { now, allowExpired: true });
  let store;
  try { store = readStateStore(storage); } catch {
    return Object.freeze({ status: 'storage-error', event: resolved.event, progress: resolved.progress });
  }
  const existing = store.data.events.find(record => record.eventId === resolved.event.eventId);
  if (existing && (
    existing.chapterId !== predecessor.chapterId
    || existing.target !== TARGET
    || existing.progress < resolved.event.progress
  )) return Object.freeze({ status: 'storage-error', event: resolved.event, progress: resolved.progress });
  if (existing?.contributed) {
    return Object.freeze({ status: 'stale', event: resolved.event, progress: existing.progress, completed: existing.progress >= TARGET });
  }
  const progress = Math.min(TARGET, Math.max(resolved.event.progress, existing?.progress || 0) + 1);
  const record = {
    eventId: resolved.event.eventId,
    chapterId: predecessor.chapterId,
    target: TARGET,
    progress,
    contributed: true,
  };
  const events = [record, ...store.data.events.filter(entry => entry.eventId !== record.eventId)].slice(0, 8);
  const serialized = JSON.stringify({ version: 1, events });
  if (!writeVerified(storage, LIVING_WORLD_SKYWELL_STORAGE_KEY, serialized, store.serialized)) {
    return Object.freeze({ status: 'storage-error', event: resolved.event, progress: resolved.progress });
  }
  return Object.freeze({
    status: 'accepted',
    event: resolved.event,
    progress,
    activatedIndex: resolved.event.progress,
    completed: progress === TARGET,
  });
}

export function deriveLivingWorldSkywellRibs(progress, { phase = 'ready', acceptedIndex = null } = {}) {
  const current = integer(progress, 0, TARGET, 'INVALID_SKYWELL_PROGRESS');
  const accepted = acceptedIndex === null ? null : integer(acceptedIndex, 0, TARGET - 1, 'INVALID_SKYWELL_RIB');
  const next = current < TARGET ? current : null;
  return Object.freeze(Array.from({ length: TARGET }, (_, index) => Object.freeze({
    index,
    open: index < current,
    target: phase === 'impact' ? index === accepted : index === next,
    impact: phase === 'impact' && index === accepted,
    dormant: index >= current && !(phase === 'impact' && index === accepted),
  })));
}

export function evaluateLivingWorldSkywellLocks(locks) {
  return evaluateSignalLocks(locks);
}
