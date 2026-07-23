#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

failed=0

check_absent() {
  local label="$1"
  local pattern="$2"
  shift 2

  if rg -n --glob '!**/README.md' "$pattern" "$@"; then
    echo "tomtom-market-cutover-delete-gate: ${label}" >&2
    failed=1
  fi
}

ACTIVE_RUNTIME_PATHS=(
  apps/api/src
  apps/api/scripts
  apps/mobile/src
  packages/shared/src
  apps/api/package.json
)

check_absent \
  "old candidatePlace response contract remains in runtime" \
  "candidatePlaceName|candidatePlaceGeoId" \
  "${ACTIVE_RUNTIME_PATHS[@]}"

check_absent \
  "provider-specific TomTom source table is still referenced by runtime" \
  "geo_tomtom_boundaries|us-locality-tomtom-|findBoundaryByProviderId" \
  "${ACTIVE_RUNTIME_PATHS[@]}" \
  apps/api/prisma/schema.prisma

check_absent \
  "Census/CBSA vocabulary remains in current schema/runtime/seeds" \
  "census|Census|CBSA|cbsa|us-cbsa-|censusPlaceGeoId|CensusPlaceBoundary|geo_census_place_boundaries|census_place_geoid" \
  "${ACTIVE_RUNTIME_PATHS[@]}" \
  apps/api/prisma/schema.prisma

check_absent \
  "old local_fallback market vocabulary remains in current schema/runtime" \
  "MarketType\\.local_fallback|\\blocal_fallback\\b|localFallback|LocalFallback" \
  "${ACTIVE_RUNTIME_PATHS[@]}" \
  apps/api/prisma/schema.prisma

check_absent \
  "scripts must not invent market keys from Google address components" \
  "buildLocalityMarketKey|administrative_area_level_1.*market|google.*marketKey" \
  apps/api/scripts

if rg -n "cbsa_metro|cbsa_micro" apps/api/prisma/schema.prisma >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: MarketType must expose provider-neutral regional/locality values only" >&2
  failed=1
fi

if ! rg -n "CREATE TYPE market_type AS ENUM \\('regional', 'locality', 'manual'\\)" \
  apps/api/prisma/migrations/20260515201000_provider_neutral_regional_markets/migration.sql \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: migration must promote provider-neutral regional market type" >&2
  failed=1
fi

if [[ -e apps/api/scripts/import_census_markets.py ]]; then
  echo "tomtom-market-cutover-delete-gate: Census import script must be deleted, not retained as a parallel path" >&2
  failed=1
fi

# WAVE-6 item 10 (2026-07-22): prisma/seed.ts (regional market provisioning)
# is DELETED — market provisioning lives in scripts/onboard-market.ts; the
# fresh-DB bootstrap is the place-catalog seed sequence documented in
# apps/api/scripts/seed-us-places.ts. The seed.ts content assertions that
# lived here died with it.
if ! rg -n "'region-' \\|\\| lower\\(country_code\\)|region-us-tx-austin" \
  apps/api/prisma/migrations/20260515201000_provider_neutral_regional_markets/migration.sql \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: regional market keys must be app-owned provider-neutral region-* keys" >&2
  failed=1
fi

if ! rg -n "DROP TABLE IF EXISTS geo_census_cbsa_boundaries" \
  apps/api/prisma/migrations/20260515201000_provider_neutral_regional_markets/migration.sql \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: clean cutover must drop old Census regional source tables" >&2
  failed=1
fi

check_absent \
  "ambiguous polls market resolve mode remains in runtime" \
  "mode:\\s*['\"]polls['\"]" \
  "${ACTIVE_RUNTIME_PATHS[@]}"

check_absent \
  "restaurant enrichment must not bootstrap missing markets" \
  "allowBootstrap:\\s*true" \
  apps/api/src/modules/restaurant-enrichment

if ! rg -n "language:\\s*this\\.language" \
  apps/api/src/modules/markets/tomtom-boundary-bootstrap.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: TomTom requests must pin language=en-US via service config" >&2
  failed=1
fi

if ! rg -n "'Tracking-ID': requestId" \
  apps/api/src/modules/markets/tomtom-boundary-bootstrap.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: TomTom requests must send Tracking-ID from bootstrap request id" >&2
  failed=1
