# LoRa Streetlight Dashboard

Control and monitoring dashboard for a LoRa mesh-based duty-cycle-compliant smart streetlight system. Connects directly to the FavorIOT MQTT broker to provide live control and historical charts that FavorIOT's own dashboard widgets can't support.

## Features

- Broadcast ON/OFF control for the lamp mesh
- Live per-node status (online/offline, relay state)
- Historical charts: latency, packet delivery ratio, duty cycle (against the AS923 1% regulatory cap), RSSI, mesh health
- Live event log
- Real-time updates over WebSocket, no polling

## Stack

Node.js, Express, MQTT.js, WebSocket (`ws`), PostgreSQL (`pg`), Chart.js. Plain HTML/CSS/JS frontend, no build step.

## Setup

```bash
npm install
cp .env.example .env   # fill in real values
psql "$DATABASE_URL" -f src/schema.sql
npm start
```

## Environment variables

| Variable | Description |
|---|---|
| `FAVORIOT_API_KEY` | FavorIOT API key, used as MQTT username/password |
| `FAVORIOT_BROKER` | FavorIOT MQTT broker hostname |
| `FAVORIOT_PORT` | MQTT broker port (1883) |
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | HTTP port (default 3000) |

## Testing

```bash
npm test
```

Runs the automated tests for the pure logic modules (payload parsing, online-transition detection, range mapping, command validation/debounce). MQTT, database, and browser behavior are verified manually against real hardware and a real broker.
