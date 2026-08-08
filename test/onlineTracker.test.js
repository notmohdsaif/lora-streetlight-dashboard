const { test } = require('node:test');
const assert = require('node:assert');
const { checkOnlineTransition } = require('../src/onlineTracker');

test('first-ever reading for a node produces no transition message', () => {
  const { newMap, logMessage } = checkOnlineTransition({}, 2, true);
  assert.strictEqual(newMap[2], true);
  assert.strictEqual(logMessage, null);
});

test('a node going from online to offline logs a timeout message', () => {
  const { newMap, logMessage } = checkOnlineTransition({ 2: true }, 2, false);
  assert.strictEqual(newMap[2], false);
  assert.strictEqual(logMessage, 'Node 2 offline (timeout)');
});

test('a node going from offline back to online logs a recovery message', () => {
  const { newMap, logMessage } = checkOnlineTransition({ 2: false }, 2, true);
  assert.strictEqual(newMap[2], true);
  assert.strictEqual(logMessage, 'Node 2 back online');
});

test('no change in online state produces no message', () => {
  const { logMessage } = checkOnlineTransition({ 2: true }, 2, true);
  assert.strictEqual(logMessage, null);
});

test('tracking is independent per node', () => {
  const { newMap } = checkOnlineTransition({ 1: true, 2: false }, 1, false);
  assert.strictEqual(newMap[1], false);
  assert.strictEqual(newMap[2], false, 'node 2 state must be preserved untouched');
});
