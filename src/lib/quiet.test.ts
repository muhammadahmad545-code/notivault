import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inWindow } from './quiet';

test('quiet hours across midnight', () => {
  assert.equal(inWindow(22 * 60, 7 * 60, 23 * 60), true);
  assert.equal(inWindow(22 * 60, 7 * 60, 3 * 60), true);
  assert.equal(inWindow(22 * 60, 7 * 60, 7 * 60), false);
  assert.equal(inWindow(22 * 60, 7 * 60, 12 * 60), false);
});

test('quiet hours within a day, and an empty window', () => {
  assert.equal(inWindow(13 * 60, 14 * 60, 13 * 60 + 30), true);
  assert.equal(inWindow(13 * 60, 14 * 60, 14 * 60), false);
  assert.equal(inWindow(9 * 60, 9 * 60, 9 * 60), false);
});
