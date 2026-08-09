const NODES = [1, 2];
const CHART_CONFIGS = [
  { param: 'latency_ms', perNode: true, unit: 'ms' },
  { param: 'acked', perNode: true, unit: '%', isPdr: true },
  { param: 'dc', perNode: true, unit: '%' },
];

const charts = {};
const currentRange = {};
const nodeStates = {}; // node id -> 'ON' | 'OFF', last known relay state
const nodeOnlineReading = {}; // node id -> { value: boolean, at: ms } - last known online reading, any age
const nodeRssi = {}; // node id -> last known RSSI, shown whenever a node reads as online

function fmtAxisTime(ts) {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 5);
}

function fmtLogTime(ts) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd} ${d.toTimeString().slice(0, 5)}`;
}

// Bucket averages are floats (724.6666666666...) - round to at most 1
// decimal place, but don't force a trailing ".0" on values that are
// already whole (409, not 409.0).
function roundDisplay(v) {
  return Math.round(v * 10) / 10;
}

const AXIS_FONT = { family: 'Inter', size: 10 };

function buildChart(param) {
  const ctx = document.getElementById(`chart-${param}`);
  const cfg = CHART_CONFIGS.find((c) => c.param === param);
  const pointStyle = {
    pointRadius: 2.5,
    pointHoverRadius: 4.5,
    pointBackgroundColor: '#fff',
    pointBorderWidth: 1.5,
  };
  const datasets = cfg.perNode
    ? [
        { label: 'Node 1', data: [], borderColor: '#111', pointBorderColor: '#111', borderWidth: 2, tension: 0.2, ...pointStyle },
        { label: 'Node 2', data: [], borderColor: '#999', pointBorderColor: '#999', borderWidth: 2, borderDash: [4, 3], tension: 0.2, ...pointStyle },
      ]
    : [{ label: 'All nodes', data: [], borderColor: '#111', pointBorderColor: '#111', borderWidth: 2, tension: 0.2, ...pointStyle }];

  // Duty cycle is measured against the AS923 1% regulatory ceiling, and its
  // real values are often near-zero - a flat all-zero line has no visible
  // shape against an auto-scaled hidden axis. Fix both: give the y-axis a
  // fixed range that always includes the cap, and draw the cap itself as a
  // reference line (matches the approved design, spec §5). The reference
  // dataset's data array is kept in sync with chart.data.labels' length in
  // fetchHistory, since Chart.js plots datasets by index against the shared
  // labels array - it must be the same length as the real data to render as
  // a flat line across the full width rather than a single point.
  const yScale = {
    display: true,
    min: param === 'dc' ? 0 : undefined,
    max: param === 'dc' ? 1.2 : undefined,
    grid: { color: 'rgba(17,17,17,.08)' },
    border: { display: false },
    ticks: { font: AXIS_FONT, color: '#777', maxTicksLimit: 4, padding: 4 },
  };

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
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          displayColors: false,
          backgroundColor: '#111',
          padding: 8,
          cornerRadius: 2,
          titleFont: { family: 'Inter', size: 11, weight: '600' },
          bodyFont: { family: 'Inter', size: 11 },
          // A gap bucket (no samples that window) has parsed.y === null.
          // Without this filter, `null * 10` coerces to 0 in roundDisplay
          // and the tooltip would show a misleading "0" for missing data.
          filter: (item) => item.parsed.y !== null,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${roundDisplay(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          border: { color: 'rgba(17,17,17,.15)' },
          ticks: {
            font: AXIS_FONT,
            color: '#777',
            maxTicksLimit: 5,
            autoSkip: true,
            maxRotation: 0,
          },
        },
        y: yScale,
      },
    },
  });
}

// Nodes report on command/ack, not a fixed heartbeat, so raw readings land
// at whatever irregular moments commands happened to be sent - a burst of
// clicks packs dozens of points into a few seconds, a quiet stretch leaves
// none at all. Bucket them onto a fixed grid per range instead, averaging
// whatever real samples fall in each window - that's the standard way to
// downsample monitoring data (smooths noise, doesn't cherry-pick a single
// possibly-outlier sample the way "nearest point to the mark" would) and it
// gives every range a consistent, readable point count.
const BUCKET_CONFIG = {
  '1h': { n: 30, stepMin: 2 },
  '12h': { n: 24, stepMin: 30 },
  '24h': { n: 24, stepMin: 60 },
};

function bucketRows(rows, range) {
  const { n, stepMin } = BUCKET_CONFIG[range];
  const stepMs = stepMin * 60000;
  const start = Date.now() - n * stepMs;
  const buckets = Array.from({ length: n }, (_, i) => ({
    t: start + i * stepMs + stepMs / 2,
    sum: 0,
    count: 0,
  }));
  rows.forEach((r) => {
    const t = new Date(r.ts).getTime();
    const idx = Math.floor((t - start) / stepMs);
    if (idx >= 0 && idx < n) {
      buckets[idx].sum += Number(r.value);
      buckets[idx].count += 1;
    }
  });
  return buckets.map((b) => ({
    ts: new Date(b.t),
    value: b.count ? b.sum / b.count : null,
  }));
}

// Clicking range pills quickly (1h -> 24h -> 1h) fires overlapping requests
// with no guaranteed resolve order - a slower, now-stale response landing
// last would silently overwrite a newer one on screen. Track a generation
// per param and skip applying a response once a newer request for the same
// param has been issued.
const fetchGeneration = {};

async function fetchHistory(param, range) {
  const cfg = CHART_CONFIGS.find((c) => c.param === param);
  const chart = charts[param];
  const gen = (fetchGeneration[param] = (fetchGeneration[param] || 0) + 1);

  let totalRows = 0;

  if (cfg.perNode) {
    for (let i = 0; i < NODES.length; i++) {
      const res = await fetch(`/api/history?node=${NODES[i]}&param=${param}&range=${range}`);
      const rows = await res.json();
      totalRows += rows.length;

      // acked is stored as a raw 0/1 reading per command - bucket-averaging
      // it directly gives "PDR% for that window", which is what isPdr's
      // 100x scale below is for.
      const buckets = bucketRows(rows, range);
      const values = buckets.map((b) => (b.value === null ? null : b.value * (cfg.isPdr ? 100 : 1)));
      const lastBucket = [...values].reverse().find((v) => v !== null);
      const lastDisplay = lastBucket !== undefined ? lastBucket : null;

      chart.data.datasets[i].data = values;
      if (i === 0) {
        chart.data.labels = buckets.map((b) => fmtAxisTime(b.ts));
        if (param === 'dc') {
          // Keep the 1% cap reference line the same length as the real data
          // so it renders as a flat line across the full chart width.
          const capDataset = chart.data.datasets[chart.data.datasets.length - 1];
          capDataset.data = chart.data.labels.map(() => 1);
        }
      }

      const valEl = document.getElementById(`val-${param}-${NODES[i]}`);
      if (valEl && lastDisplay !== null) {
        valEl.innerHTML = `${roundDisplay(lastDisplay)} <span class="unit">${cfg.unit}</span>`;
      }
    }
  } else {
    const res = await fetch(`/api/history?param=${param}&range=${range}`);
    const rows = await res.json();
    totalRows += rows.length;
    const buckets = bucketRows(rows, range);
    chart.data.datasets[0].data = buckets.map((b) => b.value);
    chart.data.labels = buckets.map((b) => fmtAxisTime(b.ts));
    const valEl = document.getElementById(`val-${param}`);
    const lastBucket = [...buckets].reverse().find((b) => b.value !== null);
    if (valEl && lastBucket) {
      valEl.innerHTML = `${roundDisplay(lastBucket.value)} <span class="unit">${cfg.unit}</span>`;
    }
  }

  if (fetchGeneration[param] !== gen) return; // superseded by a newer request for this param

  const wrap = document.getElementById(`chart-${param}`).closest('.chart-wrap');
  if (wrap) wrap.classList.toggle('empty', totalRows === 0);

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

// "Fresh" is relative to the clock, not to when we last heard something -
// a reading that was fresh a moment ago can go stale while the tab just
// sits open with nothing new arriving (nodes only report on command/ack,
// there's no heartbeat). isDisplayOnline/isConfirmedOffline are re-derived
// from these on every call rather than cached, so applyNodeOnlineState can
// be safely re-run on a timer (below) to let staleness heal on its own.
function isReadingFresh(node) {
  const r = nodeOnlineReading[node];
  return r !== undefined && (Date.now() - r.at) <= ONLINE_FRESHNESS_MS;
}
function isDisplayOnline(node) {
  return isReadingFresh(node) && nodeOnlineReading[node].value === true;
}
// Only a FRESH explicit "offline" reading counts as confirmed - a stale or
// never-seen reading must NOT confirm offline, or the controls that are the
// only way to generate a fresh reading (sending a command) would disable
// themselves and the node could never recover without an external client.
function isConfirmedOffline(node) {
  return isReadingFresh(node) && nodeOnlineReading[node].value === false;
}

function updateNodeStatus(node, data) {
  if (data.state !== undefined) nodeStates[node] = data.state;
  if (data.rssi !== undefined) nodeRssi[node] = data.rssi;
  if (data.online !== undefined) {
    nodeOnlineReading[node] = { value: data.online, at: data.onlineAt ?? Date.now() };
  }
  applyNodeOnlineState(node);
}

// Re-renders one node's status text, bulb glow, and button-disabled state
// purely from nodeOnlineReading + the clock (no new data required) - both
// the direct data paths (updateNodeStatus) and the healing timer (below)
// go through this so they can never drift out of sync with each other.
function applyNodeOnlineState(node) {
  const bulb = document.getElementById(`bulb-${node}`);
  const status = document.getElementById(`status-${node}`);
  if (!bulb || !status) return;

  const online = isDisplayOnline(node);
  status.classList.toggle('online', online);
  status.classList.toggle('offline', !online);
  status.textContent = online
    ? (nodeRssi[node] !== undefined ? `Online, RSSI ${nodeRssi[node]} dBm` : 'Online')
    : 'Offline';

  // The bulb can only honestly show "on" if the node is currently believed
  // reachable - otherwise it's just replaying a last-known state that could
  // be stale, the same trust problem the "online" text itself had.
  bulb.classList.toggle('on', nodeStates[node] === 'ON' && online);

  setNodeInteractivity(node);
  updateBroadcastInteractivity();
}

// A node we've recently, explicitly heard is offline can't receive a
// command, so its bulb button is disabled - no point letting Mohd click
// something that will just time out. Anything less certain (stale, or
// never heard from at all) leaves it enabled, since clicking it is the
// only way to find out for sure. Broadcast is disabled only once every
// node is confirmed offline.
function setNodeInteractivity(node) {
  const btn = document.getElementById(`bulb-btn-${node}`);
  if (btn) btn.disabled = isConfirmedOffline(node);
}

function updateBroadcastInteractivity() {
  const cb = document.getElementById('bcast-cb');
  if (!cb) return;
  cb.disabled = NODES.every((n) => isConfirmedOffline(n));
}

// Nothing else re-renders on a plain clock tick, so without this, a node
// whose last reading quietly ages past ONLINE_FRESHNESS_MS would keep
// showing/gating on stale info indefinitely - this is what actually lets
// a confirmed-offline node's controls re-enable themselves once that
// reading is no longer fresh enough to justify disabling them.
function startOnlineFreshnessWatch() {
  setInterval(() => NODES.forEach((n) => applyNodeOnlineState(n)), 60 * 1000);
}

function prependLog(ts, message) {
  const list = document.getElementById('log-list');
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<div class="t">${fmtLogTime(ts)}</div><div class="m">${message}</div>`;
  list.prepend(row);
  while (list.children.length > 200) list.removeChild(list.lastChild);
}

