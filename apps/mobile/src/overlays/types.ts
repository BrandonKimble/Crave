import type React from 'react';

import type { BottomSheetSnap, SnapPoints } from './bottomSheetMotionTypes';
import type {
  BottomSheetWithFlashListBaseProps,
  BottomSheetWithFlashListProps,
} from './bottomSheetWithFlashListContract';

export type OverlayKey =
  | 'search'
  | 'searchRoute'
  | 'polls'
  | 'bookmarks'
  | 'profile'
  | 'favoriteListDetail'
  | 'restaurant'
  | 'saveList'
  | 'price'
  | 'scoreInfo'
  | 'pollCreation'
  | 'pollDetail';

export type OverlaySheetSnap = BottomSheetSnap;
export type OverlaySheetSnapRequest = {
  snap: OverlaySheetSnap;
  token?: number | null;
  settleToken?: number | null;
  mode?: 'spring' | 'instant';
};

export type SnapProfile = {
  expanded: number;
  middle: number;
  collapsed: number;
  hidden: number;
  dismissThreshold?: number;
};

export type OverlayContentSpecBase = {
  overlayKey: OverlayKey;
  semanticOverlayKey?: OverlayKey | null;
  shellIdentityKey?: string | null;
  /**
   * Optional scene identity used by the shell runtime for per-scene scroll/state persistence.
   * This lets a persistent shell stay stable while scene-local state still tracks the active scene.
   */
  sceneIdentityKey?: string | null;
  snapPoints: SnapPoints;
  shellSnapRequest?: OverlaySheetSnapRequest | null;
  underlayComponent?: React.ReactNode;
  renderWrapper?: (children: React.ReactNode) => React.ReactNode;
};

export type OverlaySheetFrameSpec = OverlayContentSpecBase &
  Omit<BottomSheetWithFlashListBaseProps<any>, 'visible' | 'snapPoints'>;

export type OverlayListContentSpec<T> = OverlaySheetFrameSpec &
  Omit<
    Extract<BottomSheetWithFlashListProps<T>, { surfaceKind: 'list' }>,
    'visible' | 'snapPoints'
  > & {
    ListChromeComponent?: React.ReactNode;
  };

export type OverlayComponentContentSpec = OverlaySheetFrameSpec &
  Omit<
    Extract<BottomSheetWithFlashListProps<never>, { surfaceKind: 'content' }>,
    'visible' | 'snapPoints'
  >;

export type OverlayContentSpec<T> = OverlayListContentSpec<T> | OverlayComponentContentSpec;

export const isOverlayListContentSpec = <T>(
  spec: OverlayContentSpec<T> | null | undefined
): spec is OverlayListContentSpec<T> => spec?.surfaceKind === 'list';
