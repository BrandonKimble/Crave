import React from 'react';

import type { SearchRouteMountedSceneBodyKey } from './searchOverlayRouteHostContract';
import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';
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

/**
 * W1 slice 1 (C2): a mounted CHILD body receives ITS route entry as a prop — entryId + params
 * flow from the entry-keyed mount unit, never from useTopMostRouteEntryForScene (topmost-per-
 * key breaks with two live entries of one key). Root bodies (bookmarks/profile) stay prop-less
 * singletons; `entry` is optional so the legacy singleton render path stays byte-identical.
 */
export type MountedSceneBodyProps = {
  entry?: OverlayRouteEntry | null;
};

type BottomSheetSceneStackMountedBodyProps = {
  mountedBodyKey: SearchRouteMountedSceneBodyKey;
  entry?: OverlayRouteEntry | null;
};

export const BottomSheetSceneStackMountedBody = React.memo(
  ({ mountedBodyKey, entry }: BottomSheetSceneStackMountedBodyProps) => {
    switch (mountedBodyKey) {
      case 'bookmarks':
        return <BookmarksMountedSceneBody />;
      case 'profile':
        return <ProfileMountedSceneBody />;
      case 'saveList':
        return <SaveListMountedSceneBody entry={entry} />;
      case 'userProfile':
        return <UserProfileMountedSceneBody entry={entry} />;
      case 'listDetail':
        return <ListDetailMountedSceneBody entry={entry} />;
      case 'followList':
        return <FollowListMountedSceneBody entry={entry} />;
      case 'notifications':
        return <NotificationsMountedSceneBody entry={entry} />;
      case 'settings':
        return <SettingsMountedSceneBody entry={entry} />;
      case 'editProfile':
        return <EditProfileMountedSceneBody entry={entry} />;
      case 'shareConfig':
        return <ShareConfigMountedSceneBody entry={entry} />;
      default:
        return null;
    }
  }
);

BottomSheetSceneStackMountedBody.displayName = 'BottomSheetSceneStackMountedBody';
