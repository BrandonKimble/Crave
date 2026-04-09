import type {
  SearchRootMapRenderHandlersPublicationArgsRuntime,
  SearchRootMapRenderStatePublicationArgsRuntime,
} from './search-root-map-render-publication-runtime-contract';
import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import { useSearchRootForegroundRenderOwnerRuntime } from './use-search-root-foreground-render-owner-runtime';
import { useSearchRootMapRenderPropsRuntime } from './use-search-root-map-render-props-runtime';
import { useSearchRootModalSheetRenderOwnerRuntime } from './use-search-root-modal-sheet-render-owner-runtime';
import type { SearchRootPresentationRuntime } from './use-search-root-runtime-contract';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';
import type { SearchRootPresentationVisualRuntime } from './use-search-root-presentation-visual-runtime';

type UseSearchRootPresentationRenderRuntimeArgs = {
  insets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
  presentationVisualRuntime: SearchRootPresentationVisualRuntime;
  mapRenderStatePublicationArgsRuntime: SearchRootMapRenderStatePublicationArgsRuntime;
  mapRenderHandlersPublicationArgsRuntime: SearchRootMapRenderHandlersPublicationArgsRuntime;
} & SearchRootActionLanes;

export const useSearchRootPresentationRenderRuntime = ({
  insets,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  sessionActionRuntime,
  presentationVisualRuntime,
  mapRenderStatePublicationArgsRuntime,
  mapRenderHandlersPublicationArgsRuntime,
}: UseSearchRootPresentationRenderRuntimeArgs): SearchRootPresentationRuntime => {
  const foregroundRenderRuntime = useSearchRootForegroundRenderOwnerRuntime({
    insets,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    sessionActionRuntime,
    presentationVisualRuntime,
  });
  const mapRenderPropsRuntime = useSearchRootMapRenderPropsRuntime({
    mapArgs: {
      ...mapRenderStatePublicationArgsRuntime.rootRenderArgs.mapArgs,
      ...mapRenderHandlersPublicationArgsRuntime.rootRenderArgs.mapArgs,
    },
  });
  const modalSheetRenderRuntime = useSearchRootModalSheetRenderOwnerRuntime({
    rootScaffoldRuntime,
    sessionActionRuntime,
  });

  return {
    ...foregroundRenderRuntime,
    ...mapRenderPropsRuntime,
    ...modalSheetRenderRuntime,
    statusBarFadeHeight: presentationVisualRuntime.visualRuntime.statusBarFadeHeight,
    shouldRenderSearchOverlay:
      presentationVisualRuntime.overlayPublicationStateRuntime.shouldRenderSearchOverlay,
    handleProfilerRender:
      presentationVisualRuntime.overlayPublicationStateRuntime.handleProfilerRender,
  };
};
