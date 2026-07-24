import { decodeLivingWorldChapter, encodeLivingWorldChapter } from './living-world-chapter.js';

const TOKEN_LIMIT = 3600;
const SKYWELL_ID = /^skywell_[a-z0-9]{20,40}$/u;
const CHAPTER_ID = /^chapter_[a-z0-9]{20,40}$/u;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const SAFE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,27}$/u;
const DURATION = '6h';
const TARGET = 6;
const EVENT_KIND = 'open-skywell';
const LANDMARK = 'skywell';
const MOTIF = 'folded-horizon';
const FIELDS = [
  'v',
  'skywellId',
  'predecessor',
  'creatorName',
  'motif',
  'landmark',
  'event',
  'duration',
  'target',
  'progress',
  'expiresAt',
];

export const LIVING_WORLD_SKYWELL_FRAGMENT = 'world-skywell';
export const LIVING_WORLD_SKYWELL_STORAGE_KEY = 'creatorverse-living-world-skywell-v1';
export const LIVING_WORLD_SKYWELL_LAUNCH_KEY = 'creatorverse-living-world-skywell-launch-v1';
export const LIVING_WORLD_SKYWELL_OWNER_KEY = 'creatorverse-living-world-skywell-owner-v1';
export const LIVING_WORLD_SKYWELL_HISTORY_KEY = 'creatorverseSkywellToken';

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

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(code);
}

