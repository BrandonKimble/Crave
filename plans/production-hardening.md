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

1) **Runtime topology**
   - Do we plan to run *only* the API on Railway at first, or also a worker service?
   - Will we run >1 API replica early (autoscaling) or stay single-instance?
2) **Observability target**
   - Are we willing to pay for a hosted metrics/logs product (Grafana Cloud / Axiom / Better Stack), or do we want to self-run Prometheus/Loki?
3) **Mobile release path**
   - Are we using **EAS Build** for iOS/Android builds, or `expo run:ios/android` for internal only?
4) **Billing product definition**
   - Decision: **fully paywalled mobile app** with monthly/yearly subscription (digital access/features).
   - Apple policy implication: iOS subscription must be sold via **In‑App Purchase** (Apple commission applies).
   - Decision: **RevenueCat-only** for subscriptions/entitlements; **remove Stripe** completely (no web checkout flow).
5) **Compliance / data policy**
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
1) **Add Sentry to mobile**
   - Use the Expo-compatible integration (`sentry-expo`) or `@sentry/react-native` depending on final build strategy.
   - Configure:
     - DSN(s): separate projects for `crave-mobile` vs `crave-api`.
     - `environment`: `development`, `staging`, `production`.
     - `release`/`dist`: align to app version + build number so sourcemaps match.
2) **Add identity correlation**
   - Set Sentry user context from Clerk user ID (not email by default).
   - Add a stable `device_id` (random UUID persisted) to correlate anonymous issues pre-login.
3) **Capture breadcrumbs & API correlation**
   - Ensure each API response includes a request id / correlation id header (if not already).
   - Log/attach that id in mobile Sentry events for cross-trace debugging.
4) **Sourcemaps for React Native**
   - Automate sourcemap upload in the build pipeline (EAS build hooks).
   - Gate uploads by environment so local/dev builds don’t spam Sentry.
5) **Release health**
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

Current state:
- API has:
  - Sentry errors/perf
  - Prometheus-format metrics at `/metrics`
  - A local Docker observability stack (Prometheus + Grafana + Loki + Promtail)
- Railway deployment docs exist, but production observability hosting is not decided.

### Recommendation (phased, pragmatic)
**Start with Sentry + Railway logs**, then add hosted metrics when we need it.

Reasoning:
- Sentry already covers “what broke” + latency outliers quickly.
- Hosted metrics/logs adds cost + operational overhead; you can defer until you have real traffic and concrete questions.

### Phase A (Launch baseline)
1) **Sentry (API + Mobile)**
   - Alerts routing (Discord/Slack) and a simple on-call playbook.
2) **Railway logs**
   - Ensure structured logs are readable and have stable fields (service, requestId, userId).
3) **Uptime checks**
   - Add an external health monitor (e.g. Better Uptime / Statuspage / simple cron) hitting `/health`.
4) **Minimal dashboards**
   - Sentry dashboards for error rate and latency.

### Phase B (Metrics without self-hosting Grafana/Loki)
Pick one of these options:
1) **Grafana Cloud (recommended if you want to keep Prometheus semantics)**
   - Run Grafana Alloy (or agent) as a small service that scrapes `https://<api>/metrics` and remote-writes to Grafana Cloud.
   - Keep dashboards in Grafana Cloud (no self-hosted Grafana/Loki needed).
2) **Alternative “one vendor” observability**
   - Axiom / Better Stack / Datadog, depending on budget and preference.
   - If chosen, decide whether to keep Prometheus metrics or emit OTEL metrics/logs.

### Phase C (Centralized logs)
Only add when you need cross-request querying beyond Railway logs:
- Grafana Cloud Loki (or Axiom/Better Stack logs).
- Ensure log volume/cost control via:
  - sampling
  - dropping noisy debug fields
  - strict label hygiene (avoid high-cardinality labels)

### Validation
- Confirm metrics scrape works (scraper target “UP”).
- Confirm alerts trigger on:
  - error spike
  - elevated p95 latency
  - queue backlog
- Confirm logs can be searched by requestId and userId.

---

## 3) Protect `/metrics` (Production Security Hygiene)

Current state:
- `/metrics` exists and appears unauthenticated.

### Discovery
- How will metrics be scraped in production?
  - Public internet scrape (bad default)
  - Private network / VPN / internal only
  - Token-authenticated scrape endpoint

### Implementation (Recommended)
1) **Require an access token in production**
   - Env var: `METRICS_ACCESS_TOKEN`.
   - Only enforce when `NODE_ENV=production` (or `APP_ENV=prod`).
   - Support `Authorization: Bearer <token>` (or a dedicated header).
2) **Allowlist health endpoints**
   - Keep `/health`, `/health/ready`, `/health/live` unauthenticated.
3) **Avoid leaking secrets/PII**
   - Ensure metrics never include user identifiers or request URLs as labels.

### Validation
- Without token: `/metrics` returns 401 in prod.
- With token: `/metrics` returns 200 and scrapes cleanly.

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

### Implementation (Recommended)
1) **Introduce process roles**
   - `PROCESS_ROLE=api|worker` (or similar).
2) **Worker bootstrap**
   - Create a worker entrypoint that starts Nest in “application context” mode (no HTTP listener) and runs processors + schedulers.
