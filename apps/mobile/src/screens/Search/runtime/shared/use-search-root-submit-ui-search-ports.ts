import React from 'react';

import useSearchSubmitOwnerValue from '../../hooks/use-search-submit-owner';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

// F1308: this file existed largely to ferry `setError` — a write-only `useState` whose value
// was discarded at the declaration (`const [, setError] = useState<string | null>(null)`) and
// which nothing in the app could read. Three owners called `setError(null)` defensively; each
// call scheduled a real re-render of the search-root primitives runtime, the highest-fanout
// object in the tree, to publish an unobservable value. With it gone this hook is down to a
// single field — kept, rather than inlined, because it is the declared seam between the root
// runtime and the submit owner's UI ports.
type SearchRootSubmitUiSearchPorts = Pick<
  Parameters<typeof useSearchSubmitOwnerValue>[0]['uiPorts'],
  'isSearchEditingRef'
>;

type UseSearchRootSubmitUiSearchPortsArgs = {
  stateFoundationLane: SearchRootStateFoundationLane;
};

export const useSearchRootSubmitUiSearchPorts = ({
  stateFoundationLane,
}: UseSearchRootSubmitUiSearchPortsArgs): SearchRootSubmitUiSearchPorts => {
  const { rootPrimitivesRuntime } = stateFoundationLane;

  return React.useMemo(
    () => ({
      isSearchEditingRef: rootPrimitivesRuntime.searchState.isSearchEditingRef,
    }),
    [rootPrimitivesRuntime.searchState.isSearchEditingRef]
  );
};
