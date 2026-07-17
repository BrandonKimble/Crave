(globalThis as { __DEV__?: boolean }).__DEV__ = false;
jest.mock('../../../../utils', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { classifySearchWorldTransition } from './search-world-reconciler';
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
});
