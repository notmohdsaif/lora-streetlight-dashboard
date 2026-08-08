const { test } = require('node:test');
const assert = require('node:assert');
const { rangeToInterval } = require('../src/rangeToInterval');

test('maps known range strings to Postgres interval literals', () => {
  assert.strictEqual(rangeToInterval('1h'), '1 hour');
  assert.strictEqual(rangeToInterval('12h'), '12 hours');
  assert.strictEqual(rangeToInterval('24h'), '24 hours');
});

test('throws on an unknown range string', () => {
  assert.throws(() => rangeToInterval('7d'), /Invalid range/);
});

test('throws on an empty or undefined range', () => {
  assert.throws(() => rangeToInterval(''), /Invalid range/);
  assert.throws(() => rangeToInterval(undefined), /Invalid range/);
});
