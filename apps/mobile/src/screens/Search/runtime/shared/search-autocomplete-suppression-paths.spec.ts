/**
 * F6000 — THE SUPPRESSION A SUBMIT ASKS FOR MUST SURVIVE THE NEXT RENDER.
 *
 * There used to be a third suppression mechanism beside the state and the
 * request sequence: `manuallySuppressedAutocompleteRef`, set by
 * `suppressAutocompleteResults` and erased in the state hook's render body
 * whenever `isAutocompleteSuppressed` was false. Three call sites suppressed
 * through that ref ALONE — the two submit-preparation handlers and the
 * suggestion-commit teardown — so what they asked for was undone by the very
 * next render, invisibly.
 *
 * These specs compose each of those three paths with the render-time reader
 * that actually decides whether autocomplete runs (the lifecycle memo) and
 * assert the suppression is still in force AFTER a subsequent render. They go
 * RED the moment a path stops setting `isAutocompleteSuppressed` — which is
 * exactly the state the deleted ref could not reach.
 */
import type { AutocompleteMatch } from '../../../../services/autocomplete';
import { createReactHookHarnessModuleMock, mountHook } from './spec-support/react-hook-harness';
import { useSearchAutocompleteRequestLifecycleRuntime } from './use-search-autocomplete-request-lifecycle-runtime';
import { useSearchAutocompleteRequestStateRuntime } from './use-search-autocomplete-request-state-runtime';
import { useSearchForegroundSubmitPreparationRuntime } from './use-search-foreground-submit-preparation-runtime';
import { useSearchForegroundSuggestionSubmitRuntime } from './use-search-foreground-suggestion-submit-runtime';

jest.mock('react', () => createReactHookHarnessModuleMock());
// The hermetic node project has no RN runtime; the lifecycle runtime reaches
// `constants/search`, which reads `Dimensions` at module scope.
jest.mock('react-native', () => ({
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Platform: { OS: 'ios', select: (spec: { ios?: unknown }) => spec.ios },
  StyleSheet: { create: (sheet: unknown) => sheet, hairlineWidth: 1, absoluteFillObject: {} },
}));

const noop = () => undefined;

type SuppressionBox = { isAutocompleteSuppressed: boolean };

const createSharedArgs = (box: SuppressionBox) => ({
  setIsAutocompleteSuppressed: (next: boolean | ((prev: boolean) => boolean)) => {
    box.isAutocompleteSuppressed =
      typeof next === 'function' ? next(box.isAutocompleteSuppressed) : next;
  },
  cancelAutocomplete: noop,
  dismissSearchKeyboard: noop,
  beginSubmitTransition: () => false,
  setIsSearchFocused: noop,
  setIsSuggestionPanelActive: noop,
  setSuggestions: noop,
  setQuery: noop,
  isSearchEditingRef: { current: false },
  allowSearchBlurExitRef: { current: false },
  ignoreNextSearchBlurRef: { current: false },
});

/**
 * Mounts one suppression path together with the lifecycle memo that reads the
 * suppression, sharing the SAME `isAutocompleteSuppressed` value the way the
 * root does: the path writes it, the next render reads it.
 */
const mountSuppressionPath = (
  buildHandler: (box: SuppressionBox, suppressAutocompleteResults: () => void) => () => void
) => {
  const box: SuppressionBox = { isAutocompleteSuppressed: false };
  let invoke: () => void = noop;

  const harness = mountHook(() => {
    const requestStateRuntime = useSearchAutocompleteRequestStateRuntime({
      query: 'tacos',
      isSuggestionScreenActive: true,
      isAutocompleteSuppressed: box.isAutocompleteSuppressed,
      cancelAutocomplete: noop,
    });
    invoke = buildHandler(box, requestStateRuntime.suppressAutocompleteResults);
    return useSearchAutocompleteRequestLifecycleRuntime({
      query: 'tacos',
      isSuggestionScreenActive: true,
      isSuggestionPanelVisible: true,
      isAutocompleteSuppressed: box.isAutocompleteSuppressed,
      cancelAutocomplete: noop,
      clearAutocompleteSuggestions: noop,
      lookupAutocompleteCache: () => null,
      setSuggestions: noop as never,
      requestStateRuntime,
    });
  });

  return { harness, invoke: () => invoke(), box };
};

const expectSuppressedAcrossRender = (path: ReturnType<typeof mountSuppressionPath>): void => {
  // Before: autocomplete is live for this query.
  expect(path.harness.latest().shouldRequest).toBe(true);

  path.invoke();

  // After a SUBSEQUENT render — the render that used to erase the old ref.
  const afterFirst = path.harness.render();
  expect(path.box.isAutocompleteSuppressed).toBe(true);
  expect(afterFirst.shouldRequest).toBe(false);

  // And it is still suppressed a render later: this is a state, not an event.
  expect(path.harness.render().shouldRequest).toBe(false);
};

describe('F6000 autocomplete suppression paths', () => {
  it('prepareSubmitChrome suppresses autocomplete across the next render', () => {
    expectSuppressedAcrossRender(
      mountSuppressionPath((box, suppressAutocompleteResults) => {
        const preparation = useSearchForegroundSubmitPreparationRuntime({
          isSuggestionPanelActive: true,
          suppressAutocompleteResults,
          resetFocusedMapState: noop,
          ...createSharedArgs(box),
        } as never);
        return preparation.prepareSubmitChrome;
      })
    );
  });

  it('prepareRecentIntentSubmit suppresses autocomplete across the next render', () => {
    expectSuppressedAcrossRender(
      mountSuppressionPath((box, suppressAutocompleteResults) => {
        const preparation = useSearchForegroundSubmitPreparationRuntime({
          isSuggestionPanelActive: true,
          suppressAutocompleteResults,
          resetFocusedMapState: noop,
          ...createSharedArgs(box),
        } as never);
        return () => preparation.prepareRecentIntentSubmit('tacos');
      })
    );
  });

  it('handleSuggestionPress suppresses autocomplete across the next render', () => {
    const userMatch = {
      matchType: 'user',
      entityType: 'user',
      entityId: 'user-1',
      name: 'Ada',
    } as unknown as AutocompleteMatch;

    expectSuppressedAcrossRender(
      mountSuppressionPath((box, suppressAutocompleteResults) => {
        const suggestionSubmit = useSearchForegroundSuggestionSubmitRuntime({
          submitRuntime: { submitSearch: noop, runRestaurantEntitySearch: noop },
          query: 'tacos',
          suppressAutocompleteResults,
          pendingRestaurantSelectionRef: { current: null },
          openRestaurantProfilePreview: noop,
          openPollDetail: noop,
          openUserProfile: noop,
          ...createSharedArgs(box),
        } as never);
        return () => suggestionSubmit.handleSuggestionPress(userMatch);
      })
    );
  });
});
