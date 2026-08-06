/**
 * EQUIVALENCE + SUBSCRIPTION SPEC for the *-patch-runtime collapse (F1012, final cluster).
 *
 * Sixteen patch hooks — the ten-file hydration chain and the six-file scene-bus chain —
 * are inlined into their terminal consumers:
 *
 *   use-search-root-search-scene-list-hydration-publication-runtime.ts (six-field patch)
 *   use-search-root-search-scene-bus-publication-runtime.ts            (five-field patch)
 *
 * This spec pins:
 *   1. FIELD WIRING by source path for both patches (a rewired or dropped field fails);
 *   2. FRESH-IDENTITY-PER-RENDER for both composed patches — the old spread chains minted a
 *      new object every render, and the downstream publish effects depend on that identity,
 *      so a "helpful" memoization of the composition would CHANGE publish frequency (memoizing
 *      the patch makes this assertion fail);
 *   3. THE F1032/F1732 STARVATION CASE: `listPreparedRowsReady` used to be an unsubscribed
 *      render-time sample of the surface authority, refreshed only because the same publish
 *      happens to re-render the chain through the surface-transaction commit cascade. The
 *      collapse converts it to a key-scoped subscription. The proof: publishing a preparedRows
 *      flip must ITSELF schedule a re-render of the hydration publication hook (harness
 *      dirtyCount rises), and the next render must publish `listPreparedRowsReady: true`.
 *      Re-implementing the read as `authority.getSnapshot()` (the pre-collapse shape) keeps
 *      dirtyCount at 0 — RED. Proven RED before landing.
 *   4. a STABLE HOOK SEQUENCE across renders (F1013): the harness throws on any change of
 *      hook count or order, so completing the spec is itself the proof.
 */
import { createReactHookHarnessModuleMock, mountHook } from './spec-support/react-hook-harness';

jest.mock('react', () => createReactHookHarnessModuleMock());

const hydrationPublicationCalls: Array<{
  activeTab: string;
  searchSceneListHydrationPatch: Record<string, unknown>;
}> = [];

jest.mock('./use-results-presentation-surface-hydration-publication-runtime', () => ({
  useResultsPresentationSurfaceHydrationPublicationRuntime: (args: {
    activeTab: string;
    searchSceneListHydrationPatch: Record<string, unknown>;
  }) => {
    hydrationPublicationCalls.push(args);
  },
}));

const busPublishEffectCalls: Array<{
  searchRuntimeBus: unknown;
  searchRouteSceneBusPatch: Record<string, unknown>;
}> = [];