fi

if ! rg -n "ensureLocalityMarkets:\\s*false" \
  apps/api/src/modules/markets/markets.controller.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: public market resolve endpoint must remain passive and never bootstrap locality markets" >&2
  failed=1
fi

if rg -n "polls_create" apps/api/src/modules/markets/dto/market-resolve.dto.ts apps/api/src/modules/markets/markets.controller.ts >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: public market resolve DTO must not accept active poll creation bootstrap mode" >&2
  failed=1
fi

if ! rg -n "mode:\\s*'polls_read'" \
  apps/mobile/src/services/markets.ts \
  apps/api/src/modules/polls/polls.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: passive poll reads must use polls_read market mode" >&2
  failed=1
fi

if ! rg -n "resolveOrEnsureForPollCreation" \
  apps/api/src/modules/polls/polls.service.ts \
  apps/api/src/modules/markets/market-registry.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: active poll creation must use internal resolveOrEnsureForPollCreation path" >&2
  failed=1
fi

check_absent \
  "poll creation must not force TomTom locality before local coverage resolution" \
  "const locality = await this\\.resolveOrEnsureLocalityForActiveIntent" \
  apps/api/src/modules/markets/market-registry.service.ts

if ! rg -n "ensureLocalityMarkets:\\s*true" \
  apps/api/src/modules/search/search.service.ts \
  apps/api/src/modules/search/search-query-interpretation.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: active search submit must keep locality bootstrap so off-metro demand has market identity" >&2
  failed=1
fi

if rg -n "activeLocalityMarket|selected\\s*=\\s*activeLocalityMarket" \
  apps/api/src/modules/markets/market-registry.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: active locality bootstrap must not bypass normal overlap/tie display selection" >&2
  failed=1
fi

if ! rg -n "if \\(params\\.allowBootstrap !== true\\)" \
  apps/api/src/modules/markets/market-registry.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: passive resolveOrEnsureForLocation must not write locality markets from stored TomTom boundaries" >&2
  failed=1
fi

if ! rg -n "bootstrapUncoveredBoundaryCandidates" \
  apps/api/src/modules/markets/market-registry.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: active viewport bootstrap must be driven by uncovered geometry after local coverage resolution" >&2
  failed=1
fi

if ! rg -n "ST_Covers\\(geometry" \
  apps/api/src/modules/markets/market-resolver.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: point market resolution must use ST_Covers so boundary points do not fall into bootstrap" >&2
  failed=1
fi

if rg -n "ST_Contains" \
  apps/api/src/modules/markets \
  apps/api/src/modules/search \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: market/search boundary filters must use ST_Covers, not ST_Contains" >&2
  failed=1
fi

if ! rg -n "ST_Covers" \
  apps/api/src/modules/search/search-query.builder.ts \
  apps/api/src/modules/search/search-coverage.service.ts \
  apps/api/src/modules/search/search.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: active search result filters must use boundary-inclusive ST_Covers" >&2
  failed=1
fi

if ! rg -n "reactivatedFromInactive|Reactivated locality market" \
  apps/api/src/modules/markets/market-registry.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: locality ensure must reactivate by source-boundary identity before insert" >&2
  failed=1
fi

if rg -n "\"tomtom:deploy-gate\": \"yarn db:migrate:deploy && yarn db:seed" \
  apps/api/package.json \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: workspace deploy gate must route through guarded seed-on-unhealthy deploy script" >&2
  failed=1
fi

if ! rg -n "minimumSourceBoundaryCount:\\s*6|minimumSourceBoundaryCount:\\s*5" \
  apps/api/scripts/check-tomtom-regional-health.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: regional health must require the full configured TomTom source boundary count" >&2
  failed=1
fi

if ! rg -n "ensureLocalityMarkets:\\s*false" \
  apps/api/src/modules/autocomplete/autocomplete.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: request-time autocomplete must not bootstrap locality markets" >&2
  failed=1
fi

if ! rg -n "ensureLocalityMarkets:\\s*false" \
  apps/api/src/modules/polls/polls.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: passive poll reads must not bootstrap locality markets" >&2
  failed=1
