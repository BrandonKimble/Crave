# Postgres + Redis

## Local

`DATABASE_URL` and `REDIS_HOST`/`REDIS_PORT` in `apps/api/.env`.

```bash
source scripts/rig/svc-env.sh
psql "$DATABASE_URL" -c '\dt'
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping
```

`psql` is Postgres.app's (`/Applications/Postgres.app/.../bin/psql`).

## Production

Prod DB is the Railway `postgis-db` service (`timescale/timescaledb-ha:pg17`).
Get the URL without ever pasting it:

```bash
railway variables -s postgis-db
railway run -s api -- psql "$DATABASE_URL" -c 'SELECT 1'
```

⚠️ **Read prod through the `crave_readonly` role.** It exists precisely so an
exploratory query cannot mutate production.

⚠️ **Never point a local API at the prod DB.** One-way prod→local only, via
`./scripts/rig/refresh-local-db-from-prod.sh`. Local DB ≠ prod DB, always.

## After any migration: rebuild and restart the shared API

The dev API on `:3000` is one long-lived `node dist/main` shared by every
session. A session that migrates leaves that process serving a **stale**
generated Prisma client → P2022 on every touched query. When the broken query
is in the auth path, every authenticated endpoint 500s _before_ the request
logger, so the log looks clean and empty while the app flaps.

The session that migrates runs this, from `apps/api`:

```bash
npx prisma generate && yarn build && lsof -ti tcp:3000 -sTCP:LISTEN | xargs kill -9 && sleep 1 && nohup node --enable-source-maps dist/main >> /tmp/crave-api.log 2>&1 &
```

⚠️ Two traps that each cost hours:

1. Kill **all** LISTEN pids (`xargs`, never `head -1`) and verify the newly
   bound pid is yours — a stale binary once kept serving while the new one died
   on EADDRINUSE.
2. `-sTCP:LISTEN` is **load-bearing**. Bare `lsof -ti :3000` also returns
   processes with _client_ connections to :3000 — including the simulator app —
   and `kill -9` on that list silently SIGKILLs the app mid-test with no crash
   report.

## Laws that constrain writes

- Place-grounded restaurants are **never deleted** (~$118 lesson). Any
  wipe preserves every restaurant with a geocoded place id.
- Wipes are **community-scoped**, never global — a global predecessor nuked
  NY's derived graph as collateral.
- User-layer FKs are `Restrict` by design.
