#!/usr/bin/env bash
# Refresh the STAGING database from PRODUCTION — corpus in, user data OUT.
#
# THE STAGING PHILOSOPHY (round-six derivation, 2026-08-02): staging is NOT a
# prod mirror. What it must match prod on is SCHEMA + CORPUS SHAPE (documents,
# entities, scores — what makes behavior realistic); what it must NEVER hold
# is user data (accounts, lists, photos, votes, devices) — that adds risk and
# tests nothing. Direction is ONE-WAY prod -> staging; the prod URL is only
# ever given to pg_dump. Forked from refresh-local-db-from-prod.sh (the
# staged-restore recipe is identical) + the scrub step.
#
# Usage:
#   CRAVE_PROD_PG_PASSWORD=... CRAVE_STAGING_PG_PASSWORD=... \
#     ./scripts/rig/refresh-staging-from-prod.sh
#   (passwords also read from PGPASSWORD_FILE / STAGING_PGPASSWORD_FILE)
#
# ~15 min, $0 (no vendor calls). Safe to re-run any time staging drifts.
# REMINDER: staging worker has CRONS_ENABLED=false — loading data does not
# start spend. Flip deliberately if you want crons exercised.
set -euo pipefail

PROD_HOST=sakura.proxy.rlwy.net
PROD_PORT=48622
PROD_DB=crave_search
PROD_USER=postgres

STG_HOST=tokaido.proxy.rlwy.net
STG_PORT=38651
STG_DB=crave_search
STG_USER=postgres

if [[ -z "${CRAVE_PROD_PG_PASSWORD:-}" ]]; then
  if [[ -n "${PGPASSWORD_FILE:-}" && -f "${PGPASSWORD_FILE}" ]]; then
    CRAVE_PROD_PG_PASSWORD="$(cat "${PGPASSWORD_FILE}")"
  else
    echo "Set CRAVE_PROD_PG_PASSWORD or PGPASSWORD_FILE (prod postgres password)." >&2
    exit 1
  fi
fi
if [[ -z "${CRAVE_STAGING_PG_PASSWORD:-}" ]]; then
  STAGING_PGPASSWORD_FILE="${STAGING_PGPASSWORD_FILE:-$HOME/.crave-staging-pg-password}"
  if [[ -f "${STAGING_PGPASSWORD_FILE}" ]]; then
    CRAVE_STAGING_PG_PASSWORD="$(cat "${STAGING_PGPASSWORD_FILE}")"
  else
    echo "Set CRAVE_STAGING_PG_PASSWORD or STAGING_PGPASSWORD_FILE (default ~/.crave-staging-pg-password, written by the 2026-08-02 rotation)." >&2
    exit 1
  fi
fi

stg_psql() {
  PGPASSWORD="$CRAVE_STAGING_PG_PASSWORD" psql \
    -h "$STG_HOST" -p "$STG_PORT" -U "$STG_USER" -d "$STG_DB" "$@"
}

DUMP_DIR="$(mktemp -d /tmp/crave-staging-refresh.XXXXXX)"
DUMP_FILE="$DUMP_DIR/prod.dump"
trap 'rm -rf "$DUMP_DIR"' EXIT

echo "==> Dumping prod ($PROD_HOST:$PROD_PORT/$PROD_DB) ..."
PGPASSWORD="$CRAVE_PROD_PG_PASSWORD" pg_dump \
  -h "$PROD_HOST" -p "$PROD_PORT" -U "$PROD_USER" -d "$PROD_DB" \
  -Fc --no-owner --no-privileges -f "$DUMP_FILE"

echo "==> Recreating staging schema (drop + recreate public) ..."
# Railway's managed Postgres won't let us dropdb the primary database from a
# client; recreating the schema is the equivalent clean slate.
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

echo "==> Restore: data (the long part) ..."
PGPASSWORD="$CRAVE_STAGING_PG_PASSWORD" pg_restore \
  -h "$STG_HOST" -p "$STG_PORT" -U "$STG_USER" -d "$STG_DB" \
  -L "$TOC" --section=data --no-owner --no-privileges "$DUMP_FILE"

echo "==> Re-adding the captured CHECKs NOT VALID ..."
while IFS=$'\t' read -r tbl name def; do
  [[ -z "$tbl" ]] && continue
  def_novalid="${def% NOT VALID}"
  stg_psql -v ON_ERROR_STOP=1 -c "ALTER TABLE $tbl ADD CONSTRAINT $name $def_novalid NOT VALID;"
done < "$CHECKS_TSV"

echo "==> Restore: post-data (indexes; HNSW rebuilt serially) ..."
PGPASSWORD="$CRAVE_STAGING_PG_PASSWORD" pg_restore \
  -h "$STG_HOST" -p "$STG_PORT" -U "$STG_USER" -d "$STG_DB" \
  -L "$TOC" --section=post-data --no-owner --no-privileges -j 1 "$DUMP_FILE"

echo "==> SCRUB: removing ALL user data ..."
# TRUNCATE ... CASCADE follows the FK graph, so every table referencing
# users (lists, list items, photos, votes, follows, devices, notifications,
# reports, username history, on-demand request joins — and anything added
# later) is emptied WITHOUT this script having to enumerate the schema.
# Curated lists are owner-account-owned, so they go too — staging exists to
# test the corpus, not list content.
stg_psql -v ON_ERROR_STOP=1 -c "TRUNCATE users CASCADE;"
stg_psql -v ON_ERROR_STOP=1 -c "TRUNCATE user_reserved_usernames;" || true
# Ledger + campaign history is PROD spend truth; keeping it in staging skews
# staging-side rate derivation and reconcile runs. Fresh meters.
stg_psql -v ON_ERROR_STOP=1 -c "TRUNCATE api_usage_ledger, spend_campaigns;" || true

echo "==> Verifying: corpus present, users empty ..."
DOCS=$(stg_psql -t -A -c "SELECT count(*) FROM collection_source_documents;")
ENTS=$(stg_psql -t -A -c "SELECT count(*) FROM core_entities;")
USERS=$(stg_psql -t -A -c "SELECT count(*) FROM users;")
if [[ "$DOCS" -eq 0 || "$ENTS" -eq 0 ]]; then
  echo "FAILED: restore verified EMPTY (docs=$DOCS entities=$ENTS)." >&2
  exit 1
fi
if [[ "$USERS" -ne 0 ]]; then
  echo "FAILED: scrub left $USERS user rows — DO NOT USE this staging DB." >&2
  exit 1
fi
echo "==> Done: $DOCS documents, $ENTS entities, 0 users."
echo "    Staging now has prod's corpus and none of prod's people."
