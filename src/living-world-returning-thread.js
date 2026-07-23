import {
  decodeLivingWorldEvent,
  encodeLivingWorldEvent,
  readLivingWorldState,
} from './living-world-event.js';
import {
  decodeLivingWorldChapter,
  encodeLivingWorldChapter,
  readLivingWorldChapterState,
} from './living-world-chapter.js';

export const RETURNING_THREAD_STORAGE_KEY = 'creatorverse-returning-thread-v1';
export const RETURNING_THREAD_KINDS = Object.freeze([
  'offset-weft',
  'folded-braid',
  'notched-spine',
  'twin-latch',
]);

const EVENT_ID = /^event_[a-z0-9]{20,40}$/u;
const RECORD_FIELDS = Object.freeze([
  'v',
  'kind',
  'predecessorEventId',
  'motif',
  'landmark',
  'contributionBinding',
]);
const MOTIF = 'folded-horizon';
const LANDMARK = 'loombridge';
const CONTRIBUTION_BINDING = /^accepted:event_[a-z0-9]{20,40}$/u;

function validateEvent(event, { now = Date.now() } = {}) {
  const encoded = encodeLivingWorldEvent(event, { now, allowExpired: true });
  return decodeLivingWorldEvent(encoded, { now, allowExpired: true });
}

function validateChapter(chapter, { now = Date.now() } = {}) {
  const encoded = encodeLivingWorldChapter(chapter, { now, allowExpired: true });
  return decodeLivingWorldChapter(encoded, { now, allowExpired: true });
}

function exactParams(serialized) {
  if (typeof serialized !== 'string' || serialized.length < 40 || serialized.length > 420) {
    throw new Error('INVALID_RETURNING_THREAD_STORAGE');
  }
  const params = new URLSearchParams(serialized);
  const keys = [...params.keys()];
  if (keys.length !== RECORD_FIELDS.length) throw new Error('INVALID_RETURNING_THREAD_STORAGE');
  for (const key of keys) {
    if (!RECORD_FIELDS.includes(key) || params.getAll(key).length !== 1) {
      throw new Error('INVALID_RETURNING_THREAD_STORAGE');
    }
  }
  return params;
}

export function validateReturningThread(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('INVALID_RETURNING_THREAD');
  }
  const actual = Object.keys(record).sort();
  const expected = [...RECORD_FIELDS].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('INVALID_RETURNING_THREAD');
  }
  if (record.v !== 1 || !RETURNING_THREAD_KINDS.includes(record.kind)) {
    throw new Error('INVALID_RETURNING_THREAD');
  }
  if (!EVENT_ID.test(record.predecessorEventId)) throw new Error('INVALID_RETURNING_THREAD');
  if (record.motif !== MOTIF || record.landmark !== LANDMARK) throw new Error('INVALID_RETURNING_THREAD');
  if (!CONTRIBUTION_BINDING.test(record.contributionBinding)) throw new Error('INVALID_RETURNING_THREAD');
  if (record.contributionBinding !== `accepted:${record.predecessorEventId}`) {
    throw new Error('INVALID_RETURNING_THREAD');
  }
  return Object.freeze({ ...record });
}

export function serializeReturningThread(record) {
  const validated = validateReturningThread(record);
  const params = new URLSearchParams();
  for (const field of RECORD_FIELDS) params.append(field, String(validated[field]));
  return params.toString();
}

export function parseReturningThread(serialized) {
  const params = exactParams(serialized);
  return validateReturningThread({
    v: Number(params.get('v')),
    kind: params.get('kind'),
    predecessorEventId: params.get('predecessorEventId'),
    motif: params.get('motif'),
    landmark: params.get('landmark'),
    contributionBinding: params.get('contributionBinding'),
  });
}

