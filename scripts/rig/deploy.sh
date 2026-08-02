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
  # Ask the RUNNING PROCESS what it is, not Railway what we intended. /health
  # answers liveness and identity in one call: a crashlooping staging cannot
  # reply at all, and a stale one replies with the wrong sha. The variable is
  # intent; this is fact.
  STAGING_HEALTH="$(curl -fsS --max-time 10 "https://api-staging-25ca.up.railway.app/health" 2>/dev/null || true)"
  if [[ -z "$STAGING_HEALTH" ]]; then
    echo "REFUSED: staging is not answering /health — it cannot vouch for this code." >&2
    echo "  Deploy it first: ./scripts/rig/deploy.sh --env staging" >&2
    exit 1
  fi
  STAGING_SHA="$(printf '%s' "$STAGING_HEALTH" \
    | python3 -c 'import json,sys; print((json.load(sys.stdin) or {}).get("commit",""))' 2>/dev/null || true)"

  if [[ -z "$STAGING_SHA" || "$STAGING_SHA" == "unknown" ]]; then
    echo "REFUSED: staging cannot say which commit it is running (commit=${STAGING_SHA:-missing})." >&2
    echo "Something deployed it outside this script. Re-deploy: ./scripts/rig/deploy.sh --env staging" >&2
    exit 1
  fi
  if [[ "$STAGING_SHA" == *-dirty ]]; then
    echo "REFUSED: staging is running a DIRTY tree (${STAGING_SHA})." >&2
    echo "  It last deployed uncommitted changes, so it did not prove committed HEAD." >&2
    echo "  Commit, then re-deploy staging: ./scripts/rig/deploy.sh --env staging" >&2
    exit 1
  fi
  if [[ "$STAGING_SHA" != "$HEAD_SHA" ]]; then
    echo "REFUSED: staging is running different code than you are about to ship to PROD." >&2
    echo "  staging: ${STAGING_SHA:0:9}" >&2
    echo "  HEAD:    ${HEAD_SHA:0:9}" >&2
    echo "Deploy to staging first: ./scripts/rig/deploy.sh --env staging" >&2
    exit 1
  fi

  # ── CI VERDICT (2026-08-02, the 100-red-runs lesson) ────────────────────
  # CI failed 100 consecutive runs and nothing noticed, because nothing
  # consulted it. Rule: a KNOWN-RED CI on this exact commit hard-stops a
  # prod deploy; a pending or absent run only warns (the staging gate above
  # is the hard promotion gate — CI is the async safety net, and a solo
  # deploy should not idle 10 minutes for it). --force skips, loudly.
  # A gh AUTH failure must be distinguishable from a clean bill of health
  # (red-team P1): `gh run list` returns empty BOTH when there is no run AND
  # when the token is expired, so we probe auth separately and SAY when the
  # verdict is unavailable rather than silently proceeding as if green.
  if ! command -v gh >/dev/null 2>&1; then
    echo "==> CI: gh not installed — verdict UNAVAILABLE, proceeding (staging gate stands)."
  elif ! gh auth status >/dev/null 2>&1; then
    echo "==> CI: gh not authenticated — verdict UNAVAILABLE, proceeding (staging gate stands)."
  else
    CI_STATE="$(gh run list --commit "$HEAD_SHA" --workflow CI \
      --json status,conclusion -q '.[0] | .status + ":" + (.conclusion // "")' 2>/dev/null || true)"
    case "$CI_STATE" in
      completed:success)
        echo "==> CI: green for ${HEAD_SHA:0:9}" ;;
      completed:*)
        echo "REFUSED: CI is RED for ${HEAD_SHA:0:9} (${CI_STATE#completed:})." >&2
        echo "  gh run list --commit $HEAD_SHA   # see what failed" >&2
        echo "Fix it (or --force for a hotfix, loudly)." >&2
        exit 1 ;;
      *)
        echo "==> CI: no completed run for ${HEAD_SHA:0:9} yet (${CI_STATE:-none}) — proceeding; check it after." ;;
    esac
  fi
  echo "==> Promotion gate: staging is healthy on ${HEAD_SHA:0:9}."
fi

if [[ "$ENVIRONMENT" == "production" ]]; then
  echo "==> Pushing main first (origin must match what ships) ..."
  git push origin HEAD:main

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

