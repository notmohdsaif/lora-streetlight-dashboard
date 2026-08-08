const { test } = require('node:test');
const assert = require('node:assert');
const { validateCmd, canSend } = require('../src/controlLogic');

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
