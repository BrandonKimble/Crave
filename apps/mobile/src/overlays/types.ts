import type React from 'react';

import type { BottomSheetSnap, SnapPoints } from './bottomSheetMotionTypes';
import type {
  BottomSheetWithFlashListBaseProps,
  BottomSheetWithFlashListProps,
  BottomSheetWithSceneRegistryProps,
} from './bottomSheetWithFlashListContract';

export type OverlayKey =
  | 'search'
  | 'searchRoute'
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

export type OverlaySceneRegistrySpec = OverlayContentSpecBase &
  Omit<BottomSheetWithFlashListBaseProps<unknown>, 'visible' | 'snapPoints'> &
  BottomSheetWithSceneRegistryProps;

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

export type OverlayResolvedSpec<T> = OverlayContentSpec<T> | OverlaySceneRegistrySpec;

export const isOverlayListContentSpec = <T>(
  spec: OverlayResolvedSpec<T> | null | undefined
): spec is OverlayListContentSpec<T> => spec?.surfaceKind === 'list';
