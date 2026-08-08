require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { createMqttClient } = require('./src/mqttClient');
const { createWsServer } = require('./src/wsServer');
const { createControlRouter } = require('./src/routes/control');
const { insertLog } = require('./src/db');

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dashboard listening on ${PORT}`));
