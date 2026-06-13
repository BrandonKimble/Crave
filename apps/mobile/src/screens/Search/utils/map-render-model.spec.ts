import fc from 'fast-check';

import type { MapBounds } from '../../../types';

import { buildMarkerRenderModel, type MarkerFeature } from './map-render-model';

/**
 * Property-based tests for the LOD promotion/demotion DECISION layer.
 *
 * `buildMarkerRenderModel` is a pure function: given the candidate catalog, the
 * currently-promoted set, and which markers are visible, it decides the next
 * promoted set. Every bug we have chased on the map (mass-demotion on twist,
 * oscillation, wrong top-N) is a property of THIS function — not of the renderer.
 * So we assert those properties directly here, in Node, in milliseconds, over
 * thousands of randomized scenarios. No simulator, no native build, no Maestro.
 *
 * Visibility is driven through `nativeVisibleMarkerKeys` (the Stage B screen-space
 * set). When that is provided the geo-bounds path is bypassed, so these tests are
 * decoupled from projection math and can model "what's on screen" exactly.
 */

type Props = { restaurantId: string; rank: number; nativeLodZ?: number; lodZ?: number };

// Visibility is supplied explicitly via nativeVisibleMarkerKeys in every test, so
// the bounds value is irrelevant — any valid box works.
const DUMMY_BOUNDS: MapBounds = {
  southWest: { lat: 0, lng: 0 },
  northEast: { lat: 1, lng: 1 },
};

const makeMarker = (rank: number): MarkerFeature<Props> => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [0.5, 0.5] },
  properties: { restaurantId: `r${rank}`, rank },
});

const buildMarkerKey = (feature: MarkerFeature<Props>): string => feature.properties.restaurantId;
// One restaurant == one visual identity in these tests (no multi-location dedup).
const buildVisualIdentityKey = (feature: MarkerFeature<Props>): string =>
  feature.properties.restaurantId;

const keysOf = (features: ReadonlyArray<MarkerFeature<Props>>): string[] =>
  features.map((feature) => feature.properties.restaurantId);

const select = (args: {
  rankedCandidates: Array<MarkerFeature<Props>>;
  currentPinnedMarkers: Array<MarkerFeature<Props>>;
  visibleKeys: ReadonlySet<string>;
  maxPins: number;
}) =>
  buildMarkerRenderModel<Props>({
    bounds: DUMMY_BOUNDS,
    rankedCandidates: args.rankedCandidates,
    selectedRestaurantCandidates: [],
    currentPinnedMarkers: args.currentPinnedMarkers,
    selectedRestaurantId: null,
    selectedPriorityCoordinate: null,
    buildMarkerKey,
    buildVisualIdentityKey,
    maxPins: args.maxPins,
    nativeVisibleMarkerKeys: args.visibleKeys,
  });

/**
 * Generates a scenario: a pool of `poolSize` markers (ranks 0..poolSize-1, rank 0
 * == best), a `maxPins` budget, and a visible subset expressed as marker keys.
 */
const arbScenario = fc
  .record({
    poolSize: fc.integer({ min: 0, max: 80 }),
    maxPins: fc.integer({ min: 1, max: 30 }),
    visibleSeed: fc.array(fc.boolean(), { minLength: 0, maxLength: 80 }),
  })
  .map(({ poolSize, maxPins, visibleSeed }) => {
    const pool = Array.from({ length: poolSize }, (_unused, index) => makeMarker(index));
    const visibleKeys = new Set<string>(
      pool.filter((_feature, index) => visibleSeed[index] ?? false).map(buildMarkerKey)
    );
    return { pool, maxPins, visibleKeys };
  });

const topByRankAmong = (
  pool: ReadonlyArray<MarkerFeature<Props>>,
  visibleKeys: ReadonlySet<string>,
  maxPins: number
): string[] =>
  pool
    .filter((feature) => visibleKeys.has(buildMarkerKey(feature)))
    .slice() // ranks already ascending == best-first
    .sort((left, right) => left.properties.rank - right.properties.rank)
    .slice(0, maxPins)
    .map(buildMarkerKey);

