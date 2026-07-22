import React from 'react';

import type { SearchRouteMountedSceneBodyKey } from './searchOverlayRouteHostContract';
import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';
import { BookmarksMountedSceneBody } from './panels/BookmarksPanel';
import { ProfileMountedSceneBody } from './panels/ProfilePanel';
import { SaveListMountedSceneBody } from './panels/SaveListPanel';
import { PostPhotosPanelBody } from './panels/PostPhotosPanel';
import { DmSessionPanelBody, MessagesInboxPanelBody } from './panels/MessagingPanels';
import {
  EditProfileMountedSceneBody,
  FollowListMountedSceneBody,
  ListDetailMountedSceneBody,
  NotificationsMountedSceneBody,
  SettingsMountedSceneBody,
  UserProfileMountedSceneBody,
} from './panels/ChildScenePanels';
import { ShellVisibilityBoundary } from './ShellVisibilityBoundary';

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
        // L3 slice 3: the root own-tab under the visibility boundary (root scenes
        // have no entry units — the singleton path; the boundary is the display
        // fact's one home).
        return (
          <ShellVisibilityBoundary scene="profile">
            <ProfileMountedSceneBody />
          </ShellVisibilityBoundary>
        );
      case 'saveList':
        return <SaveListMountedSceneBody entry={entry} />;
      case 'userProfile':
        return <UserProfileMountedSceneBody entry={entry} />;
      case 'listDetail':
        return <ListDetailMountedSceneBody entry={entry} />;
      case 'followList':
        return <FollowListMountedSceneBody entry={entry} />;
      // L3 residency slice 1: the residency-managed leaves render under the liveness
      // boundary — their controllers re-derive on become-visible and their material's
      // clocks freeze when hidden (the retained-body stale-forever bug dies here).
      case 'notifications':
        return (
          <ShellVisibilityBoundary scene="notifications">
            <NotificationsMountedSceneBody entry={entry} />
          </ShellVisibilityBoundary>
        );
      case 'settings':
        return (
          <ShellVisibilityBoundary scene="settings">
            <SettingsMountedSceneBody entry={entry} />
          </ShellVisibilityBoundary>
        );
      case 'editProfile':
        return <EditProfileMountedSceneBody entry={entry} />;
      case 'postPhotos':
        return <PostPhotosPanelBody entry={entry} />;
      case 'messagesInbox':
        return <MessagesInboxPanelBody entry={entry} />;
      case 'dmSession':
        return <DmSessionPanelBody entry={entry} />;
      default:
        return null;
    }
  }
);

BottomSheetSceneStackMountedBody.displayName = 'BottomSheetSceneStackMountedBody';
