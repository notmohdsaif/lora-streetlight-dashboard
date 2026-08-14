const mqtt = require('mqtt');
const { parsePayload } = require('./parsePayload');
const { checkOnlineTransition } = require('./onlineTracker');
const { insertReadings, insertLog } = require('./db');

function createMqttClient({ apiKey, broker, port, onMessage }) {
  const pubTopic = `${apiKey}/v2/streams`;
  // clientId left unset used to mean mqtt.js auto-generates a new random ID
  // on every single reconnect attempt. The bridge firmware connects with a
  // fixed clientId (FAVORIOT_DEV_ID) under this same apiKey; if FavorIOT's
  // broker ties its one-session-per-account limit to the authenticated
  // account rather than strict per-clientId MQTT semantics, a constantly
  // shifting identity on every retry would produce exactly the endless
  // "reconnecting -> connected -> reconnecting" loop found 2026-08-15 (no
  // readings reaching Postgres for hours despite the bridge itself being
  // confirmed healthy). A fixed, distinct clientId gives the dashboard a
  // stable identity separate from the bridge's own connection.
  const client = mqtt.connect(`mqtt://${broker}:${port}`, {
    username: apiKey,
    password: apiKey,
    clientId: `${apiKey}-dashboard`,
  });
  const onlineMap = {};

  client.on('connect', () => {
    console.log('MQTT connected');
    client.subscribe(pubTopic);
  });

  client.on('reconnect', () => console.log('MQTT reconnecting...'));
  client.on('error', (err) => console.error('MQTT error:', err.message));

  client.on('message', async (topic, payloadBuf) => {
    let msg;
    try {
      msg = JSON.parse(payloadBuf.toString());
    } catch (err) {
      console.error('Malformed MQTT payload, skipping:', err.message);
      return;
    }
    const data = msg.data;
    if (!data) return;

    const { readings, logMessage } = parsePayload(data);

    try {
      await insertReadings(readings, msg);
    } catch (err) {
      console.error('DB write failed (readings), continuing:', err.message);
    }

    if (logMessage) {
      try {
        await insertLog(logMessage);
      } catch (err) {
        console.error('DB write failed (log), continuing:', err.message);
      }
    }

    if (typeof data.node === 'number' && data.online !== undefined) {
      const { newMap, logMessage: transitionMsg } = checkOnlineTransition(
        onlineMap,
        data.node,
        !!data.online
      );
      Object.assign(onlineMap, newMap);
      if (transitionMsg) {
        try {
          await insertLog(transitionMsg);
        } catch (err) {
          console.error('DB write failed (transition log), continuing:', err.message);
        }
        onMessage({ type: 'log', message: transitionMsg });
      }
    }

    onMessage({ type: 'reading', data, readings, logMessage });
  });

  function publishControl(cmd, mask) {
    const controlTopic = `${apiKey}/v2/streams/status`;
    const payload = mask === undefined ? { cmd } : { cmd, mask };
    client.publish(controlTopic, JSON.stringify(payload));
  }

  return { publishControl, client };
}

module.exports = { createMqttClient };
