import { useSearchRootRuntimeSessionAssemblyRuntime } from './use-search-root-runtime-session-assembly-runtime';
import { useSearchRootRuntimeStateAssemblyRuntime } from './use-search-root-runtime-state-assembly-runtime';
import type { SearchChromeScalarSurfaceRuntime } from '../native/search-chrome-scalar-surface-runtime';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';
import type { SearchPrimitiveUiStateController } from './search-primitive-ui-state-controller';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchSuggestionPanelStateController } from './search-suggestion-panel-state-controller';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';

export const useSearchRootRuntimeFoundationStageRuntime = ({
  appEntryPlaneRuntime,
  searchChromeScalarSurfaceRuntime,
  searchRuntimeBus,
  primitiveUiStateController,
  suggestionPanelStateController,
  foregroundPolicyPublicationAuthority,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  searchChromeScalarSurfaceRuntime?: SearchChromeScalarSurfaceRuntime;
  searchRuntimeBus: SearchRuntimeBus;
  primitiveUiStateController: SearchPrimitiveUiStateController;
  suggestionPanelStateController: SearchSuggestionPanelStateController;
  foregroundPolicyPublicationAuthority: SearchForegroundPolicyPublicationAuthority;
}) => {
  const sessionAssemblyRuntime = useSearchRootRuntimeSessionAssemblyRuntime({
    appEntryPlaneRuntime,
    searchRuntimeBus,
    primitiveUiStateController,
    suggestionPanelStateController,
  });
  const stateAssemblyRuntime = useSearchRootRuntimeStateAssemblyRuntime({
    appEntryPlaneRuntime,
    sessionAssemblyRuntime,
    searchChromeScalarSurfaceRuntime,
    foregroundPolicyPublicationAuthority,
  });
  return {
    sessionAssemblyRuntime,
    stateAssemblyRuntime,
    searchRuntimeBus,
  };
};
