# Keyword Collection Observability Overhaul

## Summary

We are intentionally skipping unit/integration/smoke tests for the keyword collection overhaul, so we need an observability-first safety net. This plan proposes a cohesive, low-cardinality metrics + high-cardinality log strategy so we can:

- debug why keywords were selected (and why they weren’t),
- debug per-term execution outcomes (success/no-results/error),
- track cost (Reddit API calls + LLM cost),
- catch regressions quickly (selection drift, duplicate terms, runaway no-results).

This plan is intended to be implemented after (or alongside) `plans/keyword-collection-priority-overhaul.md`, which introduces daily cycles, slices, cached aggregates, attempt history, and cooldowns.

## Goals / Non-Goals

### Goals

- Make each keyword cycle attributable and debuggable end-to-end via a single `cycleId`.
- Provide dashboards that answer “is the system healthy?” and “is it producing value?” without exploding metric cardinality.
- Provide drill-down traces for “why did this term get selected?” and “what happened when we ran it?”.
- Include LLM cost visibility (tokens, cost estimates, latency, error rate).

### Non-Goals

- Replacing existing observability stack choices (Prometheus + Grafana + Loki).
- Storing high-cardinality term-level data in Prometheus labels.

## Current State (what we have)

- Some keyword metrics already exist via `apps/api/src/modules/content-processing/reddit-collector/keyword-search-metrics.service.ts`.
- Existing dashboards live under `observability/grafana/provisioning/dashboards/`, e.g. `observability/grafana/provisioning/dashboards/integrations-overview.json`.

## Proposed Observability Model

### 1) Cardinality rules

- Prometheus:
  - OK labels: small, bounded sets such as `source`, `outcome`, `slice`, `sort`, `timeFilter`.
  - Never label by `term`, `entityId`, `coverageKey`, raw subreddit name, or any unbounded value.
- Loki:
  - Use structured JSON logs for per-term details (terms, IDs, per-coverageKey context, score components).

### 2) Correlation and context propagation

Every cycle should carry:

- `cycleId` (UUID)
- `source`: `scheduled | hot_spike | manual`
- `coverageKey`
- `subreddits: string[]` attempted in this cycle
- `windowDays` for cached-aggregate/demand computations
- `selectionConfig` (budgets, caps) as a small object

Every term attempt should carry:

- `cycleId`
- `normalizedTerm`
- `origin`: slice + entity metadata (if applicable)
- `executionPlan` summary (sort/time filters attempted)
- `outcome`: `success | no_results | error | deferred | skipped`
- `cooldownUntil` if set/updated

### 3) Logging (Loki) — JSON events

#### 3.1 Cycle summary (one log per cycle)

Event: `keyword_cycle_summary`

Minimum fields:

- `cycleId`, `startedAt`, `finishedAt`, `durationMs`
- `source`, `coverageKey`, `subreddits`
- `selection`:
  - `requestedTerms`, `selectedTerms`, `dedupedTerms`, `skippedByCooldown`, `skippedInvalid`
  - `sliceCounts`
  - `entityTypeCounts` (if entity-backed slice candidates were used)
  - `stalenessDaysSummary` (p50/p90/max) for entity-backed terms
- `execution`:
  - `redditApiCalls`, `redditRateLimitedCount`, `sortsAttemptedTotal`
  - `llmCalls`, `llmTokensIn`, `llmTokensOut`, `llmCostUsdEstimate` (if applicable)
- `results`:
  - `postsFound`, `commentsFound`, `connectionsCreated`, `entitiesCreatedOrEnriched`
- `failures`:
  - `termsErrored`, `termsNoResults`
  - `errorKindsTop` (bucketed strings)

#### 3.2 Term summary (one log per term per cycle)

Event: `keyword_term_summary`

Minimum fields:

- `cycleId`, `coverageKey`, `subreddit`, `term`, `normalizedTerm`
- `origin`: `{ slice, entityId?, entityType?, onDemandRequestId? }`
- `scores`: `{ stalenessScore?, qualityScore?, demandScore?, unmetScore?, exploreScore? }`
- `rankWithinSlice`, `rankOverall`
- `execution`: `{ sortsAttempted, apiCalls, durationMs }`
- `results`: `{ posts, comments, connectionsCreated }`
- `outcome`, `cooldownUntil?`, `errorKind?`

### 4) Metrics (Prometheus) — low-cardinality health + costs

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
  - `keyword_cycle_terms_selected{source}` (bucket by count)
- Gauges (optional):
  - `keyword_cycle_inflight{source}` (if concurrency matters)

LLM metrics (if/where LLM is in the pipeline):

- `llm_requests_total{provider,model,operation,outcome}`
- `llm_request_duration_seconds{provider,model,operation}`
- `llm_tokens_total{provider,model,direction}` (`in|out`)
- `llm_cost_usd_total{provider,model}` (best-effort estimate)

### 5) Dashboards (Grafana)

Add a dedicated dashboard (or extend `observability/grafana/provisioning/dashboards/integrations-overview.json`) with:

- Cycle success rate (24h/7d)
- p95 cycle duration
- Reddit API calls per cycle (avg/p95)
- Terms attempted per cycle + dedupe rate
- No-results rate (overall + by slice)
- Connections created / entities enriched per cycle
- LLM requests/tokens/cost per day (if applicable)

Add Loki drill-down panels / saved queries:

- Top `no_results` terms (by coverageKey and overall)
- Top dedupe collisions (`normalizedTerm` repeated across entities)
- Recent term errors grouped by `errorKind`

### 6) Alerts (minimal but high-signal)

- Cycle error rate > X% (rolling 1h / 6h)
- No-results rate spike (overall or within a specific slice)
- Reddit API rate-limit events > threshold
- Cycle duration p95 > threshold
- LLM error rate spike (if applicable)

## Data Retention and Storage

- Favor DB tables for durable, queryable history when we need it (e.g., keyword attempt history), and logs for detailed per-cycle/per-term context.
- Avoid storing long-term, high-cardinality histories exclusively in logs (harder to query for “top no-results over 30d” without expensive log scans).

## Dependencies / Links

- Depends on the “keyword attempt history” table in `plans/keyword-collection-priority-overhaul.md` (durable cooldowns + outcomes).
- Depends on the sliced selection approach (to emit slice-level metrics and explain selection behavior).

## Rollout

1. Add cycleId propagation and JSON logs first (fast feedback, no schema risk).
2. Add Prometheus metrics with careful label hygiene.
3. Add dashboards and a small set of alerts.
4. Iterate: expand value metrics (connections/enrichments) and LLM cost attribution once stable.
