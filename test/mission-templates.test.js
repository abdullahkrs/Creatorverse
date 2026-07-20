import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_MISSION_TEMPLATE_ID,
  MISSION_TEMPLATE_IDS,
  applyMissionActivation,
  createMissionProgress,
  getMissionTemplateCopy,
  getMissionTemplateKeySets,
  normalizeMissionTemplateId,
} from '../src/mission-templates.js';

test('exposes exactly three stable allowlisted mission templates', () => {
  assert.deepEqual(MISSION_TEMPLATE_IDS, ['route-choice', 'relay-sequence', 'signal-match']);
  assert.equal(DEFAULT_MISSION_TEMPLATE_ID, 'route-choice');
  assert.equal(normalizeMissionTemplateId('relay-sequence'), 'relay-sequence');
  assert.equal(normalizeMissionTemplateId('unknown'), DEFAULT_MISSION_TEMPLATE_ID);
  assert.throws(() => normalizeMissionTemplateId('unknown', { fallback: false }), /INVALID_MISSION_TEMPLATE/);
  assert.deepEqual(getMissionTemplateKeySets().en, getMissionTemplateKeySets().ar);
});

test('all templates complete deterministically with one fixed contribution', () => {
  const route = applyMissionActivation(createMissionProgress('route-choice'), 'sky');
  assert.deepEqual(route, { templateId: 'route-choice', step: 0, completed: true, contribution: 3 });

  let relay = createMissionProgress('relay-sequence');
  relay = applyMissionActivation(relay, 2);
  assert.equal(relay.step, 0);
  relay = applyMissionActivation(relay, 1);
  relay = applyMissionActivation(relay, 2);
  relay = applyMissionActivation(relay, 3);
  assert.deepEqual(relay, { templateId: 'relay-sequence', step: 3, completed: true, contribution: 3 });

  let signal = createMissionProgress('signal-match');
  signal = applyMissionActivation(signal, 'pulse');
  assert.equal(signal.completed, false);
  signal = applyMissionActivation(signal, 'wave');
  assert.deepEqual(signal, { templateId: 'signal-match', step: 0, completed: true, contribution: 3 });

  assert.equal(applyMissionActivation(signal, 'wave'), signal);
});

test('Arabic and English mission copy remain synchronized and bounded', () => {
  const en = getMissionTemplateCopy('en');
  const ar = getMissionTemplateCopy('ar-AE');
  assert.deepEqual(Object.keys(en.templates), Object.keys(ar.templates));
  for (const id of MISSION_TEMPLATE_IDS) {
    assert.ok(en.templates[id].name.length > 0);
    assert.ok(ar.templates[id].name.length > 0);
    assert.ok(en.templates[id].description.split(/\s+/u).length <= 4);
  }
});
