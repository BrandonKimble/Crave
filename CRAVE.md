# CRAVE — the canonical map

Built incrementally, territory by territory, as the exhaustive
rederivation covers ground. Written for a competent engineer who has
never seen this repo. Each section: what it is, the abstractions and
their real contracts, data/control flow, invariants and why, entry
points, gotchas, what deliberately does NOT exist and why, rederivation
verdicts.

## Repo shape (orientation)

Monorepo: `apps/api` (NestJS + Prisma + Postgres — the product's entire
backend), `apps/mobile` (Expo/React Native iOS app with custom native
map kits), `packages/shared`, `scripts/` + `maestro/` (ops + test rigs),
`plans/ product/ business/` (living docs — never delete), `audit/`
(this effort's ledgers). ~4.2k files, ~1.3k of them mobile image assets.

Territory sections follow as they are mapped.
