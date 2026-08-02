#!/usr/bin/env bash
# Push the LOCAL dev database to STAGING — "staging tests what I test".
#
# The owner's pit-stop flow (2026-08-02): local is where prompt/data work
# actually happens, so staging is most useful mirroring the LOCAL corpus you
# just validated, not last week's prod. This is the complement of
# refresh-staging-from-prod.sh (prod corpus, for prod-parity checks):
#
#   push-local-db-to-staging.sh      -> staging == your local DB (this file)
#   refresh-staging-from-prod.sh     -> staging == prod corpus, zero users
#
# Direction is ONE-WAY local -> staging. Prod is never touched (its URL never
# appears here). User rows are scrubbed by default — same law as the prod
# refresh (staging holds no real-person data); pass --keep-users to keep
# LOCAL users (they are prod-derived if your local came from the prod
# refresh, so only do that when you know what's in them).
#
# ~10-15 min depending on local size. Staging crons are off (CRONS_ENABLED
# =false) so loading data starts no spend.
set -euo pipefail

LOCAL_DB=crave_search
STG_HOST=tokaido.proxy.rlwy.net
STG_PORT=38651
STG_DB=crave_search
STG_USER=postgres

# HARD NOT-PROD GUARD (red-team P1): destructive ops target $STG_HOST; refuse
# if it ever equals prod's host.
PROD_HOST_GUARD=sakura.proxy.rlwy.net
if [[ "$STG_HOST" == "$PROD_HOST_GUARD" ]]; then
  echo "REFUSED: STG_HOST ($STG_HOST) equals the prod host — refusing destructive ops." >&2
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

KEEP_USERS=0
[[ "${1:-}" == "--keep-users" ]] && KEEP_USERS=1

if [[ -z "${CRAVE_STAGING_PG_PASSWORD:-}" ]]; then
  STAGING_PGPASSWORD_FILE="${STAGING_PGPASSWORD_FILE:-$HOME/.crave-staging-pg-password}"
  if [[ -f "${STAGING_PGPASSWORD_FILE}" ]]; then
    CRAVE_STAGING_PG_PASSWORD="$(cat "${STAGING_PGPASSWORD_FILE}")"
  else
    echo "Set CRAVE_STAGING_PG_PASSWORD or STAGING_PGPASSWORD_FILE (default ~/.crave-staging-pg-password)." >&2
    exit 1
  fi
fi

stg_psql() {
  PGPASSWORD="$CRAVE_STAGING_PG_PASSWORD" psql \
    -h "$STG_HOST" -p "$STG_PORT" -U "$STG_USER" -d "$STG_DB" "$@"
}

DUMP_DIR="$(mktemp -d /tmp/crave-local-push.XXXXXX)"
DUMP_FILE="$DUMP_DIR/local.dump"
trap 'rm -rf "$DUMP_DIR"' EXIT

echo "==> Dumping LOCAL '$LOCAL_DB' ..."
pg_dump -d "$LOCAL_DB" -Fc --no-owner --no-privileges -f "$DUMP_FILE"

echo "==> Recreating staging schema ..."
# POSITIVE STAGING ASSERTION (red-team P2): refuse to DROP unless the CONNECTED
# database carries the staging sentinel (scrub-staging-user-data.sql plants it
# every run). Prod never has it, so a stale/misdirected host is refused, not
# wiped. First-ever run has no sentinel yet — pass ALLOW_FRESH_STAGING=1 once.
SENTINEL="$(stg_psql -t -A -c "SELECT to_regclass('public._staging_sentinel') IS NOT NULL;" 2>/dev/null || echo error)"
if [[ "$SENTINEL" != "t" ]]; then
  if [[ "${ALLOW_FRESH_STAGING:-0}" == "1" ]]; then
    echo "==> No staging sentinel (fresh staging, ALLOW_FRESH_STAGING=1) — proceeding."
  else
    echo "REFUSED: target DB has no _staging_sentinel — it may NOT be staging (or is a first run)." >&2
    echo "  If this really is fresh staging: ALLOW_FRESH_STAGING=1 $0" >&2
    exit 1
  fi
