// In-memory store replacing Postgres. History is lost on restart/redeploy.
// Keeps 24h of readings (the longest chart range) and the last MAX_LOGS log lines.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_LOGS = 500;

const readings = []; // { ts, node, param, value }, oldest first
const logs = []; // { ts, message }, oldest first

function prune(now) {
  while (readings.length && now - readings[0].ts > MAX_AGE_MS) readings.shift();
}

async function insertReadings(rows) {
  if (!rows || rows.length === 0) return;
  const ts = new Date();
  prune(ts);
  rows.forEach((r) => readings.push({ ts, node: r.node, param: r.param, value: r.value }));
}

async function insertLog(message) {
  logs.push({ ts: new Date(), message });
  if (logs.length > MAX_LOGS) logs.shift();
}

// interval is a rangeToInterval() string such as '12 hours'
async function queryHistory(node, param, interval) {
  const cutoff = Date.now() - parseInt(interval, 10) * 60 * 60 * 1000;
  return readings
    .filter((r) => r.param === param && (node === null || r.node === node) && r.ts > cutoff)
    .map(({ ts, value }) => ({ ts, value }));
}

async function queryLogs(limit) {
  return logs.slice(-limit).reverse();
}

module.exports = { insertReadings, insertLog, queryHistory, queryLogs };
