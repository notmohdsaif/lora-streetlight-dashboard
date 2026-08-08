# LoRa Streetlight Dashboard

Control and monitoring dashboard for a LoRa mesh-based duty-cycle-compliant smart streetlight system. Connects directly to the FavorIOT MQTT broker to provide live control and historical charts that FavorIOT's own dashboard widgets can't support.

## Features

- Broadcast ON/OFF control for the lamp mesh, plus per-node ON/OFF control
- Live per-node status (online/offline, relay state), with controls disabled for a node that isn't currently reachable
- Historical charts: latency, packet delivery ratio, duty cycle (against the AS923 1% regulatory cap)
- Live event log
- Real-time updates over WebSocket, no polling

RSSI and mesh-health readings are still recorded to Postgres (via the firmware's per-node and aggregate health payloads) but aren't currently charted in the UI - removed for now since with only 2 nodes in the testbed, the aggregate figure and the per-node status text already say the same thing.

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
