---
name: service-access
description: Reach any third-party service this app runs on, from the terminal — Railway (deploys, logs, vars), Google Cloud / BigQuery (billing export, Gemini, Places), Stripe, Sentry, Clerk, Cloudinary, Resend, RevenueCat, TomTom, Mapbox, Reddit, Expo/EAS, and the prod Postgres + Redis. Use when asked to check, query, debug, or change anything in one of those services, or when a question needs live data from one (spend, logs, a customer, an upload, an error) rather than from this repo.
---

# Service access

Every service this app depends on, reachable from a terminal. No MCP required.

## The one law: credentials come from `.env`, never from a login

```bash
source scripts/rig/svc-env.sh
```

That loads `apps/api/.env` + `apps/mobile/.env` and derives the composite vars
the CLIs want (`CLOUDINARY_URL`, `MAPBOX_TOKEN`, `STRIPE_KEY`). **Every command
below assumes you ran it first.**

Do not run `<tool> login` for anything in the env-auth column. A stateful login
copies a secret that already lives in `.env` into a second place, and that copy
goes stale the moment the `.env` rotates. Three tools genuinely need a browser
login (Railway, gcloud, gh) — those are already done and persist.

**Never echo a key.** `curl -s -o /dev/null -w "%{http_code}"` to test auth;
print response bodies, never the `Authorization` header. Do not paste a key as a
literal on a command line — reference `$VAR`.

## Router

| Service                                        | Reach it with             | Auth                           | Detail                                            |
| ---------------------------------------------- | ------------------------- | ------------------------------ | ------------------------------------------------- |
| Railway                                        | `railway` CLI             | browser login ✅ done          | [railway.md](references/railway.md)               |
| Google Cloud, BigQuery billing, Gemini, Places | `gcloud`, `bq`            | browser login ✅ done          | [gcp.md](references/gcp.md)                       |
| Stripe                                         | `stripe` CLI              | `--api-key $STRIPE_KEY`        | [stripe.md](references/stripe.md)                 |
| Sentry                                         | `sentry-cli`              | `SENTRY_AUTH_TOKEN` ⚠️ missing | [sentry.md](references/sentry.md)                 |
| Clerk                                          | `npx clerk` + BAPI curl   | `CLERK_SECRET_KEY`             | [clerk.md](references/clerk.md)                   |
| Cloudinary                                     | `cld` CLI                 | `CLOUDINARY_URL`               | [cloudinary.md](references/cloudinary.md)         |
| Resend                                         | `resend` CLI              | `RESEND_API_KEY` ⚠️ missing    | [resend.md](references/resend.md)                 |
| RevenueCat                                     | curl v1 (v2 ⚠️ needs key) | `REVENUECAT_API_KEY`           | [revenuecat.md](references/revenuecat.md)         |
| TomTom, Mapbox, Reddit                         | curl                      | key in `.env`                  | [http-only.md](references/http-only.md)           |
| Expo / EAS / App Store                         | `npx eas-cli`             | browser login ✅ done          | [mobile-release.md](references/mobile-release.md) |
| Prod Postgres, Redis                           | `psql`, `redis-cli`       | URL from Railway               | [data.md](references/data.md)                     |
| GitHub                                         | `gh`                      | ✅ done                        | —                                                 |

Read the reference file for a service before running against it — each one
carries the gotchas that cost time.

## Verified working as of 2026-08-01

`railway` · `gcloud`/`bq` · `gh` · `stripe` (test mode) · `cld` · Clerk BAPI ·
TomTom · Mapbox · Reddit OAuth · RevenueCat **v1 only**.

## Known gaps — need the owner, not me

**Step-by-step for each of these: [getting-credentials.md](references/getting-credentials.md).**
Hand the owner that runbook rather than improvising instructions; never ask for
a token value in chat.

1. **No APNs push key anywhere**, though the app ships `expo-notifications`.
   Push is likely unprovisioned — see `~/Crave/Crave Labs LLC/README.md`.
2. **No `eas.json`** in `apps/mobile`, so `eas build` is not configured. EAS
   auth works; the build profiles don't exist yet.
3. **`SENTRY_AUTH_TOKEN` is local-only.** Not set on Railway, so no CI/deploy
   release or sourcemap upload. `SENTRY_RELEASE` is also empty — releases are
   indistinguishable until it's populated.
4. **`android.package` is still `com.crave.search`** in `app.config.js` while
   iOS is `com.brandonkimble.cravesearch`. Open owner choice, nothing external
   registers it yet.

Closed: App Store Connect ✅ (key `87UM3R85SH` confirmed, app id `6793724490`)
· bundle id ✅ settled to `com.brandonkimble.cravesearch` · Resend ✅ verified
end-to-end (`POST /emails` 200, 2026-07-25, from `alerts@craveapp.ai`).

Closed 2026-08-02: Sentry auth ✅ · RevenueCat v2 ✅ · EAS login ✅ (`brandonk`,
state in `~/.expo`; CI would still need `EXPO_TOKEN`) · worker
`OPS_ALERT_EMAIL` ✅ set to `brandon@craveapp.ai`.

## Safety

- Test mode vs live: `STRIPE_SECRET_KEY` and `REVENUECAT_API_KEY` are both
  **test** keys today. Confirm the prefix before believing a number is real.
- Confirm with the owner before anything that spends, emails a real address,
  mutates production data, or deploys.
- Google Places and Gemini calls **cost money per call** — see gcp.md before
  issuing one in a loop.
