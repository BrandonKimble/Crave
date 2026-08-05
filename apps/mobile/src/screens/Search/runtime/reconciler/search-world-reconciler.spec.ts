(globalThis as { __DEV__?: boolean }).__DEV__ = false;
jest.mock('../../../../utils', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  classifySearchWorldTransition,
  deriveToggleKindFromDesiredDelta,
} from './search-world-reconciler';
import {
  buildSearchWorldSliceKey,
  IDLE_SEARCH_DESIRED_TUPLE,
  type SearchDesiredTuple,
} from '../shared/search-desired-state-contract';

const idle = IDLE_SEARCH_DESIRED_TUPLE;
const shortcut = (overrides: Partial<SearchDesiredTuple> = {}): SearchDesiredTuple => ({
  ...idle,
  queryIdentity: { kind: 'shortcut', shortcutTab: 'restaurants' },
  tab: 'restaurants',
  ...overrides,
});

describe('classifySearchWorldTransition', () => {
  it('idle → shortcut is a session_enter with home surface and no sheet preserve', () => {
    const t = classifySearchWorldTransition({
      prev: idle,
      next: shortcut(),
      presentedCardsKey: null,
    });
    expect(t.class).toBe('session_enter');
    expect(t.intent).toEqual({
      presentationIntentKind: undefined,
      preserveSheetState: false,
      entrySurface: 'home',
    });
  });

  it('idle → LIST is a session_enter that PRESERVES the sheet (world presents into the pushed child)', () => {
    // Wave-4 §3: a list enter never takes over the results scene — preserveSheetState=true
    // nulls the target snap in resolveSearchSurfaceResultsSheetTargetSnap even from idle.
    const t = classifySearchWorldTransition({
      prev: idle,
      next: shortcut({
        queryIdentity: {
          kind: 'list',
          listId: 'list-1',
          listType: 'restaurant',
          displayTitle: 'Taco crawl',
        },
      }),
      presentedCardsKey: null,
    });
    expect(t.class).toBe('session_enter');
    expect(t.intent?.preserveSheetState).toBe(true);
  });

  it('in-session swap to a LIST also preserves the sheet', () => {
    const t = classifySearchWorldTransition({
      prev: shortcut(),
      next: shortcut({
        queryIdentity: {
          kind: 'list',
          listId: 'list-1',
          listType: 'dish',
          displayTitle: 'Best queso',
        },
      }),
      presentedCardsKey: 'anything',
    });
    expect(t.class).toBe('session_replace');
    expect(t.intent?.preserveSheetState).toBe(true);
  });

  it('shortcut → natural is a session_replace that keeps the sheet', () => {
    const t = classifySearchWorldTransition({
      prev: shortcut(),
      next: shortcut({ queryIdentity: { kind: 'natural', query: 'pizza' } }),
      presentedCardsKey: 'anything',
    });
    expect(t.class).toBe('session_replace');
    expect(t.intent?.preserveSheetState).toBe(true);
    expect(t.intent?.entrySurface).toBe('search_mode');
  });

  it('a LENS delta (with co-changed bounds — the chip adopt) is a lens_flip, never a session event (M-1)', () => {
    const prev = shortcut();
    const next = shortcut({
      filterVariant: { ...prev.filterVariant, openNow: true },
      committedBounds: {
        bounds: {
          northEast: { lat: 1, lng: 1 },
          southWest: { lat: 0, lng: 0 },
        },
        viewportPolygon: null,
        camera: null,
      },
    });
    const t = classifySearchWorldTransition({ prev, next, presentedCardsKey: null });
    expect(t.class).toBe('lens_flip');
    expect(t.intent?.presentationIntentKind).toBe('variant_rerun');
  });

  it('an includeSimilar delta is an IDENTITY revise (variant_rerun) — the axis split', () => {
    const prev = shortcut();
    const next = shortcut({
      filterVariant: { ...prev.filterVariant, includeSimilar: true },
    });
    const t = classifySearchWorldTransition({ prev, next, presentedCardsKey: null });
    expect(t.class).toBe('variant_rerun');
  });

  it('a lens flip mid-flight back to the presented SLICE is a retoggle_reversal (slice-granular)', () => {
    // open ON then OFF while ON is still resolving: the OFF desire equals the slice on
    // screen — a reversal at slice granularity, proving presented keys are slice keys.
    const presented = shortcut();
    const t = classifySearchWorldTransition({
      prev: shortcut({ filterVariant: { ...presented.filterVariant, openNow: true } }),
      next: presented,
      presentedCardsKey: buildSearchWorldSliceKey(presented),
    });
    expect(t.class).toBe('retoggle_reversal');
  });

  it('bounds-only delta is an area_rerun (search-this-area)', () => {
    const prev = shortcut();
    const next = shortcut({
      committedBounds: {
        bounds: { northEast: { lat: 2, lng: 2 }, southWest: { lat: 1, lng: 1 } },
        viewportPolygon: null,
        camera: null,
      },
    });
    const t = classifySearchWorldTransition({ prev, next, presentedCardsKey: null });
    expect(t.class).toBe('area_rerun');
    expect(t.intent?.presentationIntentKind).toBe('search_this_area');
  });

  it('tab-only delta is a tab_switch', () => {
    const t = classifySearchWorldTransition({
      prev: shortcut(),
      next: shortcut({ tab: 'dishes' }),
      presentedCardsKey: null,
    });
    expect(t.class).toBe('tab_switch');
  });

  it('a filter flip BACK to the presented world is a retoggle_reversal, not a rerun', () => {
    const presented = shortcut();
    const away = shortcut({
      filterVariant: { ...presented.filterVariant, openNow: true },
    });
    const t = classifySearchWorldTransition({
      prev: away,
      next: presented,
      presentedCardsKey: buildSearchWorldSliceKey(presented),
    });
    expect(t.class).toBe('retoggle_reversal');
    expect(t.intent).toBeNull();
  });

  it('non-idle → idle is a session_exit', () => {
    const t = classifySearchWorldTransition({
      prev: shortcut(),
      next: idle,
      presentedCardsKey: null,
    });
    expect(t.class).toBe('session_exit');
  });

  it('idle → idle, no presented world, is a boot_noop', () => {
    const t = classifySearchWorldTransition({
      prev: idle,
      next: idle,
      presentedCardsKey: null,
    });
    expect(t.class).toBe('boot_noop');
    expect(t.intent).toBeNull();
  });

  it('an equal-tuple write whose desire is NOT what is presented is a reassert_unresolved (the retry path) — RERUNS IN PLACE when something was presented', () => {
    // F1079: the retry path is the ONE branch that decides in-place rerun vs. fresh
    // re-entry (:174-181) — presentedCardsKey != null means SOMETHING is on screen, so
    // the reassert reruns it rather than re-entering as a bare session.
    const tuple = shortcut();
    const t = classifySearchWorldTransition({
      prev: tuple,
      next: tuple,
      presentedCardsKey: 'some-other-world-key',
    });
    expect(t.class).toBe('reassert_unresolved');
    expect(t.intent).toEqual({
      presentationIntentKind: 'variant_rerun',
      preserveSheetState: true,
      entrySurface: 'results',
    });
  });

  it('an equal-tuple write with NOTHING presented is a reassert_unresolved that RE-ENTERS as a bare session', () => {
    const tuple = shortcut();
    const t = classifySearchWorldTransition({
      prev: tuple,
      next: tuple,
      presentedCardsKey: null,
    });
    expect(t.class).toBe('reassert_unresolved');
    expect(t.intent).toEqual({
      presentationIntentKind: undefined,
      preserveSheetState: false,
      entrySurface: 'home',
    });
  });
});

