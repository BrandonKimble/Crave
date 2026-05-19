import React from 'react';

import type { SearchRouteMountedSceneBodyKey } from './searchOverlayRouteHostContract';
import { BookmarksMountedSceneBody } from './panels/BookmarksPanel';
import { PollsMountedSceneBody } from './panels/PollsPanel';
import { ProfileMountedSceneBody } from './panels/ProfilePanel';
import { SaveListMountedSceneBody } from './panels/SaveListPanel';

type BottomSheetSceneStackMountedBodyProps = {
  mountedBodyKey: SearchRouteMountedSceneBodyKey;
};

export const BottomSheetSceneStackMountedBody = React.memo(
  ({ mountedBodyKey }: BottomSheetSceneStackMountedBodyProps) => {
    switch (mountedBodyKey) {
      case 'bookmarks':
        return <BookmarksMountedSceneBody />;
      case 'polls':
        return <PollsMountedSceneBody />;
      case 'profile':
        return <ProfileMountedSceneBody />;
      case 'saveList':
        return <SaveListMountedSceneBody />;
      default:
        return null;
    }
  }
);

BottomSheetSceneStackMountedBody.displayName = 'BottomSheetSceneStackMountedBody';
