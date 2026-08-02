#!/usr/bin/env bash
# One-command deploy. THE FLOW IS staging -> production, in that order.
#
#   ./scripts/rig/deploy.sh --env staging      # 1. always here first
#   ./scripts/rig/deploy.sh                    # 2. then prod (api + worker)
#   ./scripts/rig/deploy.sh api                # prod: one service
#   ./scripts/rig/deploy.sh --force            # hotfix: skip EVERY guard
#
# Prod REFUSES unless staging is already running this exact commit and is
# answering /health. Before that gate existed (2026-08-02) the no-argument
# invocation went straight to production and staging was an optional
# side-trip nothing checked — which is how prod ended up newer than staging,
# with staging still serving a rate-limit bypass prod had been patched for.
#
# Encodes every deploy law we've burned time on:
#  - ALWAYS deploys from the repo ROOT (`railway up` uploads the cwd as the
#    build context; deploying from a subdir breaks the Docker build with
#    "/turbo.json not found" — this script makes that mistake impossible).
#  - PROD guards (2026-08-01): `railway up` ships the WORKING TREE, not HEAD.
#    A dirty tree or a HEAD that origin/main doesn't have means prod runs
#    code git can't account for (burned 2026-07-25). Prod deploys HARD-STOP
#    on either; --force is the explicit escape. Staging skips both guards —
#    it exists precisely to test uncommitted work.
#  - Pre-migration safety snapshot (prod only): pg_dump of the prod DB before
#    the new container's `prisma migrate deploy` runs, kept in
#    ~/.crave-deploy-backups (last 5).
#  - Pushes main first so origin matches what ships (prod only).
#  - Deploys ONE service at a time, watches the streamed build to its
#    terminal state, retries ONCE on a terminal failure (never overlapping
#    retries — they race each other and self-inflict FAILED).
#  - Smokes /health afterward.
# Migrations: applied automatically at container boot (Dockerfile CMD runs
# `prisma migrate deploy`) — nothing to do here.
set -euo pipefail
cd "$(dirname "$0")/../.."

ENVIRONMENT=production
FORCE=0
SERVICES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENVIRONMENT="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    --no-snapshot) ALLOW_NO_SNAPSHOT=1; shift ;;
    *) SERVICES+=("$1"); shift ;;
  esac
done
[[ ${#SERVICES[@]} -eq 0 ]] && SERVICES=(api worker)

# VALIDATE THE ENV (final red team): `--env prod` (a plausible typo) is
# neither "production" nor "staging", so every prod guard was skipped —
# no dirty-tree check, no origin check, NO SNAPSHOT — while the smoke
# curled STAGING's /health. Green output, unguarded prod deploy.
case "$ENVIRONMENT" in
  production) HEALTH_URL="https://api-production-a56f.up.railway.app/health" ;;
  staging)    HEALTH_URL="https://api-staging-25ca.up.railway.app/health" ;;
  *) echo "REFUSED: unknown --env '$ENVIRONMENT' (expected production|staging)." >&2; exit 1 ;;
esac

if [[ "$ENVIRONMENT" == "production" && "$FORCE" -ne 1 ]]; then
  # Untracked (non-ignored) files ship too — `railway up` uploads the tree,
  # not the index — so the check must NOT pass --untracked-files=no.
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "REFUSED: working tree is DIRTY — \`railway up\` would ship these uncommitted/untracked files to PROD:" >&2
    git status --short >&2
    echo "Commit (or gitignore) first, deploy to --env staging, or re-run with --force." >&2
    exit 1
  fi
  # Ahead-of-origin is fine (the script pushes main next); refuse only when
  # HEAD is behind or diverged — prod must never ship history origin rejects.
  git fetch origin main --quiet
  if ! git merge-base --is-ancestor origin/main HEAD; then
    echo "REFUSED: HEAD is behind or diverged from origin/main." >&2
    echo "  HEAD:        $(git rev-parse --short HEAD)" >&2
    echo "  origin/main: $(git rev-parse --short origin/main)" >&2
    echo "Pull/rebase first, or re-run with --force." >&2
    exit 1
  fi
