import type { SearchRootAutocompleteControlLane } from '../shared/use-search-root-control-plane-runtime-contract';
import type { SearchRootControlFoundationAuthorityRuntime } from '../shared/use-search-root-control-foundation-authority-runtime';
import type { SearchRootControlPresentationAuthorityRuntime } from '../shared/use-search-root-control-presentation-authority-runtime';

export type SearchRootControlAuthorityRuntimeValue = {
  foundationAuthorityRuntime: SearchRootControlFoundationAuthorityRuntime;
  presentationAuthorityRuntime: SearchRootControlPresentationAuthorityRuntime;
  autocompleteControlLane: SearchRootAutocompleteControlLane;
};

export const createSearchRootControlAuthorityRuntimeValue = ({
  foundationAuthorityRuntime,
  presentationAuthorityRuntime,
  autocompleteControlLane,
}: SearchRootControlAuthorityRuntimeValue): SearchRootControlAuthorityRuntimeValue => ({
  foundationAuthorityRuntime,
  presentationAuthorityRuntime,
  autocompleteControlLane,
});
