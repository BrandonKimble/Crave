import { useSearchRootRuntimeSessionAssemblyRuntime } from './use-search-root-runtime-session-assembly-runtime';
import { useSearchRootRuntimeStateAssemblyRuntime } from './use-search-root-runtime-state-assembly-runtime';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';
import type { SearchPrimitiveUiStateController } from './search-primitive-ui-state-controller';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchSuggestionPanelStateController } from './search-suggestion-panel-state-controller';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';

export const useSearchRootRuntimeFoundationStageRuntime = ({
  appEntryPlaneRuntime,
  searchRuntimeBus,
  resultsPresentationAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
  primitiveUiStateController,
  suggestionPanelStateController,
  foregroundPolicyPublicationAuthority,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  primitiveUiStateController: SearchPrimitiveUiStateController;
  suggestionPanelStateController: SearchSuggestionPanelStateController;
  foregroundPolicyPublicationAuthority: SearchForegroundPolicyPublicationAuthority;
}) => {
  const sessionAssemblyRuntime = useSearchRootRuntimeSessionAssemblyRuntime({
    appEntryPlaneRuntime,
    searchRuntimeBus,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort,
    primitiveUiStateController,
    suggestionPanelStateController,
  });
  const stateAssemblyRuntime = useSearchRootRuntimeStateAssemblyRuntime({
    appEntryPlaneRuntime,
    sessionAssemblyRuntime,
    foregroundPolicyPublicationAuthority,
  });
  return {
    sessionAssemblyRuntime,
    stateAssemblyRuntime,
    searchRuntimeBus,
  };
};
