import type {
  SearchOverlaySheetSnap,
  TabOverlaySnap,
} from '../../overlays/searchRouteSessionTypes';
import { type OverlayKey } from './app-overlay-route-types';
import { DOCKED_SCENE_KEY } from './docked-scene-target';
import {
  CONTENT_SEAT_SEED_SNAP,
  DOCKED_SCENE_RESURRECT_SNAP,
} from './app-route-sheet-snap-session-runtime';

// Two-posture law (plans/root-snap-law.md §Leg 2): the launch-origin detent for a ROOT overlay
// is simply its side's posture seat — home (search/polls → the home seat; 'hidden' means the
// the docked scene is dismissed, whose sanctioned landing is the resurrect posture) or content
// (ONE shared seat for every other root page; never hidden). The old per-tab entries and their
// hidden→sharedSnap fallback arms died with the seats.
type ResolveSearchLaunchOriginSnapOptions = {
  overlay: OverlayKey;
  homeSeatSnap: SearchOverlaySheetSnap;
  contentSeatSnap: SearchOverlaySheetSnap;
};

export const resolveSearchLaunchOriginSnap = ({
  overlay,
  homeSeatSnap,
  contentSeatSnap,
}: ResolveSearchLaunchOriginSnapOptions): TabOverlaySnap => {
  if (overlay === 'search' || overlay === DOCKED_SCENE_KEY) {
    return homeSeatSnap === 'hidden' ? DOCKED_SCENE_RESURRECT_SNAP : homeSeatSnap;
  }
  return contentSeatSnap === 'hidden' ? CONTENT_SEAT_SEED_SNAP : contentSeatSnap;
};