jest.mock('./use-search-root-search-scene-bus-publish-effect-runtime', () => ({
  useSearchRootSearchSceneBusPublishEffectRuntime: (args: {
    searchRuntimeBus: unknown;
    searchRouteSceneBusPatch: Record<string, unknown>;
  }) => {
    busPublishEffectCalls.push(args);
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { ResultsPresentationSurfaceAuthority } = require('./results-presentation-surface-authority');
const {
  useSearchRootSearchSceneListHydrationPublicationRuntime,
} = require('./use-search-root-search-scene-list-hydration-publication-runtime');
const {
  useSearchRootSearchSceneBusPublicationRuntime,
} = require('./use-search-root-search-scene-bus-publication-runtime');
/* eslint-enable @typescript-eslint/no-var-requires */

describe('useSearchRootSearchSceneListHydrationPublicationRuntime patch collapse', () => {
  beforeEach(() => {
    hydrationPublicationCalls.length = 0;
  });

  const createHarness = () => {
    const authority = new ResultsPresentationSurfaceAuthority();
    const args = {
      activeTab: 'dishes' as const,
      resultsPresentationSurfaceAuthority: authority,
      routeSceneSwitchAuthority: {} as never,
      searchInteractionRef: { current: {} } as never,
      hydrationKeyRuntime: {
        resultsIdentityKey: 'identity-1' as string | null,
        hydratedResultsKey: 'hydrated-1' as string | null,
      } as never,
      resultsReadModelSelectors: {
        isResultsHydrationSettled: false,
      } as never,
    };
    const harness = mountHook(() => useSearchRootSearchSceneListHydrationPublicationRuntime(args));
    return { authority, args, harness };
  };

  const latestPatch = () =>
    hydrationPublicationCalls[hydrationPublicationCalls.length - 1].searchSceneListHydrationPatch;

  it('wires every patch field from its pre-collapse source path', () => {
    const { harness } = createHarness();
    harness.render();
    expect(latestPatch()).toEqual({
      resultsIdentityKey: 'identity-1',
      hydratedResultsKey: 'hydrated-1',
      resultsPreparedRowsKey: 'identity-1',
      listPreparedRowsReady: false,
      shouldHydrateResultsForRender: false,
      isResultsHydrationSettled: false,
    });
  });

  it('keeps the patch a fresh identity every render (the publish-per-render contract)', () => {
    const { harness } = createHarness();
    harness.render();
    harness.render();
    const [first, second] = hydrationPublicationCalls.map(
      (call) => call.searchSceneListHydrationPatch
    );
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it('SUBSCRIBES to preparedRows: a readiness flip schedules its own re-render and the next publish carries listPreparedRowsReady=true (F1032/F1732 starvation case)', () => {
    const { authority, harness } = createHarness();
    harness.render();
    expect(latestPatch().listPreparedRowsReady).toBe(false);
    const dirtyBefore = harness.dirtyCount();

    authority.publishPreparedRows({
      targetResultsIdentityKey: 'identity-1',
      readyResultsIdentityKey: 'identity-1',
      activeRowCount: 12,
    });

    // The flip itself must notify this hook's subscription. An unsubscribed
    // getSnapshot() sample (the pre-collapse shape) leaves dirtyCount unchanged — RED.
    expect(harness.dirtyCount()).toBeGreaterThan(dirtyBefore);

    harness.render();
    expect(latestPatch().listPreparedRowsReady).toBe(true);
  });

  it('does not report readiness for a mismatched prepared-rows key', () => {
    const { authority, harness } = createHarness();
    harness.render();
    authority.publishPreparedRows({
      targetResultsIdentityKey: 'identity-OTHER',
      readyResultsIdentityKey: 'identity-OTHER',
      activeRowCount: 3,
    });
    harness.render();
    expect(latestPatch().listPreparedRowsReady).toBe(false);
  });

  it('keeps a stable hook sequence across renders (F1013)', () => {
    const { authority, harness } = createHarness();
    harness.render();
    const sequence = [...harness.hookSequence()];
    authority.publishPreparedRows({
      targetResultsIdentityKey: 'identity-1',
      readyResultsIdentityKey: 'identity-1',
      activeRowCount: 1,
    });
    harness.render();
    // NON-EMPTY FIRST (F2072 family): `toEqual(sequence)` compares the recorder
    // against itself — two empty arrays are equal, so a collapse that removed
    // every hook read green on the very contract meant to catch it.
    expect(sequence.length).toBeGreaterThan(0);
    expect(harness.hookSequence()).toEqual(sequence);
  });
});

describe('useSearchRootSearchSceneBusPublicationRuntime patch collapse', () => {
  beforeEach(() => {
    busPublishEffectCalls.length = 0;
  });

  const createArgs = () => ({
    sessionCoreLane: { searchRuntimeBus: { bus: 'bus-v1' } } as never,
    filterModalControlLane: {
      filterModalRuntime: {
        priceButtonLabelText: '$$',
        priceButtonIsActive: true,
        isPriceSelectorVisible: false,
        isSortSelectorVisible: true,
      },
    } as never,
    foregroundInteractionControlLane: {
      foregroundInteractionRuntime: {
        shouldRetrySearchOnReconnect: true,
      },
    } as never,
  });

  it('wires every bus patch field from its pre-collapse source path and forwards the bus', () => {
    const args = createArgs();
    const harness = mountHook(() => useSearchRootSearchSceneBusPublicationRuntime(args));
    harness.render();
    const call = busPublishEffectCalls[busPublishEffectCalls.length - 1];
    expect(call.searchRuntimeBus).toBe(
      (args.sessionCoreLane as { searchRuntimeBus: unknown }).searchRuntimeBus
    );
    expect(call.searchRouteSceneBusPatch).toEqual({
      priceButtonLabelText: '$$',
      priceButtonIsActive: true,
      isPriceSelectorVisible: false,
      isSortSelectorVisible: true,
      shouldRetrySearchOnReconnect: true,
    });
  });

  it('keeps the bus patch a fresh identity every render (the publish-per-render contract)', () => {
    const args = createArgs();
    const harness = mountHook(() => useSearchRootSearchSceneBusPublicationRuntime(args));
    harness.render();
    harness.render();
    const [first, second] = busPublishEffectCalls.map((call) => call.searchRouteSceneBusPatch);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});
