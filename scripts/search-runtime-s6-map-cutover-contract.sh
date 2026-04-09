#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/index.tsx"
COMPOSITION_TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/hooks/use-search-runtime-composition.ts"
MAPBOX_BOOTSTRAP_TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/hooks/use-search-mapbox-bootstrap.ts"
MAP_MOVEMENT_TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/hooks/use-search-map-movement-state.ts"
MAP_INTERACTION_TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/runtime/map/map-interaction-controller.ts"
PRESENTATION_TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/runtime/map/map-presentation-controller.ts"
HARNESS_TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/runtime/telemetry/shortcut-harness-observer.ts"
MAP_QUERY_TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/runtime/map/map-viewport-query.ts"
BOUNDS_SERVICE_TARGET="$REPO_ROOT/apps/mobile/src/screens/Search/runtime/viewport/viewport-bounds-service.ts"

for target in \
  "$ROOT_TARGET" \
  "$COMPOSITION_TARGET" \
  "$MAPBOX_BOOTSTRAP_TARGET" \
  "$MAP_MOVEMENT_TARGET" \
  "$MAP_INTERACTION_TARGET" \
  "$PRESENTATION_TARGET" \
  "$HARNESS_TARGET" \
  "$MAP_QUERY_TARGET" \
  "$BOUNDS_SERVICE_TARGET"; do
  if [[ ! -f "$target" ]]; then
    echo "[s6-map-cutover-contract] FAIL: target file not found: $target" >&2
    exit 1
  fi
done

failures=0
checks=0

require_pattern() {
  local target="$1"
  local pattern="$2"
  local description="$3"
  checks=$((checks + 1))
  if rg -n --pcre2 "$pattern" "$target" >/dev/null; then
    echo "[s6-map-cutover-contract] PASS: $description"
  else
    echo "[s6-map-cutover-contract] FAIL: $description" >&2
    failures=$((failures + 1))
  fi
}

forbid_pattern() {
  local target="$1"
  local pattern="$2"
  local description="$3"
  checks=$((checks + 1))
  if rg -n --pcre2 "$pattern" "$target" >/dev/null; then
    echo "[s6-map-cutover-contract] FAIL: $description" >&2
    rg -n --pcre2 "$pattern" "$target" >&2 || true
    failures=$((failures + 1))
  else
    echo "[s6-map-cutover-contract] PASS: $description"
  fi
}

require_pattern "$PRESENTATION_TARGET" "createMapViewportQueryService" \
  "Map presentation owner imports runtime map viewport query service."
require_pattern "$PRESENTATION_TARGET" "queryVisibleCandidates\\(" \
  "Map presentation owner resolves candidates through map viewport query service."
require_pattern "$COMPOSITION_TARGET" "createViewportBoundsService" \
  "Runtime composition imports viewport bounds service."
require_pattern "$MAPBOX_BOOTSTRAP_TARGET" "viewportBoundsService\\.setBounds\\(" \
  "Startup Mapbox bootstrap delegates initial bounds to viewport bounds service."
require_pattern "$MAP_MOVEMENT_TARGET" "viewportBoundsService\\.setBounds\\(" \
  "Map movement state delegates viewport bounds updates to viewport bounds service."
require_pattern "$MAP_INTERACTION_TARGET" "viewportBoundsService\\.setBounds\\(" \
  "Map interaction controller delegates settled viewport bounds updates to viewport bounds service."
forbid_pattern "$ROOT_TARGET" "viewportBoundsService\\.setBounds\\(" \
  "Root shell no longer writes viewport bounds directly."
require_pattern "$HARNESS_TARGET" "event: 'shortcut_loop_run_complete'" \
  "Shortcut harness completion event exists."
require_pattern "$HARNESS_TARGET" "mapRuntime: mapRuntimeSnapshot" \
  "Shortcut harness completion emits map runtime metrics."

forbid_pattern "$ROOT_TARGET" "markerCatalogEntries\\.filter\\(" \
  "Root no longer full-scans markerCatalogEntries for viewport candidateing."
forbid_pattern "$ROOT_TARGET" "return markerCatalogEntries;" \
  "Legacy full-catalog fallback return path is removed."

require_pattern "$MAP_QUERY_TARGET" "class MapViewportQueryService" \
  "Map viewport query service is implemented."
require_pattern "$MAP_QUERY_TARGET" "MapSpatialIndex" \
  "Map viewport query service uses spatial index owner."
require_pattern "$BOUNDS_SERVICE_TARGET" "class ViewportBoundsService" \
  "Viewport bounds service owner is implemented."

if [[ "$checks" -eq 0 ]]; then
  echo "[s6-map-cutover-contract] FAIL: no checks executed." >&2
  exit 1
fi

if [[ "$failures" -gt 0 ]]; then
  echo "[s6-map-cutover-contract] FAILED ($failures/$checks checks)." >&2
  exit 1
fi

echo "[s6-map-cutover-contract] OK ($checks checks)."