# STAMP WHAT IS ABOUT TO SHIP — BEFORE the deploy, so the new container boots
# carrying it and /health can report the truth immediately. Stamping afterwards
# (the first version of this, 2026-08-02) left the RUNNING process reporting
# `unknown` until the following deploy: the value was always one behind, which
# is worse than absent because it looks authoritative.
#
# `railway up` uploads a working tree and Railway records no commit for a CLI
# deploy, so without this an environment cannot say which code it runs —
# establishing that for staging took probing its live rate-limit behaviour.
# DIRTY-TREE HONESTY (red-team 2026-08-02): `railway up` ships the WORKING
# TREE, but the stamp was `git rev-parse HEAD` unconditionally — so a staging
# deploy from a dirty tree (staging skips the clean-tree guard BY DESIGN, it
# exists to test uncommitted work) reported a CLEAN sha it was NOT running.
# The prod gate's exact-match then accepted "staging proved abc123" when
# staging actually ran abc123 + uncommitted diffs. The stamp now carries a
# `-dirty` suffix when the tree is dirty, so the gate's `==` refuses it and
# forces a clean staging deploy before prod — "staging proved X" is true ONLY
# when staging ran committed X. (Prod itself can't be dirty: guarded above.)
STAMP_SHA="$(git rev-parse HEAD)"
[[ -n "$(git status --porcelain)" ]] && STAMP_SHA="${STAMP_SHA}-dirty"
echo "==> Stamping DEPLOYED_GIT_SHA=$STAMP_SHA on $ENVIRONMENT ..."
for svc in "${SERVICES[@]}"; do
  railway variables --service "$svc" --environment "$ENVIRONMENT" \
    --set "DEPLOYED_GIT_SHA=$STAMP_SHA" --skip-deploys >/dev/null 2>&1 || {
    echo "REFUSED: could not stamp DEPLOYED_GIT_SHA on $svc." >&2
    echo "Deploying anyway would leave the environment unable to identify itself," >&2
    echo "and the promotion gate would refuse every future prod deploy." >&2
    exit 1
  }
done

# CI-EARLY-START (red-team P1: the prod CI-verdict check ran before any push,
# so the standard flow never had a CI run to consult). A CLEAN staging deploy
# pushes main now, so CI runs while you poke staging — and the prod promotion
# later finds a real verdict. A dirty staging deploy pushes nothing (there is
# uncommitted work; the -dirty stamp already blocks promotion).
if [[ "$ENVIRONMENT" == "staging" && -z "$(git status --porcelain)" ]]; then
  if ! git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
    echo "==> Pushing main so CI starts now (promotion will consult it) ..."
    git push origin HEAD:main || echo "  (push failed — not fatal for staging; CI just won't pre-run)"
  fi
fi

deploy_one() {
  local svc="$1" attempt out
  for attempt in 1 2; do
    echo "==> Deploying $svc to $ENVIRONMENT (attempt $attempt) ..."
    # `|| true`: under `set -euo pipefail` a non-zero railway exit would kill
    # the script HERE, before the retry loop ever sees the failure.
    out="$(railway up --service "$svc" --environment "$ENVIRONMENT" --ci 2>&1 | tail -1 || true)"
    # SKIPPED IS CHECKED UNCONDITIONALLY (red-team P0, 2026-08-02, proven live:
    # `railway up` printed "Deploy complete" while Railway SKIPPED the upload —
    # skippedReason "No changes to watched files", because a stale dashboard
    # watchPattern re-applied at deploy time. The old code only checked SKIPPED
    # on the FAILURE branch, so a skip that printed "Deploy complete" sailed
    # through and prod silently kept the old code while the stamp lied. Never
    # trust the CLI's last line — ask Railway what the newest deployment did.
    # DO NOT let this assignment kill the script (red-team P1): under
    # `set -o pipefail` a failing `railway deployment list` (expired session,
    # CLI flag rename) made the assignment non-zero and `set -e` killed us
    # HERE — after `railway up` already fired and the stamp was already
    # written — with NO message at all. The operator sees a hang, prod may be
    # mid-deploy, and the stamp claims an unverified commit. Capture the
    # status and refuse LOUDLY instead. stderr is kept (not /dev/null'd) so
    # the cause is visible.
    local newest newest_status
    set +e
    newest="$(railway deployment list --service "$svc" --environment "$ENVIRONMENT" 2>&1 | sed -n 2p)"
    newest_status=$?
    set -e
    if [[ "$newest_status" -ne 0 ]]; then
      echo "FAILED: could not read $svc's deployment status from Railway ($newest)." >&2
      echo "  `railway up` may already have fired — verify what is running before retrying:" >&2
      echo "  railway deployment list --service $svc --environment $ENVIRONMENT" >&2
      exit 1
    fi
    if grep -q "SKIPPED" <<<"$newest"; then
      echo "FAILED: Railway SKIPPED the $svc upload (\"No changes to watched files\")." >&2
      echo "  A watchPattern is still set — check railway.json AND the dashboard service settings" >&2
      echo "  (they MERGE; a dashboard pattern survives a clean railway.json). Clear both, then retry." >&2
      exit 1
    fi
    if [[ "$out" == *"Deploy complete"* ]] && ! grep -qiE "SKIPPED|FAILED|CRASHED" <<<"$newest"; then
      echo "==> $svc: Deploy complete"
      return 0
    fi
    echo "==> $svc: not confirmed shipped ($out / $newest)"
  done
  echo "FAILED: $svc did not deploy after one retry — inspect Railway build logs." >&2
  exit 1
}

