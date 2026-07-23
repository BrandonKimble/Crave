import type React from 'react';

import type { SnapPoints } from '../../bottomSheetMotionTypes';
import type { OverlaySheetSnap } from '../../types';
import type { SearchRouteSceneSnapMeta } from '../../searchRouteSceneShellMotionContract';

export type PollsPanelParams = {
  /** A poll to auto-open on entry (notification deep links / post-create). */
  pollId?: string | null;
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
