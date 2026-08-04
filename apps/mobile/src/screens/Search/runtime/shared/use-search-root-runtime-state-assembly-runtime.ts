import { useSearchRootStateFoundationRuntime } from './use-search-root-state-foundation-runtime';
import type { SearchForegroundPolicyPublicationAuthority } from './search-foreground-policy-publication-authority';
import type { useSearchRootRuntimeSessionAssemblyRuntime } from './use-search-root-runtime-session-assembly-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';

type SearchRootRuntimeSessionAssembly = ReturnType<
  typeof useSearchRootRuntimeSessionAssemblyRuntime
>;

export const useSearchRootRuntimeStateAssemblyRuntime = ({
  appEntryPlaneRuntime,
  sessionAssemblyRuntime,
  foregroundPolicyPublicationAuthority,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  sessionAssemblyRuntime: SearchRootRuntimeSessionAssembly;
  foregroundPolicyPublicationAuthority: SearchForegroundPolicyPublicationAuthority;
}) => ({
  stateFoundationLane: useSearchRootStateFoundationRuntime({
    isSignedIn: appEntryPlaneRuntime.isSignedIn,
    rootPrimitivesRuntime: sessionAssemblyRuntime.rootPrimitivesRuntime,
    sessionCoreLane: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane,
    sessionPrimitivesLane: sessionAssemblyRuntime.sessionRuntime.sessionPrimitivesLane,
    foregroundPolicyPublicationAuthority,
  }),
});