describe('buildMarkerRenderModel — single-frame invariants', () => {
  it('never promotes more than the budget, and never more than what is visible', () => {
    fc.assert(
      fc.property(arbScenario, ({ pool, maxPins, visibleKeys }) => {
        const result = select({
          rankedCandidates: pool,
          currentPinnedMarkers: [],
          visibleKeys,
          maxPins,
        });
        const promoted = keysOf(result.nextPinnedMarkers);
        expect(promoted.length).toBeLessThanOrEqual(maxPins);
        expect(promoted.length).toBeLessThanOrEqual(visibleKeys.size);
      })
    );
  });

  it('never promotes the same visual identity twice', () => {
    fc.assert(
      fc.property(arbScenario, ({ pool, maxPins, visibleKeys }) => {
        const result = select({
          rankedCandidates: pool,
          currentPinnedMarkers: [],
          visibleKeys,
          maxPins,
        });
        const promoted = keysOf(result.nextPinnedMarkers);
        expect(new Set(promoted).size).toBe(promoted.length);
      })
    );
  });

  it('from a clean frame, promotes exactly the top-N visible by rank', () => {
    fc.assert(
      fc.property(arbScenario, ({ pool, maxPins, visibleKeys }) => {
        const result = select({
          rankedCandidates: pool,
          currentPinnedMarkers: [],
          visibleKeys,
          maxPins,
        });
        const promoted = new Set(keysOf(result.nextPinnedMarkers));
        const expected = topByRankAmong(pool, visibleKeys, maxPins);
        // With no prior pins and no selection, the promoted set IS the top-N visible.
        expect(promoted.size).toBe(expected.length);
        for (const key of expected) {
          expect(promoted.has(key)).toBe(true);
        }
      })
    );
  });

  it('from a clean frame, only promotes visible markers', () => {
    fc.assert(
      fc.property(arbScenario, ({ pool, maxPins, visibleKeys }) => {
        const result = select({
          rankedCandidates: pool,
          currentPinnedMarkers: [],
          visibleKeys,
          maxPins,
        });
        for (const key of keysOf(result.nextPinnedMarkers)) {
          expect(visibleKeys.has(key)).toBe(true);
        }
      })
    );
  });
});

