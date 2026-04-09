import type { OverlayKey } from '../store/overlayStore';
import type { SearchOverlaySheetSnap, TabOverlaySnap } from './searchRouteSessionTypes';

type ResolveSearchLaunchOriginSnapOptions = {
  overlay: OverlayKey;
  pollsSheetSnap: SearchOverlaySheetSnap;
  bookmarksSheetSnap: SearchOverlaySheetSnap;
  profileSheetSnap: SearchOverlaySheetSnap;
  isDockedPollsDismissed: boolean;
  hasUserSharedSnap: boolean;
  sharedSnap: Exclude<SearchOverlaySheetSnap, 'hidden' | 'collapsed'>;
};

const resolveSharedOverlaySnap = (
  hasUserSharedSnap: boolean,
  sharedSnap: Exclude<SearchOverlaySheetSnap, 'hidden' | 'collapsed'>
): TabOverlaySnap => (hasUserSharedSnap ? sharedSnap : 'expanded');

export const resolveSearchLaunchOriginSnap = ({
  overlay,
  pollsSheetSnap,
  bookmarksSheetSnap,
  profileSheetSnap,
  isDockedPollsDismissed,
  hasUserSharedSnap,
  sharedSnap,
}: ResolveSearchLaunchOriginSnapOptions): TabOverlaySnap => {
  if (overlay === 'polls') {
    return pollsSheetSnap === 'hidden' ? 'collapsed' : pollsSheetSnap;
  }
  if (overlay === 'bookmarks') {
    return bookmarksSheetSnap === 'hidden'
      ? resolveSharedOverlaySnap(hasUserSharedSnap, sharedSnap)
      : bookmarksSheetSnap;
  }
  if (overlay === 'profile') {
    return profileSheetSnap === 'hidden'
      ? resolveSharedOverlaySnap(hasUserSharedSnap, sharedSnap)
      : profileSheetSnap;
  }
  if (overlay === 'search') {
    if (pollsSheetSnap !== 'hidden') {
      return pollsSheetSnap;
    }
    if (isDockedPollsDismissed) {
      return 'collapsed';
    }
    return resolveSharedOverlaySnap(hasUserSharedSnap, sharedSnap);
  }
  return resolveSharedOverlaySnap(hasUserSharedSnap, sharedSnap);
};
