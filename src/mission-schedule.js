export const MISSION_SCHEDULE_IDS = Object.freeze([
  'now-1h',
  'now-24h',
  'in-1h-24h',
]);

export const missionScheduleDefinitions = Object.freeze({
  'now-1h': Object.freeze({ startOffsetMinutes: 0, durationMinutes: 60 }),
  'now-24h': Object.freeze({ startOffsetMinutes: 0, durationMinutes: 24 * 60 }),
  'in-1h-24h': Object.freeze({ startOffsetMinutes: 60, durationMinutes: 24 * 60 }),
});

export const MAX_MISSION_SCHEDULE_SPAN_MINUTES = 25 * 60;
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
  if (value > toEpochMinute(now)) throw scheduleError('MISSION_SCHEDULE_CREATED_FUTURE');
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
    scheduleId: id,
    createdAtMinute: creationMinute,
    startMinute,
    endMinute,
    startMs: startMinute * MINUTE_MS,
    endMs: endMinute * MINUTE_MS,
  });
}

export function normalizeMissionScheduleWindow(input, { now = Date.now() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw scheduleError('MISSION_SCHEDULE_INVALID');
  }

  const createdAtMinute = normalizeMissionCreationMinute(input.createdAtMinute, { now });
  const startMinute = input.startMinute;
  const endMinute = input.endMinute;
  if (!Number.isSafeInteger(startMinute) || !Number.isSafeInteger(endMinute)) {
    throw scheduleError('MISSION_SCHEDULE_BOUNDARY_INVALID');
  }
  if (startMinute < createdAtMinute || startMinute - createdAtMinute > 60) {
    throw scheduleError('MISSION_SCHEDULE_START_INVALID');
  }
  if (endMinute <= startMinute || endMinute - createdAtMinute > MAX_MISSION_SCHEDULE_SPAN_MINUTES) {
    throw scheduleError('MISSION_SCHEDULE_END_INVALID');
  }

  const match = MISSION_SCHEDULE_IDS.find(id => {
    const definition = missionScheduleDefinitions[id];
    return startMinute === createdAtMinute + definition.startOffsetMinutes
      && endMinute === startMinute + definition.durationMinutes;
  });
  if (!match) throw scheduleError('MISSION_SCHEDULE_PRESET_INVALID');

  return Object.freeze({
    id: match,
    scheduleId: match,
    createdAtMinute,
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

  const schedule = Number.isSafeInteger(scheduleInput.startMinute)
    || Number.isSafeInteger(scheduleInput.endMinute)
    ? normalizeMissionScheduleWindow(scheduleInput, { now })
    : createMissionSchedule(scheduleInput.scheduleId, scheduleInput.createdAtMinute, { now });
  const currentMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(currentMs) || currentMs < 0) throw scheduleError('MISSION_SCHEDULE_CLOCK_INVALID');

  const state = currentMs < schedule.startMs
    ? 'upcoming'
    : currentMs < schedule.endMs
      ? 'active'
      : 'expired';
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