async function loadInitialLogs() {
  const res = await fetch('/api/logs?limit=100');
  const rows = await res.json();
  rows.forEach((r) => prependLog(r.ts, r.message));
}

// Setting .checked here programmatically does NOT fire the checkbox's
// 'change' listener (only a real user interaction does) - so this is safe
// to call from state-sync paths without triggering a spurious re-send.
function updateBroadcastButton(stateStr) {
  const cb = document.getElementById('bcast-cb');
  cb.checked = stateStr === 'ON';
}

// Nodes can now be commanded individually, so the broadcast circle no
// longer mirrors "whichever node reading arrived last" - it shows ON as
// soon as any node is ON, OFF only once every node is OFF. Skips the
// update until at least one reading has been seen for every node (avoids
// a misleading flash before any data has loaded).
function refreshBroadcastFromNodes() {
  if (NODES.some((n) => nodeStates[n] === undefined)) return;
  const anyOn = NODES.some((n) => nodeStates[n] === 'ON');
  updateBroadcastButton(anyOn ? 'ON' : 'OFF');
}

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);

  ws.onclose = () => {
    setTimeout(connectWs, 2000);
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'reading' && typeof msg.data.node === 'number') {
      updateNodeStatus(msg.data.node, msg.data);
      if (msg.data.state !== undefined) refreshBroadcastFromNodes();
      if (msg.logMessage) prependLog(Date.now(), msg.logMessage);

      // A new reading landing in the DB doesn't move the chart/headline
      // numbers on its own - fetchHistory only ran on load and range-pill
      // clicks, so a card could sit on a stale bucket average until the
      // next manual refresh. Re-pull whichever chart(s) this message's
      // readings actually touched, at the range the user currently has open.
      if (msg.readings && msg.readings.length) {
        const changedParams = new Set(msg.readings.map((r) => r.param));
        CHART_CONFIGS.forEach((c) => {
          if (changedParams.has(c.param)) {
            fetchHistory(c.param, currentRange[c.param]);
          }
        });
      }
    } else if (msg.type === 'log') {
      prependLog(Date.now(), msg.message);
    }
  };
}

