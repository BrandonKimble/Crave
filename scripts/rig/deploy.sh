#!/usr/bin/env bash
# One-command production deploy.
#
#   ./scripts/rig/deploy.sh            # deploy api then worker
#   ./scripts/rig/deploy.sh api        # deploy one service
#
# Encodes every deploy law we've burned time on:
#  - ALWAYS deploys from the repo ROOT (`railway up` uploads the cwd as the
#    build context; deploying from a subdir breaks the Docker build with
#    "/turbo.json not found" — this script makes that mistake impossible).
#  - Pushes main first so origin matches what ships.
#  - Deploys ONE service at a time, watches the streamed build to its
#    terminal state, retries ONCE on a terminal failure (never overlapping
#    retries — they race each other and self-inflict FAILED).
#  - Smokes /health afterward.
# Migrations: applied automatically at container boot (Dockerfile CMD runs
# `prisma migrate deploy`) — nothing to do here.
set -euo pipefail
cd "$(dirname "$0")/../.."

SERVICES=("$@")
[[ ${#SERVICES[@]} -eq 0 ]] && SERVICES=(api worker)

echo "==> Pushing main first (origin must match what ships) ..."
git push origin main

deploy_one() {
  local svc="$1" attempt out
  for attempt in 1 2; do
    echo "==> Deploying $svc (attempt $attempt) ..."
    out="$(railway up --service "$svc" --ci 2>&1 | tail -1)"
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
code="$(curl -s -m 20 -o /dev/null -w "%{http_code}" "https://api-production-a56f.up.railway.app/health")"
if [[ "$code" != "200" ]]; then
  echo "FAILED: /health returned $code after deploy." >&2
  exit 1
fi
echo "==> Deployed $(git rev-parse --short HEAD) — /health 200."
