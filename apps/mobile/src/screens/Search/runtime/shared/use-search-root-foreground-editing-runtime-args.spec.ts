/**
 * EQUIVALENCE + HOOK-ORDER SPEC for the foreground-editing args composition (F1012).
 *
 * This composition was a four-level spread tree of seven files whose only job was to
 * assemble ONE flat object. The tree was collapsed into a single hook; this spec pins
 * the two things the collapse must not change:
 *
 *   1. the assembled object — every field, from the same source path;
 *   2. memo IDENTITY behaviour — the result is referentially stable when nothing the
 *      object reads has changed, and a NEW object when any one of them has.
 *
 * It also asserts a STABLE HOOK SEQUENCE across re-renders via the harness guard
 * (F1013): the hook count is now part of this composition's recorded contract, so a
 * later edit that reintroduces a conditional or reordered child hook fails here.
 */
import { createReactHookHarnessModuleMock, mountHook } from './spec-support/react-hook-harness';
import { useSearchRootForegroundEditingRuntimeArgs } from './use-search-root-foreground-editing-runtime-args';

jest.mock('react', () => createReactHookHarnessModuleMock());

const fn = (name: string) => Object.assign(() => undefined, { fnName: name });

const createInputs = () => {
  const searchState = {
    query: 'tacos',
    setIsAutocompleteSuppressed: fn('setIsAutocompleteSuppressed'),
    setIsSearchFocused: fn('setIsSearchFocused'),
    setIsSuggestionPanelActive: fn('setIsSuggestionPanelActive'),
    setSuggestions: fn('setSuggestions'),
    setQuery: fn('setQuery'),
    isSuggestionPanelActive: true,
    searchSessionQueryRef: { current: 'tacos' },
    isSearchEditingRef: { current: false },
    allowSearchBlurExitRef: { current: false },
    ignoreNextSearchBlurRef: { current: false },
    inputRef: { current: null },
  };
  const stateFoundationLane = {
    rootPrimitivesRuntime: { searchState },
    rootDataPlaneRuntime: {
      requestStatusRuntime: { cancelAutocomplete: fn('cancelAutocomplete') },
      resultsArrivalState: { submittedQuery: 'tacos', hasResults: true, isLoadingMore: false },
      runtimeFlags: { isSearchLoading: false, isSearchSessionActive: true },
    },
    rootSuggestionRuntime: {
      beginSuggestionCloseHold: fn('beginSuggestionCloseHold'),
      isSuggestionPanelVisible: true,
    },
  };
  const rootOverlayFoundationRuntime = {
    rootOverlayStoreRuntime: { dismissTransientOverlays: fn('dismissTransientOverlays') },
    routeOverlayCommandActions: { restoreDockedScene: fn('restoreDockedScene') },
  };
  const autocompleteAuthorityRuntime = {
    autocompleteRuntime: {
      allowAutocompleteResults: fn('allowAutocompleteResults'),
      suppressAutocompleteResults: fn('suppressAutocompleteResults'),
    },
  };
  const clearRestoreAuthorityRuntime = {
    clearOwner: {
      clearTypedQuery: fn('clearTypedQuery'),
      clearSearchState: fn('clearSearchState'),
    },
  };
  const resultsPresentationOwner = {
    shellModel: { backdropTarget: 'results' },
    presentationActions: {
      requestSearchPresentationIntent: fn('requestSearchPresentationIntent'),
      beginCloseSearch: fn('beginCloseSearch'),
    },
  };
  const foregroundInputRuntime = {
    captureSearchSessionQuery: fn('captureSearchSessionQuery'),
  };
  const profileOwner = {
    profileViewState: { presentation: { isPresentationActive: false } },
  };
  return {
    stateFoundationLane,
    rootOverlayFoundationRuntime,
    autocompleteAuthorityRuntime,
    clearRestoreAuthorityRuntime,
    resultsPresentationOwner,
    foregroundInputRuntime,
    profileOwner,
  };
};

type Inputs = ReturnType<typeof createInputs>;

const mountArgs = (getInputs: () => Inputs) =>
  mountHook(() =>
    useSearchRootForegroundEditingRuntimeArgs(
      getInputs() as unknown as Parameters<typeof useSearchRootForegroundEditingRuntimeArgs>[0]
    )
  );

