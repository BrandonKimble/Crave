# Memory Index

- [Map LOD / pin architecture](map-lod-pin-architecture.md) — how pin/dot LOD, 4 label candidates, z-order stacking, and per-pin slot source groups work (JS + native iOS)
- [Map LOD demotion root cause](map-lod-demotion-root-cause.md) — why pins jitter/demote when panning/twisting without zoom
- [Map LOD target plan](map-lod-target-plan.md) — agreed target architecture + staged cutover + LATEST STATE / progress / per-issue status / autonomous loop (READ FIRST for map work)
- [Map Stage B spec](map-stage-b-spec.md) — execution-ready spec for native screen-space per-tick selection (the next big piece; start here for Stage B)

## Local Postgres access (confirmed 2026-06-01)

- Live dev DB is **Postgres.app (PG18)** on localhost:5432, NOT Docker (Docker Desktop is not installed on this machine; `docker`/`docker-compose` CLIs exist but no daemon).
- Connect: `psql "postgresql://postgres:postgres@localhost:5432/crave_search"`. Same as `DATABASE_URL` in apps/api/.env.
- Postgres.app gates connections per-app; if rejected with "rejected trust authentication / did not allow Claude", the user must grant Claude access in Postgres.app (one-time). Once granted, prisma/psql/test-pipeline work from Claude's shell.
- Apply schema in dev: `cd apps/api && npx prisma db push --accept-data-loss` (migrations have drift; db push is the pragmatic dev path). test-pipeline resets via TRUNCATE (not migrate), so schema must be pushed first.
