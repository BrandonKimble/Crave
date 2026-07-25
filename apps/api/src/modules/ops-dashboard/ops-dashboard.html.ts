/** §18.4/§24.3 the ops dashboard page (V2) — one self-contained HTML file
 *  (inline CSS+JS, zero external requests; the controller's per-route CSP
 *  allows exactly this inline script). Stores the ?token= in localStorage on
 *  first visit and appends it (x-ops-token header) to every subsequent
 *  fetch, so a bookmarked ?token= link is a one-time bootstrap. `opsBase`
 *  is derived from location.pathname so the page follows the app's global
 *  prefix (/api/v1) wherever it is mounted. */
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
    font-variant-numeric: tabular-nums;
  }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
  .subtitle { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 16px;
  }
  @media (max-width: 420px) {
    body { padding: 14px; }
    .grid { grid-template-columns: 1fr; }
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
    margin: 0 0 2px;
    font-weight: 600;
  }
  .card .card-sub {
    color: var(--muted);
    font-size: 11px;
    margin: 0 0 12px;
  }
  .card.wide { grid-column: 1 / -1; }
  .stat-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; gap: 12px; }
  .stat-row:last-child { margin-bottom: 0; }
  .stat-label { color: var(--muted); font-size: 12px; }
  .stat-value { font-variant-numeric: tabular-nums; font-family: var(--mono); font-size: 14px; }
  .stat-value.big { font-size: 22px; font-weight: 600; }
  .table-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; color: var(--muted); font-weight: 500; padding: 6px 8px; border-bottom: 1px solid var(--panel-border); white-space: nowrap; }
  td { padding: 6px 8px; border-bottom: 1px solid var(--panel-border); font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr:last-child td { border-bottom: none; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .dot.green { background: var(--green); }
  .dot.yellow { background: var(--yellow); }
  .dot.red { background: var(--red); }
  .chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-family: var(--mono); }
  .chip.info { background: rgba(91,157,255,0.15); color: var(--accent); }
  .chip.ok { background: rgba(62,207,142,0.15); color: var(--green); }
  .chip.warn { background: rgba(224,185,74,0.15); color: var(--yellow); }
  .chip.critical { background: rgba(239,91,91,0.18); color: var(--red); }
  .mp-line { font-size: 13px; margin: 14px 0 6px; }
  .mp-track { position: relative; background: #1b1f2b; border-radius: 5px; height: 10px; overflow: visible; }
  .mp-fill { height: 100%; border-radius: 5px; background: var(--accent); }
  .mp-fill.yellow { background: var(--yellow); }
  .mp-fill.red { background: var(--red); }
  .mp-tick { position: absolute; top: -3px; width: 2px; height: 16px; background: var(--text); opacity: 0.85; }
  .mp-legend { color: var(--muted); font-size: 11px; margin-top: 6px; }
  .spark-wrap { margin-top: 16px; }
  .spark-caption { color: var(--muted); font-size: 11px; margin-top: 4px; display: flex; justify-content: space-between; }
  svg.spark { display: block; width: 100%; height: 64px; }
  .alert-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--panel-border); gap: 12px; }
  .alert-row:last-child { border-bottom: none; }
  .alert-title { font-size: 13px; }
  .alert-body { font-size: 11px; color: var(--muted); margin-top: 2px; }
  .alert-when { font-size: 11px; color: var(--muted); white-space: nowrap; }
  .ack-btn { background: transparent; border: 1px solid var(--panel-border); color: var(--muted); border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
  .ack-btn:hover { border-color: var(--accent); color: var(--accent); }
  .ack-btn:disabled { opacity: 0.4; cursor: default; }
  .muted { color: var(--muted); }
  .anomaly { color: var(--red); font-size: 12px; margin-top: 8px; }
  .place-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
  .place-card { background: #0e1118; border: 1px solid var(--panel-border); border-radius: 8px; padding: 12px 14px; }
  .place-name { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
  .place-handle { color: var(--muted); font-size: 11px; margin-bottom: 10px; font-family: var(--mono); }
  .place-later { color: var(--muted); font-size: 11px; margin-top: 10px; border-top: 1px dashed var(--panel-border); padding-top: 8px; }
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
    <div class="card wide"><h2>Spend</h2><div class="card-sub">How much are we spending this month, and is that normal for us?</div><div id="spendCard" class="muted">Loading…</div></div>
    <div class="card wide"><h2>Vendor position</h2><div class="card-sub">Where each vendor stands against its safety ceiling or prepaid credit.</div><div id="vendorsCard" class="muted">Loading…</div></div>
    <div class="card wide"><h2>Places</h2><div class="card-sub">What collection has built for each place we cover.</div><div id="placesCard" class="muted">Loading…</div></div>
    <div class="card wide"><h2>Sources</h2><div class="card-sub">What collection is doing right now, lane by lane.</div><div id="sourcesCard" class="muted">Loading…</div></div>
    <div class="card"><h2>Pipeline</h2><div class="card-sub">Is the docs → entities pipeline moving?</div><div id="pipelineCard" class="muted">Loading…</div></div>
    <div class="card wide"><h2>Alerts</h2><div class="card-sub">Anything the system flagged for a human.</div><div id="alertsCard" class="muted">Loading…</div></div>
    <div class="card wide"><h2>Campaigns</h2><div class="card-sub">Named spend jobs and how they track their approved envelopes.</div><div id="campaignsCard" class="muted">Loading…</div></div>
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
    var dollars = micros / 1000000;
    return '$' + dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function num(n) {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString('en-US');
  }

  function relTime(iso) {
    if (!iso) return '—';
    var ms = Date.now() - new Date(iso).getTime();
    var future = ms < 0;
    ms = Math.abs(ms);
    var mins = Math.floor(ms / 60000);
    var label;
    if (mins < 1) label = 'just now';
    else if (mins < 60) label = mins + 'm';
    else if (mins < 48 * 60) label = Math.floor(mins / 60) + 'h';
    else label = Math.floor(mins / (60 * 24)) + 'd';
    if (label === 'just now') return future ? 'now' : 'just now';
    return future ? 'in ' + label : label + ' ago';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Daily bar chart with an area feel: one bar per day plus min/max $ labels
  // — each day is individually readable, unlike a bare squiggle.
  function dailyBars(values) {
    if (!values || !values.length) return '<span class="muted">no data</span>';
    var w = 600, h = 64, padX = 4, padTop = 6, padBottom = 4;
    var max = Math.max.apply(null, values);
    var min = Math.min.apply(null, values);
    if (max <= 0) return '<span class="muted">no spend in the last 30 days</span>';
    var innerW = w - padX * 2;
    var slot = innerW / values.length;
    var barW = Math.max(2, slot - 2);
    var bars = values.map(function (v, i) {
      var bh = (v / max) * (h - padTop - padBottom);
      if (v > 0 && bh < 1.5) bh = 1.5;
      var x = padX + i * slot + (slot - barW) / 2;
      var y = h - padBottom - bh;
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) +
        '" height="' + bh.toFixed(1) + '" rx="1" fill="rgba(91,157,255,0.75)" />';
    }).join('');
    var line = values.map(function (v, i) {
      var x = padX + i * slot + slot / 2;
      var y = h - padBottom - (v / max) * (h - padTop - padBottom);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var area = (padX + slot / 2).toFixed(1) + ',' + (h - padBottom) + ' ' + line + ' ' +
      (padX + (values.length - 1) * slot + slot / 2).toFixed(1) + ',' + (h - padBottom);
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<polygon points="' + area + '" fill="rgba(91,157,255,0.12)" />' +
      bars +
      '</svg>' +
      '<div class="spark-caption"><span>30 days ago → today</span>' +
      '<span>low ' + usd(min) + ' · high ' + usd(max) + ' per day</span></div>';
  }

  function renderSpend(spend) {
    var byService = spend.monthToDateByService || {};
    var labels = { gemini: 'Gemini (LLM)', google_places: 'Google Places', tomtom: 'TomTom (maps)' };
    var html =
      '<div class="stat-row"><span class="stat-label">Total spend this month</span>' +
      '<span class="stat-value big">' + usd(spend.totalMtdMicros) + '</span></div>' +
      Object.keys(byService).map(function (svc) {
        return '<div class="stat-row"><span class="stat-label">' + esc(labels[svc] || svc) + '</span>' +
          '<span class="stat-value">' + usd(byService[svc]) + '</span></div>';
      }).join('');

    var mp = spend.monthPosition;
    if (mp) {
      if (mp.expectedByTodayMicros !== null) {
        // Scale the bar so both the fill (spent) and the tick (expected) fit.
        var scale = Math.max(mp.spentMtdMicros, mp.expectedByTodayMicros) * 1.15 || 1;
        var fillPct = Math.min(100, (mp.spentMtdMicros / scale) * 100);
        var tickPct = Math.min(100, (mp.expectedByTodayMicros / scale) * 100);
        var colorClass = mp.color === 'red' ? ' red' : mp.color === 'yellow' ? ' yellow' : '';
        html +=
          '<div class="mp-line">Day ' + mp.dayOfMonth + ' of ' + mp.daysInMonth + ' — spent <strong>' + usd(mp.spentMtdMicros) +
          '</strong> vs ' + usd(mp.expectedByTodayMicros) + ' expected by today' +
          (mp.percentOfExpected !== null ? ' <span class="muted">(' + mp.percentOfExpected + '% of expected)</span>' : '') +
          '</div>' +
          '<div class="mp-track"><div class="mp-fill' + colorClass + '" style="width:' + fillPct.toFixed(1) + '%"></div>' +
          '<div class="mp-tick" style="left:' + tickPct.toFixed(1) + '%"></div></div>' +
          '<div class="mp-legend">Bar = what this month has spent so far. The white tick = where spend "should" be today at the last 30 days\\u2019 pace. Blue = on pace, yellow = up to 30% over, red = more than 30% over.</div>';
      } else {
        html += '<div class="mp-line muted">Day ' + mp.dayOfMonth + ' of ' + mp.daysInMonth +
          ' — no trailing spend history yet, so no "expected by today" to compare against.</div>';
      }
    }

    html += '<div class="spark-wrap">' + dailyBars(spend.last30DailyGeminiMicros) +
      '<div class="spark-caption"><span>Daily Gemini (LLM) spend, one bar per day</span></div></div>';
    document.getElementById('spendCard').innerHTML = html;
  }

  function renderVendors(vendors) {
    if (!vendors) {
      document.getElementById('vendorsCard').innerHTML = '<span class="muted">No vendor data.</span>';
      return;
    }
    var html = '';

    var g = vendors.gemini || {};
    html += '<div class="stat-row"><span class="stat-label">Gemini — month to date vs safety ceiling</span>' +
      '<span class="stat-value">' +
      (g.backstopLimitMicros !== null && g.backstopLimitMicros !== undefined
        ? usd(g.mtdMicros) + ' of ' + usd(g.backstopLimitMicros) + ' (' + (g.percentOfBackstop === null ? '—' : g.percentOfBackstop + '%') + ')'
        : usd(g.mtdMicros) + ' <span class="muted">(no ceiling derived yet)</span>') +
      '</span></div>';

    var t = vendors.tomtom || {};
    var credit = t.credit || {};
    if (credit.declared) {
      html += '<div class="stat-row"><span class="stat-label">TomTom — prepaid credit remaining</span>' +
        '<span class="stat-value">≈ ' + usd(credit.remainingMicros) +
        ' <span class="muted">of ' + usd(credit.creditMicros) + ' declared ' + relTime(credit.declaredAt) + '</span></span></div>' +
        '<div class="stat-row"><span class="stat-label">TomTom — burn since top-up / est. days left at last-7-day pace</span>' +
        '<span class="stat-value">' + usd(credit.burnSinceDeclaredMicros) + ' · ' +
        (credit.estDaysLeft === null ? '<span class="muted">no recent burn to project from</span>' : '≈ ' + num(credit.estDaysLeft) + ' days') +
        '</span></div>';
    } else {
      html += '<div class="stat-row"><span class="stat-label">TomTom — prepaid credit</span>' +
        '<span class="stat-value muted">not declared — set TOMTOM_PREPAID_CREDIT_USD + TOMTOM_CREDIT_DECLARED_AT after a top-up</span></div>';
    }
    html += '<div class="stat-row"><span class="stat-label">TomTom — month to date</span>' +
      '<span class="stat-value">' + usd(t.mtdMicros) + '</span></div>';

    var p = vendors.googlePlaces || {};
    html += '<div class="stat-row"><span class="stat-label">Google Places — month to date</span>' +
      '<span class="stat-value">' + usd(p.mtdMicros) + '</span></div>';

    (vendors.anomalies || []).forEach(function (a) {
      html += '<div class="anomaly">⚠ ' + esc(a.name) + ': ' + esc(a.detail) + '</div>';
    });

    document.getElementById('vendorsCard').innerHTML = html;
  }

  function renderPlaces(places) {
    if (!places || !places.length) {
      document.getElementById('placesCard').innerHTML = '<span class="muted">No collector sources yet.</span>';
      return;
    }
    document.getElementById('placesCard').innerHTML = '<div class="place-grid">' +
      places.map(function (pl) {
        var title = pl.anchorPlaceName ? esc(pl.anchorPlaceName) : 'r/' + esc(pl.community);
        return '<div class="place-card">' +
          '<div class="place-name">' + title + '</div>' +
          '<div class="place-handle">r/' + esc(pl.community) + '</div>' +
          '<div class="stat-row"><span class="stat-label">Documents collected</span><span class="stat-value">' + num(pl.docsTotal) + '</span></div>' +
          '<div class="stat-row"><span class="stat-label">Documents last 24h</span><span class="stat-value">' + num(pl.docs24h) + '</span></div>' +
          '<div class="stat-row"><span class="stat-label">Entities attributed</span><span class="stat-value">' + num(pl.entitiesAttributed) + '</span></div>' +
          '<div class="stat-row"><span class="stat-label">LLM spend for this community</span><span class="stat-value">' +
          (pl.estLlmSpendMicros === null ? '—' : 'est. ' + usd(pl.estLlmSpendMicros)) + '</span></div>' +
          '<div class="place-later">Engagement (searches, views): lands post-launch — no user traffic yet.</div>' +
          '</div>';
      }).join('') + '</div>';
  }

  function sourceDotClass(s) {
    if (s.state === 'cost_paused') return 'yellow';
    if (s.state === 'red') return 'red';
    return 'green';
  }

  function sourceStateLabel(s) {
    if (s.state === 'cost_paused') return 'cost-paused';
    if (s.state === 'red') return s.normalizedLateness > 1 ? 'late' : 'red';
    return 'ok';
  }

  function renderSources(sources) {
    if (!sources || !sources.length) {
      document.getElementById('sourcesCard').innerHTML = '<span class="muted">No enabled lanes.</span>';
      return;
    }
    var rows = sources.map(function (s) {
      return '<tr>' +
        '<td><span class="dot ' + sourceDotClass(s) + '"></span>r/' + esc(s.handle) + '</td>' +
        '<td>' + esc(s.lane) + '</td>' +
        '<td>' + esc(sourceStateLabel(s)) + '</td>' +
        '<td>' + relTime(s.lastRanAt) + '</td>' +
        '<td>' + num(s.lastOutputDocs) + (s.outputDocsBaseline !== null && s.outputDocsBaseline !== undefined ? ' <span class="muted">/ ' + Math.round(s.outputDocsBaseline) + ' typical</span>' : '') + '</td>' +
        '<td>' + usd(s.lastCostMicros) + '</td>' +
        '<td>' + relTime(s.nextDueAt) + '</td>' +
        '</tr>';
    }).join('');
    document.getElementById('sourcesCard').innerHTML =
      '<div class="table-scroll"><table><thead><tr>' +
      '<th>Source</th><th>Lane</th><th>State</th><th>Last tick</th><th>Docs last tick</th><th>Cost last tick</th><th>Next due</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderPipeline(pipeline) {
    if (!pipeline) {
      document.getElementById('pipelineCard').innerHTML = '<span class="muted">No pipeline data.</span>';
      return;
    }
    function row(label, value, hot) {
      return '<div class="stat-row"><span class="stat-label">' + label + '</span>' +
        '<span class="stat-value"' + (hot ? ' style="color:var(--red)"' : '') + '>' + value + '</span></div>';
    }
    document.getElementById('pipelineCard').innerHTML =
      row('Docs collected (24h)', num(pipeline.docs24h)) +
      row('Entity events (24h)', num(pipeline.entities24h)) +
      row('Extraction runs (24h)', num(pipeline.extractionRuns24h)) +
      row('Extraction runs failed (24h)', num(pipeline.extractionFailed24h), pipeline.extractionFailed24h > 0) +
      row('LLM batch jobs waiting', num(pipeline.batchJobsPending)) +
      row('LLM batch jobs ingested (24h)', num(pipeline.batchJobsIngested24h)) +
      row('Drain backlog', pipeline.drainPending === null ? '—' : num(pipeline.drainPending)) +
      row('Unacked alerts', num(pipeline.unackedAlerts), pipeline.unackedAlerts > 0);
  }

  function renderAlerts(alerts) {
    var latest = alerts.latest || [];
    if (!latest.length) {
      document.getElementById('alertsCard').innerHTML = '<span class="muted">No alerts.</span>';
      return;
    }
    document.getElementById('alertsCard').innerHTML =
      '<div class="stat-row"><span class="stat-label">Unacknowledged</span><span class="stat-value">' + num(alerts.unacknowledgedCount) + '</span></div>' +
      latest.map(function (a) {
        var acked = !!a.acknowledgedAt;
        return '<div class="alert-row">' +
          '<div>' +
          '<span class="chip ' + esc(a.severity) + '">' + esc(a.severity) + '</span> ' +
          '<span class="alert-title">' + esc(a.title) + '</span>' +
          '<span class="alert-when"> · ' + relTime(a.createdAt) + '</span>' +
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

  function campaignChipClass(state) {
    if (state === 'breached') return 'critical';
    if (state === 'completed') return 'info';
    if (state === 'running' || state === 'approved') return 'ok';
    return 'warn';
  }

  function renderCampaigns(campaigns) {
    if (!campaigns || !campaigns.length) {
      document.getElementById('campaignsCard').innerHTML = '<span class="muted">No campaigns.</span>';
      return;
    }
    var rows = campaigns.map(function (c) {
      var spent = c.spentMicros === null || c.spentMicros === undefined ? null : Number(c.spentMicros);
      var envelope = null;
      if (c.estimateMicros !== null && c.estimateMicros !== undefined) {
        envelope = Number(c.estimateMicros) * (1 + (c.toleranceFraction || 0));
      }
      var pct = envelope && envelope > 0 && spent !== null ? Math.round((spent / envelope) * 100) : null;
      return '<tr>' +
        '<td>' + esc(c.name) + ' <span class="muted">' + esc(c.workClass) + '</span></td>' +
        '<td><span class="chip ' + campaignChipClass(c.state) + '">' + esc(c.state) + '</span></td>' +
        '<td>' + usd(spent) + (envelope !== null ? ' <span class="muted">of ' + usd(envelope) + (pct !== null ? ' (' + pct + '%)' : '') + '</span>' : ' <span class="muted">(pilot — no envelope)</span>') + '</td>' +
        '</tr>';
    }).join('');
    document.getElementById('campaignsCard').innerHTML =
      '<div class="table-scroll"><table><thead><tr><th>Campaign</th><th>State</th><th>Spent / envelope</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
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
      renderVendors(data.vendors);
      renderPlaces(data.places);
      renderSources(data.sources);
      renderPipeline(data.pipeline);
      renderAlerts(data.alerts);
      renderCampaigns(data.campaigns);
      document.getElementById('lastUpdated').textContent = 'updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
