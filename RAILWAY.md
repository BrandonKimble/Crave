# Railway — operator reference

**The deploy path is `./scripts/rig/deploy.sh`. It is the enforcer; this file
only describes it.** If this document and the script ever disagree, the script
is right — read `scripts/rig/deploy.sh` and fix this file.

Rewritten 2026-08-05 (audit F1990). The previous version of this file described
an "Option B — manual migrations" workflow (`railway run … db:migrate:deploy`,
then `git push origin main` and let Railway auto-deploy). Both halves were
wrong and dangerous: migrations self-apply at container boot, and a bare push
bypasses the staging promotion gate entirely.

## Deploying

```bash
./scripts/rig/deploy.sh --env staging      # 1. ALWAYS here first
./scripts/rig/deploy.sh                    # 2. then production (api + worker)
./scripts/rig/deploy.sh api                # production, one service
./scripts/rig/deploy.sh --force            # hotfix: skips EVERY guard, loudly
```

What the script enforces (verified against the source, not from memory):

- Always deploys from the repo ROOT (`railway up` uploads the cwd as the Docker
  build context; a subdir cwd breaks the build).
- Production REFUSES on a dirty working tree or a HEAD that is behind/diverged
  from `origin/main` (`railway up` ships the WORKING TREE, not HEAD). Staging
  skips both — it exists to test uncommitted work.
- **Promotion gate:** production REFUSES unless staging is answering `/health`
  AND reporting the exact commit being shipped (a staging deploy from a dirty
  tree stamps `<sha>-dirty`, which the gate rejects). A known-red CI run for
  that commit hard-stops; pending/absent only warns.
- Pre-migration `pg_dump` snapshot of the prod DB (kept in
  `~/.crave-deploy-backups`, last 5). It FAILS CLOSED if credentials cannot be
  resolved; `--no-snapshot` is the explicit opt-out.
- Pushes `main` before shipping prod, stamps `DEPLOYED_GIT_SHA` as a build arg
  so `/health` can report which commit is running, deploys one service at a
  time, watches each to a terminal state, retries once, then smokes `/health`
  and asserts `commit == HEAD` (a SKIPPED deploy cannot smoke green).

**Do not run `railway up`, `railway redeploy`, or push-to-deploy by hand.**
None of the guards above apply to them.

## Migrations

Migrations apply themselves at container boot — `apps/api/Dockerfile`'s CMD is
`npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js`
(a no-op when nothing is pending; concurrent api/worker deploys serialize on
prisma's advisory lock). **Never run `railway run … db:migrate:deploy`** — it
races the booting container's own migrate.

Author migrations locally, commit them, deploy:

```bash
yarn workspace api db:migrate       # prisma migrate dev, against the LOCAL db
yarn workspace api prisma:generate
```

Before writing one, read `apps/api/prisma/migrations/AUTHORING.md` (parallel-
worker guards for heavy rewrites, raw-SQL objects `migrate dev` will try to
drop, the signals-partition/cron coupling).

## Topology

THREE deployable services — one manifest each. The deployable set is derived,
not typed: `scripts/rig/deploy.sh` reads `git ls-files 'railway*.json'` and
REFUSES any name outside it (`railway.json` = api, `railway.<name>.json` =
<name>), so a fourth service is covered the day its manifest lands.

`api` and `worker` are the SAME image, distinguished by `PROCESS_ROLE`:

- `api` — `PROCESS_ROLE=api`, public domain enabled. The only service whose
  `/health` reports the running commit, so the only one the deploy smoke can
  assert an identity against.
- `worker` — `PROCESS_ROLE=worker`, private (no public domain), usually 1
  replica (bounded by Reddit/Gemini quotas). Serves no HTTP; its smoke is
  "newest Railway deployment is SUCCESS".
- `site` — separate image (`apps/site/Dockerfile`, `railway.site.json`), the
  web rail. Answers `/healthz`, but that reports liveness only and carries no
  commit, so it gets the same deployment-status smoke as the worker.
  `deploy.sh` defaults to `(api worker)`; deploy it explicitly:
  `./scripts/rig/deploy.sh --env staging site`.

Both must share `DATABASE_URL`, `REDIS_*`, `APP_ENV`, and `BULL_PREFIX` (an
identical `BULL_PREFIX` is what makes API enqueues reach the worker).
`railway.json` is API-oriented; `railway.worker.json` is the worker template.

**Never add a `startCommand` to `railway.json`** — it overrides the Dockerfile
CMD and is exec'd without a shell, so the `&&` becomes argv and the container
exits 0 after the first command (skipping the app entirely).

`watchPatterns` must stay empty on BOTH `railway.json` and the Railway
dashboard service settings — they merge, and a stale one makes deploys SKIP.

## Environments

| Environment | API health URL                                    |
| ----------- | ------------------------------------------------- |
| production  | https://api-production-a56f.up.railway.app/health |
| staging     | https://api-staging-25ca.up.railway.app/health    |

`/health` self-reports `commit` and `appEnv`, so "what is this environment
running" is a fact, not a guess.

Filling staging's DB: `scripts/rig/push-local-db-to-staging.sh` (your local
corpus — the default) or `scripts/rig/refresh-staging-from-prod.sh` (prod
corpus, for prod-parity checks).

## CLI reference

Prefer the `service-access` skill (it sources credentials from `.env`; never
run interactive CLI logins).

```bash
railway logs --service api            # add --tail / --lines N
railway variables --service api --environment production
railway variables --service api --set KEY=value
railway status
```

For prod SQL use the read-only role (`crave_readonly`) rather than an
unrestricted `railway run psql`.

## Rollback

Revert the commit, then re-run the normal flow — staging first, then
production. Do not hand-run `railway redeploy`; it bypasses the gates.

```bash
git revert <sha>
./scripts/rig/deploy.sh --env staging
./scripts/rig/deploy.sh
```

A migration that must be undone needs a new forward migration; treat
`prisma migrate resolve --rolled-back` as a break-glass operation on a
half-applied migration, not a routine rollback step.
