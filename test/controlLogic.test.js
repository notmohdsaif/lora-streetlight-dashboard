const { test } = require('node:test');
const assert = require('node:assert');
const { validateCmd, canSend, validateNodes, nodesToMask } = require('../src/controlLogic');

test('accepts ON and OFF, rejects anything else', () => {
  assert.strictEqual(validateCmd('ON'), true);
  assert.strictEqual(validateCmd('OFF'), true);
  assert.strictEqual(validateCmd('on'), false);
  assert.strictEqual(validateCmd(''), false);
  assert.strictEqual(validateCmd(undefined), false);
});

test('allows the first command when nothing has been sent yet', () => {
  assert.strictEqual(canSend(null, Date.now()), true);
});

test('blocks a second command within the 2s debounce window', () => {
  const now = 10000;
  assert.strictEqual(canSend(now, now + 1000), false);
});

test('allows a second command once the debounce window has passed', () => {
  const now = 10000;
  assert.strictEqual(canSend(now, now + 2000), true);
});

test('respects a custom debounce window', () => {
  const now = 10000;
  assert.strictEqual(canSend(now, now + 500, 1000), false);
  assert.strictEqual(canSend(now, now + 1000, 1000), true);
});

test('validateNodes accepts undefined (broadcast to all)', () => {
  assert.strictEqual(validateNodes(undefined), true);
});

test('validateNodes accepts a non-empty array of unique node IDs 1-9', () => {
  assert.strictEqual(validateNodes([1]), true);
  assert.strictEqual(validateNodes([1, 2]), true);
  assert.strictEqual(validateNodes([9]), true);
});

test('validateNodes rejects empty array, out-of-range, duplicates, non-integers', () => {
  assert.strictEqual(validateNodes([]), false);
  assert.strictEqual(validateNodes([0]), false);
  assert.strictEqual(validateNodes([10]), false);
  assert.strictEqual(validateNodes([1, 1]), false);
  assert.strictEqual(validateNodes([1.5]), false);
  assert.strictEqual(validateNodes(['1']), false);
  assert.strictEqual(validateNodes('1'), false);
});

test('nodesToMask defaults to broadcast-all (0x01FF) when nodes is undefined', () => {
  assert.strictEqual(nodesToMask(undefined), 0x01FF);
});

test('nodesToMask builds the correct bitmask for targeted nodes', () => {
  assert.strictEqual(nodesToMask([1]), 0b000000001);
  assert.strictEqual(nodesToMask([2]), 0b000000010);
  assert.strictEqual(nodesToMask([1, 2]), 0b000000011);
  assert.strictEqual(nodesToMask([9]), 0b100000000);
});
