/**
 * §2 read-time subjecthood fixtures (plans/geo-demand-foundation-rebuild.md
 * §2, §17 "subjects/header cases"): two-towns-both-subjects,
 * continental-no-subject, city+slivers→city, street-zoom descent
 * (parent/child), containing-fallback, and the probe-anchor budget.
 * All pure — the fixtures ARE the law's spec.
 */
import { GeoBbox, bboxArea } from './place-geo';
import {
  ATTENTION_FRACTION,
  MAX_PROBE_ANCHORS,
  SubjectCandidate,
  isCommensurate,
  probeAnchors,
  resolveHeaderPlace,
} from './subjects';

function candidate(
  name: string,
  bbox: GeoBbox,
  coverageOfView: number,
): SubjectCandidate {
  return { placeId: `id-${name}`, name, bbox, coverageOfView };
}

describe('resolveHeaderPlace — §2 symmetric commensurability', () => {
  it('two-towns-both-subjects: a straddle over two commensurate towns is "this area" with BOTH as subjects', () => {
    // View spans two towns, ~half each: both pass the symmetric test
    // (coverage ≥ 1/3 of view; view ≥ 1/3 of each town), neither covers.
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 2 };
    const townA = candidate(
      'Aldertown',
      { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 },
      0.5,
    );
    const townB = candidate(
      'Birchville',
      { minLat: 0, minLng: 1, maxLat: 1, maxLng: 2 },
      0.5,
    );

    const result = resolveHeaderPlace(view, [townA, townB]);

    expect(result.kind).toBe('this-area');
    if (result.kind !== 'this-area') throw new Error('unreachable');
    expect(result.reason).toBe('straddle');
    expect(result.subjects.map((subject) => subject.name).sort()).toEqual([
      'Aldertown',
      'Birchville',
    ]);
  });

  it('continental-no-subject: a continental view over city-scale places has no subject and no containing name', () => {
    // Continental view (~US extent); catalog nodes are cities — each a
    // vanishing fraction of the view (too small), none containing it.
    const view: GeoBbox = { minLat: 25, minLng: -125, maxLat: 50, maxLng: -65 };
    const austin = candidate(
      'Austin',
      { minLat: 30.1, minLng: -97.95, maxLat: 30.52, maxLng: -97.56 },
      0.0001,
    );
    const waco = candidate(
      'Waco',
      { minLat: 31.4, minLng: -97.3, maxLat: 31.7, maxLng: -97.0 },
      0.00005,
    );

    const result = resolveHeaderPlace(view, [austin, waco]);

    expect(result).toEqual({
      kind: 'this-area',
      reason: 'unnamed-ground',
      subjects: [],
    });
  });

  it('city+slivers→city: border slivers below attention never steal the header from the covering city', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const city = candidate(
      'Coreburg',
      { minLat: -0.1, minLng: -0.1, maxLat: 1.1, maxLng: 1.1 },
      1.0, // covers the whole view; view is 1/1.44 ≈ 0.69 ≥ 1/3 of the city
    );
    const sliverEast = candidate(
      'Eastfringe',
      { minLat: 0, minLng: 0.97, maxLat: 1, maxLng: 2 },
      0.03, // < 1/3 of the view → too small (§2)
    );
    const sliverNorth = candidate(
      'Northfringe',
      { minLat: 0.98, minLng: 0, maxLat: 2, maxLng: 1 },
      0.02,
    );

    const result = resolveHeaderPlace(view, [sliverEast, city, sliverNorth]);

    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Coreburg');
    expect(result.reason).toBe('commensurate');
    expect(result.subjects.map((subject) => subject.name)).toEqual([
      'Coreburg',
    ]);
  });

  it('street-zoom-inside-big-place→descend: the too-big parent loses to its commensurate child (parent/child fixture)', () => {
    // Street zoom: the view sits deep inside the city (view ≪ 1/3 of the
    // city → too big → descend the DAG, §2 "street zoom in Chongqing names
    // the ward"). The ward is commensurate and wins.
    const view: GeoBbox = {
      minLat: 0.5,
      minLng: 0.5,
      maxLat: 0.51,
      maxLng: 0.51,
    };
    const city = candidate(
      'Bigcity',
      { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 },
      1.0, // covers the view, but viewArea (1e-4) < 1/3 × cityArea (1)
    );
    const ward = candidate(
      'Old Ward',
      { minLat: 0.498, minLng: 0.498, maxLat: 0.513, maxLng: 0.513 },
      1.0, // covers the view; viewArea 1e-4 ≥ 1/3 × wardArea 2.25e-4
    );

    const result = resolveHeaderPlace(view, [city, ward]);

    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Old Ward');
    expect(result.reason).toBe('commensurate');
    // The over-scale parent is NOT a subject at this zoom.
    expect(result.subjects.map((subject) => subject.name)).toEqual([
      'Old Ward',
    ]);
  });

  it('containing-fallback: no commensurate node → smallest CONTAINING name, NOT "this area"', () => {
    // Same street zoom but the ward is un-sketched: nothing commensurate.
    // §2: fall back to the smallest containing node, even over-scale.
    const view: GeoBbox = {
      minLat: 0.5,
      minLng: 0.5,
      maxLat: 0.52,
      maxLng: 0.52,
    };
    const city = candidate(
      'Bigcity',
      { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 },
      1.0,
    );
    const county = candidate(
      'Vast County',
      { minLat: -1, minLng: -1, maxLat: 2, maxLng: 2 },
      1.0,
    );

    const result = resolveHeaderPlace(view, [county, city]);

    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.reason).toBe('containing-fallback');
    expect(result.place.name).toBe('Bigcity'); // smallest containing wins
  });

  it('boundary: coverage of exactly ATTENTION_FRACTION is commensurate (closed threshold)', () => {
    // View: 1 lat × 3 lng (area 3); the town tiles exactly a third of it.
    const town = candidate(
      'Edge Town',
      { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 },
      ATTENTION_FRACTION,
    );
    expect(isCommensurate(3, town)).toBe(true);
  });

  it('antimeridian: commensurability judges sanely for crossing views and places (Fiji)', () => {
    // Seam-straddling street-ish view inside a seam-straddling archipelago
    // bbox: the view must read as TOO SMALL relative to the big place
    // (descend), not degenerate to area 0 / coverage 1 for everything.
    const view: GeoBbox = {
      minLat: -19,
      minLng: 178,
      maxLat: -17,
      maxLng: -179,
    };
    const viewArea = bboxArea(view); // 3° lng × 2° lat, wrap-aware
    const archipelago = candidate(
      'Fiji',
      { minLat: -21, minLng: 176, maxLat: -12, maxLng: -178 },
      1.0, // covers the view…
    );
    expect(isCommensurate(viewArea, archipelago)).toBe(false); // …but too big

    const island = candidate(
      'Taveuni',
      { minLat: -19.5, minLng: 177, maxLat: -16.5, maxLng: -179 },
      1.0, // covers the view; 4°×3° vs the 3°×2° view → commensurate
    );
    expect(isCommensurate(viewArea, island)).toBe(true);
  });
});

