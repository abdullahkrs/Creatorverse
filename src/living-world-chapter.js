import { decodeLivingWorldEvent, encodeLivingWorldEvent } from './living-world-event.js';

const TOKEN_LIMIT = 2800;
const CHAPTER_ID = /^chapter_[a-z0-9]{20,40}$/u;
const EVENT_ID = /^event_[a-z0-9]{20,40}$/u;
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const SAFE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,27}$/u;
const DURATIONS = new Set(['6h', '24h']);
const TARGET = 8;
const CHAPTER_KIND = 'light-far-shore';
const LANDMARK = 'signal-grove';
const MOTIF = 'folded-horizon';
const FIELDS = [
  'v',
  'chapterId',
  'predecessor',
  'creatorName',
  'motif',
  'landmark',
  'chapter',
  'duration',
  'target',
  'progress',
  'expiresAt',
];

export const LIVING_WORLD_CHAPTER_FRAGMENT = 'world-chapter';
export const LIVING_WORLD_CHAPTER_STORAGE_KEY = 'creatorverse-living-world-chapter-v1';
export const LIVING_WORLD_CHAPTER_LAUNCH_KEY = 'creatorverse-living-world-chapter-launch-v1';
export const LIVING_WORLD_CHAPTER_OWNER_KEY = 'creatorverse-living-world-chapter-owner-v1';
export const LIVING_WORLD_PREDECESSOR_OWNER_KEY = 'creatorverse-living-world-owner-v1';

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64url');
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('INVALID_CHAPTER_TOKEN');
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
    throw new Error('INVALID_CHAPTER_CREATOR');
  }
  return value;
}

function randomChapterId(cryptoLike = globalThis.crypto) {
  if (!cryptoLike?.getRandomValues) throw new Error('CRYPTO_UNAVAILABLE');
  const bytes = new Uint8Array(15);
  cryptoLike.getRandomValues(bytes);
  return `chapter_${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function validatePredecessor(value, { now = Date.now(), allowExpired = true } = {}) {
  const predecessor = typeof value === 'string'
    ? decodeLivingWorldEvent(value, { now, allowExpired })
    : value;
  const normalized = { ...predecessor, progress: predecessor?.target };
  const encoded = encodeLivingWorldEvent(normalized, { now, allowExpired });
  const validated = decodeLivingWorldEvent(encoded, { now, allowExpired });
  if (validated.motif !== MOTIF || validated.landmark !== 'loombridge' || validated.progress !== validated.target) {
    throw new Error('INVALID_CHAPTER_PREDECESSOR');
  }
  return { event: validated, token: encoded };
}

function validateChapterShape(value, { now = Date.now(), allowExpired = false } = {}) {
  exactKeys(value, FIELDS, 'INVALID_CHAPTER_SHAPE');
  if (value.v !== 1 || !CHAPTER_ID.test(value.chapterId)) throw new Error('INVALID_CHAPTER_ID');
  if (typeof value.predecessor !== 'string' || value.predecessor.length > 1500) throw new Error('INVALID_CHAPTER_PREDECESSOR');
  const predecessor = validatePredecessor(value.predecessor, { now, allowExpired: true }).event;
  const creatorName = safeName(value.creatorName);
  if (creatorName !== predecessor.creatorName) throw new Error('INVALID_CHAPTER_BINDING');
  if (value.motif !== MOTIF || value.landmark !== LANDMARK || value.chapter !== CHAPTER_KIND) {
    throw new Error('INVALID_CHAPTER_IDENTITY');
  }
  if (!DURATIONS.has(value.duration)) throw new Error('INVALID_CHAPTER_DURATION');
  const target = integer(value.target, TARGET, TARGET, 'INVALID_CHAPTER_TARGET');
  const progress = integer(value.progress, 0, TARGET, 'INVALID_CHAPTER_PROGRESS');
  const expiresAt = integer(value.expiresAt, 1, Number.MAX_SAFE_INTEGER, 'INVALID_CHAPTER_EXPIRY');
  const lifetime = value.duration === '6h' ? 6 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  if (!allowExpired && expiresAt <= now) throw new Error('CHAPTER_EXPIRED');
  if (expiresAt > now + lifetime + 5 * 60 * 1000) throw new Error('INVALID_CHAPTER_EXPIRY');
  return Object.freeze({ ...value, creatorName, target, progress, expiresAt, predecessorEventId: predecessor.eventId });
}

export function createLivingWorldChapter(predecessor, { duration = '6h' } = {}, options = {}) {
  if (!DURATIONS.has(duration)) throw new Error('INVALID_CHAPTER_DURATION');
  const now = options.now ?? Date.now();
  const validatedPredecessor = validatePredecessor(predecessor, { now, allowExpired: false });
  const lifetime = duration === '6h' ? 6 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return validateChapterShape({
    v: 1,
    chapterId: options.chapterId || randomChapterId(options.cryptoLike),
    predecessor: validatedPredecessor.token,
    creatorName: validatedPredecessor.event.creatorName,
    motif: MOTIF,
    landmark: LANDMARK,
    chapter: CHAPTER_KIND,
    duration,
    target: TARGET,
    progress: options.progress ?? 0,
    expiresAt: now + lifetime,
  }, { now });
}

export function encodeLivingWorldChapter(chapter, options = {}) {
  const validated = validateChapterShape(chapter, options);
  const params = new URLSearchParams();
  for (const key of FIELDS) params.append(key, String(validated[key]));
  return encodeBase64Url(params.toString());
}

export function decodeLivingWorldChapter(token, options = {}) {
  if (typeof token !== 'string' || token.length < 40 || token.length > TOKEN_LIMIT) throw new Error('INVALID_CHAPTER_TOKEN');
  const params = new URLSearchParams(decodeBase64Url(token));
  const keys = [...params.keys()];
  if (keys.length !== FIELDS.length) throw new Error('INVALID_CHAPTER_SHAPE');
  for (const key of keys) {
    if (!FIELDS.includes(key) || params.getAll(key).length !== 1) throw new Error('INVALID_CHAPTER_SHAPE');
  }
  return validateChapterShape({
    v: integer(params.get('v'), 1, 1, 'UNSUPPORTED_CHAPTER_VERSION'),
    chapterId: params.get('chapterId'),
    predecessor: params.get('predecessor'),
    creatorName: params.get('creatorName'),
    motif: params.get('motif'),
    landmark: params.get('landmark'),
    chapter: params.get('chapter'),
    duration: params.get('duration'),
    target: integer(params.get('target'), TARGET, TARGET, 'INVALID_CHAPTER_TARGET'),
    progress: integer(params.get('progress'), 0, TARGET, 'INVALID_CHAPTER_PROGRESS'),
    expiresAt: integer(params.get('expiresAt'), 1, Number.MAX_SAFE_INTEGER, 'INVALID_CHAPTER_EXPIRY'),
  }, options);
}

export function chapterFromLocation(hash, options = {}) {
  const prefix = `#${LIVING_WORLD_CHAPTER_FRAGMENT}=`;
  if (typeof hash !== 'string' || !hash.startsWith(prefix)) return { status: 'none' };
  try {
    return { status: 'ready', chapter: decodeLivingWorldChapter(hash.slice(prefix.length), options) };
  } catch (error) {
    return { status: error.message === 'CHAPTER_EXPIRED' ? 'expired' : 'invalid', code: error.message };
  }
}