for svc in "${SERVICES[@]}"; do
  deploy_one "$svc"
done

echo "==> Smoke: /health (asserting the RUNNING commit == HEAD) ..."
# EXACT, NOT FUZZY (red-team P1, 2026-08-02): the old check used uptime>900 as
# a proxy for "new container". A skipped or crash-looped deploy within 15 min
# of the last one passed it green — which is exactly how a SKIPPED prod deploy
# smoked clean today. /health echoes DEPLOYED_GIT_SHA, so we can demand the
# exact answer: the process must report HEAD. Poll a bit — the new container
# boots + runs migrations after `railway up` returns. ONE curl gets code+body
# (two separate curls can hit different containers).
# Compare against the STAMP we wrote, not bare HEAD — a dirty STAGING deploy
# stamps HEAD-dirty (by design), and asserting bare HEAD would fail every
# dirty staging smoke. $STAMP_SHA is exactly what the new container must echo.
EXPECT_SHA="$STAMP_SHA"
running=""; code=""
for _ in $(seq 1 20); do
  resp="$(curl -s -m 20 -w $'\n%{http_code}' "$HEALTH_URL" 2>/dev/null || true)"
  code="$(printf '%s' "$resp" | tail -1)"
  body="$(printf '%s' "$resp" | sed '$d')"
  running="$(printf '%s' "$body" | python3 -c 'import json,sys; print((json.load(sys.stdin) or {}).get("commit",""))' 2>/dev/null || true)"
  [[ "$code" == "200" && "$running" == "$EXPECT_SHA" ]] && break
  sleep 6
done
if [[ "$code" != "200" ]]; then
  echo "FAILED: /health returned $code after deploy." >&2
  exit 1
fi
if [[ "$running" != "$EXPECT_SHA" ]]; then
  echo "FAILED: /health is 200 but the RUNNING commit is not HEAD." >&2
  echo "  running: ${running:0:9}" >&2
  echo "  expected: ${EXPECT_SHA:0:9}" >&2
  echo "  The deploy did not ship (SKIPPED, crash-looped, or slow). The stamp is" >&2
  echo "  corrected to what is ACTUALLY running so /health never lies:" >&2
  # HONEST STAMP ON FAILURE (red-team P0): never leave the speculative stamp
  # claiming a commit prod does not run. Reset it to the observed reality.
  for svc in "${SERVICES[@]}"; do
    railway variables --service "$svc" --environment "$ENVIRONMENT" \
      --set "DEPLOYED_GIT_SHA=${running:-unknown}" --skip-deploys >/dev/null 2>&1 || true
  done
  echo "  railway logs --service api --environment $ENVIRONMENT   # investigate" >&2
  exit 1
fi
# WORKER shipped? It serves no HTTP /health, so assert its newest deployment
# is SUCCESS (a silently-skipped worker was invisible before — red-team P1).
if [[ " ${SERVICES[*]} " == *" worker "* ]]; then
  set +e
  wstat="$(railway deployment list --service worker --environment "$ENVIRONMENT" 2>&1 | sed -n 2p)"
  wstat_status=$?
  set -e
  if [[ "$wstat_status" -ne 0 ]]; then
    echo "FAILED: could not read worker deployment status ($wstat)." >&2
    exit 1
  fi
  if ! grep -q "SUCCESS" <<<"$wstat"; then
    echo "FAILED: worker's newest deployment is not SUCCESS ($wstat)." >&2
    exit 1
  fi
fi
echo "==> Deployed ${EXPECT_SHA:0:9} to $ENVIRONMENT — /health 200, running commit matches the stamp."
