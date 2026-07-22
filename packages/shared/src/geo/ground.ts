/**
 * Real-ground polygon math (plans/geo-demand-foundation-rebuild.md §2.5 —
 * POLYGON-NATIVE HEADER LAW, ratified 2026-07-22).
 *
 * §2.5(c): POLYGON = TRUTH, BBOX = INDEX ONLY. Wherever a place's real ground
 * (its boundary polygon) is known, coverage judgments clip the polygon to the
 * view; the bbox exists only to FIND candidates (DB prefilter, sliding-slice
 * membership), never to judge them. This file is the pure clip/area kernel
 * both runtimes share — no IO, no vendor shapes, no Prisma.
 *
 * Representation — `PlaceGround` is a lean "GeoJSON-ish" MultiPolygon: an
 * array of OUTER RINGS, each ring an array of [lng, lat] positions
 * (number[][][]). Holes are deliberately DROPPED at serve time: an
 * administrative boundary's hole is another place's ground, and counting a
 * hole as coverage over-states by a bounded sliver while keeping the wire
 * lean and the math one-signed. MultiPolygon coverage = the SUM of its
 * parts' clipped areas (§2.5: "MultiPolygon = sum of parts").
 *
 * Wrap-awareness (R1, same law as place-geo): ring coordinates are assumed
 * NON-crossing in [-180, 180] — vendors ship seam-straddling ground as
 * separate MultiPolygon parts on each side of the antimeridian. A CROSSING
 * VIEW splits into its two non-crossing lng arcs (exactly like
 * bboxIntersectionParts) and each part clips independently; the true clipped
 * area is the sum.
 *
 * Metric: areas are shoelace degrees² × cos(mid-latitude) — the SAME
 * first-order equal-area weighting bboxArea uses, so polygon coverage ratios
 * and bbox coverage ratios (the honest fallback, §2.5(f)) live on one scale.
 * Clipped areas weight by the CLIP RECT's mid-latitude so the ratio against
 * bboxArea(view) is metric-consistent at the 2/3 boundary.
 */
import { GeoBbox, GeoPoint, bboxCenter, bboxLngArcs } from './place-geo';

/**
 * Outer rings of a place's boundary, [lng, lat] positions per vertex.
 * Rings need not be explicitly closed (first vertex repeated); the math
 * treats the last→first edge as implicit.
 */
export type PlaceGround = number[][][];

/** Unsigned shoelace area of one ring, in raw degrees² (no cos weighting). */
export function ringShoelaceArea(ring: number[][]): number {
  if (ring.length < 3) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** cos(midLat) equal-area weight for a lat interval (clamped at the poles). */
function cosWeight(minLat: number, maxLat: number): number {
  const midLat = (minLat + maxLat) / 2;
  return Math.max(0, Math.cos((midLat * Math.PI) / 180));
}

/**
 * Total real-ground area in the shared cos-weighted degrees² metric —
 * §2.5's "finest" ranking key when ground is known (smaller area = finer
 * place). Each ring weights by its OWN lat extent so a multi-part country
 * (Alaska + CONUS) sums sanely.
 */
export function groundArea(ground: PlaceGround): number {
  let total = 0;
  for (const ring of ground) {
    if (ring.length < 3) continue;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    total += ringShoelaceArea(ring) * cosWeight(minLat, maxLat);
  }
  return total;
}

/**
 * Sutherland–Hodgman: clip one ring to a NON-crossing rect (the view part).
 * Returns the clipped ring's vertices ([] when the ring misses the rect).
 */
export function clipRingToRect(ring: number[][], rect: GeoBbox): number[][] {
  type Edge = {
    inside: (p: number[]) => boolean;
    intersect: (a: number[], b: number[]) => number[];
  };
  const atLng = (a: number[], b: number[], lng: number): number[] => {
    const t = (lng - a[0]) / (b[0] - a[0]);
    return [lng, a[1] + t * (b[1] - a[1])];
  };
  const atLat = (a: number[], b: number[], lat: number): number[] => {
    const t = (lat - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), lat];
  };
  const edges: Edge[] = [
    { inside: (p) => p[0] >= rect.minLng, intersect: (a, b) => atLng(a, b, rect.minLng) },
    { inside: (p) => p[0] <= rect.maxLng, intersect: (a, b) => atLng(a, b, rect.maxLng) },
    { inside: (p) => p[1] >= rect.minLat, intersect: (a, b) => atLat(a, b, rect.minLat) },
    { inside: (p) => p[1] <= rect.maxLat, intersect: (a, b) => atLat(a, b, rect.maxLat) },
  ];
  let output = ring;
  for (const edge of edges) {
    if (output.length === 0) {
      return [];
    }
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const currentInside = edge.inside(current);
      const previousInside = edge.inside(previous);
      if (currentInside) {
        if (!previousInside) {
          output.push(edge.intersect(previous, current));
        }
        output.push(current);
      } else if (previousInside) {
        output.push(edge.intersect(previous, current));
      }
    }
  }
  return output;
}

/** Ray-cast point-in-ground (any outer ring contains the point). */
export function groundContainsPoint(ground: PlaceGround, point: GeoPoint): boolean {
  for (const ring of ground) {
    if (ring.length < 3) continue;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const crosses =
        yi > point.lat !== yj > point.lat &&
        point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
      if (crosses) {
        inside = !inside;
      }
    }
    if (inside) {
      return true;
    }
  }
  return false;
}

/**
 * §2.5 coverage law: area(real ground ∩ view) / area(view), wrap-aware.
 * A crossing view splits into its non-crossing lng-arc rects (like
 * bboxIntersectionParts) and the clipped areas sum. A zero-area (point)
 * view degenerates to point-in-ground (coverage 1 when the ground admits
 * the point — the same convention as the bbox arm's degenerate case).
 * Result is clamped to [0, 1]: MultiPolygon parts never overlap in honest
 * vendor data, but a clamp keeps a sloppy simplification from judging > 1.
 */
export function groundCoverageOfView(view: GeoBbox, viewArea: number, ground: PlaceGround): number {
  if (viewArea <= 0) {
    return groundContainsPoint(ground, bboxCenter(view)) ? 1 : 0;
  }
  let clipped = 0;
  for (const arc of bboxLngArcs(view)) {
    const rect: GeoBbox = {
      minLat: view.minLat,
      maxLat: view.maxLat,
      minLng: arc.start,
      maxLng: arc.end,
    };
    const weight = cosWeight(rect.minLat, rect.maxLat);
    for (const ring of ground) {
      const clippedRing = clipRingToRect(ring, rect);
      clipped += ringShoelaceArea(clippedRing) * weight;
    }
  }
  return Math.min(1, clipped / viewArea);
}
