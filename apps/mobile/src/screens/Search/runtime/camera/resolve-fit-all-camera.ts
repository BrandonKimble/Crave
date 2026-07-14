// World-camera L2 — the fitAll executor for LIST worlds (leg 10 step 2;
// plans/listdetail-ideal.md §1d.4, world-camera-multilocation-foundation §2/§3.2).
//
// A list is a WORLD: `camera = fitAll(members, safeRegion)` — EXACT by owner decree ("no
// exceptions"): the bounds of ALL members fit into the safe region (the map area between
// the search bar and the mid-snap sheet top), fitPaddingFactor applied, NO outlier cut
// (the outlier cut is resolveFocusCamera's job and lists deliberately do not use it).
// Cross-market continent-zoom stays the named open owner call (world-camera §6) — this
// module fits it exactly and the zoom simply lands far out.
//
// Three pieces, world-generic and producer-agnostic (ready the moment the step-1 trigger
// rewire gives child worlds a presentation lane):
//   1. resolveWorldFitSafeRegion — the search-bar→mid-snap safe-region computer (the type
//      is FocusCameraSafeRegion + the top offset the camera padding needs).
//   2. resolveFitAllCamera — the PURE fit (mercator-correct center, per-axis zoom solve).
//      Golden-testable, no React, no map SDK.
//   3. commitFitAllCamera — the executor: math → CameraIntentArbiter.commit with the
//      safe-region padding, easeTo. Returns false when the arbiter rejects (gesture) —
//      the caller must treat an unexecuted intent as a RED bark, never silence.

import type { CameraIntent, CameraIntentArbiter } from '../map/camera-intent-arbiter';
import type { FocusCameraSafeRegion } from './resolve-focus-camera';

export type FitAllMember = {
  latitude: number;
  longitude: number;
};

/** FocusCameraSafeRegion + where the region SITS in the viewport (drives camera padding). */
export type WorldFitSafeRegion = FocusCameraSafeRegion & {
  /** Region top edge in px from the map's top (the search bar's bottom). */
  topPx: number;
  /** Full map viewport width in px. */
  mapWidthPx: number;
};

export type FitAllCameraResult = {
  center: { latitude: number; longitude: number };
  zoom: number;
  memberCount: number;
};

export type FitAllTunables = {
  /** Padding factor applied to both spans so pins don't touch the region edge. */
  fitPaddingFactor: number;
  /**
   * Zoom ceiling — a single-member (or single-block) list must not land at street level.
   * Exactness is about INCLUSION (everything visible), not about maximal magnification.
   */
  zMax: number;
};

export const FIT_ALL_TUNABLES: FitAllTunables = {
  fitPaddingFactor: 1.2,
  zMax: 15,
};

const EARTH_RADIUS_M = 6_371_000;
/** Web-mercator: meters per point at Mapbox GL zoom z, latitude φ. Mapbox GL zoom is
 *  512-tile-based (the world is 512pt wide at z0) — sim-proven 2026-07-13: a 256-based
 *  solve commands a zoom one level too high and pushes both metro clusters just
 *  off-viewport (decideZERO eligible=0). */
const metersPerPixel = (latitude: number, zoom: number): number =>
  (Math.cos((latitude * Math.PI) / 180) * 2 * Math.PI * EARTH_RADIUS_M) / (512 * 2 ** zoom);

const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
const toDeg = (radians: number): number => (radians * 180) / Math.PI;

/** Mercator-correct latitude midpoint — the bounds midline as the MAP shows it, so the
 *  fitted content is visually centered (arithmetic midpoint drifts at wide spans). */
const mercatorMidLatitude = (minLat: number, maxLat: number): number => {
  const y = (latitude: number): number => Math.log(Math.tan(Math.PI / 4 + toRad(latitude) / 2));
  const midY = (y(minLat) + y(maxLat)) / 2;
  return toDeg(2 * Math.atan(Math.exp(midY)) - Math.PI / 2);
};

/**
 * The safe-region computer (owner decree: "the map area between the search bar and the
 * mid-snap sheet top"). Inputs are the two live boundary lines the caller already knows
 * (calculateSnapPoints' expanded top = the search bar line; its middle = the mid-snap
 * top) — world-generic, no window reads in here.
 */
