import { create } from 'zustand';

import type { FeatureCollection, Point } from 'geojson';

import { scoreBadgeImageId } from '../utils/quality-color';

// ---------------------------------------------------------------------------
// SCALE-PROBE STORE — the feature-count degradation harness (#21).
//
// Mounts N synthetic pin features into ONE resident symbol layer
// (icon-allow-overlap + ignore-placement + viewport-y) so we can measure how
// Mapbox fps degrades purely as a function of feature-count in a single layer —
// the open question for "can we go uncapped/everything-resident like Google".
// Slot-elimination already proved that layer-COUNT hurts; this isolates the
// FEATURE-count axis with the cheapest possible layer topology.
//
// Deterministic generation (no Math.random — banned in this codebase and we want
// identical geometry across runs). Points lay out on a jittered square grid
// centered on the probe origin, each carrying a real pre-baked score sprite so
// the icon-image atlas churn matches production.
// ---------------------------------------------------------------------------

export type ScaleProbeState = {
  markerCount: number;
  centerLng: number;
  centerLat: number;
  spreadDeg: number;
  // When true the probe layer uses allowOverlap:false (full collision) so most
  // densely-overlapping symbols are draw-culled — this measures the "load many, show
  // only the non-colliding subset" approach. When false it uses allowOverlap:true +
  // ignorePlacement:true (collision off, every symbol drawn — the in-view pin case).
  collide: boolean;
  generation: number;
  setProbe: (input: {
    count: number;
    lng: number;
    lat: number;
    spreadDeg?: number;
    collide?: boolean;
  }) => void;
  clearProbe: () => void;
};

export const SCALE_PROBE_MAX_MARKERS = 120000;
const DEFAULT_SPREAD_DEG = 0.18; // ~roughly a metro-sized scatter at z11–12.

export const usePerfScaleProbeStore = create<ScaleProbeState>((set) => ({
  markerCount: 0,
  centerLng: 0,
  centerLat: 0,
  spreadDeg: DEFAULT_SPREAD_DEG,
  collide: false,
  generation: 0,
  setProbe: ({ count, lng, lat, spreadDeg, collide }) =>
    set((state) => ({
      markerCount: Math.max(0, Math.min(SCALE_PROBE_MAX_MARKERS, Math.round(count))),
      centerLng: lng,
      centerLat: lat,
      spreadDeg: spreadDeg != null && spreadDeg > 0 ? spreadDeg : DEFAULT_SPREAD_DEG,
      collide: collide === true,
      generation: state.generation + 1,
    })),
  clearProbe: () =>
    set((state) => ({ markerCount: 0, generation: state.generation + 1 })),
}));

// Cheap deterministic hash → [0,1) for per-index jitter (no Math.random).
const hash01 = (seed: number): number => {
  let x = (seed * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = (x * 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
};

export type ScaleProbeFeatureProperties = {
  badgeImageId: string;
  craveScore: number;
  scaleProbe: true;
};

export const generateScaleProbeFeatures = (
  count: number,
  centerLng: number,
  centerLat: number,
  spreadDeg: number
): FeatureCollection<Point, ScaleProbeFeatureProperties> => {
  const features: FeatureCollection<Point, ScaleProbeFeatureProperties>['features'] = [];
  if (count <= 0) {
    return { type: 'FeatureCollection', features };
  }
  const perSide = Math.max(1, Math.ceil(Math.sqrt(count)));
  const step = spreadDeg / perSide;
  const half = spreadDeg / 2;
  const lngScale = 1 / Math.max(0.25, Math.cos((centerLat * Math.PI) / 180));
  for (let i = 0; i < count; i += 1) {
    const col = i % perSide;
    const row = Math.floor(i / perSide);
    const jitterLng = (hash01(i * 2 + 1) - 0.5) * step;
    const jitterLat = (hash01(i * 2 + 2) - 0.5) * step;
    const lng = centerLng + (-half + col * step + jitterLng) * lngScale;
    const lat = centerLat + (-half + row * step + jitterLat);
    // Cycle the full displayed 0–10 score range so icon-image variety matches prod
    // (exercises all 10 tiers: integer decile from i, plus a sub-tier fractional spread).
    const score = (i % 10) + ((i * 0.137) % 1);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        badgeImageId: scoreBadgeImageId(score),
        craveScore: score,
        scaleProbe: true,
      },
    });
  }
  return { type: 'FeatureCollection', features };
};
