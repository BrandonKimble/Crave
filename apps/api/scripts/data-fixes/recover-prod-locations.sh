#!/usr/bin/env bash
# @script-class: operational
#
# SURGICAL RECOVERY of core_restaurant_locations rows lost in the 2026-08-16
# local wipe: pull rows that exist in PROD but not LOCAL (restricted to
# restaurant_ids present in local core_entities) and insert them locally.
#
# Prod is READ-ONLY, always through the crave_readonly role
# (~/.crave-prod-readonly.env -> PROD_RO_DATABASE_URL). Writes go to LOCAL
# only ($DATABASE_URL from apps/api/.env). Idempotent: INSERT ... ON CONFLICT
# (location_id) DO NOTHING — rows already present locally are never touched
# (the sim-snapshot restore is authoritative for those).
#
# Column mapping: verified 2026-08-17 that prod and local schemas are
# IDENTICAL (23 columns, same names/order), so the copy is a full-column
# passthrough. If either side drifts, the explicit column list below fails
# loudly instead of misaligning.
#
# Usage:
#   ./recover-prod-locations.sh          # dry-run (default): report the diff
#   ./recover-prod-locations.sh --apply  # insert the missing rows locally
#
# RESULT OF THE ONE-TIME RUN (2026-08-17): diff was EMPTY — local already
# held all 13,193 prod rows (id + google_place_id fingerprints identical).
# The sim-snapshot restore had already recovered the presumed-lost ~1,050.
# Kept for the next incident; the mechanism is proven.
set -euo pipefail

APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
source "$HOME/.crave-prod-readonly.env"
# svc-env.sh loads apps/api/.env -> DATABASE_URL (local)
source "$REPO_ROOT/scripts/rig/svc-env.sh" >/dev/null

PSQL=/Applications/Postgres.app/Contents/Versions/latest/bin/psql
COLS="location_id, restaurant_id, google_place_id, latitude, longitude, address, city, region, country, postal_code, is_primary, last_polled_at, created_at, updated_at, phone_number, website_url, hours, utc_offset_minutes, time_zone, website_domain, business_status, moved_place_id, in_scoring_territory"

WORK="$(mktemp -d /tmp/recover-prod-locations.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

echo "==> Pulling prod rows (crave_readonly, SELECT only) ..."
"$PSQL" "$PROD_RO_DATABASE_URL" -Atc \
  "COPY (SELECT $COLS FROM core_restaurant_locations ORDER BY location_id) TO STDOUT" \
  > "$WORK/prod_rows.tsv"

echo "==> Staging into local temp table + diffing ..."
"$PSQL" "$DATABASE_URL" <<SQL
CREATE TEMP TABLE _prod_locations (LIKE core_restaurant_locations INCLUDING DEFAULTS);
\\copy _prod_locations ($COLS) FROM '$WORK/prod_rows.tsv'
SELECT count(*) AS prod_rows FROM _prod_locations;
SELECT count(*) AS missing_locally
FROM _prod_locations p
WHERE NOT EXISTS (SELECT 1 FROM core_restaurant_locations l WHERE l.location_id = p.location_id)
  AND EXISTS (SELECT 1 FROM core_entities e WHERE e.entity_id = p.restaurant_id);
$( if [[ $APPLY -eq 1 ]]; then cat <<'APPLYSQL'
INSERT INTO core_restaurant_locations
SELECT p.* FROM _prod_locations p
WHERE EXISTS (SELECT 1 FROM core_entities e WHERE e.entity_id = p.restaurant_id)
ON CONFLICT (location_id) DO NOTHING;
SELECT count(*) AS local_rows_after FROM core_restaurant_locations;
APPLYSQL
else echo "-- dry-run: no writes (pass --apply to insert)"; fi )
SQL

echo "==> Done ($( [[ $APPLY -eq 1 ]] && echo applied || echo dry-run ))."
