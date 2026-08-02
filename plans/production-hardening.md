# Production Hardening Plan (Stack + Services)

Goal: close the concrete production gaps identified in the current repo state, with best-practice defaults and a phased rollout path.

This plan is intentionally split into **workstreams** that can be shipped incrementally without blocking product work. Each workstream includes:

- **Discovery** (what we need to confirm)
- **Implementation** (what to build/change)
- **Validation** (how we know it works)
- **Rollout** (how we ship safely)

---

## 0) Context to Gather (Do This First)

Before building, confirm these decisions (they change the “best” implementation):

1. **Runtime topology**
   - Decision: **launch with a separate worker service** (at least 1 worker instance) alongside the API.
   - Confirm:
     - Will the API run >1 replica at launch (or shortly after)?
     - Will the worker run >1 replica (likely later, once backlog requires it)?
     - Will the worker be **private** (no public domain) in Railway?
2. **Observability target**
   - Are we willing to pay for a hosted metrics/logs product (Grafana Cloud / Axiom / Better Stack), or do we want to self-run Prometheus/Loki?
3. **Mobile release path**
   - Are we using **EAS Build** for iOS/Android builds, or `expo run:ios/android` for internal only?
4. **Billing product definition**
   - Decision: **fully paywalled mobile app** with monthly/yearly subscription (digital access/features).
   - Apple policy implication: iOS subscription must be sold via **In‑App Purchase** (Apple commission applies).
   - Decision: **RevenueCat-only** for subscriptions/entitlements; **remove Stripe** completely (no web checkout flow).
5. **Compliance / data policy**
   - Do we need a formal privacy posture (PII minimization, retention, deletion workflows) before launch?

---

## 1) Mobile Observability (Crashes + Performance + Release Health)

Current state:

- API has Sentry.
- Mobile does not appear to have a crash/perf product wired (no Sentry SDK usage visible).

### Discovery

- Confirm whether mobile is an **Expo managed** app or a **dev-client / bare** style app for production builds.
  - Repo signals both (Expo SDK 54 + `expo-dev-client`).
- Decide whether we want:
  - **Crashes only** initially, or also **performance spans**, **network breadcrumbs**, and **user/session replay** (privacy-sensitive).

### Implementation (Recommended)

1. **Add Sentry to mobile**
   - Use the Expo-compatible integration (`sentry-expo`) or `@sentry/react-native` depending on final build strategy.
   - Configure:
     - DSN(s): separate projects for `crave-mobile` vs `crave-api`.
     - `environment`: `development`, `staging`, `production`.
     - `release`/`dist`: align to app version + build number so sourcemaps match.
2. **Add identity correlation**
   - Set Sentry user context from Clerk user ID (not email by default).
   - Add a stable `device_id` (random UUID persisted) to correlate anonymous issues pre-login.
3. **Capture breadcrumbs & API correlation**
   - Ensure each API response includes a request id / correlation id header (if not already).
   - Log/attach that id in mobile Sentry events for cross-trace debugging.
4. **Sourcemaps for React Native**
   - Automate sourcemap upload in the build pipeline (EAS build hooks).
   - Gate uploads by environment so local/dev builds don’t spam Sentry.
5. **Release health**
   - Enable session tracking so we see crash-free users/sessions.

### Validation

- Force a test crash in a dev build and confirm it appears in the correct Sentry project/environment within ~10 seconds.
- Verify stack traces are de-minified (sourcemaps working) for at least one production-like build.
- Confirm user correlation works (events show Clerk user id after login).

### Rollout

- Phase 1: crashes + release health only.
- Phase 2: performance spans for key screens (Search submit → results).
- Phase 3 (optional): replay (only if privacy stance allows).

---

## 2) Production Observability Strategy (Metrics + Logs + Traces)

Owned by `plans/observability-overhaul.md`.

Decision summary:

- Sentry for errors/performance.
- Grafana Cloud for metrics-only dashboards/alerts (scrape `/metrics`).
- Defer hosted logs (no Loki in production at launch); use Railway logs.

---

## 3) Protect `/metrics` (Production Security Hygiene)

Owned by `plans/observability-overhaul.md` (token-authenticated scrape in production).

---

## 4) Split “API” vs “Worker/Scheduler” Roles (Scale Safely)

Current state:

- Bull queues + processors and schedulers appear to run inside the API process.
- If the API is scaled horizontally, scheduled jobs can duplicate and workers compete with request traffic.

### Discovery

- List all schedulers/cron jobs and which queues they enqueue.
- Decide target model:
  - **Single worker** (most common early)
  - **Worker pool** (scale with backlog)