function readRecord(storage) {
  let serialized;
  try {
    serialized = storage?.getItem?.(RETURNING_THREAD_STORAGE_KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (!serialized) return { status: 'none' };
  try {
    return { status: 'ready', serialized, thread: parseReturningThread(serialized) };
  } catch {
    return { status: 'invalid', serialized };
  }
}

function selectKind(cryptoLike = globalThis.crypto) {
  if (!cryptoLike?.getRandomValues) throw new Error('CRYPTO_UNAVAILABLE');
  const bytes = new Uint8Array(1);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    cryptoLike.getRandomValues(bytes);
    if (bytes[0] < 252) return RETURNING_THREAD_KINDS[bytes[0] % RETURNING_THREAD_KINDS.length];
  }
  throw new Error('CRYPTO_UNAVAILABLE');
}

function writeVerified(storage, serialized, previous) {
  try {
    storage.setItem(RETURNING_THREAD_STORAGE_KEY, serialized);
    if (storage.getItem(RETURNING_THREAD_STORAGE_KEY) !== serialized) throw new Error('WRITE_NOT_VERIFIED');
    return true;
  } catch {
    try {
      if (previous === null) storage.removeItem(RETURNING_THREAD_STORAGE_KEY);
      else storage.setItem(RETURNING_THREAD_STORAGE_KEY, previous);
    } catch {}
    return false;
  }
}

export function createOrRestoreReturningThread(storage, event, options = {}) {
  let validated;
  try {
    validated = validateEvent(event, options);
  } catch {
    return Object.freeze({ status: 'invalid-event' });
  }

  const localState = readLivingWorldState(storage, validated, options);
  if (!localState.contributed || localState.status !== 'duplicate') {
    return Object.freeze({ status: localState.status === 'storage-error' ? 'unavailable' : 'not-contributed' });
  }

  const current = readRecord(storage);
  if (current.status === 'invalid' || current.status === 'unavailable') {
    return Object.freeze({ status: current.status });
  }
  if (current.status === 'ready' && current.thread.predecessorEventId === validated.eventId) {
    return Object.freeze({ status: 'restored', thread: current.thread });
  }

  let thread;
  try {
    thread = validateReturningThread({
      v: 1,
      kind: selectKind(options.cryptoLike),
      predecessorEventId: validated.eventId,
      motif: validated.motif,
      landmark: validated.landmark,
      contributionBinding: `accepted:${validated.eventId}`,
    });
  } catch {
    return Object.freeze({ status: 'unavailable' });
  }

  let previous = null;
  try { previous = storage?.getItem?.(RETURNING_THREAD_STORAGE_KEY) ?? null; } catch { return Object.freeze({ status: 'unavailable' }); }
  const serialized = serializeReturningThread(thread);
  if (!writeVerified(storage, serialized, previous)) return Object.freeze({ status: 'unavailable' });
  return Object.freeze({ status: 'created', thread });
}

export function readReturningThreadForEvent(storage, event, options = {}) {
  let validated;
  try { validated = validateEvent(event, options); } catch { return Object.freeze({ status: 'invalid-event' }); }
  const stored = readRecord(storage);
  if (stored.status !== 'ready') return Object.freeze({ status: stored.status });
  const thread = stored.thread;
  if (
    thread.predecessorEventId !== validated.eventId
    || thread.motif !== validated.motif
    || thread.landmark !== validated.landmark
    || thread.contributionBinding !== `accepted:${validated.eventId}`
  ) {
    return Object.freeze({ status: 'none' });
  }
  return Object.freeze({ status: 'ready', thread });
}

export function readReturningThreadForChapter(storage, chapter, options = {}) {
  let validated;
  let predecessor;
  try {
    validated = validateChapter(chapter, options);
    predecessor = decodeLivingWorldEvent(validated.predecessor, { now: options.now ?? Date.now(), allowExpired: true });
  } catch {
    return Object.freeze({ status: 'invalid-chapter' });
  }
  if (validated.motif !== MOTIF || validated.landmark !== 'signal-grove') {
    return Object.freeze({ status: 'invalid-chapter' });
  }
  const stored = readRecord(storage);
  if (stored.status !== 'ready') return Object.freeze({ status: stored.status });
  const thread = stored.thread;
  if (
    thread.predecessorEventId !== predecessor.eventId
    || thread.motif !== predecessor.motif
    || thread.landmark !== predecessor.landmark
    || thread.contributionBinding !== `accepted:${predecessor.eventId}`
  ) {
    return Object.freeze({ status: 'none' });
  }
  return Object.freeze({ status: 'ready', thread, predecessor });
}

export function deriveReturningThreadChapterState(storage, chapter, options = {}) {
  const continuity = readReturningThreadForChapter(storage, chapter, options);
  if (continuity.status !== 'ready') return Object.freeze({ status: continuity.status, extended: false });
  const state = readLivingWorldChapterState(storage, chapter, options);
  if (state.status === 'storage-error') {
    return Object.freeze({ status: 'unavailable', extended: false });
  }
  const extended = state.contributed === true && state.status === 'duplicate';
  return Object.freeze({
    status: 'ready',
    thread: continuity.thread,
    extended,
    progress: state.progress,
    lanternIndex: extended ? Math.max(0, Math.min(7, state.progress - 1)) : null,
  });
}

export function projectReturningThreadMedia(thread, { extended = false, lanternIndex = null } = {}) {
  const validated = validateReturningThread(thread);
  if (typeof extended !== 'boolean') throw new Error('INVALID_RETURNING_THREAD_MEDIA');
  if (extended && (!Number.isSafeInteger(lanternIndex) || lanternIndex < 0 || lanternIndex > 7)) {
    throw new Error('INVALID_RETURNING_THREAD_MEDIA');
  }
  if (!extended && lanternIndex !== null) throw new Error('INVALID_RETURNING_THREAD_MEDIA');
  return Object.freeze({
    kind: validated.kind,
    extended,
    lanternIndex: extended ? lanternIndex : null,
  });
}
