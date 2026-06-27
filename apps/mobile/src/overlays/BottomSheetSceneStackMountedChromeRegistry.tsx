import React from 'react';

import type { SearchRouteMountedSceneChromeKey } from './searchOverlayRouteHostContract';
import { BookmarksMountedSceneHeader } from './panels/BookmarksPanel';
import { PollsMountedSceneHeader } from './panels/PollsPanel';
import { ProfileMountedSceneHeader } from './panels/ProfilePanel';
import { SaveListMountedSceneHeader } from './panels/SaveListPanel';

export type BottomSheetSceneStackMountedChromeSurface =
  | 'underlay'
  | 'background'
  | 'header'
  | 'overlay';

type BottomSheetSceneStackMountedChromeProps = {
  mountedChromeKey: SearchRouteMountedSceneChromeKey;
  surface: BottomSheetSceneStackMountedChromeSurface;
};

export const BottomSheetSceneStackMountedChrome = React.memo(
  ({ mountedChromeKey, surface }: BottomSheetSceneStackMountedChromeProps) => {
    // Frost is now the shared page-frame foundation (every sheet is frosty by default), so the
    // mounted scenes no longer render their own background frost.
    if (surface !== 'header') {
      return null;
    }

    switch (mountedChromeKey) {
      case 'bookmarks':
        return <BookmarksMountedSceneHeader />;
      case 'polls':
        return <PollsMountedSceneHeader />;
      case 'profile':
        return <ProfileMountedSceneHeader />;
      case 'saveList':
        return <SaveListMountedSceneHeader />;
      default:
        return null;
    }
  }
);

BottomSheetSceneStackMountedChrome.displayName = 'BottomSheetSceneStackMountedChrome';
