import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_MISSION_SCHEDULE_SPAN_MINUTES,
  MISSION_SCHEDULE_IDS,
  classifyMissionSchedule,
  createMissionSchedule,
  normalizeMissionCreationMinute,
  normalizeMissionScheduleId,
  normalizeMissionScheduleWindow,
  toEpochMinute,
} from '../src/mission-schedule.js';
import { getMissionScheduleCopy, getMissionScheduleKeySets } from '../src/mission-schedule-i18n.js';

const CREATED_MINUTE = 30_000_000;
const atMinute = (minute, offsetMs = 0) => minute * 60_000 + offsetMs;

const expectations = [
  ['now-1h', CREATED_MINUTE, CREATED_MINUTE + 60],
  ['now-24h', CREATED_MINUTE, CREATED_MINUTE + 1440],
  ['in-1h-24h', CREATED_MINUTE + 60, CREATED_MINUTE + 1500],
];

for (const [scheduleId, startMinute, endMinute] of expectations) {
  test(`${scheduleId} derives and classifies exact [start, end) boundaries`, () => {
    const created = createMissionSchedule(scheduleId, CREATED_MINUTE, { now: atMinute(CREATED_MINUTE) });
    assert.equal(created.startMinute, startMinute);
    assert.equal(created.endMinute, endMinute);

    const input = { createdAtMinute: CREATED_MINUTE, startMinute, endMinute };
    if (startMinute > CREATED_MINUTE) {
      assert.equal(classifyMissionSchedule(input, atMinute(startMinute) - 1).state, 'upcoming');
    }
    assert.equal(classifyMissionSchedule(input, atMinute(startMinute)).state, 'active');
    assert.equal(classifyMissionSchedule(input, atMinute(endMinute) - 1).state, 'active');
    assert.equal(classifyMissionSchedule(input, atMinute(endMinute)).state, 'expired');
  });
}

test('explicit boundaries must match exactly one allowlisted preset', () => {
  const valid = normalizeMissionScheduleWindow({
    createdAtMinute: CREATED_MINUTE,
    startMinute: CREATED_MINUTE + 60,
    endMinute: CREATED_MINUTE + 1500,
  }, { now: atMinute(CREATED_MINUTE) });
  assert.equal(valid.scheduleId, 'in-1h-24h');
  assert.equal(MAX_MISSION_SCHEDULE_SPAN_MINUTES, 1500);

  for (const input of [
    { createdAtMinute: CREATED_MINUTE, startMinute: CREATED_MINUTE, endMinute: CREATED_MINUTE },
    { createdAtMinute: CREATED_MINUTE, startMinute: CREATED_MINUTE + 61, endMinute: CREATED_MINUTE + 1501 },
    { createdAtMinute: CREATED_MINUTE, startMinute: CREATED_MINUTE, endMinute: CREATED_MINUTE + 61 },
    { createdAtMinute: CREATED_MINUTE, startMinute: CREATED_MINUTE, endMinute: CREATED_MINUTE + 1501 },
    { createdAtMinute: CREATED_MINUTE, startMinute: 'soon', endMinute: CREATED_MINUTE + 60 },
  ]) {
    assert.throws(
      () => normalizeMissionScheduleWindow(input, { now: atMinute(CREATED_MINUTE) }),
      /MISSION_SCHEDULE_/,
    );
  }
});

test('schedule identifiers, creation minutes, and clocks fail closed', () => {
  assert.deepEqual(MISSION_SCHEDULE_IDS, ['now-1h', 'now-24h', 'in-1h-24h']);
  assert.throws(() => normalizeMissionScheduleId('custom-date'), /MISSION_SCHEDULE_ID_INVALID/);
  assert.throws(() => normalizeMissionCreationMinute(-1, { now: atMinute(CREATED_MINUTE) }), /MISSION_SCHEDULE_CREATED_INVALID/);
  assert.throws(() => normalizeMissionCreationMinute(CREATED_MINUTE + 1, { now: atMinute(CREATED_MINUTE) }), /MISSION_SCHEDULE_CREATED_FUTURE/);
  assert.equal(normalizeMissionCreationMinute(1, { now: atMinute(CREATED_MINUTE) }), 1);
  assert.equal(toEpochMinute(atMinute(CREATED_MINUTE, 59_999)), CREATED_MINUTE);
  assert.throws(() => toEpochMinute(Number.NaN), /MISSION_SCHEDULE_CLOCK_INVALID/);
});

test('Arabic and English schedule copy remains synchronized and bounded', () => {
  assert.deepEqual(getMissionScheduleKeySets().ar, getMissionScheduleKeySets().en);
  const en = getMissionScheduleCopy('en');
  const ar = getMissionScheduleCopy('ar-AE');
  assert.deepEqual(Object.keys(ar.options), Object.keys(en.options));
  for (const localeCopy of [en, ar]) {
    assert.ok(localeCopy.selectorLegend.split(/\s+/u).length <= 3);
    for (const label of Object.values(localeCopy.options)) {
      assert.ok(label.split(/\s+/u).filter(word => word !== '·').length <= 6);
    }
    for (const key of ['expiredSupport', 'invalidSupport', 'errorSupport']) {
      assert.ok(localeCopy[key].length <= 120);
    }
    for (const key of ['checkAgain', 'tryAgain', 'back']) {
      assert.ok(localeCopy[key].split(/\s+/u).length <= 3);
    }
  }
});
