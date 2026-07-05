import React from 'react';

import type { SearchRouteMountedSceneBodyKey } from './searchOverlayRouteHostContract';
import { BookmarksMountedSceneBody } from './panels/BookmarksPanel';
import { ProfileMountedSceneBody } from './panels/ProfilePanel';
import { SaveListMountedSceneBody } from './panels/SaveListPanel';
import {
  EditProfileMountedSceneBody,
  FollowListMountedSceneBody,
  ListDetailMountedSceneBody,
  NotificationsMountedSceneBody,
  SettingsMountedSceneBody,
  ShareConfigMountedSceneBody,
  UserProfileMountedSceneBody,
} from './panels/StubScenePanels';

type BottomSheetSceneStackMountedBodyProps = {
  mountedBodyKey: SearchRouteMountedSceneBodyKey;
};

export const BottomSheetSceneStackMountedBody = React.memo(
  ({ mountedBodyKey }: BottomSheetSceneStackMountedBodyProps) => {
    switch (mountedBodyKey) {
      case 'bookmarks':
        return <BookmarksMountedSceneBody />;
      case 'profile':
        return <ProfileMountedSceneBody />;
      case 'saveList':
        return <SaveListMountedSceneBody />;
      case 'userProfile':
        return <UserProfileMountedSceneBody />;
      case 'listDetail':
        return <ListDetailMountedSceneBody />;
      case 'followList':
        return <FollowListMountedSceneBody />;
      case 'notifications':
        return <NotificationsMountedSceneBody />;
      case 'settings':
        return <SettingsMountedSceneBody />;
      case 'editProfile':
        return <EditProfileMountedSceneBody />;
      case 'shareConfig':
        return <ShareConfigMountedSceneBody />;
      default:
        return null;
    }
  }
);

BottomSheetSceneStackMountedBody.displayName = 'BottomSheetSceneStackMountedBody';
