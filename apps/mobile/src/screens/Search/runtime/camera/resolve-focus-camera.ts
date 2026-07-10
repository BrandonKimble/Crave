// World-camera L2 (plans/world-camera-multilocation-foundation.md §3.2/§3.3) — the PURE
// focus-fit: center the anchor, grow a radius greedily over the distance-sorted siblings
// until the next sibling is an outlier (median-ratio cut), fit that radius into the safe
// region, clamp to a city-scale zoom floor and to "never zoom IN to show context". No React,
// no map SDK, golden-testable like the LodEngine.
//
// P5 (the ONE anchor rule) deliberately does NOT live here — it ALREADY exists, battle-tested
// with the primary tiebreak, as resolveRestaurantLocationSelectionAnchorFromBounds +
// pickClosestLocationToCenter (runtime/map/restaurant-location-selection.ts). The caller
// resolves the anchor with that pair and passes it in; duplicating the rule here was caught
// and reverted pre-integration (2026-07-10).
//
// The tunables live in ONE table below. Lists deliberately do NOT use this — fitAll is exact
// by owner decree ("no exceptions").

export type FocusCameraLocation = {
  locationId: string;
  latitude: number;
  longitude: number;
};

/** The map area available for the fit (between the search bar and the mid-snap sheet top),
 *  in PIXELS, plus the total map height the zoom math is relative to. */
export type FocusCameraSafeRegion = {
  widthPx: number;
  heightPx: number;
  /** Full map viewport height in px — zoom resolution is per-full-viewport. */
  mapHeightPx: number;
};

export type FocusCameraResult = {
  center: { latitude: number; longitude: number };
  zoom: number;
  /** How many of the group's locations the fit includes (anchor + non-outlier siblings). */
  includedCount: number;
};

export const FOCUS_CAMERA_TUNABLES = {
  /** Siblings within this distance always join the cluster, median-ratio notwithstanding. */
  dFloorMeters: 2_000,
  /** Greedy growth admits ds[k] while ds[k] <= max(D_FLOOR, ALPHA * median(ds[1..k])). */
  alpha: 2.75,
  /** Never more zoomed-out than "city scale" (~25–30km span). */
  zCityFloor: 9.5,
  /** Padding factor applied to the fitted radius so pins don't touch the region edge. */
  fitPaddingFactor: 1.2,
} as const;

const EARTH_RADIUS_M = 6_371_000;
/** Web-mercator: meters per pixel at zoom z, latitude φ (256px tiles). */
const metersPerPixel = (latitude: number, zoom: number): number =>
  (Math.cos((latitude * Math.PI) / 180) * 2 * Math.PI * EARTH_RADIUS_M) / (256 * 2 ** zoom);

export const haversineDistanceMeters = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, s)));
};

/** §3.3 — anchored robust-cluster focus fit. */
export const resolveFocusCamera = ({
  locations,
  anchorLocationId,
  safeRegion,
  currentZoom,
  tunables = FOCUS_CAMERA_TUNABLES,
}: {
  locations: readonly FocusCameraLocation[];
  /** Resolved by the caller via THE P5 pair (restaurant-location-selection.ts). */
  anchorLocationId: string;
  safeRegion: FocusCameraSafeRegion;
  currentZoom: number;
  tunables?: typeof FOCUS_CAMERA_TUNABLES;
}): FocusCameraResult => {
  const anchor = locations.find((location) => location.locationId === anchorLocationId);
  if (anchor == null) {
    throw new Error('[FOCUS-CAMERA] anchorLocationId must reference a catalog location');
  }
  const siblingDistances = locations
    .filter((location) => location.locationId !== anchor.locationId)
    .map((location) => haversineDistanceMeters(anchor, location))
    .sort((left, right) => left - right);

  // Greedy cluster growth with the robust outlier cut (§3.3): admit ds[k] while
  // ds[k] <= max(D_FLOOR, ALPHA * median(ds[1..k])) — the median INCLUDES the candidate
  // (self-median), so a lone first sibling is always admitted and uniform sprawl grows to
  // the floor clamp, while one cross-market outlier against a tight cluster is cut.
  const admitted: number[] = [];
  for (const distance of siblingDistances) {
    const candidateSet = [...admitted, distance];
    const median = candidateSet[Math.floor((candidateSet.length - 1) / 2)];
    if (distance <= Math.max(tunables.dFloorMeters, tunables.alpha * median)) {
      admitted.push(distance);
    } else {
      break; // sorted ascending — everything after is at least as far
    }
  }
  const radiusMeters = admitted.length === 0 ? 0 : admitted[admitted.length - 1];

  // Fit the radius into the safe region: find the zoom where 2r (padded) spans the smaller
  // safe dimension. Zoom is monotonic in metersPerPixel, so solve directly.
  let zoom = currentZoom;
  if (radiusMeters > 0) {
    const fitSpanPx = Math.min(safeRegion.widthPx, safeRegion.heightPx);
    const requiredMetersPerPixel = (2 * radiusMeters * tunables.fitPaddingFactor) / fitSpanPx;
    // metersPerPixel(lat, z) = C / 2^z  ⇒  z = log2(C / requiredMpp)
    const c = metersPerPixel(anchor.latitude, 0);
    zoom = Math.log2(c / requiredMetersPerPixel);
  }
  // Clamp: never below city scale, never zoom IN to show context (center only).
  zoom = Math.max(tunables.zCityFloor, Math.min(zoom, currentZoom));

  return {
    center: { latitude: anchor.latitude, longitude: anchor.longitude },
    zoom,
    includedCount: admitted.length + 1,
  };
};
