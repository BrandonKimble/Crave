/** §18.4/§24.3: the ops dashboard page — one self-contained HTML file
 *  (inline CSS+JS, zero external requests). Stores the ?token= in
 *  localStorage on first visit and appends it (x-ops-token header) to
 *  every subsequent fetch, so a bookmarked ?token= link is a one-time
 *  bootstrap. */
export const OPS_DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Crave Ops</title>
<style>
  :root {
    --bg: #0b0d12;
    --panel: #12151c;
    --panel-border: #232838;
    --text: #e6e9f0;
    --muted: #8890a4;
    --accent: #5b9dff;
    --green: #3ecf8e;
    --yellow: #e0b94a;
    --red: #ef5b5b;
    --mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 24px;
  }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
  .subtitle { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 16px;
  }
  .card {
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 10px;
    padding: 16px 18px;
  }
  .card h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin: 0 0 12px;
    font-weight: 600;
  }
  .card.wide { grid-column: 1 / -1; }
  .stat-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .stat-label { color: var(--muted); font-size: 12px; }
  .stat-value { font-variant-numeric: tabular-nums; font-family: var(--mono); font-size: 15px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; color: var(--muted); font-weight: 500; padding: 6px 8px; border-bottom: 1px solid var(--panel-border); }
  td { padding: 6px 8px; border-bottom: 1px solid var(--panel-border); font-variant-numeric: tabular-nums; }
  tr:last-child td { border-bottom: none; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .dot.green { background: var(--green); }
  .dot.yellow { background: var(--yellow); }
  .dot.red { background: var(--red); }
  .chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-family: var(--mono); }
  .chip.info { background: rgba(91,157,255,0.15); color: var(--accent); }
  .chip.warn { background: rgba(224,185,74,0.15); color: var(--yellow); }
  .chip.critical { background: rgba(239,91,91,0.18); color: var(--red); }
  .bar-track { background: #1b1f2b; border-radius: 4px; height: 6px; overflow: hidden; margin-top: 4px; }
  .bar-fill { height: 100%; background: var(--accent); }
  .bar-fill.hot { background: var(--red); }
  .alert-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--panel-border); gap: 12px; }
  .alert-row:last-child { border-bottom: none; }
  .alert-title { font-size: 13px; }
  .alert-body { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .ack-btn { background: transparent; border: 1px solid var(--panel-border); color: var(--muted); border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
  .ack-btn:hover { border-color: var(--accent); color: var(--accent); }
  .ack-btn:disabled { opacity: 0.4; cursor: default; }
  svg.spark { display: block; }
  .muted { color: var(--muted); }
  .refresh-note { color: var(--muted); font-size: 11px; margin-top: 24px; }
  #tokenGate { position: fixed; inset: 0; background: var(--bg); display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; }
  #tokenGate input { background: var(--panel); border: 1px solid var(--panel-border); color: var(--text); padding: 8px 12px; border-radius: 6px; width: 280px; }
  #tokenGate button { background: var(--accent); border: none; color: #0b0d12; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
</style>
</head>
<body>
<div id="tokenGate" style="display:none">
  <div class="muted">Enter ops dashboard token</div>
  <input id="tokenInput" type="password" placeholder="token" />
  <button id="tokenSubmit">Continue</button>
</div>
<div id="app">
  <h1>Crave Ops</h1>
  <div class="subtitle">Auto-refreshes every 60s — <span id="lastUpdated">loading…</span></div>
  <div class="grid" id="grid">
    <div class="card wide"><h2>Spend</h2><div id="spendCard" class="muted">Loading…</div></div>
    <div class="card wide"><h2>Alerts</h2><div id="alertsCard" class="muted">Loading…</div></div>
    <div class="card wide"><h2>Campaigns</h2><div id="campaignsCard" class="muted">Loading…</div></div>
    <div class="card"><h2>Lanes health</h2><div id="lanesCard" class="muted">Loading…</div></div>
    <div class="card"><h2>Pools</h2><div id="poolsCard" class="muted">Loading…</div></div>
    <div class="card"><h2>Collection pulse</h2><div id="collectionCard" class="muted">Loading…</div></div>
  </div>
  <div class="refresh-note">Crave ops dashboard — internal only.</div>
</div>
<script>
(function () {
  'use strict';

  function getToken() {
    var params = new URLSearchParams(window.location.search);
    var fromUrl = params.get('token');
    if (fromUrl) {
      localStorage.setItem('opsDashToken', fromUrl);
      return fromUrl;
    }
    return localStorage.getItem('opsDashToken');
  }

  var token = getToken();
  if (!token) {
    document.getElementById('tokenGate').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('tokenSubmit').addEventListener('click', function () {
      var v = document.getElementById('tokenInput').value.trim();
      if (v) {
        localStorage.setItem('opsDashToken', v);
        window.location.reload();
      }
    });
    return;
  }

  function usd(micros) {
    if (micros === null || micros === undefined) return '—';
    return '$' + (micros / 1_000_000).toFixed(2);
  }

  function fmtMs(ms) {
    if (ms === null || ms === undefined) return '—';
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function sparkline(values) {
    if (!values || !values.length) return '';
    var w = 260, h = 40, pad = 2;
    var max = Math.max.apply(null, values.concat([1]));
    var step = (w - pad * 2) / Math.max(1, values.length - 1);
    var points = values.map(function (v, i) {
      var x = pad + i * step;
      var y = h - pad - (v / max) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<polyline points="' + points + '" fill="none" stroke="#5b9dff" stroke-width="1.5" />' +
      '</svg>';
  }

  function renderSpend(spend) {
    var byService = spend.monthToDateByService || {};
    var rows = Object.keys(byService).map(function (svc) {
      return '<div class="stat-row"><span class="stat-label">' + esc(svc) + '</span>' +
        '<span class="stat-value">' + usd(byService[svc]) + '</span></div>';
    }).join('');
    var expectation = spend.expectationProratedMicros;
    var mtdGemini = byService.gemini || 0;
    var pct = expectation ? Math.min(150, Math.round((mtdGemini / expectation) * 100)) : null;
    var barHot = spend.warnThresholdMicros !== null && mtdGemini > spend.warnThresholdMicros;
    document.getElementById('spendCard').innerHTML =
      rows +
      (expectation
        ? '<div class="stat-row"><span class="stat-label">Gemini vs. prorated expectation</span>' +
          '<span class="stat-value">' + pct + '%</span></div>' +
          '<div class="bar-track"><div class="bar-fill' + (barHot ? ' hot' : '') + '" style="width:' + Math.min(100, pct) + '%"></div></div>'
        : '') +
      '<div style="margin-top:12px">' + sparkline(spend.last30DailyGeminiMicros) + '<div class="stat-label">last 30 days, gemini spend</div></div>';
  }

  function renderAlerts(alerts) {
    var latest = alerts.latest || [];
    if (!latest.length) {
      document.getElementById('alertsCard').innerHTML = '<span class="muted">No alerts.</span>';
      return;
    }
    document.getElementById('alertsCard').innerHTML =
      '<div class="stat-row"><span class="stat-label">Unacknowledged</span><span class="stat-value">' + alerts.unacknowledgedCount + '</span></div>' +
      latest.map(function (a) {
        var acked = !!a.acknowledgedAt;
        return '<div class="alert-row">' +
          '<div>' +
          '<span class="chip ' + esc(a.severity) + '">' + esc(a.severity) + '</span> ' +
          '<span class="alert-title">' + esc(a.title) + '</span>' +
          '<div class="alert-body">' + esc(a.body) + '</div>' +
          '</div>' +
          '<button class="ack-btn" data-id="' + esc(a.alertId) + '" ' + (acked ? 'disabled' : '') + '>' + (acked ? 'acked' : 'ack') + '</button>' +
          '</div>';
      }).join('');
    document.querySelectorAll('.ack-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        fetchJson(opsBase + '/api/alerts/' + id + '/ack', { method: 'POST' }).then(load);
      });
    });
  }

  function renderCampaigns(campaigns) {
    if (!campaigns.length) {
      document.getElementById('campaignsCard').innerHTML = '<span class="muted">No campaigns.</span>';
      return;
    }
    var rows = campaigns.map(function (c) {
      return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.workClass) + '</td>' +
        '<td><span class="chip ' + (c.state === 'breached' ? 'critical' : c.state === 'completed' ? 'info' : 'warn') + '">' + esc(c.state) + '</span></td>' +
        '<td>' + usd(c.spentMicros) + '</td><td>' + usd(c.estimateMicros) + '</td></tr>';
    }).join('');
    document.getElementById('campaignsCard').innerHTML =
      '<table><thead><tr><th>Name</th><th>Work class</th><th>State</th><th>Spent</th><th>Estimate</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function laneDot(lane) {
    if (lane.costBreached || lane.outputCollapsed || lane.pendingWindowStale || (lane.expectedBatchesShortfall || 0) > 0) return 'red';
    if (lane.normalizedLateness > 0.5) return 'yellow';
    return 'green';
  }

  function renderLanes(lanes) {
    if (!lanes.length) {
      document.getElementById('lanesCard').innerHTML = '<span class="muted">No lanes.</span>';
      return;
    }
    document.getElementById('lanesCard').innerHTML = lanes.map(function (l) {
      return '<div class="stat-row"><span class="stat-label"><span class="dot ' + laneDot(l) + '"></span>' +
        esc(l.handle) + ' / ' + esc(l.lane) + '</span>' +
        '<span class="stat-value">' + (l.costBreached ? 'paused' : 'ok') + '</span></div>';
    }).join('');
  }

  function renderPools(pools) {
    if (!pools.length) {
      document.getElementById('poolsCard').innerHTML = '<span class="muted">No pools.</span>';
      return;
    }
    document.getElementById('poolsCard').innerHTML = pools.map(function (p) {
      var pct = p.limit > 0 ? Math.min(100, Math.round((p.used / p.limit) * 100)) : 0;
      return '<div class="stat-row"><span class="stat-label">' + esc(p.name) + '</span>' +
        '<span class="stat-value">' + pct + '%</span></div>' +
        '<div class="bar-track"><div class="bar-fill' + (pct >= 90 ? ' hot' : '') + '" style="width:' + pct + '%"></div></div>' +
        (p.poisonedForMs ? '<div class="alert-body">poisoned ' + fmtMs(p.poisonedForMs) + '</div>' : '');
    }).join('');
  }

  function renderCollection(collection) {
    document.getElementById('collectionCard').innerHTML =
      '<div class="stat-row"><span class="stat-label">Docs (24h)</span><span class="stat-value">' + collection.docs24h + '</span></div>' +
      '<div class="stat-row"><span class="stat-label">Entities (24h)</span><span class="stat-value">' + collection.entities24h + '</span></div>' +
      '<div class="stat-row"><span class="stat-label">Drain pending</span><span class="stat-value">' + (collection.drainPending === null ? '—' : collection.drainPending) + '</span></div>';
  }

  // The app serves under a global prefix (/api/v1); derive it from wherever
  // this page is actually mounted so the API calls follow the same prefix.
  var opsBase = location.pathname.replace(/[/]+$/, '');

  function fetchJson(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, { 'x-ops-token': token });
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function load() {
    fetchJson(opsBase + '/api/summary').then(function (data) {
      renderSpend(data.spend);
      renderAlerts(data.alerts);
      renderCampaigns(data.campaigns);
      renderLanes(data.lanes);
      renderPools(data.pools);
      renderCollection(data.collection);
      document.getElementById('lastUpdated').textContent = 'updated ' + new Date().toLocaleTimeString();
    }).catch(function (err) {
      document.getElementById('lastUpdated').textContent = 'refresh failed: ' + err.message;
    });
  }

  load();
  setInterval(load, 60000);
})();
</script>
</body>
</html>
`;
