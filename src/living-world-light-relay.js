import {
  commitLivingWorldChapterContribution,
  decodeLivingWorldChapter,
  encodeLivingWorldChapter,
  evaluateSignalLocks,
  readLivingWorldChapterState,
} from './living-world-chapter.js';

const TOKEN_LIMIT = 4200;
const RELAY_KIND = 'carry-light';
const TARGET = 8;
const FIELDS = Object.freeze(['v', 'kind', 'chapter', 'progress', 'targetIndex']);

export const LIVING_WORLD_LIGHT_RELAY_FRAGMENT = 'world-relay';
export const LIVING_WORLD_LIGHT_RELAY_KIND = RELAY_KIND;

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64url');
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('INVALID_LIGHT_RELAY_TOKEN');
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

function canonicalChapter(chapter, options = {}) {
  const token = typeof chapter === 'string'
    ? chapter
    : encodeLivingWorldChapter(chapter, options);
  const validated = decodeLivingWorldChapter(token, options);
  if (validated.motif !== 'folded-horizon' || validated.landmark !== 'signal-grove' || validated.chapter !== 'light-far-shore') {
    throw new Error('INVALID_LIGHT_RELAY_CHAPTER');
  }
  return { chapter: validated, token: encodeLivingWorldChapter(validated, options) };
}

function validateRelayShape(value, { now = Date.now(), allowExpired = false } = {}) {
  exactKeys(value, FIELDS, 'INVALID_LIGHT_RELAY_SHAPE');
  if (value.v !== 1 || value.kind !== RELAY_KIND) throw new Error('INVALID_LIGHT_RELAY_KIND');
  if (typeof value.chapter !== 'string' || value.chapter.length < 40 || value.chapter.length > 3000) {
    throw new Error('INVALID_LIGHT_RELAY_CHAPTER');
  }
  const canonical = canonicalChapter(value.chapter, { now, allowExpired });
  const progress = integer(value.progress, 1, TARGET - 1, 'INVALID_LIGHT_RELAY_PROGRESS');
  const targetIndex = integer(value.targetIndex, 1, TARGET - 1, 'INVALID_LIGHT_RELAY_TARGET');
  if (canonical.chapter.progress !== progress || targetIndex !== progress || progress >= canonical.chapter.target) {
    throw new Error('INVALID_LIGHT_RELAY_BINDING');
  }
  return Object.freeze({
    v: 1,
    kind: RELAY_KIND,
    chapter: canonical.token,
    progress,
    targetIndex,
  });
}

export function createLivingWorldLightRelay(chapter, progress, options = {}) {
  const now = options.now ?? Date.now();
  const canonical = canonicalChapter(chapter, { now, allowExpired: false });
  const current = integer(progress, 1, TARGET - 1, 'INVALID_LIGHT_RELAY_PROGRESS');
  if (current < canonical.chapter.progress || current >= canonical.chapter.target) {
    throw new Error('INVALID_LIGHT_RELAY_PROGRESS');
  }
  const snapshot = { ...canonical.chapter, progress: current };
  return validateRelayShape({
    v: 1,
    kind: RELAY_KIND,
    chapter: encodeLivingWorldChapter(snapshot, { now }),
    progress: current,
    targetIndex: current,
  }, { now });
}

export function encodeLivingWorldLightRelay(relay, options = {}) {
  const validated = validateRelayShape(relay, options);
  const params = new URLSearchParams();
  for (const field of FIELDS) params.append(field, String(validated[field]));
  return encodeBase64Url(params.toString());
}

export function decodeLivingWorldLightRelay(token, options = {}) {
  if (typeof token !== 'string' || token.length < 50 || token.length > TOKEN_LIMIT) {
    throw new Error('INVALID_LIGHT_RELAY_TOKEN');
  }
  const params = new URLSearchParams(decodeBase64Url(token));
  const keys = [...params.keys()];
  if (keys.length !== FIELDS.length) throw new Error('INVALID_LIGHT_RELAY_SHAPE');
  for (const key of keys) {
    if (!FIELDS.includes(key) || params.getAll(key).length !== 1) throw new Error('INVALID_LIGHT_RELAY_SHAPE');
  }
  return validateRelayShape({
    v: integer(params.get('v'), 1, 1, 'UNSUPPORTED_LIGHT_RELAY_VERSION'),
    kind: params.get('kind'),
    chapter: params.get('chapter'),
    progress: integer(params.get('progress'), 1, TARGET - 1, 'INVALID_LIGHT_RELAY_PROGRESS'),
    targetIndex: integer(params.get('targetIndex'), 1, TARGET - 1, 'INVALID_LIGHT_RELAY_TARGET'),
  }, options);
}