export const resolveWorldFitSafeRegion = ({
  mapWidthPx,
  mapHeightPx,
  searchBarBottomPx,
  sheetMiddleTopPx,
}: {
  mapWidthPx: number;
  mapHeightPx: number;
  /** Bottom edge of the search bar (px from the map top). */
  searchBarBottomPx: number;
  /** The middle snap point's top edge (px from the map top). */
  sheetMiddleTopPx: number;
}): WorldFitSafeRegion => {
  const topPx = Math.max(0, searchBarBottomPx);
  const bottomPx = Math.min(mapHeightPx, Math.max(topPx + 1, sheetMiddleTopPx));
  return {
    topPx,
    widthPx: mapWidthPx,
    heightPx: bottomPx - topPx,
    mapWidthPx,
    mapHeightPx,
  };
};

/** The PURE exact fit: bounds of ALL members into the safe region, padded, no cut. */
export const resolveFitAllCamera = ({
  members,
  safeRegion,
  tunables = FIT_ALL_TUNABLES,
}: {
  members: readonly FitAllMember[];
  safeRegion: FocusCameraSafeRegion & { widthPx: number; heightPx: number };
  tunables?: FitAllTunables;
}): FitAllCameraResult => {
  const valid = members.filter(
    (member) => Number.isFinite(member.latitude) && Number.isFinite(member.longitude)
  );
  if (valid.length === 0) {
    // RED contract: a fit over nothing is a programming error upstream, never a no-op.
    throw new Error('[FIT-ALL-CAMERA] members must contain at least one finite coordinate');
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const member of valid) {
    minLat = Math.min(minLat, member.latitude);
    maxLat = Math.max(maxLat, member.latitude);
    minLng = Math.min(minLng, member.longitude);
    maxLng = Math.max(maxLng, member.longitude);
  }

  const centerLat = mercatorMidLatitude(minLat, maxLat);
  const centerLng = (minLng + maxLng) / 2;

  // Per-axis zoom solve: span meters (through the center lines) padded, per axis pixels;
  // metersPerPixel(lat, z) = C / 2^z ⇒ z = log2(C / requiredMpp). The binding axis wins
  // (min zoom). Zero spans (single member / colinear) leave that axis unconstrained.
  const cosLat = Math.cos(toRad(centerLat));
  const latSpanMeters = (toRad(maxLat - minLat) || 0) * EARTH_RADIUS_M;
  const lngSpanMeters = (toRad(maxLng - minLng) || 0) * EARTH_RADIUS_M * cosLat;
  const c = metersPerPixel(centerLat, 0);
  const zoomForAxis = (spanMeters: number, axisPx: number): number => {
    if (spanMeters <= 0 || axisPx <= 0) {
      return Infinity;
    }
    return Math.log2(c / ((spanMeters * tunables.fitPaddingFactor) / axisPx));
  };
  const zoom = Math.min(
    tunables.zMax,
    zoomForAxis(latSpanMeters, safeRegion.heightPx),
    zoomForAxis(lngSpanMeters, safeRegion.widthPx)
  );

  return {
    center: { latitude: centerLat, longitude: centerLng },
    zoom,
    memberCount: valid.length,
  };
};

/**
 * The executor: fit + commit through the arbiter with the safe-region PADDING (the
 * camera centers the members inside the region, not the raw viewport). Returns the
 * arbiter's verdict — false = the intent did NOT execute (live gesture); per the
 * world-camera verification line the CALLER must bark on false, never swallow it.
 */
export const commitFitAllCamera = ({
  arbiter,
  members,
  safeRegion,
  animationDurationMs = 600,
  requestToken = null,
  tunables = FIT_ALL_TUNABLES,
}: {
  arbiter: Pick<CameraIntentArbiter, 'commit'>;
  members: readonly FitAllMember[];
  safeRegion: WorldFitSafeRegion;
  animationDurationMs?: number;
  requestToken?: number | null;
  tunables?: FitAllTunables;
}): boolean => {
  const fit = resolveFitAllCamera({ members, safeRegion, tunables });
  const intent: CameraIntent = {
    center: [fit.center.longitude, fit.center.latitude],
    zoom: fit.zoom,
    padding: {
      paddingTop: safeRegion.topPx,
      paddingBottom: Math.max(0, safeRegion.mapHeightPx - (safeRegion.topPx + safeRegion.heightPx)),
      paddingLeft: Math.max(0, safeRegion.mapWidthPx - safeRegion.widthPx) / 2,
      paddingRight: Math.max(0, safeRegion.mapWidthPx - safeRegion.widthPx) / 2,
    },
    animationMode: 'easeTo',
    animationDurationMs,
    requestToken,
    // Animated commits MUST defer the controlled-camera prop sync to completion —
    // an immediate sync hands the destination to the controlled Camera component,
    // which stomps the native easeTo mid-flight (the frozen-between-cities symptom).
    deferControlledCameraStateUntilCompletion: true,
  };
  return arbiter.commit(intent);
};
