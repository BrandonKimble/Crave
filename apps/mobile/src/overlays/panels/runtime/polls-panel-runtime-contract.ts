import type React from 'react';

import type { PollBootstrapSnapshot } from '../../../services/polls';
import type { Coordinate, MapBounds } from '../../../types';
import type { SnapPoints } from '../../bottomSheetMotionTypes';
import type { OverlaySheetSnap } from '../../types';
import type {
  SearchRouteSceneShellMotionContract,
  SearchRouteSceneSnapMeta,
} from '../../searchRouteSceneShellMotionContract';

export type PollsPanelParams = {
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
  bounds?: MapBounds | null;
  bootstrapSnapshot?: PollBootstrapSnapshot | null;
  userLocation?: Coordinate | null;
  params?: PollsPanelParams;
  initialSnapPoint?: PollsPanelInitialSnapPoint;
  mode?: PollsPanelMode;
  currentSnap?: OverlaySheetSnap;
  navBarTop?: number;
  navBarHeight?: number;
  searchBarTop?: number;
  snapPoints?: SnapPoints;
  onSnapStart?: SearchRouteSceneShellMotionContract['onSnapStart'];
  onSnapChange?: SearchRouteSceneShellMotionContract['onSnapChange'];
  onRequestPollCreationExpand?: () => void;
  onRequestReturnToSearch?: () => void;
  interactionRef?: PollsPanelInteractionRef;
};
