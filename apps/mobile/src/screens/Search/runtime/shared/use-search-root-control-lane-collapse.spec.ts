/**
 * EQUIVALENCE + HOOK-ORDER SPEC for the *-lane control-lane collapse (F1012, lane cluster).
 *
 * The eleven single-field `*ControlLane` useMemo wrappers that lived in
 * `use-search-root-{foreground,profile,results}-control-lanes.ts` (three files, one
 * consumer per hook) were inlined into their consumers as per-lane `React.useMemo`
 * literals. This spec pins the three things the collapse must not change:
 *
 *   1. every lane field, wired from the same source path as before (including the one
 *      DERIVED field, `stableOpenRestaurantProfileFromResults`);
 *   2. per-lane memo IDENTITY — each lane stays referentially stable across renders
 *      when its own source has not changed, and only the lane whose source changed
 *      mints a new object (a merged single-memo re-implementation fails this);
 *   3. a STABLE HOOK SEQUENCE across hit and miss renders (F1013): the harness throws
 *      on any change of hook count or order, so completing a spec is itself the proof.
 *
 * Consumers under test: use-search-root-results-control-runtime and
 * use-search-root-profile-control-runtime, with their child runtime hooks mocked as
 * plain (hook-free) forwarders so the lanes' inputs are controllable. The four lanes
 * inlined into use-search-root-runtime-control-stage-runtime follow the identical
 * single-field pattern and are covered by tsc against the contract lane types plus
 * the stage's existing consumers.
 */
import { createReactHookHarnessModuleMock, mountHook } from './spec-support/react-hook-harness';

jest.mock('react', () => createReactHookHarnessModuleMock());

const resultsChildren = {
  resultsSheetInteractionModel: { model: 'sheet-v1' } as unknown,
  presentationState: { state: 'presentation-v1' } as unknown,
  portPublicationCalls: [] as unknown[],
};

jest.mock('./use-search-root-results-sheet-interaction-model-runtime', () => ({
  useSearchRootResultsSheetInteractionModelRuntime: () =>
    resultsChildren.resultsSheetInteractionModel,
}));
jest.mock('./use-search-root-results-presentation-state-runtime', () => ({
  useSearchRootResultsPresentationStateRuntime: () => resultsChildren.presentationState,
}));
jest.mock('./use-search-root-results-interaction-port-publication-runtime', () => ({
  useSearchRootResultsInteractionPortPublicationRuntime: (args: unknown) => {
    resultsChildren.portPublicationCalls.push(args);
  },
}));

const profileChildren = {
  profileOwnerRuntime: {
    profileOwner: {
      profileActions: { openRestaurantProfileFromResults: () => undefined },
    },
    suggestionInteractionRuntime: { runtime: 'suggestion-v1' },
    pendingMarkerOpenAnimationFrameRef: { current: null as number | null },
    restaurantSelectionModel: { model: 'selection-v1' },
  },
  profileMapCommandRuntime: {
    mapProfileCommandPort: { port: 'command-v1' },
    mapViewState: { view: 'view-v1' },
  },
};

