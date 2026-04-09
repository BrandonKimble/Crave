import type React from 'react';
import type { SharedValue } from 'react-native-reanimated';

import type { PollBootstrapSnapshot } from '../../../services/polls';
import type { MapBounds } from '../../../types';
import type { SnapPoints } from '../../bottomSheetMotionTypes';
import type { OverlaySheetSnap, OverlaySheetSnapRequest } from '../../types';

export type PollsPanelParams = {
  coverageKey?: string | null;
  pollId?: string | null;
};

export type PollsPanelMode = 'docked' | 'overlay';

export type PollsPanelInitialSnapPoint = 'expanded' | 'middle' | 'collapsed';

export type PollsPanelSnapMeta = { source: 'gesture' | 'programmatic' };

export type PollsPanelInteractionRef = React.MutableRefObject<{ isInteracting: boolean }>;

export type UsePollsPanelSpecOptions = {
  visible: boolean;
  bounds?: MapBounds | null;
  bootstrapSnapshot?: PollBootstrapSnapshot | null;
  params?: PollsPanelParams;
  initialSnapPoint?: PollsPanelInitialSnapPoint;
  mode?: PollsPanelMode;
  currentSnap?: OverlaySheetSnap;
  navBarTop?: number;
  navBarHeight?: number;
  searchBarTop?: number;
  snapPoints?: SnapPoints;
  onSnapStart?: (snap: OverlaySheetSnap, meta?: PollsPanelSnapMeta) => void;
  onSnapChange?: (snap: OverlaySheetSnap, meta?: PollsPanelSnapMeta) => void;
  shellSnapRequest?: OverlaySheetSnapRequest | null;
  onRequestPollCreationExpand?: () => void;
  onRequestReturnToSearch?: () => void;
  sheetY: SharedValue<number>;
  headerActionAnimationToken?: number;
  headerActionProgress?: SharedValue<number>;
  interactionRef?: PollsPanelInteractionRef;
};
