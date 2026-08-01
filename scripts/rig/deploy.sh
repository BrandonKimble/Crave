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
    echo "WARNING: could not resolve prod DATABASE_URL — skipping snapshot." >&2
  else
    read -r DB_USER DB_PASS DB_NAME <<<"$DB_CREDS"
    SNAP="$BACKUP_DIR/prod-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD).dump"
    PGPASSWORD="$DB_PASS" pg_dump --no-owner -Fc \
      -h sakura.proxy.rlwy.net -p 48622 -U "$DB_USER" -d "$DB_NAME" -f "$SNAP"
    echo "==> Snapshot: $SNAP ($(du -h "$SNAP" | cut -f1))"
    # Keep the newest 2 (not 1): if a bad migration is only noticed after the
    # NEXT deploy, the newest dump is already post-corruption — the one before
    # it is the recovery point. Fixed-size (~900MB), never accumulates.
    ls -t "$BACKUP_DIR"/prod-*.dump 2>/dev/null | tail -n +3 | xargs rm -f 2>/dev/null || true
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
