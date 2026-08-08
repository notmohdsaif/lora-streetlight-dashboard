const { test } = require('node:test');
const assert = require('node:assert');
const { parsePayload } = require('../src/parsePayload');

test('parses a per-node ON payload with a real ACK into readings + ACK log message', () => {
  const data = { node: 2, state: 'ON', rssi: -24, dc: 0.21, online: true, cmd_seq: 5, acked: true, latency_ms: 705 };
  const { readings, logMessage } = parsePayload(data);

  assert.deepStrictEqual(readings, [
    { node: 2, param: 'state', value: 1 },
    { node: 2, param: 'rssi', value: -24 },
    { node: 2, param: 'dc', value: 0.21 },
    { node: 2, param: 'online', value: 1 },
    { node: 2, param: 'acked', value: 1 },
    { node: 2, param: 'latency_ms', value: 705 },
  ]);
  assert.strictEqual(logMessage, 'ACK node=2, 705ms');
});

test('a missed command (acked false, latency_ms -1) skips the latency_ms reading and logs the miss', () => {
  const data = { node: 2, state: 'ON', rssi: -24, dc: 0.21, online: true, cmd_seq: 6, acked: false, latency_ms: -1 };
  const { readings, logMessage } = parsePayload(data);

  const hasLatency = readings.some((r) => r.param === 'latency_ms');
  assert.strictEqual(hasLatency, false, 'should not record a -1 sentinel as a real latency reading');
  assert.strictEqual(logMessage, 'CMD seq=6 missed by node 2');
});

test('parses a mesh_health payload with node=null and no log message', () => {
  const data = { mesh_health: 50, nodes_online: 1 };
  const { readings, logMessage } = parsePayload(data);

  assert.deepStrictEqual(readings, [
    { node: null, param: 'mesh_health', value: 50 },
    { node: null, param: 'nodes_online', value: 1 },
  ]);
  assert.strictEqual(logMessage, null);
});

test('a per-node payload with OFF state records state as 0', () => {
  const data = { node: 1, state: 'OFF', rssi: -31, dc: 0.18, online: true, cmd_seq: 6, acked: true, latency_ms: 810 };
  const { readings } = parsePayload(data);
  assert.deepStrictEqual(readings.find((r) => r.param === 'state'), { node: 1, param: 'state', value: 0 });
});
