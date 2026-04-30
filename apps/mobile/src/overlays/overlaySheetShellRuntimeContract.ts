import type { RefObject } from 'react';
import type { FlashListRef } from '@shopify/flash-list';
import type { SharedValue } from 'react-native-reanimated';

import type {
  OverlayContentSpec,
  OverlaySheetFrameSpec,
  OverlayKey,
  OverlaySheetSnap,
} from './types';
import type {
  AppRouteSheetSnapSessionActions,
  AppRouteSheetSnapSessionAuthority,
} from '../navigation/runtime/app-route-sheet-snap-session-runtime';

export type OverlaySheetSnapStateRuntimeArgs = {
  spec: OverlaySheetFrameSpec | null;
  resolvedShellIdentityKey: string;
  activeOverlayKey: OverlayKey;
  rootOverlay: OverlayKey;
  overlayRouteStackLength: number;
  routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;
  routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;
};

export type OverlaySheetListRuntimeArgs = {
  visible: boolean;
  spec: OverlayContentSpec<unknown> | null;
  sceneIdentityKey: string;
  scrollOffset: SharedValue<number>;
};

export type OverlaySheetSnapRuntime = {
  handleSnapChange: (snap: OverlaySheetSnap, meta?: { source: 'gesture' | 'programmatic' }) => void;
  handleSnapStart: (snap: OverlaySheetSnap, meta?: { source: 'gesture' | 'programmatic' }) => void;
};

export type OverlaySheetSnapStateRuntime = OverlaySheetSnapRuntime & {
  persistedSnap: OverlaySheetSnap | null;
  resolvedSnapPersistenceKey: string | null;
  ensurePersistedSnap: (snap: OverlaySheetSnap) => void;
};

export type OverlaySheetListRuntime = {
  isListBackedSpec: boolean;
  resolvedListRef: RefObject<FlashListRef<unknown> | null>;
  handleScrollOffsetChange: (offsetY: number) => void;
};