fi

if rg -n "for \\(const anchor of anchors\\)" \
  apps/api/src/modules/markets/market-registry.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: viewport bootstrap must not loop through stale uncovered anchors in one coverage pass" >&2
  failed=1
fi

if ! rg -n "requestId," \
  apps/api/src/modules/markets/market-registry.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: locality ensure events must carry bootstrap request id when available" >&2
  failed=1
fi

if ! rg -n '"source_boundary_provider" IS NULL|missing_source_boundary_identity' \
  apps/api/prisma/migrations/20260515194500_deactivate_orphan_locality_markets/migration.sql \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: orphan locality markets without source boundary identity must be deactivated by migration" >&2
  failed=1
fi

if ! rg -n "core_markets_active_locality_source_boundary_check" \
  apps/api/prisma/migrations \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: active locality source boundary identity must be enforced by a database check constraint" >&2
  failed=1
fi

if ! rg -n "source_boundary_provider = 'tomtom'|source_boundary_type = 'Municipality'" \
  apps/api/prisma/migrations/20260515202000_market_geometry_contracts/migration.sql \
  apps/api/prisma/migrations/20260515201000_provider_neutral_regional_markets/migration.sql \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: active locality source-boundary constraint must require TomTom Municipality" >&2
  failed=1
fi

if ! rg -n "stale_regional_geometry_requires_tomtom_seed" \
  apps/api/prisma/migrations/20260515202000_market_geometry_contracts/migration.sql \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: migrated regional rows with non-TomTom geometry must be deactivated until TomTom seed runs" >&2
  failed=1
fi

if ! rg -n "core_markets_source_boundary_fkey" \
  apps/api/prisma/migrations \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: active locality source boundary identity must reference geo_boundary_features" >&2
  failed=1
fi

if ! rg -n "bootstrapNextUncoveredBoundaryCandidate" \
  apps/api/src/modules/markets/market-registry.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: uncovered viewport bootstrap must attempt one locality then recompute coverage" >&2
  failed=1
fi

check_absent \
  "exact market membership must use geometry-index predicates, not mutable bbox correctness gates" \
  "bbox_ne_latitude\\s*>=|bbox_sw_latitude\\s*<=|bbox_ne_longitude\\s*>=|bbox_sw_longitude\\s*<=" \
  apps/api/src/modules/markets \
  apps/api/src/modules/search

if ! rg -n "resolveOrEnsureLocalityForActiveIntent" \
  apps/api/src/modules/markets/market-registry.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: active no-market point intent must still be able to create locality scope" >&2
  failed=1
fi

check_absent \
  "uncovered viewport bootstrap must not ensure a stale batch of candidates" \
  "for \\(const candidate of uncoveredBoundaries\\)" \
  apps/api/src/modules/markets/market-registry.service.ts

if ! rg -n "attempt_index|uncovered_area_meters|uncovered_area_share|candidate_name|stop_reason" \
  apps/api/prisma/migrations/20260515200000_view_events_and_bootstrap_observability/migration.sql \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: bootstrap events must carry attempt diagnostics" >&2
  failed=1
fi

if ! rg -n "bootstrap_attempted|bootstrap_succeeded|bootstrap_skipped|bootstrap_stopped" \
  apps/api/src/modules/markets/tomtom-boundary-bootstrap.service.ts \
  apps/api/src/modules/markets/market-registry.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: bootstrap lifecycle events must expose attempted/succeeded/skipped/stopped states" >&2
  failed=1
fi

if ! rg -n "tomtom_config_missing|eventType: 'error'" \
  apps/api/src/modules/markets/tomtom-boundary-bootstrap.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: missing TomTom API key must record an explicit error, not no_boundary" >&2
  failed=1
fi

if ! rg -n "TOMTOM_API_KEY_DEV|TOMTOM_API_KEY_PROD" \
  scripts/tomtom-market-deploy-gate.sh \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: TomTom deploy gate must accept scoped TOMTOM_API_KEY_DEV/PROD like app config and seed" >&2
  failed=1
fi

if ! rg -n "load_api_env_var APP_ENV|load_api_env_var CRAVE_ENV" \
  scripts/tomtom-market-deploy-gate.sh \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: TomTom deploy gate must load app env scope from apps/api/.env before choosing scoped secrets" >&2
  failed=1
