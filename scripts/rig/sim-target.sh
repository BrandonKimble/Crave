#!/usr/bin/env bash
# Point the simulator at prod or local and make it ACTUALLY take effect.
#
#   ./scripts/rig/sim-target.sh prod    # sim -> Railway api (default dev mode)
#   ./scripts/rig/sim-target.sh local   # sim -> localhost:3000 (API dev mode)
#
# EXPO_PUBLIC_* inlines when METRO STARTS, not per bundle — editing .env.local
# without restarting Metro silently keeps the old target. This script edits
# the env, restarts Metro, and runs the verified cold reload so the switch is
# a fact, not a hope.
set -euo pipefail
cd "$(dirname "$0")/../.."

PROD_URL="https://api-production-a56f.up.railway.app/api/v1"
LOCAL_URL="http://localhost:3000/api/v1"

case "${1:-}" in
  prod)  URL="$PROD_URL" ;;
  local) URL="$LOCAL_URL" ;;
  *) echo "usage: sim-target.sh prod|local" >&2; exit 1 ;;
esac

if [[ "$URL" == "$LOCAL_URL" ]] && ! lsof -ti tcp:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "NOTE: nothing is listening on :3000 — start the local api first" >&2
  echo "      (cd apps/api && yarn build && nohup node --enable-source-maps dist/main >> /tmp/crave-api.log 2>&1 &)" >&2
fi

perl -pi -e "s|^EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=$URL|" apps/mobile/.env.local
echo "==> $(grep '^EXPO_PUBLIC_API_URL' apps/mobile/.env.local)"

echo "==> Restarting Metro (env inlines at Metro start) ..."
lsof -ti tcp:8081 -sTCP:LISTEN | xargs kill 2>/dev/null || true
sleep 1
(cd apps/mobile && nohup npx expo start --dev-client --port 8081 > /tmp/crave-metro.log 2>&1 &)

for _ in $(seq 1 90); do
  curl -s -m 2 -o /dev/null http://localhost:8081/status && break
  sleep 1
done
curl -s -m 2 -o /dev/null http://localhost:8081/status || { echo "FAILED: Metro did not come up." >&2; exit 1; }

echo "==> Verified cold reload ..."
./scripts/rig/reload-dev-client.sh
echo "==> Sim now targets: $URL"
