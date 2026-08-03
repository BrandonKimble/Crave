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

## Territory: repo-root (pass 1, partial — configs verified, docs/lockfile mapped)

**What it is.** Workspace plumbing: yarn workspaces (`package.json` —
scripts are thin `turbo run` / `yarn workspace` delegations plus rig
shims), turbo task graph, single root tsconfig, lefthook (live hook
manager — its generated hooks live in `.git/hooks`; `LEFTHOOK=0`
bypasses), gitleaks, knip (runs in the pre-commit `deps-check` lane,
gated on package-file changes), prettier/eslint/editor configs, Railway
deploy manifests (`railway.json` api / `railway.worker.json` worker —
NEVER add a startCommand: it replaces the Dockerfile CMD, exec'd without
a shell), Expo root shims (`App.tsx` re-export + `app.config.js` — Expo
resolves the entry at workspace root; deliberate, minimal, ideal),
`patches/` (patch-package, rnmapbox 10.3.1 — applied via postinstall).

**Gotchas.** `.node-version`+`.nvmrc` pin Node 22; `.lefthook/
with-node-22.sh` re-execs hooks under Node 22 because GUI git clients
run hooks with a minimal PATH. `stories.md`/`PRD.md`/`BRD.md` are the
STALE original spec family — product/ and business/ supersede them
(CLAUDE.md says so; keep for seed ideas only). `copy.md` is the living
copy library.

**What deliberately does not exist.** A CI-enforced hook path
(`core.hooksPath` unset — lefthook owns `.git/hooks` directly); a
multi-agent commit-coordination ritual (the `.githooks/` +
`scripts/agent-log/` cluster enforcing claimed entries in
`plans/agent-log.md` was DELETED this pass — never wired, superseded by
the commit-straight-to-main + pathspec-per-session law).

**Rederivation verdicts.** Configs IDEAL-VERIFIED (each is the minimal
honest shape for a real constraint); agent-log cluster DELETED (F1);
`patches-parked/` being removed by a concurrent session (not touched);
`yarn.lock`/`stories.md`/`copy.md`/`PRD.md`/`BRD.md` mapped, held for
the docs territory verdict.
