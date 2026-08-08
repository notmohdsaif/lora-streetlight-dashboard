function parsePayload(data) {
  const readings = [];
  let logMessage = null;

  if (typeof data.node === 'number') {
    const node = data.node;

    if (data.state !== undefined) {
      readings.push({ node, param: 'state', value: data.state === 'ON' ? 1 : 0 });
    }
    if (data.rssi !== undefined) {
      readings.push({ node, param: 'rssi', value: Number(data.rssi) });
    }
    if (data.dc !== undefined) {
      readings.push({ node, param: 'dc', value: Number(data.dc) });
    }
    if (data.online !== undefined) {
      readings.push({ node, param: 'online', value: data.online ? 1 : 0 });
    }
    if (data.acked !== undefined) {
      readings.push({ node, param: 'acked', value: data.acked ? 1 : 0 });
    }
    // -1 is firmware's "unknown/unacked" sentinel, not a real duration - never chart it.
    if (data.latency_ms !== undefined && data.latency_ms >= 0) {
      readings.push({ node, param: 'latency_ms', value: Number(data.latency_ms) });
    }

    if (data.acked === false) {
      logMessage = `CMD seq=${data.cmd_seq} missed by node ${node}`;
    } else if (data.acked === true && data.latency_ms !== undefined && data.latency_ms >= 0) {
      logMessage = `ACK node=${node}, ${data.latency_ms}ms`;
    }
  } else if (data.mesh_health !== undefined) {
    readings.push({ node: null, param: 'mesh_health', value: Number(data.mesh_health) });
    if (data.nodes_online !== undefined) {
      readings.push({ node: null, param: 'nodes_online', value: Number(data.nodes_online) });
    }
  }

  return { readings, logMessage };
}

module.exports = { parsePayload };
