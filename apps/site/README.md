# apps/site — craveapp.ai

The public website and the **web checkout entry** for the Strava-pattern dual-rail
paywall (`business/business-model.md` → "Margin lever"; owner ruling 2026-08-01/08-03).

## What this replaced

Until this rederivation, craveapp.ai was a Railway **function** whose entire source
was a **base64 blob inside the service's `startCommand`** — four HTML string constants
and an if-chain, living outside the repo, outside git, outside review. That shape
cannot hold auth or checkout, so it was rederived here as a normal in-repo app.

The four pages were captured from the live site and are preserved verbatim, with one
edit: Cloudflare had rewritten the `support@craveapp.ai` links into `__cf_email__`
obfuscation that only renders if a CDN script loads. Those are plain `mailto:` links
again.

| route                | source                   | notes                                          |
| -------------------- | ------------------------ | ---------------------------------------------- |
| `/`                  | `src/pages/index.html`   | landing page, preserved                        |
| `/privacy`           | `src/pages/privacy.html` | Privacy Policy, preserved                      |
| `/terms`             | `src/pages/terms.html`   | Terms of Service, preserved                    |
| `/support`           | `src/pages/support.html` | Support, preserved                             |
| `/premium`           | `src/premium-page.ts`    | **new** — Clerk sign-in → checkout             |
| `/premium/success`   | `src/premium-page.ts`    | **new** — `STRIPE_CHECKOUT_SUCCESS_URL` target |
| `/premium/cancelled` | `src/premium-page.ts`    | **new** — `STRIPE_CHECKOUT_CANCEL_URL` target  |
| `/healthz`           | `src/router.ts`          | **new** — Railway healthcheck                  |
| anything else        | —                        | 302 → `/`                                      |

## The `/premium` flow

1. Clerk's browser bundle loads from the frontend-API host **derived from the
   publishable key itself** (`src/clerk-frontend-api.ts`) — no fourth env var, and no
   way for a hand-typed host to disagree with the key.
2. Not signed in → `Clerk.mountSignIn()`. Same Clerk instance as the mobile app.
3. Signed in → "Continue to secure checkout" mints a **JWT-template token**
   (`getToken({ template: … })`) and `POST`s it as a bearer to
   `${API_ORIGIN}/api/v1/billing/checkout-session` with an **empty JSON body**.
4. The api returns `{ url }` — the hosted Stripe Checkout page — and the browser
   follows it.

**What the site deliberately does not do**, and must never start doing:

- **It never names a price.** Premium is the only product; the api refuses any
  `priceId` but the configured one. Sending none means there is nothing to get wrong.
- **It never chooses the redirect URLs.** The DTO stopped accepting client
  `successUrl`/`cancelUrl` — that is an open redirect wearing a feature's clothes.
  `/premium/success` and `/premium/cancelled` exist to **be** the configured URLs,
  not to be passed as them.
- **It never grants anything.** Access arrives only via the Stripe webhook →
  access-grant ledger. Landing on `/premium/success` is a redirect, not a receipt,
  and the page's copy says so ("being confirmed").
- **It holds no secret.** No Stripe key, no Clerk secret key, no database URL.

## Env contract (all three are non-secret)

| var                     | required       | default  | meaning                                             |
| ----------------------- | -------------- | -------- | --------------------------------------------------- |
| `API_ORIGIN`            | for `/premium` | —        | api origin **without** `/api/v1` (the site adds it) |
| `CLERK_PUBLISHABLE_KEY` | for `/premium` | —        | `pk_live_…` for the SAME Clerk instance as the app  |
| `CLERK_JWT_TEMPLATE`    | no             | `mobile` | see the warning below                               |
| `PORT`                  | no             | `8080`   | Railway's domains bind 8080                         |

Missing `API_ORIGIN`/`CLERK_PUBLISHABLE_KEY` does **not** take the site down: the
four static pages keep serving and `/premium` answers **503** naming what is missing.
An unconfigured checkout is an outage and must look like one to a monitor.

### ⚠️ `CLERK_JWT_TEMPLATE` is not cosmetic

`ClerkAuthService` validates `aud` against **`CLERK_JWT_AUDIENCE`** and refuses any
token outside that list (absence of configuration never grants access). The mobile app
uses `getToken({ template: 'mobile' })`, so `mobile` is the one template known to
produce an accepted audience today. Point this at a dedicated `web` template **only
after** that template's `aud` has been added to the api's `CLERK_JWT_AUDIENCE`.

### ⚠️ The api needs `WEB_ORIGIN`

Prod CORS was a flat `false` — correct while the only client was the native app (not a
browser, sends no Origin), fatal for a browser POST. `apps/api/src/main.ts` now reads
**`WEB_ORIGIN`** (comma-separated exact origins). **Unset means prod stays exactly as
strict as before**, so nothing widens by accident — but `/premium` will fail its
preflight until `WEB_ORIGIN=https://craveapp.ai` is set on the **api** service.

## Deploy shape

Repo-connected or CLI, same as api/worker — `railway.site.json` is the manifest to
copy onto the service (build context is the **repo ROOT**; `dockerfilePath` is
`apps/site/Dockerfile`).

**Never set a `startCommand` on this service.** Railway execs it without a shell, so
an `&&` becomes argv and the container exits 0 after the first word. The Dockerfile
`CMD` is the only start command.

Also confirm **`watchPatterns` is empty on BOTH the dashboard service setting and the
manifest** — they merge, and a stale pattern makes a deploy SKIP while printing
success (see `CLAUDE.md`).

### Cutover (owner/orchestrator executes — this app does not deploy anything)

1. On the api service: set `WEB_ORIGIN=https://craveapp.ai`; confirm
   `STRIPE_CHECKOUT_SUCCESS_URL=https://craveapp.ai/premium/success` and
   `STRIPE_CHECKOUT_CANCEL_URL=https://craveapp.ai/premium/cancelled`; redeploy api.
2. Create/point the Railway **`site`** service at this repo with
   `railway.site.json`'s build config. **Clear the base64 `startCommand`** — that blob
   is what this app replaces, and leaving it set means the old function still runs.
3. Set on `site`: `API_ORIGIN`, `CLERK_PUBLISHABLE_KEY`, `PORT=8080`.
4. Deploy to a generated Railway domain first and smoke all seven routes there —
   `/`, `/privacy`, `/terms`, `/support` (200, copy unchanged), `/premium` (200 with
   the Clerk sign-in, **not** 503), `/healthz`, and an unknown path (302).
5. Only then move the `craveapp.ai` custom domain onto the `site` service.
6. Delete the old function service once the domain has settled.

## Local

```bash
yarn workspace site build     # tsc + copy the four pages into dist
yarn workspace site test      # node --test, no network, no vendor calls
API_ORIGIN=http://localhost:3000 CLERK_PUBLISHABLE_KEY=pk_test_… \
  yarn workspace site start
```

Zero runtime dependencies, by design — adding this workspace touches neither
`yarn.lock` nor anyone's install time.
