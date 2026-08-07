/**
 * EQUIVALENCE + HOOK-ORDER SPEC for the *-ports submit collapse (F1012, ports cluster;
 * triage F1720, executed here).
 *
 * The ten one-useMemo repacker hooks of the submit ports family
 * (`use-search-root-submit-{runtime-bus,runtime-request,runtime-core,runtime,ui-history,
 * ui-surface,ui-results,ui-search,ui-presentation,ui}-ports.ts`, one consumer each) were
 * inlined into `use-search-root-submit-control-runtime.ts` as per-port `React.useMemo`
 * literals with EXPLICIT field lists (F1668: spreads bypass excess-property checking).
 * The three load-bearing files survive as hooks and are mounted REAL here:
 * viewport-ports (ref + effect ownership), ui-presentation-intent-ports and
 * ui-results-presentation-ports (derivation branches).
 *
 * Pins, same trio as the F1719 lane-collapse spec:
 *   1. every uiPorts/runtimePorts field wired from its original source path;
 *   2. per-port memo IDENTITY independence — changing one source re-mints only the
 *      ports that read it (a merged single-memo re-implementation fails this);
 *   3. a STABLE HOOK SEQUENCE across hit and miss renders (F1013): the harness throws
 *      on any count/order change, so completing a render pair is itself the proof.
 */
import { createReactHookHarnessModuleMock, mountHook } from './spec-support/react-hook-harness';

jest.mock('react', () => createReactHookHarnessModuleMock());
jest.mock('react-native', () => ({
  Dimensions: { get: () => ({ width: 400, height: 800 }) },
}));

const submitOwnerCalls: unknown[] = [];
const submitOwnerResult = { result: 'submit-owner-v1' };
jest.mock('../../hooks/use-search-submit-owner', () => ({
  __esModule: true,
  default: (args: unknown) => {
    submitOwnerCalls.push(args);
    return submitOwnerResult;
  },
}));

