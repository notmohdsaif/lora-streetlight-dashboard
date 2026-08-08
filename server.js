require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { createMqttClient } = require('./src/mqttClient');
const { createWsServer } = require('./src/wsServer');
const { createControlRouter } = require('./src/routes/control');
const { createHistoryRouter } = require('./src/routes/history');
const { createLogsRouter } = require('./src/routes/logs');
const { insertLog, pruneLogs } = require('./src/db');

const LOG_RETENTION_DAYS = 30;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function runLogPrune() {
  pruneLogs(LOG_RETENTION_DAYS)
    .then((deleted) => {
      if (deleted > 0) console.log(`Pruned ${deleted} log row(s) older than ${LOG_RETENTION_DAYS} days`);
    })
    .catch((err) => console.error('Log prune failed:', err.message));
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.status(200).send('ok'));

const server = http.createServer(app);
const { broadcast } = createWsServer(server);

const { publishControl } = createMqttClient({
  apiKey: process.env.FAVORIOT_API_KEY,
  broker: process.env.FAVORIOT_BROKER,
  port: Number(process.env.FAVORIOT_PORT || 1883),
  onMessage: (msg) => broadcast(msg),
});

app.use(createControlRouter({ publishControl, insertLog }));
app.use(createHistoryRouter());
app.use(createLogsRouter());

runLogPrune();
setInterval(runLogPrune, PRUNE_INTERVAL_MS);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dashboard listening on ${PORT}`));