3) **API bootstrap**
   - API role runs HTTP only; processors disabled; schedulers disabled.
4) **Distributed safety**
   - Ensure any scheduled work is idempotent or protected by a distributed lock (Redis) so a misconfig doesn’t double-run.
5) **Railway deploy**
   - Add a second Railway service for the worker with a different `startCommand` and the same image/build.
   - Set resource sizing separately (CPU/memory) for API vs worker.

### Validation
- With 2 API replicas: scheduled jobs run once (not twice).
- Worker restarts do not lose jobs (Bull persistence).
- Queue backlog drains and does not impact API latency under load.

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
1) **Pick a single source of truth**
   - Remove ambiguity so `yarn dev` and EAS builds always use the same config.
2) **Unify identifiers**
   - Ensure iOS bundle id and Android package id match across config and CI.
3) **Apple sign-in & redirects**
   - Confirm Clerk redirect URIs match the real bundle id and scheme.
4) **Expo Updates strategy**
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
1) **Inventory current usage**
   - All direct imports + all DI providers that expose Redis clients.
2) **Pick one primary client and wrap it**
   - Provide a single Nest “RedisModule” that exports a shared client/provider.
3) **Remove the unused dependency**
   - Reduce risk of version conflicts and security patch surface.

### Validation
- Jobs enqueue/process successfully.
- Rate limiter storage works under concurrency.
- No runtime dependency on the removed Redis library remains.

---

## 7) RevenueCat-Only Subscriptions (Remove Stripe Completely)

Decision: the app is a **digital** subscription product (monthly/yearly paywall), so iOS must use **Apple IAP**. We will standardize on **RevenueCat** for subscription lifecycle + entitlements and remove all Stripe codepaths, schemas, env vars, and docs.

### Discovery (do once, upfront)
1) **Entitlements & products**
   - Define the canonical entitlement(s): e.g. `premium`.
   - Define product IDs per store: `premium_monthly`, `premium_yearly`, trial rules, and upgrade/downgrade behavior.
2) **User identity mapping**
   - Decide what `app_user_id` should be in RevenueCat:
     - Recommended: stable authenticated id (e.g. Clerk user id) once logged in.
     - Ensure anonymous users can “restore purchases” even before full profile setup.
3) **Platform coverage**
   - iOS first; decide whether Android launches with subscriptions at the same time.
4) **Data migration stance**
   - Confirm there are **no active Stripe customers/subscriptions**. If any exist, define a sunset/grandfather plan before deletion.

### Implementation (Mobile)
1) **Add RevenueCat SDK**
   - Integrate the official Purchases SDK (`react-native-purchases`) and wire it for Expo/EAS builds (native module).
2) **Purchase + restore flows**
   - Implement:
     - paywall screen
     - purchase action
     - restore purchases
     - “manage subscription” deep link to system subscription management
3) **Entitlement gating**
   - Use RevenueCat customer info to gate UI locally.
   - Also pass entitlement status to the API (see below) so backend enforcement matches the client.
4) **Privacy & logging**
   - Ensure no receipt payloads or sensitive billing data are logged.

### Implementation (API)
1) **RevenueCat as source of truth**
   - Keep (and harden) the RevenueCat webhook:
     - strict auth via `REVENUECAT_WEBHOOK_SECRET`
     - idempotency on `externalEventId`
     - correct platform mapping (ios/android)
2) **Backend entitlement enforcement**
   - Add a single “entitlement check” abstraction used by auth guards for paywalled endpoints.
   - Optional: add a “sync now” endpoint that the mobile app can call after purchase/restore to minimize delay between purchase and backend access.
3) **Remove Stripe modules entirely**
   - Delete Stripe endpoints:
     - `POST /billing/checkout-session`
     - `POST /billing/portal-session`
     - `POST /billing/webhooks/stripe`
   - Remove Stripe configuration (`STRIPE_*`) and Stripe SDK dependency.
   - Update legal copy to remove Stripe references.

### Implementation (Database / Prisma)
1) **Remove Stripe fields & tables**
   - Remove `User.stripeCustomerId`.
   - Remove `CheckoutSession` (Stripe-only concept) and related tables if no longer used.
2) **Normalize providers**
   - Remove `SubscriptionProvider.stripe` and any `SubscriptionPlatform.web` usage if we truly have no web billing.
   - Ensure remaining enums and data reflect reality: `revenuecat` (+ optional `manual` for admin grants).
3) **Migration safety**
   - Provide a reversible migration path if any prod data exists (export snapshots, verify no rows reference Stripe provider before dropping enum values/tables).

### Decommission Stripe (Ops)
1) Remove Stripe webhooks/endpoints from Stripe Dashboard (or disable the app).
2) Remove `STRIPE_*` secrets from Railway environment.
3) Confirm there are no inbound calls from Stripe (logs stay clean).

### Validation (must pass before launch)
- iOS purchase succeeds; entitlement becomes active immediately in-app.
- Restore purchases works on a fresh install.
- RevenueCat webhooks update backend entitlement state.
- Paywalled API endpoints reject non-entitled users and allow entitled users.
- No Stripe endpoints/routes exist, and no Stripe secrets are required anywhere.