const readModel = { submittedQuery: 'ramen', query: 'ra', isLoadingMore: false };
jest.mock('./use-search-root-submit-read-model', () => ({
  useSearchRootSubmitReadModel: () => readModel,
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { useSearchRootSubmitControlRuntime } = require('./use-search-root-submit-control-runtime');
/* eslint-enable @typescript-eslint/no-var-requires */

type OwnerArgs = {
  readModel: unknown;
  uiPorts: Record<string, unknown>;
  runtimePorts: Record<string, unknown>;
};

const createSources = () => ({
  sessionCoreLane: {
    runtimeWorkSchedulerRef: { current: 'scheduler' },
    searchRuntimeBus: { bus: 'bus-v1' },
    latestBoundsRef: { current: null },
    viewportBoundsService: { service: 'bounds-v1' },
    resultsPresentationAuthority: { authority: 'presentation-v1' },
    resultsPresentationSurfaceAuthority: { authority: 'surface-v1' },
    cameraIntentArbiter: { arbiter: 'arbiter-v1' },
  },
  stateFoundationLane: {
    rootPrimitivesRuntime: {
      searchState: { isSearchEditingRef: { current: false }, query: ' pho ' },
      mapState: { mapRef: { current: null } },
    },
    rootDataPlaneRuntime: {
      historyRuntime: { loadRecentHistory: () => undefined },
      requestStatusRuntime: { runSearch: () => undefined },
    },
    sessionPrimitivesLane: { primitives: { lastSearchRequestIdRef: { current: null } } },
    rootSuggestionRuntime: { searchBarFrame: { height: 40 } },
  },
  rootOverlayFoundationRuntime: {
    rootSharedSheetRuntimeLane: { resetMapMoveFlag: () => undefined },
    appRouteSharedSheetRuntimeOwner: {
      markSharedSheetHidden: () => undefined,
      snapPoints: { middle: 400 },
    },
    rootOverlaySessionSurfaceRuntime: { searchBarTop: 60 },
  },
  requestExecutionAuthorityRuntime: { lastAutoOpenKeyRef: { current: null } },
  recentActivityAuthorityRuntime: {
    recentActivityRuntime: { deferRecentSearchUpsert: () => undefined },
  },
  resultsScrollAuthorityRuntime: {
    resultsScrollPort: { scrollResultsToTop: () => undefined },
  },
  resultsPresentationOwner: {
    presentationActions: {
      cancelCloseSearch: () => undefined,
      requestSearchPresentationIntent: () => undefined,
    },
    beginSearchThisAreaPresentationPending: () => undefined,
    pendingTogglePresentationIntentId: null,
    handlePresentationIntentAbort: () => undefined,
    handlePageOneResultsCommitted: () => undefined,
  },
  userLocation: null,
});

const mount = (sources: ReturnType<typeof createSources>) =>
  mountHook(() =>
    useSearchRootSubmitControlRuntime(
      sources as unknown as Parameters<typeof useSearchRootSubmitControlRuntime>[0]
    )
  );

describe('useSearchRootSubmitControlRuntime ports collapse', () => {
  beforeEach(() => {
    submitOwnerCalls.length = 0;
  });

  it('wires every ui and runtime port from its original source path', () => {
    const sources = createSources();
    const harness = mount(sources);
    expect(harness.latest()).toBe(submitOwnerResult);
    const args = submitOwnerCalls[submitOwnerCalls.length - 1] as OwnerArgs;

    expect(args.readModel).toBe(readModel);

    const { uiPorts, runtimePorts } = args;
    // search / history / surface ports
    expect(uiPorts.isSearchEditingRef).toBe(
      sources.stateFoundationLane.rootPrimitivesRuntime.searchState.isSearchEditingRef
    );
    expect(uiPorts.loadRecentHistory).toBe(
      sources.stateFoundationLane.rootDataPlaneRuntime.historyRuntime.loadRecentHistory
    );
    expect(uiPorts.updateLocalRecentSearches).toBe(
      sources.recentActivityAuthorityRuntime.recentActivityRuntime.deferRecentSearchUpsert
    );
    expect(uiPorts.resetSheetToHidden).toBe(
      sources.rootOverlayFoundationRuntime.appRouteSharedSheetRuntimeOwner.markSharedSheetHidden
    );
    expect(uiPorts.scrollResultsToTop).toBe(
      sources.resultsScrollAuthorityRuntime.resultsScrollPort.scrollResultsToTop
    );
    expect(uiPorts.resetMapMoveFlag).toBe(
      sources.rootOverlayFoundationRuntime.rootSharedSheetRuntimeLane.resetMapMoveFlag
    );
    // presentation ports (through the REAL kept derivation hooks)
    expect(uiPorts.onPresentationIntentAbort).toBe(
      sources.resultsPresentationOwner.handlePresentationIntentAbort
    );
    expect(typeof uiPorts.onPageOneResultsCommitted).toBe('function');
    // F5701: the options type names exactly what the owner reads, so the members that
    // had no reader are not merely unwired — they are unpassable.
    expect(uiPorts).not.toHaveProperty('getIsProfilePresentationActive');
    expect(uiPorts).not.toHaveProperty('clearMapHighlightedRestaurantId');
    expect(uiPorts).not.toHaveProperty('onShortcutSearchCoverageSnapshot');
    expect(typeof uiPorts.onPresentationIntentStart).toBe('function');
    // the control-runtime's own fitAll port survives the collapse
    expect(typeof uiPorts.onListWorldPresented).toBe('function');

    // runtime ports
    expect(runtimePorts.searchRuntimeBus).toBe(sources.sessionCoreLane.searchRuntimeBus);
    expect(runtimePorts.lastSearchRequestIdRef).toBe(
      sources.stateFoundationLane.sessionPrimitivesLane.primitives.lastSearchRequestIdRef
    );
    expect(runtimePorts.lastAutoOpenKeyRef).toBe(
      sources.requestExecutionAuthorityRuntime.lastAutoOpenKeyRef
    );
    expect(runtimePorts.resultsPresentationSurfaceAuthority).toBe(
      sources.sessionCoreLane.resultsPresentationSurfaceAuthority
    );
    expect(runtimePorts.runSearch).toBe(
      sources.stateFoundationLane.rootDataPlaneRuntime.requestStatusRuntime.runSearch
    );
    expect(runtimePorts.mapRef).toBe(
      sources.stateFoundationLane.rootPrimitivesRuntime.mapState.mapRef
    );
    expect(runtimePorts.viewportBoundsService).toBe(sources.sessionCoreLane.viewportBoundsService);
    // viewport KEEP hook: the stable ref container, not the raw value
    expect(runtimePorts.userLocationRef).toEqual({ current: null });
    expect(runtimePorts).not.toHaveProperty('runtimeWorkSchedulerRef');
    expect(runtimePorts).not.toHaveProperty('resultsPresentationAuthority');
    expect(runtimePorts).not.toHaveProperty('latestBoundsRef');

    harness.unmount();
  });

  it('keeps per-port identity independent across memo hit and miss (F1013 order guard implicit)', () => {
    const sources = createSources();
    const harness = mount(sources);
    const first = submitOwnerCalls[submitOwnerCalls.length - 1] as OwnerArgs;

    // No-change re-render: both composite ports hold identity.
    harness.render();
    const second = submitOwnerCalls[submitOwnerCalls.length - 1] as OwnerArgs;
    expect(second.uiPorts).toBe(first.uiPorts);
    expect(second.runtimePorts).toBe(first.runtimePorts);

    // A ui-side-only source change re-mints uiPorts but NOT runtimePorts — proof the
    // runtime chain's memos do not share a dep array with the ui chain (a merged
    // single-memo re-implementation fails here).
    sources.resultsScrollAuthorityRuntime.resultsScrollPort = {
      scrollResultsToTop: () => undefined,
    };
    harness.render();
    const third = submitOwnerCalls[submitOwnerCalls.length - 1] as OwnerArgs;
    expect(third.uiPorts).not.toBe(second.uiPorts);
    expect(third.uiPorts.scrollResultsToTop).toBe(
      sources.resultsScrollAuthorityRuntime.resultsScrollPort.scrollResultsToTop
    );
    expect(third.runtimePorts).toBe(second.runtimePorts);

    // A runtime-side-only source change re-mints runtimePorts but NOT uiPorts, and the
    // untouched fields keep their original wiring (stale-value check: the new object
    // must re-read its sources, not cache the old ones).
    sources.sessionCoreLane.searchRuntimeBus = { bus: 'bus-v2' };
    harness.render();
    const fourth = submitOwnerCalls[submitOwnerCalls.length - 1] as OwnerArgs;
    expect(fourth.runtimePorts).not.toBe(third.runtimePorts);
    expect(fourth.runtimePorts.searchRuntimeBus).toEqual({ bus: 'bus-v2' });
    expect(fourth.uiPorts).toBe(third.uiPorts);

    harness.unmount();
  });
});
