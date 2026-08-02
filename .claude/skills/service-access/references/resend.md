# Resend

`resend` CLI v2.10.0 installed.

## Where the key actually lives: Railway, not `.env`

`RESEND_API_KEY` is **set in production** on both the `api` and `worker`
services. It is a **send-only restricted key** — that is why
`resend domains list` returns 401 `"This API key is restricted to only send
emails"`. That 401 means the key is _valid_, not missing. Sending works.

It is **not** in `apps/api/.env`, so locally the ops-alert email transport is
off and logs `email transport unconfigured`. That is local-only and expected.

✅ **Sending is verified end-to-end.** The Resend dashboard log shows a
`POST /emails` → **200** (2026-07-25), sending as `alerts@craveapp.ai`. The
domain is verified; alerts do arrive. The only `/domains` 401 in that log is a
tooling probe against the send-only key, not a failure.

To exercise it locally without copying the secret anywhere:

```bash
railway run -s api -- resend emails list      # 401 on a send-only key, as designed
```

## ⚠️ Real gap: the worker has no recipient

`apps/api/src/modules/external-integrations/shared/ops-alerts.service.ts:123`:

```ts
const apiKey = process.env.RESEND_API_KEY;
const to = process.env.OPS_ALERT_EMAIL;
if (!apiKey || !to) return;
```

| var               | api | worker         |
| ----------------- | --- | -------------- |
| `RESEND_API_KEY`  | ✅  | ✅             |
| `OPS_ALERT_FROM`  | ✅  | ✅             |
| `OPS_ALERT_EMAIL` | ✅  | ❌ **missing** |

So **every ops alert raised in the worker silently drops its email.** The alert
still lands in the DB; only the notification is lost. Given the worker is where
collection, enrichment, and scheduled jobs run, that is most of the alerts you
would actually want to hear about.

Fix (owner approval — it changes prod config):

```bash
railway variables -s worker --set OPS_ALERT_EMAIL=<same value as api>
```

Read the api's current value with `railway variables -s api --kv | grep OPS_ALERT_EMAIL`.

## CLI usage

Authenticates straight from `RESEND_API_KEY` — no `resend login`.

```bash
source scripts/rig/svc-env.sh   # local: no key, will fail
railway run -s api -- resend <cmd>   # prod key, send-only scope
```

A full-access key (mint at https://resend.com/api-keys) is required for
`domains list`, `api-keys list`, and anything management-shaped. Only worth
creating if you need to administer domains — the send-only key is the correct,
tighter choice for the app itself.

## Confirm first

`resend emails send` puts mail in a real human's inbox. Owner approval per
send, every time — no standing permission.