// A fresh page load only had HTML defaults ("No data yet", bulb off) until
// a *new* live MQTT reading happened to arrive over the websocket - nodes
// only report on command/ack, not a heartbeat, so that could be a long
// wait even though the DB already has each node's last known state/online/
// rssi. Pull those on load (same source refreshBroadcastFromNodes uses for
// the broadcast circle) so the bulbs and status text start correct instead
// of blank.
//
// The firmware only publishes a node's `online` flag as part of a
// command/ack payload (bridge_main.cpp) - there is no per-node heartbeat,
// only an aggregate mesh-health ping every 30s that isn't stored per node.
// So a stored `online:true` only means "this node ACKed the last command we
// sent it", which can go stale indefinitely if nothing's been sent since.
// Once it's older than this window (or there's no reading at all), the
// status text falls back to "Offline" - but only a *fresh* explicit false
// disables the controls (see isConfirmedOffline above); otherwise the one
// action that could refresh a stale reading would be the thing it disables.
const ONLINE_FRESHNESS_MS = 10 * 60 * 1000;

async function syncNodeState() {
  await Promise.all(
    NODES.map(async (n) => {
      const [stateRows, onlineRows, rssiRows] = await Promise.all([
        fetch(`/api/history?node=${n}&param=state&range=24h`).then((r) => r.json()),
        fetch(`/api/history?node=${n}&param=online&range=24h`).then((r) => r.json()),
        fetch(`/api/history?node=${n}&param=rssi&range=24h`).then((r) => r.json()),
      ]);
      const data = {};
      if (stateRows.length) data.state = Number(stateRows[stateRows.length - 1].value) === 1 ? 'ON' : 'OFF';
      if (onlineRows.length) {
        // Pass the reading's own timestamp, not "now" - isReadingFresh()
        // re-derives staleness against the clock on every call, so a
        // reading that's already 8 minutes old at load time correctly
        // goes stale ~2 minutes later, not 10.
        const last = onlineRows[onlineRows.length - 1];
        data.online = Number(last.value) === 1;
        data.onlineAt = new Date(last.ts).getTime();
      }
      if (rssiRows.length) data.rssi = Number(rssiRows[rssiRows.length - 1].value);
      updateNodeStatus(n, data);
    })
  );
  refreshBroadcastFromNodes();
}

// The switch is a real checkbox, so clicking it already flips .checked
// (and the visible position) before this handler even runs - unlike the
// old circle button, there's no "optimistic update after success" step.
// If the request fails, flip it back to undo that premature visual change.
function setupBroadcast() {
  const cb = document.getElementById('bcast-cb');

  cb.addEventListener('change', async () => {
    const nextCmd = cb.checked ? 'ON' : 'OFF';
    cb.disabled = true;
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: nextCmd }),
      });
      if (!res.ok) {
        const err = await res.json();
        prependLog(Date.now(), `Broadcast failed: ${err.error}`);
        cb.checked = !cb.checked;
      }
    } finally {
      updateBroadcastInteractivity();
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
          nodeStates[node] = nextCmd;
          refreshBroadcastFromNodes();
        } else {
          const err = await res.json();
          prependLog(Date.now(), `Node ${node} command failed: ${err.error}`);
        }
      } finally {
        setNodeInteractivity(node);
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
    syncNodeState(),
  ]);
  connectWs();
  startOnlineFreshnessWatch();
}

init();