fi
stg_psql -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
stg_psql -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS vector;" || true

TOC="$DUMP_DIR/toc.filtered"
pg_restore -l "$DUMP_FILE" | grep -viE 'timescaledb|_timescaledb|continuous_agg' > "$TOC"

echo "==> Restore: pre-data ..."
PGPASSWORD="$CRAVE_STAGING_PG_PASSWORD" pg_restore \
  -h "$STG_HOST" -p "$STG_PORT" -U "$STG_USER" -d "$STG_DB" \
  -L "$TOC" --section=pre-data --no-owner --no-privileges "$DUMP_FILE"

echo "==> Capturing + dropping the validate_entity_references CHECKs ..."
CHECKS_TSV="$DUMP_DIR/checks.tsv"
stg_psql -t -A -F $'\t' -c "
  SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE contype='c' AND pg_get_constraintdef(oid) LIKE '%validate_entity_references%'
" > "$CHECKS_TSV"
while IFS=$'\t' read -r tbl name def; do
  [[ -z "$tbl" ]] && continue
  stg_psql -v ON_ERROR_STOP=1 -c "ALTER TABLE $tbl DROP CONSTRAINT $name;"
done < "$CHECKS_TSV"

echo "==> Restore: data ..."
PGPASSWORD="$CRAVE_STAGING_PG_PASSWORD" pg_restore \
  -h "$STG_HOST" -p "$STG_PORT" -U "$STG_USER" -d "$STG_DB" \
  -L "$TOC" --section=data --no-owner --no-privileges "$DUMP_FILE"

echo "==> Re-adding the captured CHECKs NOT VALID ..."
while IFS=$'\t' read -r tbl name def; do
  [[ -z "$tbl" ]] && continue
  def_novalid="${def% NOT VALID}"
  stg_psql -v ON_ERROR_STOP=1 -c "ALTER TABLE $tbl ADD CONSTRAINT $name $def_novalid NOT VALID;"
done < "$CHECKS_TSV"

echo "==> Restore: post-data (indexes) ..."
PGPASSWORD="$CRAVE_STAGING_PG_PASSWORD" pg_restore \
  -h "$STG_HOST" -p "$STG_PORT" -U "$STG_USER" -d "$STG_DB" \
  -L "$TOC" --section=post-data --no-owner --no-privileges -j 1 "$DUMP_FILE"

if [[ "$KEEP_USERS" -eq 0 ]]; then
  echo "==> SCRUB: removing user PII (shared, fail-closed) ..."
  # Shared scrub — same fail-closed guarantee as refresh-staging (red-team
  # P0/P1): catalog-discovered, RAISES if any PII survives, so a local DB
  # that happened to hold prod users cannot reach a live staging un-scrubbed.
  stg_psql -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/scrub-staging-user-data.sql"
else
  # --keep-users: still drop spend history (local meters, not staging's).
  stg_psql -v ON_ERROR_STOP=1 -c "TRUNCATE api_usage_ledger, spend_campaigns;" || true
fi

echo "==> Verifying ..."
DOCS=$(stg_psql -t -A -c "SELECT count(*) FROM collection_source_documents;")
ENTS=$(stg_psql -t -A -c "SELECT count(*) FROM core_entities;")
USERS=$(stg_psql -t -A -c "SELECT count(*) FROM users;")
if [[ "$DOCS" -eq 0 || "$ENTS" -eq 0 ]]; then
  echo "FAILED: restore verified EMPTY (docs=$DOCS entities=$ENTS)." >&2
  exit 1
fi
# FAIL CLOSED on the scrub (red-team P1): if we scrubbed, users MUST be 0 —
# never declare success with real accounts sitting in staging.
if [[ "$KEEP_USERS" -eq 0 && "$USERS" -ne 0 ]]; then
  echo "FAILED: scrub left $USERS user rows — DO NOT USE this staging DB." >&2
  exit 1
fi
echo "==> Done: $DOCS documents, $ENTS entities, $USERS users."
echo "    Staging now mirrors your local DB."
