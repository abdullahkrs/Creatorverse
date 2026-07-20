import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_MISSION_SCHEDULE_AGE_MINUTES,
  MISSION_SCHEDULE_IDS,
  classifyMissionSchedule,
  normalizeMissionCreationMinute,
  normalizeMissionScheduleId,
  toEpochMinute,
} from '../src/mission-schedule.js';
import { getMissionScheduleCopy, getMissionScheduleKeySets } from '../src/mission-schedule-i18n.js';

const CREATED_MINUTE = 30_000_000;
const atMinute = (minute, offsetMs = 0) => minute * 60_000 + offsetMs;

const expectations = [
  ['now-30m', CREATED_MINUTE, CREATED_MINUTE + 30],
  ['in-1h-30m', CREATED_MINUTE + 60, CREATED_MINUTE + 90],
  ['in-24h-24h', CREATED_MINUTE + 1440, CREATED_MINUTE + 2880],
];

for (const [scheduleId, startMinute, endMinute] of expectations) {
  test(`${scheduleId} classifies exact [start, end) boundaries`, () => {
    const input = { scheduleId, createdAtMinute: CREATED_MINUTE };
    assert.equal(classifyMissionSchedule(input, atMinute(startMinute) - 1).state, 'upcoming');
    assert.equal(classifyMissionSchedule(input, atMinute(startMinute)).state, 'active');
    assert.equal(classifyMissionSchedule(input, atMinute(endMinute) - 1).state, 'active');
    assert.equal(classifyMissionSchedule(input, atMinute(endMinute)).state, 'ended');
  });
}

test('schedule identifiers and creation minutes fail closed', () => {
  assert.deepEqual(MISSION_SCHEDULE_IDS, ['now-30m', 'in-1h-30m', 'in-24h-24h']);
  assert.throws(() => normalizeMissionScheduleId('custom-date'), /MISSION_SCHEDULE_ID_INVALID/);
  assert.throws(() => normalizeMissionCreationMinute(-1, { now: atMinute(CREATED_MINUTE) }), /MISSION_SCHEDULE_CREATED_INVALID/);
  assert.throws(() => normalizeMissionCreationMinute(CREATED_MINUTE + 1, { now: atMinute(CREATED_MINUTE) }), /MISSION_SCHEDULE_CREATED_FUTURE/);
  assert.throws(
    () => normalizeMissionCreationMinute(CREATED_MINUTE - MAX_MISSION_SCHEDULE_AGE_MINUTES - 1, { now: atMinute(CREATED_MINUTE) }),
    /MISSION_SCHEDULE_STALE/,
  );
  assert.equal(toEpochMinute(atMinute(CREATED_MINUTE, 59_999)), CREATED_MINUTE);
});

test('Arabic and English schedule copy remains synchronized and bounded', () => {
  assert.deepEqual(getMissionScheduleKeySets().ar, getMissionScheduleKeySets().en);
  const en = getMissionScheduleCopy('en');
  const ar = getMissionScheduleCopy('ar-AE');
  assert.deepEqual(Object.keys(ar.options), Object.keys(en.options));
  assert.deepEqual(Object.keys(ar.states), Object.keys(en.states));
  for (const localeCopy of [en, ar]) {
    assert.ok(localeCopy.selectorHelp.length <= 70);
    for (const state of Object.values(localeCopy.states)) {
      assert.ok(state.title.split(/\s+/u).length <= 5);
      assert.ok(state.support.length <= 85);
      assert.ok(state.control.split(/\s+/u).length <= 4);
    }
  }
});
