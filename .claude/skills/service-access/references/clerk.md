# Clerk

Two independent paths. Both work.

## Backend API via curl — verified working, no login

`CLERK_SECRET_KEY` is in `apps/api/.env`.

```bash
source scripts/rig/svc-env.sh
curl -s -H "Authorization: Bearer $CLERK_SECRET_KEY" \
  "https://api.clerk.com/v1/users?limit=5" | jq '.[] | {id, email_addresses}'

curl -s -H "Authorization: Bearer $CLERK_SECRET_KEY" \
  "https://api.clerk.com/v1/users/count"
```

This is the fastest path for "look up a user", "how many users", "check a
session". Prefer it.

## The CLI — `npx clerk` (v2.3.1)

No install needed. It is **built for agents**: non-TTY defaults to agent mode,
`clerk init -y` is non-interactive.

```bash
npx clerk --help
npx clerk open              # opens the dashboard
npx clerk webhooks listen   # local webhook toolkit (v2.0+)
```

`npx clerk` commands that touch instance config require a browser login
(`npx clerk login`) — that is an owner action, and only worth doing for the
webhook toolkit or feature toggles. Reads should go through BAPI curl instead.

⚠️ **Do not run `clerk init`** in this repo. It auto-detects the framework and
writes auth pages, middleware, and providers — Clerk is already wired here
(`@clerk/clerk-sdk-node`, `CLERK_JWT_AUDIENCE`, `CLERK_ADMIN_USER_IDS`), and
init would scaffold over it.

## Repo context

Auth runs per-request on the API. Note the standing trap: when a migration
breaks a query in the auth path, **every** authenticated endpoint 500s before
the request logger, so the server log looks clean and empty while the app
flaps. Unauthenticated curl still returns 401 and looks healthy.
