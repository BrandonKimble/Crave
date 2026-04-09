import type { SearchRootMapInteractionArgsRuntime } from './use-search-root-map-display-runtime-contract';
import type { UseSearchRootMapDisplayRuntimeArgs } from './use-search-root-map-display-runtime-contract';

export type SearchRootMapRequestInteractionArgsRuntime = {
  interactionArgs: Pick<
    SearchRootMapInteractionArgsRuntime['interactionArgs'],
    'suppressAutocompleteResults'
  >;
};

export const useSearchRootMapRequestInteractionArgsRuntime = ({
  requestLaneRuntime,
}: Pick<
  UseSearchRootMapDisplayRuntimeArgs,
  'requestLaneRuntime'
>): SearchRootMapRequestInteractionArgsRuntime => {
  return {
    interactionArgs: {
      suppressAutocompleteResults:
        requestLaneRuntime.requestPresentationFlowRuntime.autocompleteRuntime
          .suppressAutocompleteResults,
    },
  };
};