export function lightRelayFromLocation(hash, options = {}) {
  const prefix = `#${LIVING_WORLD_LIGHT_RELAY_FRAGMENT}=`;
  if (typeof hash !== 'string' || !hash.startsWith(prefix)) return Object.freeze({ status: 'none' });
  try {
    return Object.freeze({ status: 'ready', relay: decodeLivingWorldLightRelay(hash.slice(prefix.length), options) });
  } catch (error) {
    return Object.freeze({
      status: error.message === 'CHAPTER_EXPIRED' ? 'expired' : 'invalid',
      code: error.message,
    });
  }
}

export function buildLivingWorldLightRelayUrl(relay, {
  baseUrl = globalThis.location?.href || 'https://example.test/',
  now = Date.now(),
} = {}) {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = `${LIVING_WORLD_LIGHT_RELAY_FRAGMENT}=${encodeLivingWorldLightRelay(relay, { now })}`;
  return url.toString();
}

export function decodeLightRelayChapter(relay, options = {}) {
  const validated = validateRelayShape(relay, options);
  return decodeLivingWorldChapter(validated.chapter, options);
}

export function deriveLightRelayLanterns(relay, { progress = relay?.progress, phase = 'ready', now = Date.now() } = {}) {
  const validated = validateRelayShape(relay, { allowExpired: true, now });
  const current = integer(progress, validated.progress, TARGET, 'INVALID_LIGHT_RELAY_PROGRESS');
  const acceptedTarget = validated.targetIndex;
  const nextTarget = current < TARGET ? current : null;
  return Object.freeze(Array.from({ length: TARGET }, (_, index) => Object.freeze({
    index,
    active: index < current,
    target: phase === 'impact' ? index === acceptedTarget : index === nextTarget,
    connected: phase === 'impact' && index === acceptedTarget,
  })));
}

export function resolveLivingWorldLightRelay(storage, relay, options = {}) {
  let validated;
  let chapter;
  try {
    validated = validateRelayShape(relay, options);
    chapter = decodeLivingWorldChapter(validated.chapter, options);
  } catch (error) {
    return Object.freeze({ status: error.message === 'CHAPTER_EXPIRED' ? 'expired' : 'invalid' });
  }
  const state = readLivingWorldChapterState(storage, chapter, options);
  if (state.status === 'storage-error') {
    return Object.freeze({ status: 'storage-error', relay: validated, chapter, progress: validated.progress });
  }
  if (state.progress > validated.progress || state.contributed || state.status === 'duplicate') {
    return Object.freeze({
      status: 'stale',
      relay: validated,
      chapter,
      progress: Math.max(state.progress, validated.progress),
      completed: Math.max(state.progress, validated.progress) >= TARGET,
    });
  }
  if (state.progress !== validated.progress) {
    return Object.freeze({ status: 'ahead', relay: validated, chapter, progress: state.progress });
  }
  return Object.freeze({ status: 'ready', relay: validated, chapter, progress: validated.progress, completed: false });
}

export function commitLivingWorldLightRelayContribution(storage, relay, options = {}) {
  const resolved = resolveLivingWorldLightRelay(storage, relay, options);
  if (resolved.status !== 'ready') return resolved;
  const committed = commitLivingWorldChapterContribution(storage, resolved.chapter, options);
  if (committed.status !== 'accepted') {
    return Object.freeze({
      status: committed.status === 'duplicate' ? 'stale' : 'storage-error',
      relay: resolved.relay,
      chapter: resolved.chapter,
      progress: committed.progress ?? resolved.progress,
      completed: committed.completed === true,
    });
  }
  if (committed.progress !== resolved.relay.targetIndex + 1) {
    return Object.freeze({ status: 'storage-error', relay: resolved.relay, chapter: resolved.chapter, progress: resolved.progress });
  }
  return Object.freeze({
    status: 'accepted',
    relay: resolved.relay,
    chapter: resolved.chapter,
    progress: committed.progress,
    completed: committed.completed === true,
    activatedIndex: resolved.relay.targetIndex,
  });
}

export function evaluateLightRelayLocks(locks) {
  return evaluateSignalLocks(locks);
}