describe('probeAnchors — §2 probe budget', () => {
  const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };

  it('budget: never more than 3 anchors, center first, on wholly unknown ground', () => {
    const anchors = probeAnchors(view, []);
    expect(MAX_PROBE_ANCHORS).toBe(3);
    expect(anchors).toHaveLength(3);
    expect(anchors[0]).toEqual({ lat: 0.5, lng: 0.5 }); // center leads
    for (const anchor of anchors) {
      expect(anchor.lat).toBeGreaterThanOrEqual(0);
      expect(anchor.lat).toBeLessThanOrEqual(1);
      expect(anchor.lng).toBeGreaterThanOrEqual(0);
      expect(anchor.lng).toBeLessThanOrEqual(1);
    }
  });

  it('a view fully answered by a COMMENSURATE place needs no probes at all', () => {
    // 1.7×1.7 bbox over the 1×1 view: covering, and not too-big (area 2.89 ≤
    // 3 × viewArea) — it legitimately answers every anchor.
    const anchors = probeAnchors(view, [
      { minLat: -0.35, minLng: -0.35, maxLat: 1.35, maxLng: 1.35 },
    ]);
    expect(anchors).toEqual([]);
  });

  it('known commensurate bboxes suppress their anchors; only unanswered ground is probed', () => {
    // Commensurate-scale bbox over the left ~0.6 of the view → all anchors
    // land in the unanswered right side.
    const anchors = probeAnchors(view, [
      { minLat: -0.1, minLng: -0.1, maxLat: 1.1, maxLng: 0.6 },
    ]);
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.length).toBeLessThanOrEqual(3);
    for (const anchor of anchors) {
      expect(anchor.lng).toBeGreaterThan(0.6);
    }
  });

  it('scale law (§1/§2): over-scale known ground answers NOTHING — country+city sketched, street zoom still probes', () => {
    // The permanent-starvation defect: once "United States" (or the city) is
    // sketched with a bbox, point-in-bbox marked every future anchor inside
    // it answered forever, so neighborhoods could never enter lazily and the
    // Chongqing street-zoom descent starved. The answered test is now
    // scale-aware: both sketched regions are too-big for this view, so the
    // full anchor budget still probes.
    const streetView: GeoBbox = {
      minLat: 0.5,
      minLng: 0.5,
      maxLat: 0.502,
      maxLng: 0.502,
    };
    const city: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const country: GeoBbox = {
      minLat: -30,
      minLng: -30,
      maxLat: 30,
      maxLng: 30,
    };
    const anchors = probeAnchors(streetView, [city, country]);
    expect(anchors).toHaveLength(MAX_PROBE_ANCHORS);
    // A commensurate neighborhood over the same ground DOES answer
    // (0.003° square: area 9e-6 ≤ 3 × the view's 4e-6 → not too-big).
    const ward: GeoBbox = {
      minLat: 0.4995,
      minLng: 0.4995,
      maxLat: 0.5025,
      maxLng: 0.5025,
    };
    expect(probeAnchors(streetView, [city, country, ward])).toEqual([]);
  });
});
