import React from 'react';

import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
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
    if (surface === 'background') {
      return <FrostedGlassBackground />;
    }

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
