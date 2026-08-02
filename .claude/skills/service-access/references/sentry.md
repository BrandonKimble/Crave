# Sentry

`sentry-cli` v3.6.2. ✅ **Configured and working** (2026-08-02).

Auth comes from `SENTRY_AUTH_TOKEN` in `apps/api/.env` — a user token with full
scopes (`project:*`, `org:*`, `event:*`, `team:*`, `alerts:*`). No
`sentry-cli login`.

```
SENTRY_ORG=crave-yu
SENTRY_PROJECT=crave          # the API. Mobile is a SEPARATE project.
```

## Two projects, don't mix them up

| Slug           | ID               | What reports to it              |
| -------------- | ---------------- | ------------------------------- |
| `crave`        | 4510664990523392 | the NestJS **API** (and worker) |
| `crave-mobile` | 4511798194143232 | the **React Native app**        |

`SENTRY_PROJECT` defaults to `crave`. For mobile, pass `-p crave-mobile`.

⚠️ The `crave` project's display name is **"javascript-nextjs"** — an artifact
of the template it was created from. It is the Nest API project regardless.

## Usage

```bash
source scripts/rig/svc-env.sh
sentry-cli info
sentry-cli issues list
sentry-cli issues list -p crave-mobile
sentry-cli projects list -o crave-yu
```

`SENTRY_DSN` (also in `.env`) is write-only ingest and cannot list anything —
the auth token is what reads.

## Releases + sourcemaps

The reason this CLI matters: RN stack traces are unreadable without uploaded
sourcemaps.

```bash
sentry-cli releases new "$SENTRY_RELEASE"
sentry-cli sourcemaps upload --release "$SENTRY_RELEASE" ./dist
sentry-cli releases finalize "$SENTRY_RELEASE"
```

⚠️ `SENTRY_RELEASE` is **empty** in `apps/api/.env`, and `SENTRY_ENVIRONMENT` is
`development` locally / `production` on Railway. Releases won't be
distinguishable until `SENTRY_RELEASE` is populated (git sha is the usual
choice) — worth wiring into `deploy.sh`.

## Also available

The Sentry MCP is loaded (`search_issues`, `search_events`,
`analyze_issue_with_seer`) and authenticates separately. Seer's root-cause
analysis is worth reaching for on a hard crash; the CLI is better for
scripted/bulk reads and for release management.

Wiring: `apps/mobile/src/observability/crash-reporting.ts`, `apps/api/src/main.ts`.