jest.mock('./use-search-root-profile-owner-runtime', () => ({
  useSearchRootProfileOwnerRuntime: () => profileChildren.profileOwnerRuntime,
}));
jest.mock('./use-search-root-profile-map-command-runtime', () => ({
  useSearchRootProfileMapCommandRuntime: () => profileChildren.profileMapCommandRuntime,
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { useSearchRootResultsControlRuntime } = require('./use-search-root-results-control-runtime');
const { useSearchRootProfileControlRuntime } = require('./use-search-root-profile-control-runtime');
/* eslint-enable @typescript-eslint/no-var-requires */

describe('useSearchRootResultsControlRuntime lane collapse', () => {
  const createArgs = () => ({
    stateFoundationLane: {} as never,
    rootOverlayFoundationRuntime: {} as never,
    resultsPresentationOwner: {
      closeTransitionActions: { actions: 'close-v1' },
      searchSurfaceResultsTransactionKey: 'txn-1' as string | null,
    },
    resultsInteractionPorts: {} as never,
    profileOwner: {} as never,
    submitRuntimeResult: {} as never,
  });

  it('wires each lane from its declared source and keeps sibling lane identities independent', () => {
    const args = createArgs();
    const harness = mountHook(() =>
      useSearchRootResultsControlRuntime(
        args as unknown as Parameters<typeof useSearchRootResultsControlRuntime>[0]
      )
    );
    const first = harness.latest();

    expect(first.resultsSheetControlLane.resultsSheetInteractionModel).toBe(
      resultsChildren.resultsSheetInteractionModel
    );
    expect(first.resultsPresentationStateControlLane.presentationState).toBe(
      resultsChildren.presentationState
    );
    expect(first.resultsTransitionControlLane.closeTransitionActions).toBe(
      args.resultsPresentationOwner.closeTransitionActions
    );
    expect(
      first.searchSurfaceResultsTransactionControlLane.searchSurfaceResultsTransactionKey
    ).toBe('txn-1');

    // A no-change re-render holds every lane identity.
    const second = harness.render();
    expect(second.resultsSheetControlLane).toBe(first.resultsSheetControlLane);
    expect(second.resultsPresentationStateControlLane).toBe(
      first.resultsPresentationStateControlLane
    );
    expect(second.resultsTransitionControlLane).toBe(first.resultsTransitionControlLane);
    expect(second.searchSurfaceResultsTransactionControlLane).toBe(
      first.searchSurfaceResultsTransactionControlLane
    );

    // Changing ONE source invalidates exactly THAT lane — a merged single-memo
    // re-implementation would mint new objects for all four and fail here.
    args.resultsPresentationOwner.searchSurfaceResultsTransactionKey = 'txn-2';
    const third = harness.render();
    expect(third.searchSurfaceResultsTransactionControlLane).not.toBe(
      first.searchSurfaceResultsTransactionControlLane
    );
    expect(
      third.searchSurfaceResultsTransactionControlLane.searchSurfaceResultsTransactionKey
    ).toBe('txn-2');
    expect(third.resultsSheetControlLane).toBe(first.resultsSheetControlLane);
    expect(third.resultsPresentationStateControlLane).toBe(
      first.resultsPresentationStateControlLane
    );
    expect(third.resultsTransitionControlLane).toBe(first.resultsTransitionControlLane);

    // Same, from a mocked child hook's output.
    resultsChildren.resultsSheetInteractionModel = { model: 'sheet-v2' };
    const fourth = harness.render();
    expect(fourth.resultsSheetControlLane).not.toBe(third.resultsSheetControlLane);
    expect(fourth.resultsSheetControlLane.resultsSheetInteractionModel).toBe(
      resultsChildren.resultsSheetInteractionModel
    );
    expect(fourth.resultsPresentationStateControlLane).toBe(
      third.resultsPresentationStateControlLane
    );

    // F1013: hook sequence stable across both hit and miss renders.
    const sequence = harness.hookSequence();
    // NON-EMPTY FIRST: `[].every(...)` is `true`, so a harness that recorded ZERO
    // hooks (or a consumer that called none) used to satisfy this line outright.
    expect(sequence.length).toBeGreaterThan(0);
    expect(sequence.every((kind) => kind === 'useMemo')).toBe(true);
    harness.unmount();
  });
});

describe('useSearchRootProfileControlRuntime lane collapse', () => {
  const createArgs = () =>
    ({
      sessionCoreLane: {},
      stateFoundationLane: {},
      rootOverlayFoundationRuntime: {},
      insets: {},
      isSignedIn: true,
      userLocation: null,
      userLocationRef: { current: null },
      profileBridgeAuthorityRuntime: {},
      recentActivityAuthorityRuntime: {},
      clearRestoreAuthorityRuntime: {},
    }) as unknown as Parameters<typeof useSearchRootProfileControlRuntime>[0];

  it('wires each lane from its declared source, including the derived stable action', () => {
    const harness = mountHook(() => useSearchRootProfileControlRuntime(createArgs()));
    const first = harness.latest();
    const owner = profileChildren.profileOwnerRuntime;
    const mapCommand = profileChildren.profileMapCommandRuntime;

    expect(first.profileOwner).toBe(owner.profileOwner);
    expect(first.suggestionInteractionControlLane.suggestionInteractionRuntime).toBe(
      owner.suggestionInteractionRuntime
    );
    expect(first.profilePresentationControlLane.profileOwner).toBe(owner.profileOwner);
    expect(first.profilePresentationControlLane.stableOpenRestaurantProfileFromResults).toBe(
      owner.profileOwner.profileActions.openRestaurantProfileFromResults
    );
    expect(first.profilePresentationControlLane.pendingMarkerOpenAnimationFrameRef).toBe(
      owner.pendingMarkerOpenAnimationFrameRef
    );
    expect(first.mapProfileControlLane.mapProfileCommandPort).toBe(
      mapCommand.mapProfileCommandPort
    );
    expect(first.mapProfileControlLane.mapViewState).toBe(mapCommand.mapViewState);
    expect(first.mapProfileControlLane.restaurantSelectionModel).toBe(
      owner.restaurantSelectionModel
    );

    // No-change re-render holds every lane identity.
    const second = harness.render();
    expect(second.suggestionInteractionControlLane).toBe(first.suggestionInteractionControlLane);
    expect(second.profilePresentationControlLane).toBe(first.profilePresentationControlLane);
    expect(second.mapProfileControlLane).toBe(first.mapProfileControlLane);

    // Changing ONE child output invalidates exactly the lanes that read it.
    profileChildren.profileMapCommandRuntime = {
      ...mapCommand,
      mapViewState: { view: 'view-v2' },
    };
    const third = harness.render();
    expect(third.mapProfileControlLane).not.toBe(first.mapProfileControlLane);
    expect(third.mapProfileControlLane.mapViewState).toEqual({ view: 'view-v2' });
    expect(third.suggestionInteractionControlLane).toBe(first.suggestionInteractionControlLane);
    expect(third.profilePresentationControlLane).toBe(first.profilePresentationControlLane);

    // F1013: hook sequence stable across both hit and miss renders (the harness throws
    // on any count/order change, so reaching this line is the proof).
    const sequence = harness.hookSequence();
    // NON-EMPTY FIRST: `[].every(...)` is `true`, so a harness that recorded ZERO
    // hooks (or a consumer that called none) used to satisfy this line outright.
    expect(sequence.length).toBeGreaterThan(0);
    expect(sequence.every((kind) => kind === 'useMemo')).toBe(true);
    harness.unmount();
  });
});
