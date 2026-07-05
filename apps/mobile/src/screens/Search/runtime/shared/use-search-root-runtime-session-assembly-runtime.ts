import { useSearchMapNativeCameraExecutor } from '../map/search-map-native-camera-executor';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchPrimitiveUiStateController } from './search-primitive-ui-state-controller';
import type { SearchSuggestionPanelStateController } from './search-suggestion-panel-state-controller';
import { useSearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import { useSearchRootSessionRuntime } from './use-search-root-session-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';

export const useSearchRootRuntimeSessionAssemblyRuntime = ({
  appEntryPlaneRuntime,
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
  primitiveUiStateController,
  suggestionPanelStateController,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  primitiveUiStateController: SearchPrimitiveUiStateController;
  suggestionPanelStateController: SearchSuggestionPanelStateController;
}) => {
  const searchMapNativeCameraExecutor = useSearchMapNativeCameraExecutor();
  const rootPrimitivesRuntime = useSearchRootPrimitivesRuntime({
    startupCamera: appEntryPlaneRuntime.startupCamera,
    searchRuntimeBus,
    primitiveUiStateController,
    suggestionPanelStateController,
  });
  const sessionRuntime = useSearchRootSessionRuntime({
    isSignedIn: appEntryPlaneRuntime.isSignedIn,
    accessToken: appEntryPlaneRuntime.accessToken,
    startupPollBounds: appEntryPlaneRuntime.startupPollBounds,
    startupCamera: appEntryPlaneRuntime.startupCamera,
    markMainMapLoaded: appEntryPlaneRuntime.markMainMapLoaded,
    markMainMapReady: appEntryPlaneRuntime.markMainMapReady,
    searchMapNativeCameraExecutor,
    rootPrimitivesRuntime,
    searchRuntimeBus,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort,
  });

  return {
    rootPrimitivesRuntime,
    sessionRuntime,
  };
};
