import type React from 'react';

import type { BottomSheetWithFlashListProps, SnapPoints } from './BottomSheetWithFlashList';

export type OverlayKey =
  | 'search'
  | 'polls'
  | 'bookmarks'
  | 'profile'
  | 'restaurant'
  | 'saveList'
  | 'price'
  | 'scoreInfo'
  | 'pollCreation';

export type OverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';

export type SnapProfile = {
  expanded: number;
  middle: number;
  collapsed: number;
  hidden: number;
  dismissThreshold?: number;
};

export type OverlayContentSpec<T> = {
  overlayKey: OverlayKey;
  snapPoints: SnapPoints;
  underlayComponent?: React.ReactNode;
} & Omit<BottomSheetWithFlashListProps<T>, 'visible' | 'snapPoints'>;