fi

app_env_load_line="$(rg -n "load_api_env_var APP_ENV" scripts/tomtom-market-deploy-gate.sh | head -1 | cut -d: -f1 || true)"
crave_env_load_line="$(rg -n "load_api_env_var CRAVE_ENV" scripts/tomtom-market-deploy-gate.sh | head -1 | cut -d: -f1 || true)"
scoped_key_line="$(rg -n "TOMTOM_SCOPED_KEY=\"\\$\\{TOMTOM_API_KEY_(PROD|DEV)" scripts/tomtom-market-deploy-gate.sh | head -1 | cut -d: -f1 || true)"
if [[ -z "$app_env_load_line" || -z "$crave_env_load_line" || -z "$scoped_key_line" ]] \
  || (( app_env_load_line >= scoped_key_line )) \
  || (( crave_env_load_line >= scoped_key_line )); then
  echo "tomtom-market-cutover-delete-gate: TomTom deploy gate must load APP_ENV/CRAVE_ENV before selecting TOMTOM_SCOPED_KEY" >&2
  failed=1
fi

if rg -n "db:migrate:deploy" apps/api/.env.example >/tmp/tomtom-market-delete-gate.out; then
  cat /tmp/tomtom-market-delete-gate.out >&2
  echo "tomtom-market-cutover-delete-gate: deployment docs must route migrations through tomtom-market:deploy-gate" >&2
  failed=1
fi

if ! rg -n "normalized === 'prod' \\|\\| normalized === 'production'|isProductionAppEnv" \
  apps/api/src/config/configuration.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: app config must treat APP_ENV=production as production for scoped TomTom secrets" >&2
  failed=1
fi

if ! rg -n "before migrations when regional market seed repair may be needed" \
  scripts/tomtom-market-deploy-gate.sh \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: deploy gate must verify seed repair credentials before migrations can deactivate regional markets" >&2
  failed=1
fi

if ! rg -n "sourceBoundaryFeatureCount|geo_boundary_features feature|WHERE boundary\\.\"sourceProvider\" = 'tomtom'" \
  apps/api/scripts/check-tomtom-regional-health.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: regional health must verify metadata source boundaries against TomTom geo_boundary_features rows" >&2
  failed=1
fi

if ! rg -n "sourceBoundaryFeatureCount\\) !==|metadata does not match valid TomTom boundary rows" \
  apps/api/scripts/check-tomtom-regional-health.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: regional health must require every sourceBoundary metadata entry to match a valid TomTom feature row" >&2
  failed=1
fi

check_absent \
  "TomTom docs/runtime must use the implemented invalid_boundary event name" \
  "invalid_geometry" \
  plans/tomtom-market-cutover-plan.md \
  apps/api/src/modules/markets

if ! rg -n "market_bootstrap_events_total|market_bootstrap_duration_seconds" \
  apps/api/src/modules/markets/market-bootstrap-metrics.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: bootstrap lifecycle must expose Prometheus counters and duration metrics" >&2
  failed=1
fi

if ! rg -n "eventType: 'locality_market_ensured'" \
  apps/api/src/modules/markets/tomtom-boundary-bootstrap.service.ts \
  >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: ensured locality market bootstrap events must be included in lifecycle metrics" >&2
  failed=1
fi

if ! rg -n "tomtom-market:health|tomtom:regional-health" package.json apps/api/package.json >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: deploy cutover must expose a regional TomTom seed health check" >&2
  failed=1
fi

if ! rg -n "tomtom-market:deploy-gate|tomtom:deploy-gate" package.json apps/api/package.json >/dev/null; then
  echo "tomtom-market-cutover-delete-gate: production deploy must expose migrate + TomTom seed + health gate" >&2
  failed=1
fi

# WAVE-6 item 10 (2026-07-22): validate-tomtom-market-fixtures.ts + the
# tomtom:fixtures / tomtom-market:fixtures scripts are DELETED (they gated
# nothing in CI; the markets machinery is on the survivor-ledger kill path).

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "tomtom-market-cutover-delete-gate: ok"