export function buildLivingWorldChapterUrl(chapter, {
  progress = chapter.progress,
  baseUrl = globalThis.location?.href || 'https://example.test/',
  now = Date.now(),
} = {}) {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = `${LIVING_WORLD_CHAPTER_FRAGMENT}=${encodeLivingWorldChapter({ ...chapter, progress }, { now })}`;
  return url.toString();
}

function validateChapterRecord(record) {
  exactKeys(record, ['chapterId', 'predecessorEventId', 'target', 'progress', 'contributed'], 'INVALID_CHAPTER_STORAGE');
  if (!CHAPTER_ID.test(record.chapterId) || !EVENT_ID.test(record.predecessorEventId)) throw new Error('INVALID_CHAPTER_STORAGE');
  const target = integer(record.target, TARGET, TARGET, 'INVALID_CHAPTER_STORAGE');
  const progress = integer(record.progress, 0, TARGET, 'INVALID_CHAPTER_STORAGE');
  if (typeof record.contributed !== 'boolean') throw new Error('INVALID_CHAPTER_STORAGE');
  return { chapterId: record.chapterId, predecessorEventId: record.predecessorEventId, target, progress, contributed: record.contributed };
}

function readStateStore(storage) {
  const serialized = storage?.getItem?.(LIVING_WORLD_CHAPTER_STORAGE_KEY);
  if (!serialized) return { serialized: null, data: { version: 1, chapters: [] } };
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw new Error('INVALID_CHAPTER_STORAGE'); }
  exactKeys(parsed, ['version', 'chapters'], 'INVALID_CHAPTER_STORAGE');
  if (parsed.version !== 1 || !Array.isArray(parsed.chapters) || parsed.chapters.length > 8) throw new Error('INVALID_CHAPTER_STORAGE');
  const chapters = parsed.chapters.map(validateChapterRecord);
  if (new Set(chapters.map(record => record.chapterId)).size !== chapters.length) throw new Error('INVALID_CHAPTER_STORAGE');
  return { serialized, data: { version: 1, chapters } };
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

export function readLivingWorldChapterState(storage, chapter, options = {}) {
  const validated = validateChapterShape(chapter, { now: options.now ?? Date.now(), allowExpired: true });
  try {
    const { data } = readStateStore(storage);
    const record = data.chapters.find(item => item.chapterId === validated.chapterId);
    if (!record) return { status: 'ready', progress: validated.progress, contributed: false };
    if (record.predecessorEventId !== validated.predecessorEventId || record.target !== TARGET || record.progress < validated.progress) {
      return { status: 'storage-error', progress: validated.progress, contributed: false };
    }
    return { status: record.contributed ? 'duplicate' : 'ready', progress: record.progress, contributed: record.contributed };
  } catch {
    return { status: 'storage-error', progress: validated.progress, contributed: false };
  }
}

