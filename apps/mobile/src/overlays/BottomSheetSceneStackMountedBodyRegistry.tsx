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
import { isResidencyManagedScene } from './shell-residency-registry';
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

/** One component per mounted-body key — the registry's ONLY per-scene fact. */
const MOUNTED_BODY_BY_KEY: Partial<
  Record<SearchRouteMountedSceneBodyKey, React.ComponentType<MountedSceneBodyProps>>
> = {
  bookmarks: BookmarksMountedSceneBody,
  profile: ProfileMountedSceneBody,
  saveList: SaveListMountedSceneBody,
  userProfile: UserProfileMountedSceneBody,
  listDetail: ListDetailMountedSceneBody,
  followList: FollowListMountedSceneBody,
  notifications: NotificationsMountedSceneBody,
  settings: SettingsMountedSceneBody,
  editProfile: EditProfileMountedSceneBody,
  postPhotos: PostPhotosPanelBody,
  messagesInbox: MessagesInboxPanelBody,
  dmSession: DmSessionPanelBody,
};

type BottomSheetSceneStackMountedBodyProps = {
  mountedBodyKey: SearchRouteMountedSceneBodyKey;
  entry?: OverlayRouteEntry | null;
};

/**
 * L3 residency: the visibility boundary is DERIVED from registry membership
 * (`isResidencyManagedScene`), applied exactly once here — the "which scenes are
 * managed" fact has ONE home (RESIDENCY_MANAGED_SCENES), so adding a scene to the
 * registry cannot silently miss its boundary (the old hand-wrapped switch could).
 */
export const BottomSheetSceneStackMountedBody = React.memo(
  ({ mountedBodyKey, entry }: BottomSheetSceneStackMountedBodyProps) => {
    const Body = MOUNTED_BODY_BY_KEY[mountedBodyKey];
    if (Body == null) {
      return null;
    }
    const content = <Body entry={entry} />;
    return isResidencyManagedScene(mountedBodyKey) ? (
      <ShellVisibilityBoundary scene={mountedBodyKey}>{content}</ShellVisibilityBoundary>
    ) : (
      content
    );
  }
);

BottomSheetSceneStackMountedBody.displayName = 'BottomSheetSceneStackMountedBody';
