export const MISSION_SCHEDULE_IDS = Object.freeze([
  'now-30m',
  'in-1h-30m',
  'in-24h-24h',
]);

export const missionScheduleDefinitions = Object.freeze({
  'now-30m': Object.freeze({ startOffsetMinutes: 0, durationMinutes: 30 }),
  'in-1h-30m': Object.freeze({ startOffsetMinutes: 60, durationMinutes: 30 }),
  'in-24h-24h': Object.freeze({ startOffsetMinutes: 24 * 60, durationMinutes: 24 * 60 }),
});

export const MAX_MISSION_SCHEDULE_AGE_MINUTES = 48 * 60;
const MINUTE_MS = 60_000;

function scheduleError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function toEpochMinute(now = Date.now()) {
  const numeric = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(numeric) || numeric < 0) throw scheduleError('MISSION_SCHEDULE_CLOCK_INVALID');
  return Math.floor(numeric / MINUTE_MS);
}

export function normalizeMissionScheduleId(value, { fallback = false } = {}) {
  if (MISSION_SCHEDULE_IDS.includes(value)) return value;
  if (fallback) return MISSION_SCHEDULE_IDS[0];
  throw scheduleError('MISSION_SCHEDULE_ID_INVALID');
}

export function normalizeMissionCreationMinute(value, { now = Date.now() } = {}) {
  if (!Number.isSafeInteger(value) || value < 0) throw scheduleError('MISSION_SCHEDULE_CREATED_INVALID');
  const currentMinute = toEpochMinute(now);
  const age = currentMinute - value;
  if (age < 0) throw scheduleError('MISSION_SCHEDULE_CREATED_FUTURE');
  if (age > MAX_MISSION_SCHEDULE_AGE_MINUTES) throw scheduleError('MISSION_SCHEDULE_STALE');
  return value;
}

export function createMissionSchedule(scheduleId, createdAtMinute, { now = Date.now() } = {}) {
  const id = normalizeMissionScheduleId(scheduleId);
  const creationMinute = normalizeMissionCreationMinute(createdAtMinute, { now });
  const definition = missionScheduleDefinitions[id];
  const startMinute = creationMinute + definition.startOffsetMinutes;
  const endMinute = startMinute + definition.durationMinutes;
  return Object.freeze({
    id,
    createdAtMinute: creationMinute,
    startMinute,
    endMinute,
    startMs: startMinute * MINUTE_MS,
    endMs: endMinute * MINUTE_MS,
  });
}

export function classifyMissionSchedule(scheduleInput, now = Date.now()) {
  if (!scheduleInput || typeof scheduleInput !== 'object' || Array.isArray(scheduleInput)) {
    throw scheduleError('MISSION_SCHEDULE_INVALID');
  }
  const schedule = createMissionSchedule(
    scheduleInput.scheduleId,
    scheduleInput.createdAtMinute,
    { now },
  );
  const currentMs = now instanceof Date ? now.getTime() : Number(now);
  const state = currentMs < schedule.startMs
    ? 'upcoming'
    : currentMs < schedule.endMs
      ? 'active'
      : 'ended';
  const nextBoundaryMs = state === 'upcoming'
    ? schedule.startMs
    : state === 'active'
      ? schedule.endMs
      : null;
  return Object.freeze({ ...schedule, state, nextBoundaryMs });
}

export function isMissionScheduleActive(scheduleInput, now = Date.now()) {
  try {
    return classifyMissionSchedule(scheduleInput, now).state === 'active';
  } catch {
    return false;
  }
}
