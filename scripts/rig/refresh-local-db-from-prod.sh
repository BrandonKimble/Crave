#!/usr/bin/env bash
# Refresh the LOCAL dev database from the PRODUCTION (Railway) database.
#
# Direction is ONE-WAY: prod -> local. Nothing here writes to prod (the prod
# URL is only ever given to pg_dump). Standing law: the prod DB is touched
# only by deployed code + the deliberate drift-path migration recipe — never
# by a local dev api. When you need real data locally, run this, don't point
# a local api at prod.
#
# Usage:
#   PGPASSWORD_FILE=<file with prod password> ./scripts/rig/refresh-local-db-from-prod.sh
#   (or export CRAVE_PROD_PG_PASSWORD directly)
#
# The staged restore mirrors the 2026-07-24 cutover recipe in reverse: the
# validate_entity_references CHECK constraints fire on same-table forward
# references mid-COPY, so we restore pre-data, drop the two checks, load
# data, re-add them NOT VALID, then run post-data.
set -euo pipefail

PROD_HOST=sakura.proxy.rlwy.net
PROD_PORT=48622
PROD_DB=crave_search
PROD_USER=postgres
LOCAL_DB=crave_search

if [[ -z "${CRAVE_PROD_PG_PASSWORD:-}" ]]; then
  if [[ -n "${PGPASSWORD_FILE:-}" && -f "${PGPASSWORD_FILE}" ]]; then
    CRAVE_PROD_PG_PASSWORD="$(cat "${PGPASSWORD_FILE}")"
  else
    echo "Set CRAVE_PROD_PG_PASSWORD or PGPASSWORD_FILE (prod postgres password)." >&2
    exit 1
  fi
fi

DUMP_DIR="$(mktemp -d /tmp/crave-prod-dump.XXXXXX)"
DUMP_FILE="$DUMP_DIR/prod.dump"
trap 'rm -rf "$DUMP_DIR"' EXIT

echo "==> Dumping prod ($PROD_HOST:$PROD_PORT/$PROD_DB) ..."
PGPASSWORD="$CRAVE_PROD_PG_PASSWORD" pg_dump \
  -h "$PROD_HOST" -p "$PROD_PORT" -U "$PROD_USER" -d "$PROD_DB" \
  -Fc --no-owner --no-privileges -f "$DUMP_FILE"

echo "==> Recreating local db '$LOCAL_DB' (dropping the stale copy) ..."
dropdb --if-exists "$LOCAL_DB"
createdb "$LOCAL_DB"

echo "==> Restore: pre-data ..."
pg_restore -d "$LOCAL_DB" --section=pre-data --no-owner --no-privileges "$DUMP_FILE"

echo "==> Capturing + dropping the validate_entity_references CHECKs ..."
# These CHECKs call validate_entity_references() (same-table forward refs) and
# fire mid-COPY. Capture their REAL definitions from the restored pre-data
# schema, drop them, and re-add exactly those definitions NOT VALID afterward
# — never hand-written expressions.
CHECKS_TSV="$DUMP_DIR/checks.tsv"
psql -d "$LOCAL_DB" -t -A -F $'\t' -c "
  SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE contype='c' AND pg_get_constraintdef(oid) LIKE '%validate_entity_references%'
" > "$CHECKS_TSV"
while IFS=$'\t' read -r tbl name def; do
  [[ -z "$tbl" ]] && continue
  psql -d "$LOCAL_DB" -v ON_ERROR_STOP=1 -c "ALTER TABLE $tbl DROP CONSTRAINT $name;"
done < "$CHECKS_TSV"

echo "==> Restore: data (this is the long part) ..."
pg_restore -d "$LOCAL_DB" --section=data --no-owner --no-privileges "$DUMP_FILE"

echo "==> Re-adding the captured CHECKs NOT VALID ..."
while IFS=$'\t' read -r tbl name def; do
  [[ -z "$tbl" ]] && continue
  def_novalid="${def% NOT VALID}"
  psql -d "$LOCAL_DB" -v ON_ERROR_STOP=1 -c "ALTER TABLE $tbl ADD CONSTRAINT $name $def_novalid NOT VALID;"
done < "$CHECKS_TSV"

echo "==> Restore: post-data (indexes; HNSW rebuilt serially) ..."
psql -d "$LOCAL_DB" -c "SET maintenance_work_mem = '128MB';" >/dev/null
pg_restore -d "$LOCAL_DB" --section=post-data --no-owner --no-privileges -j 1 "$DUMP_FILE"

echo "==> Done. Local '$LOCAL_DB' now mirrors prod as of this dump."
echo "    Reminder: local api (yarn start / node dist/main) + sim .env.local"
echo "    switched to http://localhost:3000/api/v1 = full local mode."
