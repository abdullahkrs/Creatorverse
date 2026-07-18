import test from 'node:test';
import assert from 'node:assert/strict';

import { getSafetyAcknowledgementError, isSafetyAcknowledged } from '../src/safety-gate.js';

test('requires the safety acknowledgement before launch', () => {
  assert.equal(isSafetyAcknowledged({ checked: true }), true);
  assert.equal(isSafetyAcknowledged({ checked: false }), false);
  assert.equal(isSafetyAcknowledged(null), false);
});

test('returns synchronized English and Arabic validation messages', () => {
  assert.equal(
    getSafetyAcknowledgementError('en'),
    'Confirm the fictional-world safety acknowledgement before launching the preview.',
  );
  assert.equal(
    getSafetyAcknowledgementError('ar-AE'),
    'أكد إقرار الأمان الخاص بالعالم الخيالي قبل إطلاق المعاينة.',
  );
  assert.equal(
    getSafetyAcknowledgementError('fr'),
    'Confirm the fictional-world safety acknowledgement before launching the preview.',
  );
});
