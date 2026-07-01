import React from 'react';

import { consumePendingOriginSceneSegmentRestore } from '../../originSceneSegmentRuntime';
import { useOriginSceneScrollPublication } from '../../useOriginSceneScrollPublication';
import {
  PROFILE_DEFAULT_SEGMENT,
  type ProfileSegment,
} from '../profileSceneQueryOptions';
import { useProfilePanelActionsRuntime } from './profile-panel-actions-runtime';
import { useProfilePanelDataRuntime } from './profile-panel-data-runtime';
import { useProfilePanelIdentityRuntime } from './profile-panel-identity-runtime';
import type {
  ProfilePanelActionsRuntime,
  ProfileSceneHeaderProps,
  ProfileSceneRow,
} from './profile-panel-runtime-contract';
import { useProfilePanelSegmentRowsRuntime } from './profile-panel-segment-rows-runtime';

// Runtime guard derived from the ProfileSegment type as the single source of truth: a Record keyed
// by the union forces a compile error HERE if a segment is added to the type without listing it,
// so the restore validator can never silently fall out of sync with the segments that exist.
const PROFILE_SEGMENT_LOOKUP: Record<ProfileSegment, true> = {
  created: true,
  contributed: true,
  favorites: true,
};

const isProfileSegment = (value: string | null): value is ProfileSegment =>
  value != null && Object.prototype.hasOwnProperty.call(PROFILE_SEGMENT_LOOKUP, value);

export type ProfilePanelBodyModelRuntime = {
  actionsRuntime: ProfilePanelActionsRuntime;
  headerProps: ProfileSceneHeaderProps;
  rows: readonly ProfileSceneRow[];
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
  const [activeSegment, setActiveSegment] =
    React.useState<ProfileSegment>(PROFILE_DEFAULT_SEGMENT);
  const actionsRuntime = useProfilePanelActionsRuntime();
  const dataLaneReady = actionsRuntime.isSignedIn && shouldRunDataLane;
  const dataRuntime = useProfilePanelDataRuntime({
    activeSegment,
    dataLaneReady,
    shouldRenderExpandedContent,
  });

  // Return-to-origin foundation — profile publishes its rich live state (scroll lane + active
  // segment) through THE SHARED publication primitive (one hook call; bookmarks uses the same hook
  // scroll-only). The hook reads the live shared scroll itself; profile supplies the live segment
  // getter. Own profile is the SELF-DEFAULT, param-less re-root, so it does NOT publish
  // sceneParams (its absence === a null self-default — byte-identical to today); a future
  // FOREIGN-profile source passes getSceneParams to the same hook and the restore forwards
  // {profileUserId} as routeParams — zero dismiss/restore machinery change.
  const activeSegmentRef = React.useRef(activeSegment);
  activeSegmentRef.current = activeSegment;
  useOriginSceneScrollPublication('profile', {
    getSegment: () => activeSegmentRef.current,
  });

  // Return-to-origin foundation — SEGMENT RESTORE consume. Gated on the SAME false→true
  // re-activation edge the scroll restore uses (isActive && shouldRenderExpandedContent) — NOT the
  // sticky hasActivatedExpandedContent alone (which fires once, ever, on first bootstrap and never
  // again on a WARM dismiss-return of the retained profile scene). So a warm return re-consumes the
  // freshly-staged segment, segment-FIRST, before the scroll restore measures rows. Consume-once:
  // an organic re-activation finds no pending flag and keeps the current segment. A layout effect
  // so the setState commits before paint.
  React.useLayoutEffect(() => {
    if (!isActive || !shouldRenderExpandedContent) {
      return;
    }
    const pendingSegment = consumePendingOriginSceneSegmentRestore('profile');
    if (isProfileSegment(pendingSegment)) {
      setActiveSegment(pendingSegment);
    }
  }, [isActive, shouldRenderExpandedContent]);
  const headerProps = useProfilePanelIdentityRuntime({
    activeSegment,
    onOpenSettings: actionsRuntime.handleOpenSettings,
    onSelectSegment: setActiveSegment,
    profile: dataRuntime.profile,
  });
  const rows = useProfilePanelSegmentRowsRuntime({
    activeSegment,
    dataRuntime,
    shouldRenderExpandedContent,
  });

  return React.useMemo(
    () => ({
      actionsRuntime,
      headerProps,
      rows,
    }),
    [actionsRuntime, headerProps, rows]
  );
};
