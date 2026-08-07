import type React from 'react';

import type { SnapPoints } from '../../bottomSheetMotionTypes';
import type { OverlaySheetSnap } from '../../types';

export type PollsPanelParams = {
  /** A poll to auto-open on entry (notification deep links / post-create). */
  pollId?: string | null;
};

export type PollsPanelInitialSnapPoint = 'expanded' | 'middle' | 'collapsed';

export type PollsPanelInteractionRef = React.MutableRefObject<{ isInteracting: boolean }>;

export type UsePollsPanelSpecOptions = {
  visible: boolean;
  params?: PollsPanelParams;
  initialSnapPoint?: PollsPanelInitialSnapPoint;
  currentSnap?: OverlaySheetSnap;
  navBarTop?: number;
  navBarHeight?: number;
  searchBarTop?: number;
  snapPoints?: SnapPoints;
  onRequestReturnToSearch?: () => void;
  interactionRef?: PollsPanelInteractionRef;
};