- Confirm what the worker must expose:
  - **Metrics**: do we need the worker to expose `/metrics` so Grafana Cloud can see job/collection metrics? (recommended: yes)
  - **Health**: do we need a worker `/health` endpoint for Railway healthchecks? (recommended: yes)
  - **Public access**: ensure the worker has **no public domain** (recommended) even if it binds a port.
  - **Sentry**: ensure background job errors are captured and tagged `service=worker`.
  - **Kill switches**: confirm the exact env vars/flags we will use to disable schedulers and/or pause collection safely in production.
  - **Queue ops**: confirm how we’ll retry/triage failed jobs without exposing a public Bull UI.

### Implementation (Recommended)

1. **Introduce process roles**
   - `PROCESS_ROLE=api|worker` (or similar).
2. **Worker bootstrap**
   - Preferred: create a worker entrypoint that starts Nest in “application context” mode (no public HTTP API) and runs processors + schedulers.
   - If Railway requires HTTP healthchecks/metrics: run a **minimal HTTP server** in worker role that exposes only:
     - `/health` (and optionally `/health/live`, `/health/ready`)
     - `/metrics` (token-protected in production)
   - Initialize Sentry in the worker process as well (same DSN, different `serverName`/tag).
3. **API bootstrap**
   - API role runs HTTP only; processors disabled; schedulers disabled.
4. **Distributed safety**
   - Ensure any scheduled work is idempotent or protected by a distributed lock (Redis) so a misconfig doesn’t double-run.
5. **Railway deploy**
   - Add a second Railway service for the worker with a different `startCommand` and the same image/build.
   - Set resource sizing separately (CPU/memory) for API vs worker.
   - Ensure both services share the same Postgres + Redis and consistent Bull prefix/env (`APP_ENV`, `BULL_PREFIX`).
6. **Kill switches (prod safety)**
   - Add explicit env-controlled switches for:
     - schedulers on/off
     - enqueueing on/off (optional)
     - worker processors on/off (emergency “stop the bleeding”)
   - Require these switches to default to “safe on” in production, but be trivially toggled in Railway variables without a redeploy.
7. **Queue operations (no public admin UI by default)**
   - Provide a secure mechanism to:
     - inspect failed job counts by queue/job
     - requeue/retry with guardrails
     - optionally drain/pause queues during incidents
   - Prefer: internal scripts run via `railway run ...` or a locked-down admin-only endpoint guarded by Clerk admin IDs (if you must).

### Validation

- With 2 API replicas: scheduled jobs run once (not twice).
- Worker restarts do not lose jobs (Bull persistence).
- Queue backlog drains and does not impact API latency under load.
- Grafana metrics show worker-side queue/job activity (not just API request metrics).
- A worker-thrown exception shows up in Sentry with `service=worker` tags.
- Kill switch toggles stop scheduling/enqueueing within a bounded time (no new work is created, and in-flight work finishes or is safely interrupted).

---

## 5) Consolidate Mobile App Config (Expo + EAS + Bundle IDs)

Current state:

- Root has `app.config.js` and a root Expo entry (`App.tsx`) re-exporting from `apps/mobile/App`.
- `apps/mobile` also looks like a full Expo project with its own `app.json` and bundle IDs.
- Bundle IDs / package names differ across configs, which can break Apple Sign In, push notifications, and store submissions.

### Discovery

- Decide the single canonical Expo app location:
  - Option A: **Run Expo from repo root** (root config is source of truth).
  - Option B: **Run Expo from `apps/mobile`** (apps/mobile config is source of truth).
- Confirm the canonical identifiers:
  - iOS bundle identifier (must match Apple Developer configuration)
  - Android application id
  - Expo project ID (for notifications + updates)

### Implementation (Recommended)

1. **Pick a single source of truth**
   - Remove ambiguity so `yarn dev` and EAS builds always use the same config.
2. **Unify identifiers**
   - Ensure iOS bundle id and Android package id match across config and CI.
3. **Apple sign-in & redirects**
   - Confirm Clerk redirect URIs match the real bundle id and scheme.
4. **Expo Updates strategy**
   - Decide whether OTA updates are enabled for production and which channels (staging/prod).

### Validation

- Apple Sign In works on a production-like build.
- Push token registration works (Expo project id correct).
- EAS build produces an installable artifact with correct identifiers.

---

## 6) Redis Client Standardization (`redis` vs `ioredis`)

Current state:

- API code appears to import `ioredis` directly.
- Dependencies include both `redis` and `ioredis` (extra surface area).

### Discovery

- Confirm whether the `redis` package is used anywhere directly or via a library (cache store, etc.).
- Decide the standard:
  - Keep **ioredis** as the primary client (common with Bull)
  - Or move to **node-redis** everywhere (requires checking Bull compatibility and current Nest Redis module)

### Implementation (Recommended)

1. **Inventory current usage**
   - All direct imports + all DI providers that expose Redis clients.
2. **Pick one primary client and wrap it**
   - Provide a single Nest “RedisModule” that exports a shared client/provider.
