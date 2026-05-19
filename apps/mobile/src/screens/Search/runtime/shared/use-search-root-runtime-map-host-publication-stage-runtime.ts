import { useSearchRootMapHostPublicationRuntime } from './use-search-root-map-host-publication-runtime';
import type { useSearchRootControlAuthorityRuntime } from './use-search-root-control-authority-runtime';
import type { useSearchRootControlProfileExperienceRuntime } from './use-search-root-control-profile-experience-runtime';
import type { useSearchRootRuntimeOverlayFoundationAssemblyRuntime } from './use-search-root-runtime-overlay-foundation-assembly-runtime';
import type { useSearchRootRuntimeSessionAssemblyRuntime } from './use-search-root-runtime-session-assembly-runtime';
import type { useSearchRootRuntimeStateAssemblyRuntime } from './use-search-root-runtime-state-assembly-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';

type SearchRootRuntimeSessionAssembly = ReturnType<
  typeof useSearchRootRuntimeSessionAssemblyRuntime
>;
type SearchRootRuntimeStateAssembly = ReturnType<
  typeof useSearchRootRuntimeStateAssemblyRuntime
>;
type SearchRootRuntimeOverlayFoundationAssembly = ReturnType<
  typeof useSearchRootRuntimeOverlayFoundationAssemblyRuntime
>;
type SearchRootControlAuthorityRuntime = ReturnType<
  typeof useSearchRootControlAuthorityRuntime
>;
type SearchRootControlProfileExperienceRuntime = ReturnType<
  typeof useSearchRootControlProfileExperienceRuntime
>;
export const useSearchRootRuntimeMapHostPublicationStageRuntime = ({
  appEntryPlaneRuntime,
  sessionAssemblyRuntime,
  stateAssemblyRuntime,
  overlayFoundationAssemblyRuntime,
  controlAuthorityRuntime,
  profileControlRuntime,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
  sessionAssemblyRuntime: SearchRootRuntimeSessionAssembly;
  stateAssemblyRuntime: SearchRootRuntimeStateAssembly;
  overlayFoundationAssemblyRuntime: SearchRootRuntimeOverlayFoundationAssembly;
  controlAuthorityRuntime: SearchRootControlAuthorityRuntime;
  profileControlRuntime: SearchRootControlProfileExperienceRuntime;
}) =>
  useSearchRootMapHostPublicationRuntime({
    appEntryPlaneRuntime,
    sessionCoreLane: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane,
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    mapViewportIntentRuntime:
      overlayFoundationAssemblyRuntime.mapViewportIntentRuntime,
    rootOverlayFoundationRuntime:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    autocompleteControlLane: controlAuthorityRuntime.autocompleteControlLane,
    suggestionInteractionControlLane:
      profileControlRuntime.suggestionInteractionControlLane,
    profilePresentationControlLane:
      profileControlRuntime.profilePresentationControlLane,
    mapProfileControlLane: profileControlRuntime.mapProfileControlLane,
    resultsPresentationControlLane:
      controlAuthorityRuntime.presentationAuthorityRuntime
        .resultsPresentationControlLane,
  });
