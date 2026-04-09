import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';

export type SearchRootOverlayPublicationStateRuntime = {
  shouldRenderSearchOverlay: boolean;
  handleProfilerRender: SearchRootScaffoldRuntime['instrumentationRuntime']['handleProfilerRender'];
};

export const useSearchRootOverlayPublicationStateRuntime = ({
  rootScaffoldRuntime,
}: Pick<
  {
    rootScaffoldRuntime: SearchRootScaffoldRuntime;
  },
  'rootScaffoldRuntime'
>): SearchRootOverlayPublicationStateRuntime => {
  return {
    shouldRenderSearchOverlay: rootScaffoldRuntime.overlaySessionRuntime.shouldRenderSearchOverlay,
    handleProfilerRender: rootScaffoldRuntime.instrumentationRuntime.handleProfilerRender,
  };
};