3. **Remove the unused dependency**
   - Reduce risk of version conflicts and security patch surface.

### Validation

- Jobs enqueue/process successfully.
- Rate limiter storage works under concurrency.
- No runtime dependency on the removed Redis library remains.

---

## 7) RevenueCat-Only Subscriptions (Remove Stripe Completely)

Decision: the app is a **digital** subscription product (monthly/yearly paywall), so iOS must use **Apple IAP**. We will standardize on **RevenueCat** for subscription lifecycle + entitlements and remove all Stripe codepaths, schemas, env vars, and docs.

### Discovery (do once, upfront)

1. **Entitlements & products**
   - Define the canonical entitlement(s): e.g. `premium`.
   - Define product IDs per store: `premium_monthly`, `premium_yearly`, trial rules, and upgrade/downgrade behavior.
2. **User identity mapping**
   - Decide what `app_user_id` should be in RevenueCat:
     - Recommended: stable authenticated id (e.g. Clerk user id) once logged in.
     - Ensure anonymous users can “restore purchases” even before full profile setup.
3. **Platform coverage**
   - iOS first; decide whether Android launches with subscriptions at the same time.
4. **Data migration stance**
   - Confirm there are **no active Stripe customers/subscriptions**. If any exist, define a sunset/grandfather plan before deletion.

### Implementation (Mobile)

1. **Add RevenueCat SDK**
   - Integrate the official Purchases SDK (`react-native-purchases`) and wire it for Expo/EAS builds (native module).
2. **Purchase + restore flows**
   - Implement:
     - paywall screen
     - purchase action
     - restore purchases
     - “manage subscription” deep link to system subscription management
3. **Entitlement gating**
   - Use RevenueCat customer info to gate UI locally.
   - Also pass entitlement status to the API (see below) so backend enforcement matches the client.
4. **Privacy & logging**
   - Ensure no receipt payloads or sensitive billing data are logged.

### Implementation (API)

1. **RevenueCat as source of truth**
   - Keep (and harden) the RevenueCat webhook:
     - strict auth via `REVENUECAT_WEBHOOK_SECRET`
     - idempotency on `externalEventId`
     - correct platform mapping (ios/android)
2. **Backend entitlement enforcement**
   - Add a single “entitlement check” abstraction used by auth guards for paywalled endpoints.
   - Optional: add a “sync now” endpoint that the mobile app can call after purchase/restore to minimize delay between purchase and backend access.
3. **Remove Stripe modules entirely**
   - Delete Stripe endpoints:
     - `POST /billing/checkout-session`
     - `POST /billing/portal-session`
     - `POST /billing/webhooks/stripe`
   - Remove Stripe configuration (`STRIPE_*`) and Stripe SDK dependency.
   - Update legal copy to remove Stripe references.

### Implementation (Database / Prisma)

1. **Remove Stripe fields & tables**
   - Remove `User.stripeCustomerId`.
   - Remove `CheckoutSession` (Stripe-only concept) and related tables if no longer used.
2. **Normalize providers**
   - Remove `SubscriptionProvider.stripe` and any `SubscriptionPlatform.web` usage if we truly have no web billing.
   - Ensure remaining enums and data reflect reality: `revenuecat` (+ optional `manual` for admin grants).
3. **Migration safety**
   - Provide a reversible migration path if any prod data exists (export snapshots, verify no rows reference Stripe provider before dropping enum values/tables).

### Decommission Stripe (Ops)

1. Remove Stripe webhooks/endpoints from Stripe Dashboard (or disable the app).
2. Remove `STRIPE_*` secrets from Railway environment.
3. Confirm there are no inbound calls from Stripe (logs stay clean).

### Validation (must pass before launch)

- iOS purchase succeeds; entitlement becomes active immediately in-app.
- Restore purchases works on a fresh install.
- RevenueCat webhooks update backend entitlement state.
- Paywalled API endpoints reject non-entitled users and allow entitled users.
- No Stripe endpoints/routes exist, and no Stripe secrets are required anywhere.

---

## 8) Staging + Runbooks (Launch With a Worker)

Launching with a separate worker makes “it deployed” != “it’s healthy”. We need a small amount of operational scaffolding.

### Staging environment (recommended before first paid launch)

- **DONE 2026-08-01**: staging Railway environment live — own Postgres + Redis,
  dev vendor keys (Gemini/Places), scheduler off, api at
  api-staging-25ca.up.railway.app, worker healthy. Still open from the list
  below: separate Sentry environment, Clerk separation, RevenueCat test config.
- Create a staging Railway environment with:
  - separate Postgres + Redis
  - ~~separate Sentry environment~~ — settled NO (owner, 2026-08-01): Sentry
    exists to watch unattended prod; staging is only alive while someone is
    actively deploying/watching it, so railway logs suffice. Staging's
    SENTRY_DSN is deliberately deleted (it was polluting prod Sentry).
  - separate Clerk instance/config (or clearly separated templates/audiences)
  - RevenueCat test configuration pointing at staging webhooks