function integer(value, minimum, maximum, code) {
  if (typeof value === 'string' && !/^(0|[1-9]\d*)$/u.test(value)) throw new Error(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(code);
  return parsed;
}

function safeName(value) {
  if (typeof value !== 'string' || value.length > 28 || UNSAFE_TEXT.test(value) || !SAFE_NAME.test(value)) {
    throw new Error('INVALID_SKYWELL_CREATOR');
  }
  return value;
}

function randomSkywellId(cryptoLike = globalThis.crypto) {
  if (!cryptoLike?.getRandomValues) throw new Error('CRYPTO_UNAVAILABLE');
  const bytes = new Uint8Array(15);
  cryptoLike.getRandomValues(bytes);
  return `skywell_${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function validatePredecessor(value, { now = Date.now(), allowExpired = true } = {}) {
  const predecessor = typeof value === 'string'
    ? decodeLivingWorldChapter(value, { now, allowExpired })
    : value;
  const encoded = encodeLivingWorldChapter(predecessor, { now, allowExpired });
  const validated = decodeLivingWorldChapter(encoded, { now, allowExpired });
  if (
    validated.motif !== MOTIF
    || validated.landmark !== 'signal-grove'
    || validated.chapter !== 'light-far-shore'
    || validated.target !== 8
    || validated.progress !== 8
  ) {
    throw new Error('INVALID_SKYWELL_PREDECESSOR');
  }
  return { chapter: validated, token: encoded };
}

function predecessorChapterId(skywell, now = Date.now()) {
  return validatePredecessor(skywell.predecessor, { allowExpired: true, now }).chapter.chapterId;
}

function validateSkywellShape(value, { now = Date.now(), allowExpired = false } = {}) {
  exactKeys(value, FIELDS, 'INVALID_SKYWELL_SHAPE');
  if (value.v !== 1 || !SKYWELL_ID.test(value.skywellId)) throw new Error('INVALID_SKYWELL_ID');
  if (typeof value.predecessor !== 'string' || value.predecessor.length > 1800) {
    throw new Error('INVALID_SKYWELL_PREDECESSOR');
  }
  const predecessor = validatePredecessor(value.predecessor, { now, allowExpired: true }).chapter;
  const creatorName = safeName(value.creatorName);
  if (creatorName !== predecessor.creatorName) throw new Error('INVALID_SKYWELL_BINDING');
  if (value.motif !== MOTIF || value.landmark !== LANDMARK || value.event !== EVENT_KIND) {
    throw new Error('INVALID_SKYWELL_IDENTITY');
  }
  if (value.duration !== DURATION) throw new Error('INVALID_SKYWELL_DURATION');
  const target = integer(value.target, TARGET, TARGET, 'INVALID_SKYWELL_TARGET');
  const progress = integer(value.progress, 0, TARGET, 'INVALID_SKYWELL_PROGRESS');
  const expiresAt = integer(value.expiresAt, 1, Number.MAX_SAFE_INTEGER, 'INVALID_SKYWELL_EXPIRY');
  const lifetime = 6 * 60 * 60 * 1000;
  if (!allowExpired && expiresAt <= now) throw new Error('SKYWELL_EXPIRED');
  if (expiresAt > now + lifetime + 5 * 60 * 1000) throw new Error('INVALID_SKYWELL_EXPIRY');
  return Object.freeze({ ...value, creatorName, target, progress, expiresAt });
}

export function createLivingWorldSkywell(predecessor, options = {}) {
  const now = options.now ?? Date.now();
  const validatedPredecessor = validatePredecessor(predecessor, { now, allowExpired: false });
  return validateSkywellShape({
    v: 1,
    skywellId: options.skywellId || randomSkywellId(options.cryptoLike),
    predecessor: validatedPredecessor.token,
    creatorName: validatedPredecessor.chapter.creatorName,
    motif: MOTIF,
    landmark: LANDMARK,
    event: EVENT_KIND,
    duration: DURATION,
    target: TARGET,
    progress: options.progress ?? 0,
    expiresAt: now + 6 * 60 * 60 * 1000,
  }, { now });
}

export function encodeLivingWorldSkywell(skywell, options = {}) {
  const validated = validateSkywellShape(skywell, options);
  const params = new URLSearchParams();
  for (const key of FIELDS) params.append(key, String(validated[key]));
  return encodeBase64Url(params.toString());
}

export function decodeLivingWorldSkywell(token, options = {}) {
  if (typeof token !== 'string' || token.length < 40 || token.length > TOKEN_LIMIT) throw new Error('INVALID_SKYWELL_TOKEN');
  const params = new URLSearchParams(decodeBase64Url(token));
  const keys = [...params.keys()];
  if (keys.length !== FIELDS.length) throw new Error('INVALID_SKYWELL_SHAPE');
  for (const key of keys) {
    if (!FIELDS.includes(key) || params.getAll(key).length !== 1) throw new Error('INVALID_SKYWELL_SHAPE');
  }
  return validateSkywellShape({
    v: integer(params.get('v'), 1, 1, 'UNSUPPORTED_SKYWELL_VERSION'),
    skywellId: params.get('skywellId'),
    predecessor: params.get('predecessor'),
    creatorName: params.get('creatorName'),
    motif: params.get('motif'),
    landmark: params.get('landmark'),
    event: params.get('event'),
    duration: params.get('duration'),
    target: integer(params.get('target'), TARGET, TARGET, 'INVALID_SKYWELL_TARGET'),
    progress: integer(params.get('progress'), 0, TARGET, 'INVALID_SKYWELL_PROGRESS'),
    expiresAt: integer(params.get('expiresAt'), 1, Number.MAX_SAFE_INTEGER, 'INVALID_SKYWELL_EXPIRY'),
  }, options);
}

export function skywellFromLocation(hash, options = {}) {
  const prefix = `#${LIVING_WORLD_SKYWELL_FRAGMENT}=`;
  if (typeof hash !== 'string' || !hash.startsWith(prefix)) return { status: 'none' };
  try {
    return { status: 'ready', skywell: decodeLivingWorldSkywell(hash.slice(prefix.length), options) };
  } catch (error) {
    return { status: error.message === 'SKYWELL_EXPIRED' ? 'expired' : 'invalid', code: error.message };
  }
}

export function buildLivingWorldSkywellUrl(skywell, {
  progress = skywell.progress,
  baseUrl = globalThis.location?.href || 'https://example.test/',
  now = Date.now(),
} = {}) {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = `${LIVING_WORLD_SKYWELL_FRAGMENT}=${encodeLivingWorldSkywell({ ...skywell, progress }, { now })}`;
  return url.toString();
}

function validateSkywellRecord(record) {
  exactKeys(record, ['skywellId', 'predecessorChapterId', 'target', 'progress', 'contributed'], 'INVALID_SKYWELL_STORAGE');
  if (!SKYWELL_ID.test(record.skywellId) || !CHAPTER_ID.test(record.predecessorChapterId)) {
    throw new Error('INVALID_SKYWELL_STORAGE');
  }
  const target = integer(record.target, TARGET, TARGET, 'INVALID_SKYWELL_STORAGE');
  const progress = integer(record.progress, 0, TARGET, 'INVALID_SKYWELL_STORAGE');
  if (typeof record.contributed !== 'boolean') throw new Error('INVALID_SKYWELL_STORAGE');
  return {
    skywellId: record.skywellId,
    predecessorChapterId: record.predecessorChapterId,
    target,
    progress,
    contributed: record.contributed,
  };
}

function readStateStore(storage) {
  const serialized = storage?.getItem?.(LIVING_WORLD_SKYWELL_STORAGE_KEY);
  if (!serialized) return { serialized: null, data: { version: 1, skywells: [] } };
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw new Error('INVALID_SKYWELL_STORAGE'); }
  exactKeys(parsed, ['version', 'skywells'], 'INVALID_SKYWELL_STORAGE');
  if (parsed.version !== 1 || !Array.isArray(parsed.skywells) || parsed.skywells.length > 8) {
    throw new Error('INVALID_SKYWELL_STORAGE');
  }
  const skywells = parsed.skywells.map(validateSkywellRecord);
  if (new Set(skywells.map(record => record.skywellId)).size !== skywells.length) {
    throw new Error('INVALID_SKYWELL_STORAGE');
  }
  return { serialized, data: { version: 1, skywells } };
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

export function readLivingWorldSkywellState(storage, skywell, options = {}) {
  const now = options.now ?? Date.now();
  const validated = validateSkywellShape(skywell, { now, allowExpired: true });
  const boundPredecessorId = predecessorChapterId(validated, now);
  try {
    const { data } = readStateStore(storage);
    const record = data.skywells.find(item => item.skywellId === validated.skywellId);
    if (!record) return { status: 'ready', progress: validated.progress, contributed: false };
    if (record.predecessorChapterId !== boundPredecessorId || record.target !== TARGET) {
      return { status: 'storage-error', progress: validated.progress, contributed: false };
    }
    if (record.contributed && record.progress === validated.progress + 1) {
      return { status: 'duplicate', progress: record.progress, contributed: true };
    }
    if (record.progress > validated.progress) {
      return { status: 'stale', progress: record.progress, contributed: record.contributed };
    }
    if (record.contributed) {
      return { status: 'duplicate', progress: Math.max(record.progress, validated.progress), contributed: true };
    }
    return { status: 'ready', progress: Math.max(record.progress, validated.progress), contributed: false };
  } catch {
    return { status: 'storage-error', progress: validated.progress, contributed: false };
  }
}

export function commitLivingWorldSkywellContribution(storage, skywell, options = {}) {
  const now = options.now ?? Date.now();
  let validated;
  try {
    validated = validateSkywellShape(skywell, { now });
  } catch {
    return { status: 'storage-error', progress: Number.isSafeInteger(skywell?.progress) ? skywell.progress : 0 };
  }
  const boundPredecessorId = predecessorChapterId(validated, now);
  let store;
  try { store = readStateStore(storage); } catch {
    return { status: 'storage-error', progress: validated.progress };
  }
  const existing = store.data.skywells.find(record => record.skywellId === validated.skywellId);
  if (existing && (existing.predecessorChapterId !== boundPredecessorId || existing.target !== TARGET)) {
    return { status: 'storage-error', progress: validated.progress };
  }
  if (existing?.contributed && existing.progress === validated.progress + 1) {
    return { status: 'duplicate', progress: existing.progress, completed: existing.progress === TARGET };
  }
  if (existing?.progress > validated.progress) {
    return { status: 'stale', progress: existing.progress, completed: existing.progress === TARGET };
  }
  if (existing?.contributed) {
    const progress = Math.max(existing.progress, validated.progress);
    return { status: 'duplicate', progress, completed: progress === TARGET };
  }
  const progress = Math.min(TARGET, Math.max(validated.progress, existing?.progress || 0) + 1);
  const record = {
    skywellId: validated.skywellId,
    predecessorChapterId: boundPredecessorId,
    target: TARGET,
    progress,
    contributed: true,
  };
  const skywells = [record, ...store.data.skywells.filter(item => item.skywellId !== validated.skywellId)].slice(0, 8);
  const serialized = JSON.stringify({ version: 1, skywells });
  if (!writeVerified(storage, LIVING_WORLD_SKYWELL_STORAGE_KEY, serialized, store.serialized)) {
    return { status: 'storage-error', progress: validated.progress };
  }
  return { status: 'accepted', progress, completed: progress === TARGET };
}

function readLaunchStore(storage, now) {
  const serialized = storage?.getItem?.(LIVING_WORLD_SKYWELL_LAUNCH_KEY);
  if (!serialized) return { serialized: null, data: { version: 1, launches: [] } };
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw new Error('INVALID_SKYWELL_LAUNCH_STORAGE'); }
  exactKeys(parsed, ['version', 'launches'], 'INVALID_SKYWELL_LAUNCH_STORAGE');
  if (parsed.version !== 1 || !Array.isArray(parsed.launches) || parsed.launches.length > 4) {
    throw new Error('INVALID_SKYWELL_LAUNCH_STORAGE');
  }
  for (const launch of parsed.launches) {
    exactKeys(launch, ['predecessorChapterId', 'skywell'], 'INVALID_SKYWELL_LAUNCH_STORAGE');
    if (!CHAPTER_ID.test(launch.predecessorChapterId)) throw new Error('INVALID_SKYWELL_LAUNCH_STORAGE');
    const skywell = validateSkywellShape(launch.skywell, { allowExpired: true, now });
    if (predecessorChapterId(skywell, now) !== launch.predecessorChapterId) {
      throw new Error('INVALID_SKYWELL_LAUNCH_STORAGE');
    }
  }
  return { serialized, data: parsed };
}