fi

# ── PROMOTION GATE: prod ships only what staging has already run ──────────
#
# THE SHAPE THIS FIXES (2026-08-02). `deploy.sh` with no arguments went
# straight to PRODUCTION, and staging was an optional side-trip nothing
# checked. Measured that day: prod had the newest code while staging was
# running a build from the previous night — still carrying a rate-limit bypass
# prod had already been patched for. Staging was not a stage in a pipeline; it
# was a parallel environment someone occasionally remembered.
#
# A gate is the only thing that makes staging mean anything. Prod now refuses
# unless staging is running THIS EXACT COMMIT and is healthy. --force is the
# hotfix escape and says so loudly, because a gate with a silent bypass is the
# allowlist mistake all over again.
if [[ "$ENVIRONMENT" == "production" && "$FORCE" -ne 1 ]]; then
  HEAD_SHA="$(git rev-parse HEAD)"
  STAGING_SHA="$(railway variables --service api --environment staging --json 2>/dev/null \
    | python3 -c 'import json,sys; print((json.load(sys.stdin) or {}).get("DEPLOYED_GIT_SHA",""))' 2>/dev/null || true)"

  if [[ -z "$STAGING_SHA" ]]; then
    echo "REFUSED: staging has no DEPLOYED_GIT_SHA — it has never been deployed by this script," >&2
    echo "so there is no evidence this code has run anywhere but a laptop." >&2
    echo "  Run: ./scripts/rig/deploy.sh --env staging" >&2
    exit 1
  fi
  if [[ "$STAGING_SHA" != "$HEAD_SHA" ]]; then
    echo "REFUSED: staging is running different code than you are about to ship to PROD." >&2
    echo "  staging: ${STAGING_SHA:0:9}" >&2
    echo "  HEAD:    ${HEAD_SHA:0:9}" >&2
    echo "Deploy to staging first: ./scripts/rig/deploy.sh --env staging" >&2
    exit 1
  fi
  # Healthy, not merely deployed — a crashlooping staging proves nothing.
  if ! curl -fsS --max-time 10 "https://api-staging-25ca.up.railway.app/health" >/dev/null 2>&1; then
    echo "REFUSED: staging is not answering /health. It is running this commit but is not well." >&2
    exit 1
  fi
  echo "==> Promotion gate: staging is healthy on ${HEAD_SHA:0:9}."
fi

if [[ "$ENVIRONMENT" == "production" ]]; then
  echo "==> Pushing main first (origin must match what ships) ..."
  git push origin main

  echo "==> Pre-migration snapshot of prod DB ..."
  BACKUP_DIR="$HOME/.crave-deploy-backups"
  mkdir -p "$BACKUP_DIR"
  # No public-URL var exists on the DB service; the TCP proxy is stable, so
  # take credentials from the api's DATABASE_URL and swap in the proxy host.
  # Password travels via PGPASSWORD, never argv (argv is world-readable in ps).
  DB_CREDS="$(railway variables --service api --environment production --json 2>/dev/null \
    | python3 -c '
import json, sys
from urllib.parse import urlsplit
u = json.load(sys.stdin).get("DATABASE_URL") or ""
if u:
    p = urlsplit(u)
    print(p.username, p.password, p.path.lstrip("/"))
')" || DB_CREDS=""
  if [[ -z "$DB_CREDS" ]]; then
    # FAIL CLOSED (final red team): an expired Railway session or a CLI
    # output change yielded empty creds and the deploy CONTINUED — applying
    # migrations with no backup at all, the exact case the snapshot exists
    # for. `2>/dev/null` hid the reason, so it was silent too.
    echo "REFUSED: could not resolve prod DATABASE_URL for the pre-migration snapshot." >&2
    echo "Check 'railway whoami' / 'railway variables --service api --environment production', or re-run with --no-snapshot to deploy unprotected." >&2
    [[ "${ALLOW_NO_SNAPSHOT:-0}" == "1" ]] || exit 1
  else
    read -r DB_USER DB_PASS DB_NAME <<<"$DB_CREDS"
    SNAP="$BACKUP_DIR/prod-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD).dump"
    PGPASSWORD="$DB_PASS" pg_dump --no-owner -Fc \
      -h sakura.proxy.rlwy.net -p 48622 -U "$DB_USER" -d "$DB_NAME" -f "$SNAP"
    echo "==> Snapshot: $SNAP ($(du -h "$SNAP" | cut -f1))"
    ls -t "$BACKUP_DIR"/prod-*.dump 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
  fi
