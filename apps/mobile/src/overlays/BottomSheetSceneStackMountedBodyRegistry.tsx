import React from 'react';

import type { SearchRouteMountedSceneBodyKey } from './searchOverlayRouteHostContract';
import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';
import { ListsMountedSceneBody } from './panels/ListsPanel';
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
 * key breaks with two live entries of one key). Root bodies (lists/profile) stay prop-less
 * singletons; `entry` is optional so the legacy singleton render path stays byte-identical.
 */
export type MountedSceneBodyProps = {
  entry?: OverlayRouteEntry | null;
};

/**
 * F981 — THE `Partial<>` IS THE DEFECT, so it is gone.
 *
 * This table used to be typed `Partial<Record<SearchRouteMountedSceneBodyKey, ...>>`, which
 * is exactly what removed the compile force it was built to provide: `'home'` and `'search'`
 * are declared members of the key union, had no entry here, and the `if (Body == null)`
 * below silently rendered NOTHING for them. Adding a fifteenth key to the union could never
 * fail the build — the scene would just come up blank at runtime.
 *
 * The shape now (F908's array-derives-the-type, F939's exhaustive Record):
 *  - `NON_MOUNTED_SCENE_BODY_KEYS` states the closed, deliberate exclusion set — 'home',
 *    'search' and 'polls' publish `surfaceKind: 'list'` bodies, not mounted bodies. ('polls'
 *    was NOT named in the original finding: the exhaustive Record found the third hole on
 *    its first compile, which is the whole point of removing the `Partial<>`.)
 *  - the table is an EXHAUSTIVE `Record` over everything else, so a new mounted-body key
 *    that forgets its component is a BUILD ERROR, and a key that is deliberately not a
 *    mounted body must say so out loud by joining the exclusion set.
 */
const NON_MOUNTED_SCENE_BODY_KEYS = ['home', 'search', 'polls'] as const;

type NonMountedSceneBodyKey = (typeof NON_MOUNTED_SCENE_BODY_KEYS)[number];

type MountedSceneBodyRegistryKey = Exclude<SearchRouteMountedSceneBodyKey, NonMountedSceneBodyKey>;

const MOUNTED_BODY_BY_KEY: Record<
  MountedSceneBodyRegistryKey,
  React.ComponentType<MountedSceneBodyProps>
> = {
  lists: ListsMountedSceneBody,
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
const isMountedSceneBodyRegistryKey = (
  key: SearchRouteMountedSceneBodyKey
): key is MountedSceneBodyRegistryKey =>
  !(NON_MOUNTED_SCENE_BODY_KEYS as readonly string[]).includes(key);

export const BottomSheetSceneStackMountedBody = React.memo(
  ({ mountedBodyKey, entry }: BottomSheetSceneStackMountedBodyProps) => {
    if (!isMountedSceneBodyRegistryKey(mountedBodyKey)) {
      // F981: reaching here means a scene that publishes a LIST body asked to be rendered as
      // a MOUNTED one. That used to render null silently — a blank scene with no bark. The
      // table itself can no longer be incomplete (it is an exhaustive Record), so this arm
      // is now the only way to get nothing, and it says so.
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.error(
          `[mounted-body-registry] F981: scene '${mountedBodyKey}' is declared a non-mounted ` +
            'body (it publishes a list surface) but was rendered through the mounted-body registry.'
        );
      }
      return null;
    }
    const Body = MOUNTED_BODY_BY_KEY[mountedBodyKey];
    const content = <Body entry={entry} />;
    return isResidencyManagedScene(mountedBodyKey) ? (
      <ShellVisibilityBoundary scene={mountedBodyKey}>{content}</ShellVisibilityBoundary>
    ) : (
      content
    );
  }
);

BottomSheetSceneStackMountedBody.displayName = 'BottomSheetSceneStackMountedBody';
