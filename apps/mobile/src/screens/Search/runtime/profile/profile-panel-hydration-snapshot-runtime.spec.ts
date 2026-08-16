// F1059: crave-score PRESENCE is null-aware (F758 made `craveScore` `number | null`,
// with NULL as the one spelling of "unscored"). A real 0 is a legitimate score and must
// survive both hand-offs in this file — the seed build and the hydrate apply — which
// used to disagree (`Number.isFinite` vs `> 0`).
//
// RED RECIPE (both proved by mutation before landing):
//   1. restore `craveScore > 0` in resolveHydratedCraveScore → 'a REAL 0 on the panel
//      survives hydration' fails (Expected 0, Received 71 — the hydrated score wins).
//   2. restore the same in the seed builder → 'a REAL 0 on the seed survives the cached
//      profile' fails the same way.

import {
  applyHydratedRestaurantProfileToPanelSnapshot,
  createSeededRestaurantPanelSnapshot,
} from './profile-panel-hydration-snapshot-runtime';
import type {
  HydratedRestaurantProfile,
  RestaurantPanelSnapshot,
  RestaurantProfileSeed,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

const seed = (craveScore: number | null): RestaurantProfileSeed =>
  ({
    placeId: 'r1',
    name: 'Taqueria',
    craveScore,
    locations: [],
    displayLocation: null,
  }) as unknown as RestaurantProfileSeed;

const snapshot = (craveScore: number | null): RestaurantPanelSnapshot =>
  ({
    restaurant: seed(craveScore),
    dishes: [],
    queryLabel: 'q',
    isFavorite: false,
    isLoading: false,
  }) as unknown as RestaurantPanelSnapshot;

const hydrated = (craveScore: number | null): HydratedRestaurantProfile =>
  ({
    restaurant: seed(craveScore),
    dishes: [],
  }) as unknown as HydratedRestaurantProfile;

describe('crave-score presence is null-aware (F1059)', () => {
  it('a REAL 0 on the panel survives hydration — 0 is the worst SCORED, not unscored', () => {
    const next = applyHydratedRestaurantProfileToPanelSnapshot({
      currentSnapshot: snapshot(0),
      placeId: 'r1',
      hydratedProfile: hydrated(71),
    });
    expect(next?.restaurant.craveScore).toBe(0);
  });

  it('NULL on the panel yields to the hydrated score — absence is the only thing that yields', () => {
    const next = applyHydratedRestaurantProfileToPanelSnapshot({
      currentSnapshot: snapshot(null),
      placeId: 'r1',
      hydratedProfile: hydrated(71),
    });
    expect(next?.restaurant.craveScore).toBe(71);
  });

  it('unscored on BOTH sides stays null — never coerced to a rank (F758)', () => {
    const next = applyHydratedRestaurantProfileToPanelSnapshot({
      currentSnapshot: snapshot(null),
      placeId: 'r1',
      hydratedProfile: hydrated(null),
    });
    expect(next?.restaurant.craveScore).toBeNull();
  });

  it('a REAL 0 on the seed survives the cached profile (the sibling hand-off agrees)', () => {
    const next = createSeededRestaurantPanelSnapshot({
      currentSnapshot: null,
      restaurant: seed(0),
      queryLabel: 'q',
      cachedProfile: hydrated(71),
    });
    expect(next.restaurant.craveScore).toBe(0);
  });

  it('a NULL seed takes the cached profile score', () => {
    const next = createSeededRestaurantPanelSnapshot({
      currentSnapshot: null,
      restaurant: seed(null),
      queryLabel: 'q',
      cachedProfile: hydrated(71),
    });
    expect(next.restaurant.craveScore).toBe(71);
  });
});
