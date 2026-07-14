import type {
  SearchOverlaySheetSnap,
  TabOverlaySnap,
} from '../../overlays/searchRouteSessionTypes';
import type { OverlayKey } from './app-overlay-route-types';
import {
  CONTENT_SEAT_SEED_SNAP,
  DOCKED_POLLS_RESURRECT_SNAP,
} from './app-route-sheet-snap-session-runtime';

// Two-posture law (plans/root-snap-law.md §Leg 2): the launch-origin detent for a ROOT overlay
// is simply its side's posture seat — home (search/polls → the home seat; 'hidden' means the
// docked polls are dismissed, whose sanctioned landing is the resurrect posture) or content
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
  if (overlay === 'search' || overlay === 'polls') {
    return homeSeatSnap === 'hidden' ? DOCKED_POLLS_RESURRECT_SNAP : homeSeatSnap;
  }
  return contentSeatSnap === 'hidden' ? CONTENT_SEAT_SEED_SNAP : contentSeatSnap;
};
