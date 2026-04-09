import type React from 'react';

import type { BottomSheetSnap, SnapPoints } from './bottomSheetMotionTypes';
import type { BottomSheetWithFlashListProps } from './bottomSheetWithFlashListContract';

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

export type OverlaySheetSnap = BottomSheetSnap;
export type OverlaySheetSnapRequest = {
  snap: OverlaySheetSnap;
  token?: number | null;
};

export type SnapProfile = {
  expanded: number;
  middle: number;
  collapsed: number;
  hidden: number;
  dismissThreshold?: number;
};

type OverlayContentSpecBase = {
  overlayKey: OverlayKey;
  snapPoints: SnapPoints;
  /**
   * Optional key used to persist and restore a sheet snap position across overlay switches.
   * - `undefined`: resolved automatically by the overlay shell.
   * - `null`: disables snap persistence for this overlay spec.
   * - `string`: uses the provided key.
   */
  snapPersistenceKey?: string | null;
  shellSnapRequest?: OverlaySheetSnapRequest | null;
  underlayComponent?: React.ReactNode;
  renderWrapper?: (children: React.ReactNode) => React.ReactNode;
};

export type OverlayListContentSpec<T> = OverlayContentSpecBase &
  Omit<
    Extract<BottomSheetWithFlashListProps<T>, { surfaceKind: 'list' }>,
    'visible' | 'snapPoints'
  >;

export type OverlayComponentContentSpec = OverlayContentSpecBase &
  Omit<
    Extract<BottomSheetWithFlashListProps<never>, { surfaceKind: 'content' }>,
    'visible' | 'snapPoints'
  >;

export type OverlayContentSpec<T> = OverlayListContentSpec<T> | OverlayComponentContentSpec;

export const isOverlayListContentSpec = <T>(
  spec: OverlayContentSpec<T> | null | undefined
): spec is OverlayListContentSpec<T> => spec?.surfaceKind === 'list';
