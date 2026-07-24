import { getRelayLanternPoint } from './living-world-light-relay-focus.js';

const TARGET = 8;
const HASH_PATTERN = /^#world-relay=[A-Za-z0-9_-]{50,4200}$/u;

export const WORLD_WAKE_DURATION_MS = 1900;
export const WORLD_WAKE_REDUCED_MS = 80;
export const WORLD_WAKE_PHASES = Object.freeze({
  ESTABLISHED: 'established',
  CONNECTED: 'connected',
  SEAT: 'seat',
  TARGET: 'target',
  SETTLED: 'settled',
});

function finiteInteger(value, minimum, maximum, code) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(code);
  return parsed;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function easeOut(value) {
  const t = clamp01(value);
  return 1 - ((1 - t) ** 3);
}

function smooth(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function deriveWorldWakeModel({
  status = 'ready',
  phase = 'ready',
  progress,
  completed = false,
  restored = false,
} = {}) {
  const current = Number(progress);
  const eligible = status === 'ready'
    && phase === 'ready'
    && completed !== true
    && restored !== true
    && Number.isSafeInteger(current)
    && current >= 1
    && current < TARGET;

  return Object.freeze({
    eligible,
    progress: Number.isSafeInteger(current) ? current : null,
    latestActiveIndex: eligible ? current - 1 : null,
    targetIndex: eligible ? current : null,
    laterDormantIndex: eligible && current + 1 < TARGET ? current + 1 : null,
  });
}

export function worldWakePhaseAt(elapsedMs) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  if (elapsed < 180) return WORLD_WAKE_PHASES.ESTABLISHED;
  if (elapsed < 760) return WORLD_WAKE_PHASES.CONNECTED;
  if (elapsed < 1100) return WORLD_WAKE_PHASES.SEAT;
  if (elapsed < 1900) return WORLD_WAKE_PHASES.TARGET;
  return WORLD_WAKE_PHASES.SETTLED;
}

export function projectWorldWakeFrame(elapsedMs) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const phase = worldWakePhaseAt(elapsed);
  const connectedReveal = elapsed < 180 ? 0 : elapsed < 760
    ? easeOut((elapsed - 180) / 580)
    : 1;
  const connectedFade = elapsed < 1100 ? 1 : 1 - smooth((elapsed - 1100) / 580);
  const targetReveal = elapsed < 1100 ? 0 : smooth((elapsed - 1100) / 580);
  const seatProgress = elapsed < 760 || elapsed >= 1100 ? 0 : (elapsed - 760) / 340;
  const latestScale = 1 - (Math.sin(Math.PI * clamp01(seatProgress)) * 0.04);
  const latestEmphasis = elapsed < 1100 ? 1 : 1 - smooth((elapsed - 1100) / 580);

  return Object.freeze({
    phase,
    settled: phase === WORLD_WAKE_PHASES.SETTLED,
    connectedProgress: clamp01(connectedReveal),
    connectedOpacity: clamp01(connectedFade),
    targetProgress: clamp01(targetReveal),
    targetOpacity: clamp01(targetReveal),
    latestScale,
    latestEmphasis: clamp01(latestEmphasis),
  });
}

export function createWorldWakeConnectedPath(latestActiveIndex) {
  const latest = finiteInteger(latestActiveIndex, 0, TARGET - 2, 'INVALID_WORLD_WAKE_LATEST');
  const start = latest > 0 ? getRelayLanternPoint(latest - 1) : Object.freeze({ x: 522, y: 336 });
  const end = getRelayLanternPoint(latest);
  return `M${start.x} ${start.y} C${start.x + 18} ${start.y - 34} ${end.x - 24} ${end.y + 28} ${end.x} ${end.y}`;
}

export function createWorldWakePresentationMarker(hash) {
  if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) throw new Error('INVALID_WORLD_WAKE_CONTEXT');
  let value = 0x811c9dc5;
  for (let index = 0; index < hash.length; index += 1) {
    value ^= hash.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return `creatorverse-world-wake-v1:${value.toString(16).padStart(8, '0')}`;
}
