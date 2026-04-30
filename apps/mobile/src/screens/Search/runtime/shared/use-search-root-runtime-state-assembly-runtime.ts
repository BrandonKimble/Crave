import { useSearchRootStateFoundationRuntime } from './use-search-root-state-foundation-runtime';
import type { SearchChromeScalarSurfaceRuntime } from '../native/search-chrome-scalar-surface-runtime';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';
import type { useSearchRootRuntimeSessionAssemblyRuntime } from './use-search-root-runtime-session-assembly-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';

type SearchRootRuntimeSessionAssembly = ReturnType<
  typeof useSearchRootRuntimeSessionAssemblyRuntime
>;

export const useSearchRootRuntimeStateAssemblyRuntime = ({
  appEntryPlaneRuntime,
  sessionAssemblyRuntime,
  searchChromeScalarSurfaceRuntime,
  foregroundPolicyPublicationAuthority,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  sessionAssemblyRuntime: SearchRootRuntimeSessionAssembly;
  searchChromeScalarSurfaceRuntime?: SearchChromeScalarSurfaceRuntime;
  foregroundPolicyPublicationAuthority: SearchForegroundPolicyPublicationAuthority;
}) => ({
  stateFoundationLane: useSearchRootStateFoundationRuntime({
    isSignedIn: appEntryPlaneRuntime.isSignedIn,
    rootPrimitivesRuntime: sessionAssemblyRuntime.rootPrimitivesRuntime,
    sessionCoreLane: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane,
    sessionPrimitivesLane: sessionAssemblyRuntime.sessionRuntime.sessionPrimitivesLane,
    searchChromeScalarSurfaceRuntime,
    foregroundPolicyPublicationAuthority,
  }),
});
