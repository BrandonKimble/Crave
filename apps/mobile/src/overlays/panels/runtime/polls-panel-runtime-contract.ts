import type React from 'react';

import type { SnapPoints } from '../../bottomSheetMotionTypes';
import type { OverlaySheetSnap } from '../../types';

export type PollsPanelParams = {
  /** A poll to auto-open on entry (notification deep links / post-create). */
  pollId?: string | null;
};

// F1494: was 'docked' | 'overlay'. The only producer
// (useSearchRoutePollsSceneStateRuntime.ts) has always hardcoded 'docked' — 'overlay'
// had zero assignments repo-wide, so its lone consumer (the `mode === 'overlay' ?
// 'middle' : 'collapsed'` ternary in polls-panel-feed-runtime.ts) was unreachable.
// Narrowed to the one live value; if an overlay-seated polls mode is ever built,
// re-widen the union there.
export type PollsPanelMode = 'docked';

export type PollsPanelInitialSnapPoint = 'expanded' | 'middle' | 'collapsed';

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
