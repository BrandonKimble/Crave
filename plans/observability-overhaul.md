# Observability Overhaul (Production + Collection/Polls Tuning + AI Feedback Loop)

This plan replaces `plans/keyword-collection-observability-overhaul.md` with a broader, production-oriented observability strategy.

Core decisions:
- **Sentry (API + Worker + Mobile)** for errors + performance.
- **Grafana Cloud (metrics-only)** for Prometheus metrics dashboards/alerts.
- **No hosted logs at launch** (no Loki/Promtail in production); use **Railway logs** for ad-hoc debugging.
- **AI feedback loop**: keep dashboards, but make the primary collaboration artifact a single on-demand `ops report` output you can paste into chat.
- **Separate worker service at launch**: worker must be observable via metrics (not just API request metrics).

This plan is designed to support a tight “tune collection precisely” loop in production, not just “typical dev observability”.

---

## 0) What the Production Loop Looks Like

This is the intended day-to-day loop once deployed:

1) Deploy change (keyword selection, job concurrency, rate-limit config, etc).
2) Wait for enough traffic / scheduled cycles to run (often 15–60 minutes).
3) Run `yarn ops:report --range 6h` (or `1h`) locally.
4) Paste the output into chat along with what changed; the AI can reason over the structured numbers and deltas.
5) Use Grafana dashboards only for quick visual confirmation; avoid “interpret the graph for me” as the primary workflow.

---

## 1) Scope and Principles

### Goals
- Make collection and poll activity tunable with confidence (throughput, backlog, latency, failures, rate limits, “no results”).
- Keep metrics **low-cardinality** and cheap to run long-term.
- Provide a single, pasteable artifact (`ops report`) for fast iteration with an AI.
- Ensure `/metrics` is safe in production (not public scrape without controls).

### Non-goals
- Running Loki/Grafana/Prometheus as self-managed infrastructure in production.
- Storing high-cardinality term-level data as Prometheus labels.
- Replacing Sentry with metrics; they serve different purposes.

---

## 2) Production Observability Stack (What We Actually Deploy)

### 2.1 Required at launch
1) **Sentry (API + Worker + Mobile)**
   - Errors + performance.
   - Alerts to your chosen channel.
2) **Grafana Cloud (metrics-only)**
   - Ingest Prometheus metrics.
   - Dashboards + alert rules.
3) **Railway logs**
   - Structured JSON logs (kept local to Railway for launch).
4) **Uptime monitor**
   - External ping of `/health` (and optionally `/health/ready`).

### 2.2 How metrics reach Grafana Cloud
Preferred approach:
- Run **Grafana Alloy** (or Prometheus agent) that:
  - scrapes **both**:
    - `https://<api>/metrics`
    - `https://<worker>/metrics` (or the worker’s private/internal endpoint)
  - remote-writes to Grafana Cloud Metrics
- Host this agent as:
  - a small separate service (container) in Railway, or
  - an external lightweight VM/container if Railway networking makes it easier

### 2.3 Secure `/metrics`
Decision:
- `/metrics` must require a token in production.
- Grafana Alloy can be configured to send headers for scraping.

Implementation expectations:
- Env var: `METRICS_ACCESS_TOKEN`
- Require: `Authorization: Bearer <token>` for `/metrics` when `APP_ENV=prod` (or `NODE_ENV=production`)
- Keep `/health` endpoints unauthenticated.
 - Worker note: if the worker binds HTTP only for health/metrics, ensure it has **no public domain** in Railway.

---

## 3) Dashboards: Keep, But Make Them Intentional (and Metrics-Only)

### 3.1 Dashboard audit (existing repo assets)
Existing dashboards are under `observability/grafana/provisioning/dashboards/` and currently include Loki datasource usage in at least one file.

Actions:
1) Inventory all dashboards and panels:
   - identify the question each panel answers
   - confirm labels are low-cardinality
   - confirm each panel is actionable (what do we do if it’s red?)
2) Remove any **log panels** / Loki datasource dependencies:
   - we are not hosting centralized logs at launch
3) Reduce to a small set of “must-have” dashboards:
   - **Search & API health**
   - **Integrations & queues** (collection/polls tuning)

### 3.2 “Top 10” panel set (metrics-only)
Target: ~10 panels that answer “what changed?” quickly:
1) API request rate + error rate
2) API p50/p95 latency (overall)
3) Bull queue backlog (per queue; split by `service=api|worker` if applicable)
4) Job processing throughput (per queue/job; split by service)
5) Job duration p50/p95 (per job type; split by service)
6) Job failure rate (per job type; split by service)
7) Reddit API coordinator usage + rate-limit hits
8) LLM rate limiter utilization + error rate + p95 wait time
9) Keyword selection outcomes: success/no-results/error rates (low-cardinality)
10) Poll refresh outcomes + latency + backlog (if applicable)

