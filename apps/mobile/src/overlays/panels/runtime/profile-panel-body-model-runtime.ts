import React from 'react';
import { useQuery } from '@tanstack/react-query';

import { consumePendingOriginSceneSegmentRestore } from '../../originSceneSegmentRuntime';
import { useOriginSceneScrollPublication } from '../../useOriginSceneScrollPublication';
import {
  PROFILE_DEFAULT_SECTION,
  isProfileSectionKey,
  type ProfileSectionKey,
} from '../ProfileSectionsBody';
import { createProfileQueryOptions } from '../profileSceneQueryOptions';
import { useProfilePanelActionsRuntime } from './profile-panel-actions-runtime';
import { useProfilePanelIdentityRuntime } from './profile-panel-identity-runtime';
import type {
  ProfilePanelActionsRuntime,
  ProfileSceneHeaderProps,
} from './profile-panel-runtime-contract';

export type ProfilePanelBodyModelRuntime = {
  actionsRuntime: ProfilePanelActionsRuntime;
  headerProps: ProfileSceneHeaderProps;
  // The signed-in user's own id — the key the shared ProfileSectionsBody fetches its four sections
  // against. Null while the getMe read is still resolving (the sections stay a skeleton until then).
  userId: string | null;
  activeSection: ProfileSectionKey;
  onSelectSection: (section: ProfileSectionKey) => void;
  // Gate the section queries: signed-in, the scene has expanded, and the own profile resolved.
  sectionsEnabled: boolean;
};

export const useProfilePanelBodyModelRuntime = ({
  shouldRenderExpandedContent,
  shouldRunDataLane,
  isActive,
}: {
  shouldRenderExpandedContent: boolean;
  shouldRunDataLane: boolean;
  isActive: boolean;
}): ProfilePanelBodyModelRuntime => {
  const [activeSection, setActiveSection] =
    React.useState<ProfileSectionKey>(PROFILE_DEFAULT_SECTION);
  const actionsRuntime = useProfilePanelActionsRuntime();
  const dataLaneReady = actionsRuntime.isSignedIn && shouldRunDataLane;

  // Own profile identity read (getMe) — prewarms with the data lane; feeds the identity chrome
  // (avatar / name / metrics FrostCutout) and yields the userId the shared sections fetch against.
  const profileQuery = useQuery({
    ...createProfileQueryOptions(),
    enabled: dataLaneReady,
    subscribed: dataLaneReady,
  });
  const profile = profileQuery.data;
  const userId = profile?.userId ?? null;

  // Return-to-origin foundation — profile publishes its rich live state (scroll lane + active
  // section) through THE SHARED publication primitive (one hook call; bookmarks uses the same hook
  // scroll-only). The hook reads the live shared scroll itself; profile supplies the live section
  // getter. Own profile is the SELF-DEFAULT, param-less re-root, so it does NOT publish
  // sceneParams (its absence === a null self-default — byte-identical to today); a future
  // FOREIGN-profile source passes getSceneParams to the same hook and the restore forwards
  // {profileUserId} as routeParams — zero dismiss/restore machinery change.
  const activeSectionRef = React.useRef(activeSection);
  activeSectionRef.current = activeSection;
  useOriginSceneScrollPublication('profile', {
    getSegment: () => activeSectionRef.current,
  });

  // Return-to-origin foundation — SECTION RESTORE consume. Gated on the SAME false→true
  // re-activation edge the scroll restore uses (isActive && shouldRenderExpandedContent) — NOT the
  // sticky hasActivatedExpandedContent alone (which fires once, ever, on first bootstrap and never
  // again on a WARM dismiss-return of the retained profile scene). So a warm return re-consumes the
  // freshly-staged section, section-FIRST, before the scroll restore measures rows. Consume-once:
  // an organic re-activation finds no pending flag and keeps the current section. A layout effect
  // so the setState commits before paint.
  React.useLayoutEffect(() => {
    if (!isActive || !shouldRenderExpandedContent) {
      return;
    }
    const pendingSegment = consumePendingOriginSceneSegmentRestore('profile');
    if (isProfileSectionKey(pendingSegment)) {
      setActiveSection(pendingSegment);
    }
  }, [isActive, shouldRenderExpandedContent]);

  // Followers/Following taps need the resolved own userId — bound here (the identity chrome
  // stays a dumb presenter). Inert until getMe resolves; the stat values are skeletons then too.
  const handleOpenFollowList = actionsRuntime.handleOpenFollowList;
  const onOpenFollowList = React.useCallback(
    (mode: 'followers' | 'following') => {
      if (userId == null) {
        return;
      }
      handleOpenFollowList(userId, mode);
    },
    [handleOpenFollowList, userId]
  );

  const headerProps = useProfilePanelIdentityRuntime({
    onOpenSettings: actionsRuntime.handleOpenSettings,
    onOpenMessages: actionsRuntime.handleOpenMessages,
    onOpenFollowList,
    profile,
  });

  const sectionsEnabled = dataLaneReady && shouldRenderExpandedContent && userId != null;

  return React.useMemo(
    () => ({
      actionsRuntime,
      headerProps,
      userId,
      activeSection,
      onSelectSection: setActiveSection,
      sectionsEnabled,
    }),
    [actionsRuntime, headerProps, userId, activeSection, sectionsEnabled]
  );
};
