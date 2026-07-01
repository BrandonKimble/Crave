import type { OverlayKey, OverlayRouteParamsMap } from './app-overlay-route-types';
import type { OriginScrollLane } from '../../overlays/searchRouteSessionTypes';

// Return-to-origin foundation (plans/return-to-origin-foundation-design.md §Capture / P3).
//
// A scene's RICH capturable state (its scroll lane(s) + active segment) lives inside the
// scene's own runtime — but the capture chokepoint (captureSearchSessionOrigin in the
// overlay-session controller) runs OUTSIDE the React tree and must read those values
// SYNCHRONOUSLY and LIVE. Per CLAUDE.md, a provider must read from the scene's FEED RUNTIME /
// controller (live values), NOT a render-body hook whose effects may not fire.
//
// So each rich scene publishes a tiny LIVE-STATE PUBLICATION here (functions that read its
// live scroll/segment at call time), keyed by sceneKey. The overlay-session controller
// registers the BOOKMARKS / PROFILE capture providers that merge this live rich state onto
// the degenerate base (which already carries the correct sceneKey + LIVE detent). Keeping
// detent resolution in the controller (it owns the sheet-snap session) and scroll/segment in
// the scene keeps the layering clean.
//
// The publication is a pull (getter) snapshot, never a stored value: the scene mutates its
// own live scroll SharedValue / segment state freely and the getter reads the current value
// only when capture fires. Publishing is idempotent; the scene clears it on unmount.
export type OriginSceneLiveStatePublication = {
  /** live scroll lane(s) for this scene at call time (laneKey=sceneIdentityKey, offset=live). */
  getScrollLanes: () => OriginScrollLane[];
  /** live active sub-tab for a segmented scene (profile); omitted for non-segmented scenes. */
  getSegment?: () => string | null;
  /**
   * live route params for the scene's TRUE identity (profile: {profileUserId}); omitted for
   * scenes whose identity is fully carried by sceneKey (home). The single publisher (the scene
   * owner) populates this so the captured snapshot carries the real param axis — the foreign
   * profile source reads the same axis with a non-null profileUserId, no machinery change.
   */
  getSceneParams?: () => OverlayRouteParamsMap[OverlayKey] | null;
};

const originSceneLiveStatePublications = new Map<OverlayKey, OriginSceneLiveStatePublication>();

export const publishOriginSceneLiveState = (
  sceneKey: OverlayKey,
  publication: OriginSceneLiveStatePublication
): (() => void) => {
  originSceneLiveStatePublications.set(sceneKey, publication);
  return () => {
    if (originSceneLiveStatePublications.get(sceneKey) === publication) {
      originSceneLiveStatePublications.delete(sceneKey);
    }
  };
};

export const getOriginSceneLiveState = (
  sceneKey: OverlayKey
): OriginSceneLiveStatePublication | undefined => originSceneLiveStatePublications.get(sceneKey);
