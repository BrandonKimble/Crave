import type React from 'react';

import type { SnapPoints } from '../../bottomSheetMotionTypes';
import type { OverlaySheetSnap } from '../../types';
import type { SearchRouteSceneSnapMeta } from '../../searchRouteSceneShellMotionContract';

export type PollsPanelParams = {
  /**
   * LEGACY route identity (notification deep links / poll-creation pass-through).
   * The FEED no longer consumes these — it is viewport-scoped (§22 item 5); the
   * pinned-market feed arm is dead. They die entirely when notification targeting
   * moves to placeId (the server's quarantined home-place seam).
   */
  marketKey?: string | null;
  marketName?: string | null;
  pollId?: string | null;
  pinnedMarket?: boolean | null;
};

export type PollsPanelMode = 'docked' | 'overlay';

export type PollsPanelInitialSnapPoint = 'expanded' | 'middle' | 'collapsed';

export type PollsPanelSnapMeta = SearchRouteSceneSnapMeta;

export type PollsPanelInteractionRef = React.MutableRefObject<{ isInteracting: boolean }>;

export type UsePollsPanelSpecOptions = {
  visible: boolean;
  params?: PollsPanelParams;
  initialSnapPoint?: PollsPanelInitialSnapPoint;
  mode?: PollsPanelMode;
  currentSnap?: OverlaySheetSnap;
  navBarTop?: number;
  navBarHeight?: number;
  searchBarTop?: number;
  snapPoints?: SnapPoints;
  onRequestPollCreationExpand?: () => void;
  onRequestReturnToSearch?: () => void;
  interactionRef?: PollsPanelInteractionRef;
};