- Rehearse:
  - migrations (including rollback procedure)
  - worker deploy/restart behavior
  - collection/poll job execution end-to-end

### Runbooks (minimum set)

1. **Incident: backlog climbing**
   - How to confirm (Grafana panels + `ops report`) and what to do first (reduce concurrency? pause schedulers?).
2. **Incident: error spike**
   - How to correlate Sentry errors to job types and the last deploy.
3. **DB migration failure**
   - How to stop deploy, recover, and roll forward/back (with explicit “do not drop data” guidance).
4. **RevenueCat webhook mismatch**
   - How to validate webhook auth, event ingestion, and entitlement state.

### Backups / restore drill

- **DONE 2026-08-02 — Railway Pro + daily volume backups are LIVE.** Owner
  upgraded to Pro; daily schedule enabled on the PROD postgis volume via the
  GraphQL API (`volumeInstanceBackupScheduleUpdate`, kinds [DAILY] — cron
  58 4 \* \* \* UTC, retention 6 days), and a first manual backup was taken
  immediately (2,240 MB referenced). The pre-migration `pg_dump` on every
  prod deploy (last 5 in `~/.crave-deploy-backups`) stays as the
  second, independent rail.
- **VOLUME-RESTORE REHEARSAL RUN 2026-08-02 (staging, RED-proven).** How
  Railway restore ACTUALLY works — it never overwrites in place:
  1. Backup taken → marker table planted AFTER the backup →
     `volumeInstanceBackupRestore` invoked.
  2. Restore mints a NEW volume named `postgis-db-<timestamp>` from the
     snapshot, attached to NOTHING. The original volume is untouched (this
     is why a redeploy alone changes nothing — we proved that the hard way).
  3. Complete it with a volume swap:
     `railway volume -s <svc> -e <env> detach -v postgis-db-volume -y`,
     `attach -v "postgis-db-<timestamp>" -y`, then redeploy the service.
  4. PROOF: the post-backup marker table was GONE on the restored volume
     (`to_regclass` = f) — the snapshot genuinely rewinds data.
     Rehearsal cleanup: staging swapped back to its original volume, snapshot
     volume deleted, marker dropped. For a REAL prod restore, steps 1–3 on the
     prod instance are the whole runbook (plus the app services reconnect on
     their own — DATABASE_URL doesn't change).
- The GraphQL wrinkle: the CLI has no backup verbs; use the API with the
  `accessToken` (NOT `token`) from `~/.railway/config.json` against
  backboard.railway.com/graphql/v2. Backups list via
  `volumeInstanceBackupList(volumeInstanceId:)`; prod volumeInstance id
  8fece9b0-580e-44e4-a45c-6bb1123ade0c.
- **RESTORE DRILL RUN 2026-08-01** (prod dump → scratch DB on staging PG).
  Verified: core_entities 17,518 / mentions 46,608 / polls 17,931 / users 17 —
  exact match to prod. The working recipe:
  1. `DUMP=$(ls -t ~/.crave-deploy-backups/prod-*.dump | head -1)`
  2. `psql -h <target> -U postgres -d postgres -c "CREATE DATABASE restore_target"`
  3. `pg_restore --no-owner --no-privileges -h <target> -d restore_target "$DUMP"`
     Two errors are EXPECTED and understood:
  - `_timescaledb_catalog.chunk ... column "schema_name" does not exist` —
    Timescale's own catalog schema version drift between image builds. We use
    ZERO hypertables (verified: `timescaledb_information.hypertables` = 0
    rows), so this is noise. Silence it next time with
    `pg_restore --exclude-schema=_timescaledb_catalog` (also exclude
    `_timescaledb_config/_timescaledb_cache/_timescaledb_internal`).
  - `CREATE INDEX ... hnsw ... could not resize shared memory segment ... No
space left on device` — the pgvector HNSW index on
    core_entities.name_embedding allocates ~1GB of dynamic shared memory for
    its PARALLEL build; small containers' /dev/shm can't hold it. NOT a plan
    tier limit — prod's index already exists and is untouched. Fix at restore
    time: `SET max_parallel_maintenance_workers = 0;` then re-run the
    `CREATE INDEX ... USING hnsw` statement (serial build, works anywhere;
    queries work without the index meanwhile, just slower vector search).
  - RPO today: ≤24h (daily volume backup, 04:58 UTC) and at most the last
    deploy for schema-affecting incidents (pre-migration dump). RTO: ~15 min (restore measured ~10 min for
    450MB over the proxy + index rebuild). Rehearse quarterly; drop the
    scratch DB after (`DROP DATABASE restore_target` — staging volume is
    only 4.9GB).