describe('deriveToggleKindFromDesiredDelta (F1074 — a bounds-only reversal must not be labeled filter_price)', () => {
  it('MUTATION PROOF: a bounds-only delta (identical filterVariant) derives search_this_area, never the filter_price default', () => {
    // This is exactly the retoggle_reversal shape F1074 found: cardsKey is
    // bounds-inclusive, so an A→B→A pan-back reaches the toggle-kind derivation with
    // prev.filterVariant === next.filterVariant field-for-field. Reverting the fix (make
    // the function's terminal arm an unconditional `return 'filter_price'`, as it used to
    // be) turns this RED.
    const prev = shortcut({
      committedBounds: {
        bounds: { northEast: { lat: 1, lng: 1 }, southWest: { lat: 0, lng: 0 } },
        viewportPolygon: null,
        camera: null,
      },
    });
    const next = shortcut({
      committedBounds: {
        bounds: { northEast: { lat: 2, lng: 2 }, southWest: { lat: 1, lng: 1 } },
        viewportPolygon: null,
        camera: null,
      },
    });
    expect(next.filterVariant).toEqual(prev.filterVariant);
    expect(deriveToggleKindFromDesiredDelta(prev, next)).toBe('search_this_area');
  });

  it('an actual price-levels delta still derives filter_price (the explicit arm, not the old default)', () => {
    const prev = shortcut();
    const next = shortcut({ filterVariant: { ...prev.filterVariant, priceLevels: [1, 2] } });
    expect(deriveToggleKindFromDesiredDelta(prev, next)).toBe('filter_price');
  });

  it('an openNow delta still derives filter_open_now (unaffected by the rederive)', () => {
    const prev = shortcut();
    const next = shortcut({ filterVariant: { ...prev.filterVariant, openNow: true } });
    expect(deriveToggleKindFromDesiredDelta(prev, next)).toBe('filter_open_now');
  });
});

describe('dietary walls ride the chip lane with their OWN identity', () => {
  const withDietary = (dietary: string[]): SearchDesiredTuple =>
    shortcut({ filterVariant: { ...idle.filterVariant, dietary } });

  it('a dietary flip is a LENS_FLIP — same world, new slice (never a new session)', () => {
    const t = classifySearchWorldTransition({
      prev: shortcut(),
      next: withDietary(['vegan']),
      presentedCardsKey: null,
    });
    expect(t.class).toBe('lens_flip');
  });

  it('the slice key separates dietary sets, so a flip can never serve the cached slice', () => {
    expect(buildSearchWorldSliceKey(withDietary(['vegan']))).not.toEqual(
      buildSearchWorldSliceKey(withDietary(['vegetarian']))
    );
    // …and order does not (a SET, not a list)
    expect(buildSearchWorldSliceKey(withDietary(['vegan', 'halal']))).toEqual(
      buildSearchWorldSliceKey(withDietary(['halal', 'vegan']))
    );
  });

  it('a dietary flip is NOT a reversal onto the presented world', () => {
    const presented = buildSearchWorldSliceKey(shortcut());
    const t = classifySearchWorldTransition({
      prev: shortcut(),
      next: withDietary(['vegan']),
      presentedCardsKey: presented,
    });
    expect(t.class).toBe('lens_flip');
  });
});
