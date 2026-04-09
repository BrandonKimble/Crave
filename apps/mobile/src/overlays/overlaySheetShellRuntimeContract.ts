import type { MutableRefObject, RefObject } from 'react';
import type { FlashListRef } from '@shopify/flash-list';
import type { SharedValue } from 'react-native-reanimated';

import type {
  OverlayContentSpec,
  OverlayKey,
  OverlaySheetSnap,
  OverlaySheetSnapRequest,
} from './types';
import type { BottomSheetRuntimeModel } from './useBottomSheetRuntime';

export type OverlaySheetResolvedSnapRuntimeArgs = {
  spec: OverlayContentSpec<unknown> | null;
  resolvedOverlayKey: OverlayKey;
  rootOverlay: OverlayKey;
  overlayRouteStackLength: number;
};

export type OverlaySheetSnapCommandRuntimeArgs = {
  runtime: BottomSheetRuntimeModel;
  handleSnapChangeBase: (
    snap: OverlaySheetSnap,
    meta?: { source: 'gesture' | 'programmatic' }
  ) => void;
  handleSnapStartBase: (
    snap: OverlaySheetSnap,
    meta?: { source: 'gesture' | 'programmatic' }
  ) => void;
};

export type OverlaySheetDesiredSnapRuntimeArgs = {
  visible: boolean;
  spec: OverlayContentSpec<unknown> | null;
  resolvedOverlayKey: OverlayKey;
  persistedSnap: OverlaySheetSnap | null;
  resolvedSnapPersistenceKey: string | null;
  ensurePersistedSnap: (snap: OverlaySheetSnap) => void;
  screenHeight: number;
  sheetY: SharedValue<number>;
  requestShellSnap: (request: OverlaySheetSnapRequest | null) => void;
  requestedShellSnapRef: MutableRefObject<OverlaySheetSnapRequest | null>;
  currentSnapRef: MutableRefObject<'expanded' | 'middle' | 'collapsed' | 'hidden'>;
};

export type OverlaySheetListRuntimeArgs = {
  visible: boolean;
  spec: OverlayContentSpec<unknown> | null;
  resolvedOverlayKey: OverlayKey;
  scrollOffset: SharedValue<number>;
};

export type OverlaySheetSnapRuntime = {
  handleSnapChange: (snap: OverlaySheetSnap, meta?: { source: 'gesture' | 'programmatic' }) => void;
  handleSnapStart: (snap: OverlaySheetSnap, meta?: { source: 'gesture' | 'programmatic' }) => void;
};

export type OverlaySheetResolvedSnapRuntime = OverlaySheetSnapRuntime & {
  persistedSnap: OverlaySheetSnap | null;
  resolvedSnapPersistenceKey: string | null;
  ensurePersistedSnap: (snap: OverlaySheetSnap) => void;
};

export type OverlaySheetSnapCommandRuntime = OverlaySheetSnapRuntime & {
  requestShellSnap: (request: OverlaySheetSnapRequest | null) => void;
  requestedShellSnapRef: MutableRefObject<OverlaySheetSnapRequest | null>;
  currentSnapRef: MutableRefObject<'expanded' | 'middle' | 'collapsed' | 'hidden'>;
};

export type OverlaySheetListRuntime = {
  isListBackedSpec: boolean;
  resolvedListRef: RefObject<FlashListRef<unknown> | null>;
  handleScrollOffsetChange: (offsetY: number) => void;
};
