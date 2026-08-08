require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { createMqttClient } = require('./src/mqttClient');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.status(200).send('ok'));

const server = http.createServer(app);

const { publishControl } = createMqttClient({
  apiKey: process.env.FAVORIOT_API_KEY,
  broker: process.env.FAVORIOT_BROKER,
  port: Number(process.env.FAVORIOT_PORT || 1883),
  onMessage: (msg) => console.log('MQTT event:', msg.type, msg.data || msg.message),
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dashboard listening on ${PORT}`));
