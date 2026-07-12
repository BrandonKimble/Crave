import React from 'react';

import { useAppRouteSharedSheetRuntimeOwner } from '../navigation/runtime/AppRouteSharedSheetRuntimeProvider';
import { publishOriginSceneLiveState } from '../navigation/runtime/origin-scene-live-state-registry';
import type {
  OverlayKey,
  OverlayRouteParamsMap,
} from '../navigation/runtime/app-overlay-route-types';

// Return-to-origin foundation (plans/return-to-origin-foundation-design.md §Capture).
//
// THE SINGLE publication primitive for a mounted return-to-origin source. A scene publishes its
// LIVE rich state into the scene live-state registry so the origin capture provider can snapshot
// "where was I" at the moment a search/favorites reveal launches. All axes are read at CALL time
// via getters, never stored — a pull-snapshot the controller reads synchronously and out-of-tree.
//
//   • SCROLL (always) — the lane offset is read from the shared sheet scroll SharedValue
//     (`sheetScrollOffset`, the live scroll of the currently-displayed scene-stack body). The lane
//     is keyed by sceneIdentityKey (== overlayKey for the static mounted tabs), matching
//     sceneScrollStateRegistry's seed key on the restore side so the offset flows back to the
//     same lane on the cold re-mount.
//   • SEGMENT (optional) — a segmented scene (profile) passes getSegment to publish its live
//     active sub-tab; the restore stages it and the scene segment-selects first, scroll second.
//   • sceneParams (optional, foundation-ready) — a scene whose true identity needs a param (a
//     FOREIGN profile's {profileUserId}) passes getSceneParams so the restore re-roots THAT
//     identity via routeParams. Own/self scenes omit it (the absence === a param-less self-default
//     re-root); no current caller passes it. This is the extension point that makes
//     search-from-a-foreign-source "add one hook call, zero dismiss/restore machinery change".
//
// "Add a return-to-origin source = ONE call to this hook with the getters it has." The publication
// is registered for the mounted scene body's lifetime and torn down on unmount, so an unmounted
// scene contributes nothing (capture falls back to a plain rich top-level origin) and the live
// getters always reflect the visible scene.
export const useOriginSceneScrollPublication = (
  sceneKey: OverlayKey,
  options?: {
    /** live active sub-tab for a segmented scene (profile). */
    getSegment?: () => string | null;
    /** live route params carrying a non-self scene identity (foreign profile's {profileUserId}). */
    getSceneParams?: () => OverlayRouteParamsMap[OverlayKey] | null;
  }
): void => {
  const { sheetScrollOffset } = useAppRouteSharedSheetRuntimeOwner();
  // Keep the latest getters in refs so the publication effect never re-subscribes on a getter's
  // identity change — the scene re-renders freely while its registry entry stays stable.
  const getSegmentRef = React.useRef(options?.getSegment);
  getSegmentRef.current = options?.getSegment;
  const getSceneParamsRef = React.useRef(options?.getSceneParams);
  getSceneParamsRef.current = options?.getSceneParams;
  // Which optional axes this scene contributes is fixed for its lifetime (a scene's shape doesn't
  // change), so it's safe to decide publication membership from the option presence.
  const publishSegment = options?.getSegment != null;
  const publishSceneParams = options?.getSceneParams != null;
  React.useEffect(
    () =>
      publishOriginSceneLiveState(sceneKey, {
        getScrollLanes: () => [{ laneKey: sceneKey, offset: sheetScrollOffset.value }],
        ...(publishSegment ? { getSegment: () => getSegmentRef.current?.() ?? null } : {}),
        ...(publishSceneParams
          ? { getSceneParams: () => getSceneParamsRef.current?.() ?? null }
          : {}),
      }),
    [sceneKey, sheetScrollOffset, publishSegment, publishSceneParams]
  );
};