describe('buildMarkerRenderModel — v4 visibility-gated promotion (no off-view retention)', () => {
  // v4 invariant (plans/map-lod-ideal-model-v4.md): promotion is STRICTLY
  // visibility-gated. A pin that leaves the projected visible set demotes
  // immediately — its slot frees for whoever is on screen. Edge stability is the
  // native projector's spatial enter/exit hysteresis (it keeps a marker in the
  // visible SET until it is genuinely off-screen), NOT decision-layer off-view
  // retention. So the promoted set is always a subset of the visible set, and the
  // old "a scrolled-off pin stays promoted" behavior is intentionally gone — it was
  // what let stale off-screen pins hold every budget slot and starve visible
  // candidates (the out-region score-pin starvation).
  const arbStableStart = fc
    .record({
      poolSize: fc.integer({ min: 1, max: 60 }),
      maxPins: fc.integer({ min: 1, max: 30 }),
    })
    .map(({ poolSize, maxPins }) => {
      const pool = Array.from({ length: poolSize }, (_unused, index) => makeMarker(index));
      return { pool, maxPins };
    });

  it('never promotes a marker that is not visible', () => {
    fc.assert(
      fc.property(
        arbScenario,
        fc.array(fc.boolean(), { minLength: 0, maxLength: 80 }),
        ({ pool, maxPins, visibleKeys }, pinnedSeed) => {
          // Arbitrary starting pins (some may be off-screen) + arbitrary visible set.
          // No off-screen pin may survive into the next promoted set.
          const currentPinnedMarkers = pool
            .filter((_f, index) => pinnedSeed[index] ?? false)
            .slice(0, maxPins);
          const result = select({
            rankedCandidates: pool,
            currentPinnedMarkers,
            visibleKeys,
            maxPins,
          });
          for (const key of keysOf(result.nextPinnedMarkers)) {
            expect(visibleKeys.has(key)).toBe(true);
          }
        }
      )
    );
  });

  it('a still-visible pin is never demoted when there is room (no contention)', () => {
    fc.assert(
      fc.property(
        arbScenario,
        fc.array(fc.boolean(), { minLength: 0, maxLength: 80 }),
        ({ pool, maxPins, visibleKeys }, pinnedSeed) => {
          const currentPinnedMarkers = pool
            .filter((_f, index) => pinnedSeed[index] ?? false)
            .slice(0, maxPins);
          // Only the VISIBLE current pins are eligible to stay (v4: off-view demotes).
          const visibleCurrentKeys = new Set(
            keysOf(currentPinnedMarkers).filter((key) => visibleKeys.has(key))
          );
          const freshVisible = pool.filter(
            (f) => visibleKeys.has(buildMarkerKey(f)) && !visibleCurrentKeys.has(buildMarkerKey(f))
          );
          // Room for everyone visible → no contention → every visible pin retained.
          fc.pre(visibleCurrentKeys.size + freshVisible.length <= maxPins);
          const result = select({
            rankedCandidates: pool,
            currentPinnedMarkers,
            visibleKeys,
            maxPins,
          });
          const nextSet = new Set(keysOf(result.nextPinnedMarkers));
          for (const key of visibleCurrentKeys) {
            expect(nextSet.has(key)).toBe(true);
          }
        }
      )
    );
  });

  it('over a SEQUENCE of scroll frames, the promoted set is exactly the top-N visible (resident candidates, no collapse, no off-view hold)', () => {
    fc.assert(
      fc.property(
        arbStableStart,
        fc.array(fc.array(fc.boolean(), { minLength: 0, maxLength: 60 }), {
          minLength: 1,
          maxLength: 12,
        }),
        ({ pool, maxPins }, frames) => {
          // Resident model: ALL candidates always exist; only visibility changes per
          // frame. The promoted set each frame must be exactly the top-min(|visible|,
          // maxPins) by rank, contain nothing off-screen, and a marker that left and
          // returns must re-promote — driven purely by the per-frame visible set, with
          // no dependence on what was promoted last frame (no oscillation, no hold).
          let currentPinnedMarkers: Array<MarkerFeature<Props>> = [];
          for (const visibleSeed of frames) {
            const visibleKeys = new Set(
              pool.filter((_f, index) => visibleSeed[index] ?? false).map(buildMarkerKey)
            );
            const result = select({
              rankedCandidates: pool,
              currentPinnedMarkers,
              visibleKeys,
              maxPins,
            });
            const set = new Set(keysOf(result.nextPinnedMarkers));
            // pool is rank-ordered, so filter(visible).slice(0,maxPins) == top-N visible.
            const expectedTopVisible = pool
              .filter((f) => visibleKeys.has(buildMarkerKey(f)))
              .slice(0, maxPins);
            expect(set.size).toBe(expectedTopVisible.length);
            for (const feature of expectedTopVisible) {
              expect(set.has(buildMarkerKey(feature))).toBe(true);
            }
            for (const key of set) {
              expect(visibleKeys.has(key)).toBe(true);
            }
            currentPinnedMarkers = result.nextPinnedMarkers;
          }
        }
      )
    );
  });
});

describe('buildMarkerRenderModel — in-view priority is the intended contract', () => {
  // Locks the v4 decision: promotion is visibility-gated. An on-screen marker takes
  // a slot over an off-screen pin EVEN IF the off-screen pin is higher-ranked,
  // because the off-screen pin is demoted outright (it keeps NO slot) — only
  // on-screen markers compete for the budget.
  it('a fresh on-screen marker claims a full slot from a higher-ranked off-screen pin', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (maxPins) => {
        const pinned = Array.from({ length: maxPins }, (_unused, index) => makeMarker(index));
        const fresh = makeMarker(maxPins); // worst rank, NOT currently pinned
        const pool = [...pinned, fresh];
        const offScreenPin = pinned[0]; // the BEST-ranked pin scrolls off-screen
        const visibleKeys = new Set(
          pool.filter((feature) => feature !== offScreenPin).map(buildMarkerKey)
        );
        const result = select({
          rankedCandidates: pool,
          currentPinnedMarkers: pinned,
          visibleKeys,
          maxPins,
        });
        const promoted = new Set(keysOf(result.nextPinnedMarkers));
        expect(promoted.has(buildMarkerKey(fresh))).toBe(true); // on-screen wins the slot
        expect(promoted.has(buildMarkerKey(offScreenPin))).toBe(false); // off-screen yields
        expect(promoted.size).toBe(maxPins);
      })
    );
  });
});

