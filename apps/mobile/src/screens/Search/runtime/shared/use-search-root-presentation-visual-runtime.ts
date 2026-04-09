import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import {
  useSearchRootPresentationChromeInputRuntime,
  type SearchRootPresentationChromeInputRuntime,
} from './use-search-root-presentation-chrome-input-runtime';
import {
  useSearchRootPresentationSurfaceVisualRuntime,
  type SearchRootPresentationSurfaceVisualRuntime,
} from './use-search-root-presentation-surface-visual-runtime';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';

type UseSearchRootPresentationVisualRuntimeArgs = {
  insets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
} & SearchRootActionLanes;

export type SearchRootPresentationVisualRuntime = SearchRootPresentationSurfaceVisualRuntime &
  SearchRootPresentationChromeInputRuntime;

export const useSearchRootPresentationVisualRuntime = ({
  insets,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  sessionActionRuntime,
  resultsSheetInteractionModel,
  presentationState,
}: UseSearchRootPresentationVisualRuntimeArgs): SearchRootPresentationVisualRuntime => {
  const presentationSurfaceVisualRuntime = useSearchRootPresentationSurfaceVisualRuntime({
    insets,
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    sessionActionRuntime,
    resultsSheetInteractionModel,
    presentationState,
  });
  const presentationChromeInputRuntime = useSearchRootPresentationChromeInputRuntime({
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    sessionActionRuntime,
    presentationSurfaceVisualRuntime,
  });

  return {
    ...presentationSurfaceVisualRuntime,
    ...presentationChromeInputRuntime,
  };
};
