import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDisplayNumber, parseDisplayNumber } from '../extension/popup/number-animation.js';

test('formatDisplayNumber uses the same Chinese unit style as the popup formatter', () => {
  assert.equal(formatDisplayNumber(9500), '9,500');
  assert.equal(formatDisplayNumber(12500), '1.3万');
});

test('parseDisplayNumber supports raw integers and Chinese ten-thousand units', () => {
  assert.equal(parseDisplayNumber('9,500'), 9500);
  assert.equal(parseDisplayNumber('1.3万'), 13000);
  assert.equal(parseDisplayNumber('0'), 0);
});
