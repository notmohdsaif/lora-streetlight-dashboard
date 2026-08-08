const NODES = [1, 2];
const CHART_CONFIGS = [
  { param: 'latency_ms', perNode: true, unit: 'ms' },
  { param: 'acked', perNode: true, unit: '%', isPdr: true },
  { param: 'dc', perNode: true, unit: '%' },
  { param: 'rssi', perNode: true, unit: 'dBm' },
  { param: 'mesh_health', perNode: false, unit: '% online' },
];

const charts = {};
const currentRange = {};
const nodeStates = {}; // node id -> 'ON' | 'OFF', last known relay state

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

function buildChart(param) {
  const ctx = document.getElementById(`chart-${param}`);
  const cfg = CHART_CONFIGS.find((c) => c.param === param);
  const datasets = cfg.perNode
    ? [
        { label: 'Node 1', data: [], borderColor: '#111', borderWidth: 2, pointRadius: 0, tension: 0.2 },
        { label: 'Node 2', data: [], borderColor: '#999', borderWidth: 2, borderDash: [4, 3], pointRadius: 0, tension: 0.2 },
      ]
    : [{ label: 'All nodes', data: [], borderColor: '#111', borderWidth: 2, pointRadius: 0, tension: 0.2 }];

  // Duty cycle is measured against the AS923 1% regulatory ceiling, and its
  // real values are often near-zero - a flat all-zero line has no visible
  // shape against an auto-scaled hidden axis. Fix both: give the y-axis a
  // fixed range that always includes the cap, and draw the cap itself as a
  // reference line (matches the approved design, spec §5). The reference
  // dataset's data array is kept in sync with chart.data.labels' length in
  // fetchHistory, since Chart.js plots datasets by index against the shared
  // labels array - it must be the same length as the real data to render as
  // a flat line across the full width rather than a single point.
  const yScale = param === 'dc'
    ? { display: false, min: 0, max: 1.2 }
    : { display: false };

  if (param === 'dc') {
    datasets.push({
      label: '1% cap',
      data: [],
      borderColor: '#e33',
      borderWidth: 1,
      borderDash: [3, 3],
      pointRadius: 0,
    });
  }

  charts[param] = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: yScale },
    },
  });
}

async function fetchHistory(param, range) {
  const cfg = CHART_CONFIGS.find((c) => c.param === param);
  const chart = charts[param];

  if (cfg.perNode) {
    for (let i = 0; i < NODES.length; i++) {
      const res = await fetch(`/api/history?node=${NODES[i]}&param=${param}&range=${range}`);
      const rows = await res.json();
      let values = rows.map((r) => Number(r.value));
      let lastDisplay = values.length ? values[values.length - 1] : null;

      if (cfg.isPdr) {
        // acked is stored as a raw 0/1 reading per command, not a percentage.
        // Convert to a running PDR% (acked so far / commands so far) for the
        // chart line, and an overall PDR% for the headline value.
        let ackedCount = 0;
        values = values.map((v, idx) => {
          ackedCount += v;
          return (ackedCount / (idx + 1)) * 100;
        });
        lastDisplay = rows.length ? (ackedCount / rows.length) * 100 : null;
      }

      chart.data.datasets[i].data = values;
      if (i === 0) {
        chart.data.labels = rows.map((r) => fmtTime(r.ts));
        if (param === 'dc') {
          // Keep the 1% cap reference line the same length as the real data
          // so it renders as a flat line across the full chart width.
          const capDataset = chart.data.datasets[chart.data.datasets.length - 1];
          capDataset.data = chart.data.labels.map(() => 1);
        }
      }

      const valEl = document.getElementById(`val-${param}-${NODES[i]}`);
      if (valEl && lastDisplay !== null) {
        const displayValue = cfg.isPdr ? lastDisplay.toFixed(1) : lastDisplay;
        valEl.innerHTML = `${displayValue} <span class="unit">${cfg.unit}</span>`;
      }
    }
  } else {
    const res = await fetch(`/api/history?param=${param}&range=${range}`);
    const rows = await res.json();
    chart.data.datasets[0].data = rows.map((r) => Number(r.value));
    chart.data.labels = rows.map((r) => fmtTime(r.ts));
    const valEl = document.getElementById(`val-${param}`);
    if (valEl && rows.length > 0) {
      valEl.innerHTML = `${Number(rows[rows.length - 1].value)} <span class="unit">${cfg.unit}</span>`;
    }
  }
  chart.update();
}

function setupRangePills() {
  document.querySelectorAll('.range-pill').forEach((pill) => {
    const param = pill.dataset.param;
    currentRange[param] = '1h';
    pill.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        pill.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentRange[param] = btn.dataset.range;
        fetchHistory(param, btn.dataset.range);
      });
    });
  });
}