---

## 4) AI Feedback Loop: `ops report` (Primary Artifact)

Dashboards are great for human scanning, but the “show the AI” workflow should be:
- a single JSON/Markdown report you can paste into chat
- with explicit deltas vs the prior window
- with short “top offenders” lists derived from metrics (not logs)

### 4.1 `yarn ops:report` spec (to implement)
Command:
- `yarn ops:report --range 6h` (defaults)
- Optional: `--range 1h`, `--compare 6h` (compare current window vs previous equal window)

Output:
- Markdown (human) + JSON (machine) modes, e.g. `--format md|json`
- Always include:
  - queue depth (current, max, avg)
  - throughput (jobs/min)
  - job duration p50/p95
  - failure counts and failure rate
  - rate-limit hits (Reddit, LLM)
  - “no results” rate (where available)
  - deltas vs previous window
  - service split: report both **API** and **worker** metrics (and a combined summary) so we can see where the work is actually happening

Data source:
- Use the Prometheus HTTP API endpoint backing Grafana Cloud Metrics (authenticated via token).
 - Operational note: treat the Grafana Cloud API token as a secret (store in a local `.env`, 1Password, etc); do not put it in the repo.

---

## 5) Collection & Polls Observability Model (Metrics-First, Logs Deferred)

We are intentionally optimizing for metrics-driven tuning. High-cardinality details (per-term drilldown) must not require expensive log scanning.

### 5.1 Cardinality rules (non-negotiable)
- OK metric labels: small bounded sets (`outcome`, `queue`, `job`, `provider`, `model`, `operation`).
- Never label by: `term`, `entityId`, `coverageKey`, subreddit name, request URL, user ID.

### 5.2 Keyword collection: cycleId and outcomes
Keep the “cycleId” concept from the original plan, but treat detailed per-term context as:
- **ephemeral structured logs** in Railway for immediate debugging, and/or
- **durable DB records** for long-term “top offenders” analysis (recommended if we truly need per-term insight in production without logs).

Minimum: metrics must still allow tuning without per-term logs.

### 5.3 Poll activity (first-class)
Ensure poll-related background work emits:
- queue backlog + throughput + p95 duration
- failure rates and error kinds (bucketed)
- notification enqueue/send rates (if applicable)

---

## 6) Keyword Collection Deep Observability (Preserved From Original Plan)

This section preserves the intent of the original keyword plan, but adapts it to “no hosted logs” at launch.

### 6.1 Correlation and context propagation
Every cycle should carry:
- `cycleId` (UUID)
- `source`: `scheduled | hot_spike | manual`
- `windowDays` and a small `selectionConfig` summary

Every term attempt should track (in DB and/or ephemeral logs):
- `cycleId`
- `normalizedTerm`
- `origin` (slice and optional entity metadata)
- `outcome`: `success | no_results | error | deferred | skipped`
- `cooldownUntil` if set/updated

### 6.2 Metrics (Prometheus) — low-cardinality health + costs
Suggested additions (names illustrative):
- Counters:
  - `keyword_cycles_total{source,outcome}`
  - `keyword_terms_total{source,outcome,slice}`
  - `keyword_reddit_api_calls_total{source,sort}`
  - `keyword_terms_deduped_total{source,reason}`
  - `keyword_terms_skipped_total{source,reason}` (`cooldown|invalid|budget_exhausted`)
- Histograms:
  - `keyword_cycle_duration_seconds{source}`
  - `keyword_term_duration_seconds{source,slice}`
  - `keyword_cycle_terms_selected{source}`
- Gauges (optional):
  - `keyword_cycle_inflight{source}`

LLM metrics (where relevant):
- `llm_requests_total{provider,model,operation,outcome}`
- `llm_request_duration_seconds{provider,model,operation}`
- `llm_tokens_total{provider,model,direction}`
- `llm_cost_usd_total{provider,model}` (best-effort)

### 6.3 Alerts (minimal but high-signal)
- No-results rate spike (overall)
- Job failures spike (by job type)
- Backlog growth (queue depth increasing over N minutes)
- Rate-limit hits spike (Reddit/LLM)
- Cycle duration p95 regression

---

## 7) Defer and Remove Log Dashboards (Explicitly)

We should not keep Loki panels around “just in case” if we aren’t hosting logs.

Actions:
1) Remove Loki datasource dependencies from dashboards in `observability/grafana/provisioning/dashboards/`.
2) Ensure the Grafana Cloud setup is metrics-only for launch (no Loki ingestion).
3) If/when we add hosted logs later, reintroduce logs as a deliberate project with cost controls and explicit use cases.

---

## 8) Dependencies / Links

- Keyword selection architecture: `plans/keyword-collection-priority-overhaul.md`
- Production hardening overview: `plans/production-hardening.md` (observability sections are owned by this plan)
