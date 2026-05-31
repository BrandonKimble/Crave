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

describe('buildMarkerRenderModel — stable membership (the mass-demotion / jitter invariants)', () => {
  // A scenario where the promoted set starts as the top-`maxPins` of the pool
  // (everything visible), then visibility changes. These are the twist/pan frames.
  const arbStableStart = fc
    .record({
      poolSize: fc.integer({ min: 1, max: 60 }),
      maxPins: fc.integer({ min: 1, max: 30 }),
    })
    .map(({ poolSize, maxPins }) => {
      const pool = Array.from({ length: poolSize }, (_unused, index) => makeMarker(index));
      const allVisible = new Set(keysOf(pool));
      const initial = select({
        rankedCandidates: pool,
        currentPinnedMarkers: [],
        visibleKeys: allVisible,
        maxPins,
      });
      return { pool, maxPins, initialPinned: initial.nextPinnedMarkers };
    });

  it('pure off-screen scroll (no new marker enters) never demotes a pin — the twist bug', () => {
    fc.assert(
      fc.property(
        arbStableStart,
        fc.array(fc.boolean(), { minLength: 0, maxLength: 60 }),
        ({ maxPins, initialPinned }, visibleSeed) => {
          // Model a twist/pan where markers leave the screen but NONE new enter:
          // the visible set is a subset of the currently-promoted pins. The
          // universe (current pins ∪ fresh-in-view) is then just the pins, which
          // fits the budget, so retention must keep every one. The pre-fix code
          // recomputed membership against the shrunken visible set and collapsed
          // the whole promoted set here — the mass-demotion bug.
          const visibleKeys = new Set(
            initialPinned.filter((_f, index) => visibleSeed[index] ?? false).map(buildMarkerKey)
          );
          const next = select({
            rankedCandidates: initialPinned, // no markers beyond the current pins enter view
            currentPinnedMarkers: initialPinned,
            visibleKeys,
            maxPins,
          });
          const nextSet = new Set(keysOf(next.nextPinnedMarkers));
          for (const key of keysOf(initialPinned)) {
            expect(nextSet.has(key)).toBe(true);
          }
        }
      )
    );
  });

  it('no demotion whenever there is room: |current pins ∪ fresh-in-view| ≤ maxPins', () => {
    fc.assert(
      fc.property(
        arbScenario,
        fc.array(fc.boolean(), { minLength: 0, maxLength: 80 }),
        ({ pool, maxPins, visibleKeys }, pinnedSeed) => {
          // Arbitrary starting pins (≤ maxPins) + arbitrary visible set.
          const currentPinnedMarkers = pool
            .filter((_f, index) => pinnedSeed[index] ?? false)
            .slice(0, maxPins);
          const pinnedKeys = new Set(keysOf(currentPinnedMarkers));
          const freshInView = pool.filter(
            (f) => visibleKeys.has(buildMarkerKey(f)) && !pinnedKeys.has(buildMarkerKey(f))
          );
          const universeSize = pinnedKeys.size + freshInView.length;
          // Only assert when there is genuinely room (no contention for slots).
          fc.pre(universeSize <= maxPins);
          const result = select({
            rankedCandidates: pool,
            currentPinnedMarkers,
            visibleKeys,
            maxPins,
          });
          const nextSet = new Set(keysOf(result.nextPinnedMarkers));
          for (const key of pinnedKeys) {
            expect(nextSet.has(key)).toBe(true);
          }
        }
      )
    );
  });

  it('over a SEQUENCE of pure scroll frames, the promoted set stays invariant (no collapse/oscillation)', () => {
    fc.assert(
      fc.property(
        arbStableStart,
        fc.array(fc.array(fc.boolean(), { minLength: 0, maxLength: 60 }), {
          minLength: 1,
          maxLength: 12,
        }),
        ({ maxPins, initialPinned }, frames) => {
          const initialSet = new Set(keysOf(initialPinned));
          let currentPinnedMarkers = initialPinned;
          for (const visibleSeed of frames) {
            // Each frame: only currently-promoted markers move in/out of view, no
            // new markers enter. The promoted set must stay exactly the initial
            // set across the whole gesture — any drop-then-recover is flicker.
            const visibleKeys = new Set(
              currentPinnedMarkers
                .filter((_f, index) => visibleSeed[index] ?? false)
                .map(buildMarkerKey)
            );
            const result = select({
              rankedCandidates: currentPinnedMarkers,
              currentPinnedMarkers,
              visibleKeys,
              maxPins,
            });
            const set = new Set(keysOf(result.nextPinnedMarkers));
            expect(set.size).toBe(initialSet.size);
            for (const key of initialSet) {
              expect(set.has(key)).toBe(true);
            }
            currentPinnedMarkers = result.nextPinnedMarkers;
          }
        }
      )
    );
  });
});

describe('buildMarkerRenderModel — in-view priority is the intended contract', () => {
  // Locks the design decision (confirmed): when slots are full, an on-screen
  // marker takes priority over an off-screen pin EVEN IF the off-screen pin is
  // higher-ranked. Off-screen pins keep only otherwise-empty slots.
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