describe('buildMarkerRenderModel — selected restaurant is always pinned', () => {
  it('promotes the selected restaurant regardless of rank or visibility', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 60 }),
        fc.boolean(),
        (maxPins, poolSize, selectedVisible) => {
          const pool = Array.from({ length: poolSize }, (_unused, index) => makeMarker(index));
          const selected = pool[pool.length - 1]; // worst-ranked: would never be a normal pin
          const selectedId = selected.properties.restaurantId;
          const visibleKeys = new Set(pool.slice(0, maxPins).map(buildMarkerKey));
          if (selectedVisible) {
            visibleKeys.add(selectedId);
          }
          const result = buildMarkerRenderModel<Props>({
            bounds: DUMMY_BOUNDS,
            rankedCandidates: pool,
            selectedRestaurantCandidates: [selected],
            currentPinnedMarkers: [],
            selectedRestaurantId: selectedId,
            selectedPriorityCoordinate: null,
            buildMarkerKey,
            buildVisualIdentityKey,
            maxPins,
            nativeVisibleMarkerKeys: visibleKeys,
          });
          expect(new Set(keysOf(result.nextPinnedMarkers)).has(selectedId)).toBe(true);
        }
      )
    );
  });
});

describe('buildMarkerRenderModel — slot (z) assignment stability', () => {
  const arbStableStartForSlots = fc
    .record({
      poolSize: fc.integer({ min: 1, max: 60 }),
      maxPins: fc.integer({ min: 1, max: 30 }),
    })
    .map(({ poolSize, maxPins }) => {
      const pool = Array.from({ length: poolSize }, (_unused, index) => makeMarker(index));
      const initial = select({
        rankedCandidates: pool,
        currentPinnedMarkers: [],
        visibleKeys: new Set(keysOf(pool)),
        maxPins,
      });
      return { maxPins, initialPinned: initial.nextPinnedMarkers };
    });

  it('assigns unique, in-bounds slots and preserves a retained marker’s slot across frames', () => {
    fc.assert(
      fc.property(
        arbStableStartForSlots,
        fc.array(fc.boolean(), { minLength: 0, maxLength: 60 }),
        ({ maxPins, initialPinned }, visibleSeed) => {
          const visibleKeys = new Set(
            initialPinned.filter((_f, index) => visibleSeed[index] ?? false).map(buildMarkerKey)
          );
          const result = select({
            rankedCandidates: initialPinned, // pure scroll, no new markers
            currentPinnedMarkers: initialPinned,
            visibleKeys,
            maxPins,
          });
          const slots = result.nextPinnedMeta.map((meta) => meta.lodZ);
          // Slots are unique and within [0, capacity).
          expect(new Set(slots).size).toBe(slots.length);
          const capacity = Math.max(maxPins, result.nextPinnedMarkers.length);
          for (const slot of slots) {
            expect(slot).toBeGreaterThanOrEqual(0);
            expect(slot).toBeLessThan(capacity);
          }
          // A marker retained from the previous frame keeps its exact slot — this
          // is what stops pins visually hopping slots / z-order during a gesture.
          const previousSlotByKey = new Map(
            initialPinned.map((feature) => [buildMarkerKey(feature), feature.properties.lodZ])
          );
          for (const meta of result.nextPinnedMeta) {
            const previousSlot = previousSlotByKey.get(meta.markerKey);
            if (previousSlot != null) {
              expect(meta.lodZ).toBe(previousSlot);
            }
          }
        }
      )
    );
  });
});

describe('buildMarkerRenderModel — contention still demotes (policy is not degenerate)', () => {
  it('higher-ranked fresh markers displace lower-ranked pins when slots are contended', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 25 }), (maxPins) => {
        // Pool of 2*maxPins. Start with the WORST maxPins promoted (ranks
        // maxPins..2maxPins-1), then reveal everything: the best maxPins are
        // fresh in-view and must take the slots.
        const pool = Array.from({ length: maxPins * 2 }, (_unused, index) => makeMarker(index));
        const worstHalf = pool.slice(maxPins);
        const result = select({
          rankedCandidates: pool,
          currentPinnedMarkers: worstHalf,
          visibleKeys: new Set(keysOf(pool)),
          maxPins,
        });
        const promoted = new Set(keysOf(result.nextPinnedMarkers));
        const expectedTop = pool.slice(0, maxPins).map(buildMarkerKey);
        // Under genuine contention the better-ranked markers win the slots.
        expect(promoted.size).toBe(maxPins);
        for (const key of expectedTop) {
          expect(promoted.has(key)).toBe(true);
        }
      })
    );
  });
});
