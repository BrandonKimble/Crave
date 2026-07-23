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
        // L3 slice 4 (the pair): the lists root tab under the visibility boundary.
        return (
          <ShellVisibilityBoundary scene="bookmarks">
            <BookmarksMountedSceneBody />
          </ShellVisibilityBoundary>
        );
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
        return (
          <ShellVisibilityBoundary scene="saveList">
            <SaveListMountedSceneBody entry={entry} />
          </ShellVisibilityBoundary>
        );
      case 'userProfile':
        return (
          <ShellVisibilityBoundary scene="userProfile">
            <UserProfileMountedSceneBody entry={entry} />
          </ShellVisibilityBoundary>
        );
      case 'listDetail':
        // L3 slice 4 (the pair): the first MULTI-ENTRY managed scene — identity-keyed
        // resident units (listId) mean this body's tree survives pops and re-pushes of
        // the same list; per-unit activity + the scene bit compose the visibility.
        return (
          <ShellVisibilityBoundary scene="listDetail">
            <ListDetailMountedSceneBody entry={entry} />
          </ShellVisibilityBoundary>
        );
      case 'followList':
        return (
          <ShellVisibilityBoundary scene="followList">
            <FollowListMountedSceneBody entry={entry} />
          </ShellVisibilityBoundary>
        );
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
        return (
          <ShellVisibilityBoundary scene="editProfile">
            <EditProfileMountedSceneBody entry={entry} />
          </ShellVisibilityBoundary>
        );
      case 'postPhotos':
        return (
          <ShellVisibilityBoundary scene="postPhotos">
            <PostPhotosPanelBody entry={entry} />
          </ShellVisibilityBoundary>
        );
      case 'messagesInbox':
        return (
          <ShellVisibilityBoundary scene="messagesInbox">
            <MessagesInboxPanelBody entry={entry} />
          </ShellVisibilityBoundary>
        );
      case 'dmSession':
        return (
          <ShellVisibilityBoundary scene="dmSession">
            <DmSessionPanelBody entry={entry} />
          </ShellVisibilityBoundary>
        );
      default:
        return null;
    }
  }
);

BottomSheetSceneStackMountedBody.displayName = 'BottomSheetSceneStackMountedBody';