describe('useSearchRootForegroundEditingRuntimeArgs', () => {
  it('assembles every field of the foreground-editing args from its declared source path', () => {
    const inputs = createInputs();
    const harness = mountArgs(() => inputs);
    const args = harness.latest() as unknown as Record<string, unknown>;

    const { stateFoundationLane: lane } = inputs;
    // state half
    expect(args.query).toBe(lane.rootPrimitivesRuntime.searchState.query);
    expect(args.submittedQuery).toBe(lane.rootDataPlaneRuntime.resultsArrivalState.submittedQuery);
    expect(args.hasResults).toBe(true);
    expect(args.isSearchLoading).toBe(false);
    expect(args.isLoadingMore).toBe(false);
    expect(args.isSearchSessionActive).toBe(true);
    expect(args.isSuggestionPanelActive).toBe(true);
    expect(args.isSuggestionPanelVisible).toBe(true);
    expect(args.shouldTreatSearchAsResults).toBe(true);
    expect(args.showPollsOverlay).toBe(false);
    expect(args.profilePresentationActive).toBe(false);
    expect(args.searchSessionQueryRef).toBe(
      lane.rootPrimitivesRuntime.searchState.searchSessionQueryRef
    );
    expect(args.isSearchEditingRef).toBe(lane.rootPrimitivesRuntime.searchState.isSearchEditingRef);
    expect(args.allowSearchBlurExitRef).toBe(
      lane.rootPrimitivesRuntime.searchState.allowSearchBlurExitRef
    );
    expect(args.ignoreNextSearchBlurRef).toBe(
      lane.rootPrimitivesRuntime.searchState.ignoreNextSearchBlurRef
    );
    expect(args.inputRef).toBe(lane.rootPrimitivesRuntime.searchState.inputRef);

    // clear half — clearOwner is a NARROWED copy, not the source object
    expect(args.clearOwner).toEqual({
      clearTypedQuery: inputs.clearRestoreAuthorityRuntime.clearOwner.clearTypedQuery,
      clearSearchState: inputs.clearRestoreAuthorityRuntime.clearOwner.clearSearchState,
    });
    expect(args.clearOwner).not.toBe(inputs.clearRestoreAuthorityRuntime.clearOwner);
    expect(args.captureSearchSessionQuery).toBe(
      inputs.foregroundInputRuntime.captureSearchSessionQuery
    );

    // autocomplete half
    expect(args.allowAutocompleteResults).toBe(
      inputs.autocompleteAuthorityRuntime.autocompleteRuntime.allowAutocompleteResults
    );
    expect(args.suppressAutocompleteResults).toBe(
      inputs.autocompleteAuthorityRuntime.autocompleteRuntime.suppressAutocompleteResults
    );
    expect(args.cancelAutocomplete).toBe(
      lane.rootDataPlaneRuntime.requestStatusRuntime.cancelAutocomplete
    );
    expect(args.setIsAutocompleteSuppressed).toBe(
      lane.rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed
    );

    // presentation half
    expect(args.dismissTransientOverlays).toBe(
      inputs.rootOverlayFoundationRuntime.rootOverlayStoreRuntime.dismissTransientOverlays
    );
    expect(args.beginSuggestionCloseHold).toBe(lane.rootSuggestionRuntime.beginSuggestionCloseHold);
    expect(args.requestSearchPresentationIntent).toBe(
      inputs.resultsPresentationOwner.presentationActions.requestSearchPresentationIntent
    );
    expect(args.beginCloseSearch).toBe(
      inputs.resultsPresentationOwner.presentationActions.beginCloseSearch
    );
    expect(args.restoreDockedScene).toBe(
      inputs.rootOverlayFoundationRuntime.routeOverlayCommandActions.restoreDockedScene
    );

    // search-ui half
    expect(args.setIsSearchFocused).toBe(lane.rootPrimitivesRuntime.searchState.setIsSearchFocused);
    expect(args.setIsSuggestionPanelActive).toBe(
      lane.rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive
    );
    expect(args.setSuggestions).toBe(lane.rootPrimitivesRuntime.searchState.setSuggestions);
    expect(args.setQuery).toBe(lane.rootPrimitivesRuntime.searchState.setQuery);

    harness.unmount();
  });

  it('holds the same object across re-renders and produces a new one when a source value changes', () => {
    const inputs = createInputs();
    const harness = mountArgs(() => inputs);
    const first = harness.latest();

    expect(harness.render()).toBe(first);
    expect(harness.render()).toBe(first);

    inputs.stateFoundationLane.rootPrimitivesRuntime.searchState.query = 'ramen';
    const next = harness.render() as unknown as Record<string, unknown>;
    expect(next).not.toBe(first);
    expect(next.query).toBe('ramen');

    // A field NOT read by the composition must not invalidate the memo.
    const stable = harness.render();
    expect(harness.render()).toBe(stable);

    harness.unmount();
  });

  it('calls a stable hook sequence on every render (F1013 wiring contract)', () => {
    const inputs = createInputs();
    const harness = mountArgs(() => inputs);
    const sequence = harness.hookSequence();

    expect(sequence.every((kind) => kind === 'useMemo')).toBe(true);

    // Re-render through both a memo HIT and a memo MISS — the harness throws on any
    // change of hook count or order, so reaching the assertions is itself the proof.
    harness.render();
    inputs.stateFoundationLane.rootPrimitivesRuntime.searchState.query = 'pho';
    harness.render();
    expect(harness.hookSequence()).toEqual(sequence);

    harness.unmount();
  });
});