fi

deploy_one() {
  local svc="$1" attempt out
  for attempt in 1 2; do
    echo "==> Deploying $svc to $ENVIRONMENT (attempt $attempt) ..."
    # `|| true`: under `set -euo pipefail` a non-zero railway exit would kill
    # the script HERE, before the retry loop ever sees the failure.
    out="$(railway up --service "$svc" --environment "$ENVIRONMENT" --ci 2>&1 | tail -1 || true)"
    if [[ "$out" == *"Deploy complete"* ]]; then
      echo "==> $svc: Deploy complete"
      return 0
    fi
    # SKIPPED trap — RESOLVED 2026-08-02: no GitHub repo is connected to
    # prod api/worker (verified via service config: no source block) and the
    # never-match watchPatterns were removed, so CLI deploys no longer skip.
    # The detection stays as a tripwire: if SKIPPED ever reappears, someone
    # re-added patterns or reconnected a repo.
    if railway deployment list --service "$svc" --environment "$ENVIRONMENT" 2>/dev/null | sed -n 2p | grep -q "SKIPPED"; then
      echo "FAILED: Railway SKIPPED the upload — the manual-deploys watch pattern blocks CLI deploys too." >&2
      echo "Open the window (watchPatterns [\"**\"] via Railway MCP/dashboard), deploy, close it — or disconnect the repo in the dashboard and remove the patterns permanently." >&2
      exit 1
    fi
    echo "==> $svc: terminal FAILED ($out)"
  done
  echo "FAILED: $svc did not deploy after one retry — inspect Railway build logs." >&2
  exit 1
}

for svc in "${SERVICES[@]}"; do
  deploy_one "$svc"
done

echo "==> Smoke: /health ..."
body="$(curl -s -m 20 "$HEALTH_URL")"
code="$(curl -s -m 20 -o /dev/null -w "%{http_code}" "$HEALTH_URL")"
if [[ "$code" != "200" ]]; then
  echo "FAILED: /health returned $code after deploy." >&2
  exit 1
fi
# FRESHNESS ASSERT (final red team): migrations run at CONTAINER BOOT, after
# `railway up` says "Deploy complete". If the new container crashloops on a
# bad migration, Railway keeps the OLD one serving — and /health returns a
# static version string, so the smoke passed with a 200 from the code the
# deploy was supposed to replace. A long uptime proves we smoked the old
# container.
uptime_s="$(printf '%s' "$body" | python3 -c 'import json,sys; print(int(json.load(sys.stdin).get("uptime", 0)))' 2>/dev/null || echo 0)"
if [[ "$uptime_s" -gt 900 ]]; then
  echo "FAILED: /health is 200 but uptime is ${uptime_s}s — the OLD container is still serving." >&2
  echo "The new container likely crashlooped (check migrations): railway logs --service api --environment $ENVIRONMENT" >&2
  exit 1
fi
# STAMP WHAT SHIPPED. `railway up` uploads a working tree and Railway records
# no commit for a CLI deploy, so without this an environment cannot say which
# code it is running — answering that for staging on 2026-08-02 required
# probing its live rate-limit behaviour. /health echoes this back.
for svc in "${SERVICES[@]}"; do
  railway variables --service "$svc" --environment "$ENVIRONMENT" \
    --set "DEPLOYED_GIT_SHA=$(git rev-parse HEAD)" --skip-deploys >/dev/null 2>&1 || \
    echo "WARNING: could not stamp DEPLOYED_GIT_SHA on $svc — the promotion gate will refuse the next prod deploy." >&2
done

echo "==> Deployed $(git rev-parse --short HEAD) to $ENVIRONMENT — /health 200 (uptime ${uptime_s}s)."
