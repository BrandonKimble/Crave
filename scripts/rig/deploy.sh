#!/usr/bin/env bash
# One-command deploy (prod by default, staging with --env staging).
#
#   ./scripts/rig/deploy.sh                    # prod: api then worker
#   ./scripts/rig/deploy.sh api                # prod: one service
#   ./scripts/rig/deploy.sh --env staging      # staging: api then worker
#   ./scripts/rig/deploy.sh --force            # prod: skip the clean-tree guards
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
    *) SERVICES+=("$1"); shift ;;
  esac
done
[[ ${#SERVICES[@]} -eq 0 ]] && SERVICES=(api worker)

if [[ "$ENVIRONMENT" == "production" ]]; then
  HEALTH_URL="https://api-production-a56f.up.railway.app/health"
else
  HEALTH_URL="https://api-staging-25ca.up.railway.app/health"
fi

if [[ "$ENVIRONMENT" == "production" && "$FORCE" -ne 1 ]]; then
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "REFUSED: working tree is DIRTY — \`railway up\` would ship these uncommitted changes to PROD:" >&2
    git status --short --untracked-files=no >&2
    echo "Commit first, deploy to --env staging, or re-run with --force." >&2
    exit 1
  fi
  git fetch origin main --quiet
  if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
    echo "REFUSED: HEAD != origin/main — prod must ship exactly what origin has." >&2
    echo "  HEAD:        $(git rev-parse --short HEAD)" >&2
    echo "  origin/main: $(git rev-parse --short origin/main)" >&2
    echo "Push (or pull) first, or re-run with --force." >&2
    exit 1
  fi
fi

if [[ "$ENVIRONMENT" == "production" ]]; then
  echo "==> Pushing main first (origin must match what ships) ..."
  git push origin main

  echo "==> Pre-migration snapshot of prod DB ..."
  BACKUP_DIR="$HOME/.crave-deploy-backups"
  mkdir -p "$BACKUP_DIR"
  # No public-URL var exists on the DB service; the TCP proxy is stable, so
  # take credentials from the api's DATABASE_URL and swap in the proxy host.
  DB_URL="$(railway variables --service api --environment production --json 2>/dev/null \
    | python3 -c '
import json, sys
from urllib.parse import urlsplit
u = json.load(sys.stdin).get("DATABASE_URL") or ""
if u:
    p = urlsplit(u)
    print(f"postgresql://{p.username}:{p.password}@sakura.proxy.rlwy.net:48622{p.path}")
')" || DB_URL=""
  if [[ -z "$DB_URL" ]]; then
    echo "WARNING: could not resolve DATABASE_PUBLIC_URL — skipping snapshot." >&2
  else
    SNAP="$BACKUP_DIR/prod-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD).dump"
    pg_dump --no-owner -Fc "$DB_URL" -f "$SNAP"
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
    echo "==> $svc: terminal FAILED ($out)"
  done
  echo "FAILED: $svc did not deploy after one retry — inspect Railway build logs." >&2
  exit 1
}

for svc in "${SERVICES[@]}"; do
  deploy_one "$svc"
done

echo "==> Smoke: /health ..."
code="$(curl -s -m 20 -o /dev/null -w "%{http_code}" "$HEALTH_URL")"
if [[ "$code" != "200" ]]; then
  echo "FAILED: /health returned $code after deploy." >&2
  exit 1
fi
echo "==> Deployed $(git rev-parse --short HEAD) to $ENVIRONMENT — /health 200."