export function createOrResumeLivingWorldSkywell(storage, predecessor, options = {}) {
  const now = options.now ?? Date.now();
  const validatedPredecessor = validatePredecessor(predecessor, { now, allowExpired: false }).chapter;
  let store;
  try { store = readLaunchStore(storage, now); } catch { return { status: 'storage-error' }; }
  const existing = store.data.launches.find(item => item.predecessorChapterId === validatedPredecessor.chapterId);
  if (existing) {
    try {
      const skywell = validateSkywellShape(existing.skywell, { now });
      return { status: 'resumed', skywell };
    } catch {}
  }
  let skywell;
  try {
    skywell = createLivingWorldSkywell(validatedPredecessor, {
      ...options,
      now,
    });
  } catch {
    return { status: 'invalid' };
  }
  const launches = [
    { predecessorChapterId: validatedPredecessor.chapterId, skywell },
    ...store.data.launches.filter(item => item.predecessorChapterId !== validatedPredecessor.chapterId),
  ].slice(0, 4);
  const serialized = JSON.stringify({ version: 1, launches });
  if (!writeVerified(storage, LIVING_WORLD_SKYWELL_LAUNCH_KEY, serialized, store.serialized)) {
    return { status: 'storage-error' };
  }
  return { status: 'created', skywell };
}

export function deriveSkywellRibs(progress) {
  const current = integer(progress, 0, TARGET, 'INVALID_SKYWELL_PROGRESS');
  return Array.from({ length: TARGET }, (_, index) => Object.freeze({
    index,
    open: index < current,
    target: current < TARGET && index === current,
    dormant: index > current,
  }));
}

export function evaluateSkywellLocks(locks) {
  if (!Array.isArray(locks) || locks.length !== 3 || locks.some(value => typeof value !== 'boolean')) {
    throw new Error('INVALID_SKYWELL_SIGNAL_RESULTS');
  }
  const successfulLocks = locks.filter(Boolean).length;
  return Object.freeze({
    successfulLocks,
    accepted: successfulLocks >= 2,
    perfect: successfulLocks === 3,
  });
}
