import React from 'react';

import type { SearchRouteMountedSceneBodyKey } from './searchOverlayRouteHostContract';
import type {
  BottomSheetSceneStackBodyDefaults,
  BottomSheetSceneStackBodyScrollRuntime,
} from './bottomSheetSceneStackHostContract';
import { BookmarksMountedSceneBody } from './panels/BookmarksPanel';
import { PollsMountedSceneBody } from './panels/PollsPanel';
import { ProfileMountedSceneBody } from './panels/ProfilePanel';
import { SaveListMountedSceneBody } from './panels/SaveListPanel';
import { SearchMountedSceneBody } from './SearchMountedSceneBody';

type BottomSheetSceneStackMountedBodyProps = {
  mountedBodyKey: SearchRouteMountedSceneBodyKey;
  bodyDefaults?: BottomSheetSceneStackBodyDefaults;
  bodyScrollRuntime?: BottomSheetSceneStackBodyScrollRuntime;
};

export const BottomSheetSceneStackMountedBody = React.memo(
  ({ mountedBodyKey, bodyDefaults, bodyScrollRuntime }: BottomSheetSceneStackMountedBodyProps) => {
    switch (mountedBodyKey) {
      case 'bookmarks':
        return <BookmarksMountedSceneBody />;
      case 'polls':
        return <PollsMountedSceneBody />;
      case 'profile':
        return <ProfileMountedSceneBody />;
      case 'saveList':
        return <SaveListMountedSceneBody />;
      case 'search':
        return (
          <SearchMountedSceneBody
            bodyDefaults={bodyDefaults}
            bodyScrollRuntime={bodyScrollRuntime}
          />
        );
      default:
        return null;
    }
  }
);

BottomSheetSceneStackMountedBody.displayName = 'BottomSheetSceneStackMountedBody';
