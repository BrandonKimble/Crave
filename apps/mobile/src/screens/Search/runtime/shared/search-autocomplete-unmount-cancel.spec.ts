/**
 * F6005 — UNMOUNTING MID-REQUEST CANCELS EXACTLY ONCE.
 *
 * `use-search-autocomplete-request-cleanup-runtime.ts` was a whole module, hook
 * and type import for one unmount effect that bumped the request sequence and
 * called `cancelAutocomplete` — the identical pair the execution effect's own
 * cleanup already performs when a request is in flight, and a no-op when one is
 * not (the execution effect early-returns before registering any cleanup, so
 * there is nothing to invalidate and the debouncer is idle). Every execution of
 * that module was a duplicate or a no-op.
 *
 * Deleting it is not provable from the suite's greenness, so this spec asserts
 * the OBSERVABLE instead: unmount mid-request, `cancelAutocomplete` called
 * exactly once. It passed at TWO before the deletion; the discriminating
 * assertion is `toHaveBeenCalledTimes(1)`, which reds if a second cleanup ever
 * comes back — or if the execution effect's own cleanup is ever removed.
 *
 * Unlike the sibling specs in this directory, this one needs REAL effects, so it
 * uses react-test-renderer rather than the render-only hook harness (whose
 * `useEffect` is deliberately a recorded slot that never fires).
 */
import React from 'react';

jest.mock('react-native', () => ({
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Platform: { OS: 'ios', select: (spec: { ios?: unknown }) => spec.ios },
  StyleSheet: { create: (sheet: unknown) => sheet, hairlineWidth: 1, absoluteFillObject: {} },
}));

import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

import type { AutocompleteMatch } from '../../../../services/autocomplete';
import { useSearchAutocompleteRuntime } from './use-search-autocomplete-runtime';

// react-test-renderer 19 requires the act environment flag to be declared.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bounds = {
  northEast: { lat: 30.3, lng: -97.7 },
  southWest: { lat: 30.2, lng: -97.8 },
};

const mountAutocompleteRuntime = (cancelAutocomplete: jest.Mock) => {
  // A request that never settles: the component unmounts while it is in flight.
  const runAutocomplete = jest.fn(() => new Promise<AutocompleteMatch[]>(() => undefined));

  const Probe = () => {
    useSearchAutocompleteRuntime({
      query: 'tacos',
      isSuggestionScreenActive: true,
      isSuggestionPanelVisible: true,
      isAutocompleteSuppressed: false,
      runAutocomplete,
      cancelAutocomplete,
      setSuggestions: () => undefined,
      bounds,
      userLocation: null,
    });
    return null;
  };

  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });
  return { renderer, runAutocomplete };
};

describe('F6005 autocomplete unmount cancel', () => {
  it('cancels exactly once when unmounted mid-request', () => {
    const cancelAutocomplete = jest.fn();
    const { renderer, runAutocomplete } = mountAutocompleteRuntime(cancelAutocomplete);

    expect(runAutocomplete).toHaveBeenCalledTimes(1);
    expect(cancelAutocomplete).not.toHaveBeenCalled();

    act(() => {
      renderer.unmount();
    });

    expect(cancelAutocomplete).toHaveBeenCalledTimes(1);
  });
});