function updateNodeStatus(node, data) {
  const bulb = document.getElementById(`bulb-${node}`);
  const status = document.getElementById(`status-${node}`);
  if (!bulb || !status) return;

  if (data.state !== undefined) {
    nodeStates[node] = data.state;
    bulb.classList.toggle('on', data.state === 'ON');
  }
  if (data.online !== undefined) {
    status.classList.toggle('online', !!data.online);
    status.classList.toggle('offline', !data.online);
    status.textContent = data.online
      ? `Online, RSSI ${data.rssi} dBm`
      : 'Offline';
  }
}

function prependLog(ts, message) {
  const list = document.getElementById('log-list');
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<div class="t">${fmtTime(ts)}</div><div class="m">${message}</div>`;
  list.prepend(row);
  while (list.children.length > 50) list.removeChild(list.lastChild);
}

async function loadInitialLogs() {
  const res = await fetch('/api/logs?limit=20');
  const rows = await res.json();
  rows.forEach((r) => prependLog(r.ts, r.message));
}

function updateBroadcastButton(stateStr) {
  const btn = document.getElementById('bcast-btn');
  const isOn = stateStr === 'ON';
  btn.dataset.state = isOn ? 'ON' : 'OFF';
  btn.classList.toggle('on', isOn);
  btn.textContent = isOn ? 'ON' : 'OFF';
}

// Nodes can now be commanded individually, so the broadcast circle no
// longer mirrors "whichever node reading arrived last" - it shows ON only
// when every known node is ON, otherwise OFF. Skips the update until at
// least one reading has been seen for every node (avoids a misleading OFF
// flash before any data has loaded).
function refreshBroadcastFromNodes() {
  if (NODES.some((n) => nodeStates[n] === undefined)) return;
  const allOn = NODES.every((n) => nodeStates[n] === 'ON');
  updateBroadcastButton(allOn ? 'ON' : 'OFF');
}

function setWsStatus(connected) {
  const el = document.getElementById('ws-status');
  if (!el) return;
  el.textContent = connected ? 'Live' : 'Reconnecting...';
  el.classList.toggle('offline', !connected);
}

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => setWsStatus(true);
  ws.onclose = () => {
    setWsStatus(false);
    setTimeout(connectWs, 2000);
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'reading' && typeof msg.data.node === 'number') {
      updateNodeStatus(msg.data.node, msg.data);
      if (msg.data.state !== undefined) refreshBroadcastFromNodes();
      if (msg.logMessage) prependLog(Date.now(), msg.logMessage);
    } else if (msg.type === 'log') {
      prependLog(Date.now(), msg.message);
    }
  };
}

// Nodes can be commanded individually now, so the broadcast circle's
// displayed ON/OFF must reflect each node's own last known commanded state
// (aggregated via refreshBroadcastFromNodes), not a fresh per-page-load
// guess - since a second tab, an individual bulb click, or an external
// command (curl, another session) can change any node without this page
// ever seeing it happen.
async function syncBroadcastState() {
  const results = await Promise.all(
    NODES.map((n) =>
      fetch(`/api/history?node=${n}&param=state&range=24h`).then((r) => r.json())
    )
  );
  results.forEach((rows, i) => {
    if (rows.length === 0) return;
    const last = rows[rows.length - 1];
    nodeStates[NODES[i]] = Number(last.value) === 1 ? 'ON' : 'OFF';
  });
  refreshBroadcastFromNodes();
}

function setupBroadcast() {
  const btn = document.getElementById('bcast-btn');
  const label = document.getElementById('bcast-label');

  btn.addEventListener('click', async () => {
    const nextCmd = btn.dataset.state === 'ON' ? 'OFF' : 'ON';
    btn.disabled = true;
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: nextCmd }),
      });
      if (res.ok) {
        updateBroadcastButton(nextCmd);
        label.textContent = `Broadcast, last sent ${new Date().toLocaleTimeString()}`;
      } else {
        const err = await res.json();
        label.textContent = `Broadcast failed: ${err.error}`;
      }
    } finally {
      btn.disabled = false;
    }
  });
}

// Individual node control - each bulb is its own broadcast target (mask
// covering just that node). Mirrors setupBroadcast()'s disable-during-
// request and optimistic-update pattern, applied per node instead of all.
function setupNodeControls() {
  NODES.forEach((node) => {
    const btn = document.getElementById(`bulb-btn-${node}`);
    const bulb = document.getElementById(`bulb-${node}`);
    if (!btn || !bulb) return;

    btn.addEventListener('click', async () => {
      const nextCmd = bulb.classList.contains('on') ? 'OFF' : 'ON';
      btn.disabled = true;
      try {
        const res = await fetch('/api/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: nextCmd, nodes: [node] }),
        });
        if (res.ok) {
          bulb.classList.toggle('on', nextCmd === 'ON');
        }
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function init() {
  CHART_CONFIGS.forEach((c) => buildChart(c.param));
  setupRangePills();
  setupBroadcast();
  setupNodeControls();
  await loadInitialLogs();
  await Promise.all([
    ...CHART_CONFIGS.map((c) => fetchHistory(c.param, '1h')),
    syncBroadcastState(),
  ]);
  connectWs();
}

init();
