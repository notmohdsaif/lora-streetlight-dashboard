const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function insertReadings(rows, raw) {
  if (!rows || rows.length === 0) return;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const base = i * 4;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    params.push(r.node, r.param, r.value, raw ? JSON.stringify(raw) : null);
  });
  const sql = `INSERT INTO readings (node, param, value, raw) VALUES ${values.join(', ')}`;
  await pool.query(sql, params);
}

async function insertLog(message) {
  await pool.query('INSERT INTO logs (message) VALUES ($1)', [message]);
}

async function queryHistory(node, param, interval) {
  const sql = `
    SELECT ts, value FROM readings
    WHERE param = $1
      AND ($2::int IS NULL OR node = $2)
      AND ts > now() - $3::interval
    ORDER BY ts ASC
  `;
  const { rows } = await pool.query(sql, [param, node, interval]);
  return rows;
}

async function queryLogs(limit) {
  const { rows } = await pool.query(
    'SELECT ts, message FROM logs ORDER BY ts DESC LIMIT $1',
    [limit]
  );
  return rows;
}

async function pruneLogs(retentionDays) {
  const { rowCount } = await pool.query(
    `DELETE FROM logs WHERE ts < now() - ($1 || ' days')::interval`,
    [retentionDays]
  );
  return rowCount;
}

module.exports = { pool, insertReadings, insertLog, queryHistory, queryLogs, pruneLogs };