export function commitLivingWorldChapterContribution(storage, chapter, options = {}) {
  let validated;
  try {
    validated = validateChapterShape(chapter, { now: options.now ?? Date.now() });
  } catch {
    return { status: 'storage-error', progress: Number.isSafeInteger(chapter?.progress) ? chapter.progress : 0 };
  }
  let store;
  try { store = readStateStore(storage); } catch { return { status: 'storage-error', progress: validated.progress }; }
  const existing = store.data.chapters.find(record => record.chapterId === validated.chapterId);
  if (existing && (existing.predecessorEventId !== validated.predecessorEventId || existing.progress < validated.progress)) {
    return { status: 'storage-error', progress: validated.progress };
  }
  if (existing?.contributed) return { status: 'duplicate', progress: existing.progress, completed: existing.progress === TARGET };
  const progress = Math.min(TARGET, Math.max(validated.progress, existing?.progress || 0) + 1);
  const record = {
    chapterId: validated.chapterId,
    predecessorEventId: validated.predecessorEventId,
    target: TARGET,
    progress,
    contributed: true,
  };
  const chapters = [record, ...store.data.chapters.filter(item => item.chapterId !== validated.chapterId)].slice(0, 8);
  const serialized = JSON.stringify({ version: 1, chapters });
  if (!writeVerified(storage, LIVING_WORLD_CHAPTER_STORAGE_KEY, serialized, store.serialized)) {
    return { status: 'storage-error', progress: validated.progress };
  }
  return { status: 'accepted', progress, completed: progress === TARGET };
}

function readLaunchStore(storage) {
  const serialized = storage?.getItem?.(LIVING_WORLD_CHAPTER_LAUNCH_KEY);
  if (!serialized) return { serialized: null, data: { version: 1, launches: [] } };
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw new Error('INVALID_CHAPTER_LAUNCH_STORAGE'); }
  exactKeys(parsed, ['version', 'launches'], 'INVALID_CHAPTER_LAUNCH_STORAGE');
  if (parsed.version !== 1 || !Array.isArray(parsed.launches) || parsed.launches.length > 4) throw new Error('INVALID_CHAPTER_LAUNCH_STORAGE');
  for (const launch of parsed.launches) {
    exactKeys(launch, ['predecessorEventId', 'chapter'], 'INVALID_CHAPTER_LAUNCH_STORAGE');
    if (!EVENT_ID.test(launch.predecessorEventId)) throw new Error('INVALID_CHAPTER_LAUNCH_STORAGE');
    const chapter = validateChapterShape(launch.chapter, { allowExpired: true });
    if (chapter.predecessorEventId !== launch.predecessorEventId) throw new Error('INVALID_CHAPTER_LAUNCH_STORAGE');
  }
  return { serialized, data: parsed };
}

export function createOrResumeLivingWorldChapter(storage, predecessor, config = {}, options = {}) {
  const now = options.now ?? Date.now();
  const validatedPredecessor = validatePredecessor(predecessor, { now, allowExpired: false }).event;
  let store;
  try { store = readLaunchStore(storage); } catch { return { status: 'storage-error' }; }
  const existing = store.data.launches.find(item => item.predecessorEventId === validatedPredecessor.eventId);
  if (existing) {
    try {
      const chapter = validateChapterShape(existing.chapter, { now });
      return { status: 'resumed', chapter };
    } catch {}
  }
  let chapter;
  try { chapter = createLivingWorldChapter(validatedPredecessor, config, { ...options, now }); } catch { return { status: 'invalid' }; }
  const launches = [
    { predecessorEventId: validatedPredecessor.eventId, chapter },
    ...store.data.launches.filter(item => item.predecessorEventId !== validatedPredecessor.eventId),
  ].slice(0, 4);
  const serialized = JSON.stringify({ version: 1, launches });
  if (!writeVerified(storage, LIVING_WORLD_CHAPTER_LAUNCH_KEY, serialized, store.serialized)) return { status: 'storage-error' };
  return { status: 'created', chapter };
}

export function deriveSignalLanterns(progress) {
  const current = integer(progress, 0, TARGET, 'INVALID_CHAPTER_PROGRESS');
  return Array.from({ length: TARGET }, (_, index) => Object.freeze({ index, active: index < current }));
}

export function evaluateSignalLocks(locks) {
  if (!Array.isArray(locks) || locks.length !== 3 || locks.some(value => typeof value !== 'boolean')) {
    throw new Error('INVALID_SIGNAL_RESULTS');
  }
  const successfulLocks = locks.filter(Boolean).length;
  return Object.freeze({ successfulLocks, accepted: successfulLocks >= 2, perfect: successfulLocks === 3 });
}
