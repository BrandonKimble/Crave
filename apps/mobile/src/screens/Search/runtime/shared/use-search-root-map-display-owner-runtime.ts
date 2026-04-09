import { useSearchMapRuntime } from './use-search-map-runtime';
import type {
  SearchRootMapDisplayRuntime,
  UseSearchRootMapDisplayRuntimeArgs,
} from './use-search-root-map-display-runtime-contract';
import { useSearchRootMapActionInteractionArgsRuntime } from './use-search-root-map-action-interaction-args-runtime';
import { useSearchRootMapPrimitivesInteractionArgsRuntime } from './use-search-root-map-primitives-interaction-args-runtime';
import { useSearchRootMapRequestInteractionArgsRuntime } from './use-search-root-map-request-interaction-args-runtime';
import { useSearchRootMapRuntimeInteractionArgsRuntime } from './use-search-root-map-runtime-interaction-args-runtime';
import { useSearchRootMapScaffoldInteractionArgsRuntime } from './use-search-root-map-scaffold-interaction-args-runtime';
import { useSearchRootMapStableHandlersArgsRuntime } from './use-search-root-map-stable-handlers-args-runtime';

export type UseSearchRootMapDisplayOwnerRuntimeArgs = UseSearchRootMapDisplayRuntimeArgs;

export type SearchRootMapDisplayOwnerRuntime = {
  mapRuntime: SearchRootMapDisplayRuntime;
};

export const useSearchRootMapDisplayOwnerRuntime = ({
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  sessionActionRuntime,
  presentationState,
  pendingMarkerOpenAnimationFrameRef,
}: UseSearchRootMapDisplayOwnerRuntimeArgs): SearchRootMapDisplayOwnerRuntime => {
  const runtimeInteractionArgsRuntime = useSearchRootMapRuntimeInteractionArgsRuntime({
    rootSessionRuntime,
    pendingMarkerOpenAnimationFrameRef,
  });
  const scaffoldInteractionArgsRuntime = useSearchRootMapScaffoldInteractionArgsRuntime({
    rootScaffoldRuntime,
  });
  const requestInteractionArgsRuntime = useSearchRootMapRequestInteractionArgsRuntime({
    requestLaneRuntime,
  });
  const primitivesInteractionArgsRuntime = useSearchRootMapPrimitivesInteractionArgsRuntime({
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
  });
  const actionInteractionArgsRuntime = useSearchRootMapActionInteractionArgsRuntime({
    sessionActionRuntime,
    presentationState,
  });
  const stableHandlersArgsRuntime = useSearchRootMapStableHandlersArgsRuntime({
    rootSessionRuntime,
    requestLaneRuntime,
  });

  return {
    mapRuntime: useSearchMapRuntime({
      interactionArgs: {
        ...runtimeInteractionArgsRuntime.interactionArgs,
        ...scaffoldInteractionArgsRuntime.interactionArgs,
        ...requestInteractionArgsRuntime.interactionArgs,
        ...primitivesInteractionArgsRuntime.interactionArgs,
        ...actionInteractionArgsRuntime.interactionArgs,
      },
      ...stableHandlersArgsRuntime,
    }),
  };
};
