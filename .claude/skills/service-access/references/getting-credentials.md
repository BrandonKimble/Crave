# Getting credentials — the owner's runbook

Every remaining service, in the same shape: mint a token in a dashboard, add it
to a `.env`, verify with one command. **Claude cannot do these** — each needs a
browser session or a password. Claude also must never be handed the token value
in chat; put it in the `.env` yourself.

`svc-env.sh` loads `apps/api/.env` and `apps/mobile/.env`, so anything added to
either is picked up with no further wiring.

⚠️ Prefix rule: in `apps/mobile/.env`, anything named `EXPO_PUBLIC_*` **ships in
the client bundle**. Secrets there must NOT carry that prefix.

---

## 1. Sentry — unblocks `sentry-cli`

Mint: https://sentry.io/settings/account/api-tokens/
Scopes: `project:read`, `project:releases`, `org:read`

Add to `apps/api/.env`:

```
SENTRY_AUTH_TOKEN=sntrys_...
SENTRY_ORG=<org-slug>
SENTRY_PROJECT=<project-slug>
```

Verify: `source scripts/rig/svc-env.sh && sentry-cli info`

The org and project slugs are in the URL when you're in the Sentry dashboard:
`sentry.io/organizations/<org>/projects/<project>/`.

---

## 2. Resend — mostly already done; one prod var missing

**No new key needed.** `RESEND_API_KEY` is already set on Railway `api` and
`worker` (send-only scope — `domains list` 401s by design; sending works).

The one thing to fix is that the **worker has no `OPS_ALERT_EMAIL`**, so alerts
raised there drop their email silently:

```bash
railway variables -s api --kv | grep OPS_ALERT_EMAIL      # read the value
railway variables -s worker --set OPS_ALERT_EMAIL=<that value>
```

Optional, only if you want to administer domains from the terminal: mint a
**Full access** key at https://resend.com/api-keys and put it in
`apps/api/.env` as `RESEND_API_KEY`. Not needed for the app to send.

Until a domain is verified, mail sends from `onboarding@resend.dev`. That works,
but lands in spam often enough to be worth verifying a domain before relying on
it for real alerting.

---

## 3. RevenueCat v2 — unblocks projects/offerings/entitlements

The existing `REVENUECAT_API_KEY` is a legacy **test-mode v1** key. v2 rejects it.

Mint: https://app.revenuecat.com/settings/api-keys → **New API key** → V2 secret.

Add to `apps/api/.env` as a **separate** var (don't overwrite v1, the app uses it):

```
REVENUECAT_API_KEY_V2=sk_...
```

Verify:

```bash
source scripts/rig/svc-env.sh
curl -s -H "Authorization: Bearer $REVENUECAT_API_KEY_V2" \
  https://api.revenuecat.com/v2/projects | jq '.items[].name'
```

Alternative: authorize the RevenueCat MCP in `.mcp.json` from an interactive
`claude` session (`/mcp`) — ~100 typed tools, better than curl for v2 work.

---

## 4. Expo / EAS — ✅ done

Logged in as `brandonk` (interactive; state in `~/.expo`).

For CI, add a token instead — https://expo.dev/settings/access-tokens →
`EXPO_TOKEN=` in `apps/mobile/.env` (note: **no** `EXPO_PUBLIC_` prefix).

---

## 5. App Store Connect — blocked on Apple enrollment

Cannot be set up until Apple Developer Program enrollment completes.

Once it does: https://appstoreconnect.apple.com → Users and Access → Integrations
→ App Store Connect API → generate a key. You get three things:

```
ASC_ISSUER_ID=...
ASC_KEY_ID=...
ASC_PRIVATE_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8
```

⚠️ **The `.p8` downloads exactly once and can never be re-retrieved.** Losing it
means revoking and regenerating. Do not put it in the repo — store in Keychain
or as a Railway variable, and keep the path (not the key) in `.env`.

Then `fastlane` (`brew install fastlane`) is the recommended tool — `pilot` for
TestFlight, `deliver` for metadata, `produce` for app creation.

---

## Rotation

When you rotate any key, change it in **both** the `.env` and Railway. There is
no other copy — that is the whole point of not using stateful CLI logins.
Nothing here caches a credential except `~/.expo` and the three browser logins
(Railway, gcloud, gh).
