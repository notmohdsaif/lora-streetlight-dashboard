CREATE TABLE IF NOT EXISTS readings (
  id SERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  node INTEGER,
  param TEXT NOT NULL,
  value NUMERIC NOT NULL,
  raw JSONB
);

CREATE INDEX IF NOT EXISTS idx_readings_node_param_ts ON readings (node, param, ts);

CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  message TEXT NOT NULL
);
