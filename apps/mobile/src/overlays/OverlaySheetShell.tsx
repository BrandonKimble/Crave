import React from 'react';
import { InteractionManager, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { FlashListRef } from '@shopify/flash-list';
import type { SharedValue } from 'react-native-reanimated';

import BottomSheetWithFlashList, {
  type BottomSheetWithFlashListProps,
} from './BottomSheetWithFlashList';
import { OVERLAY_STACK_ZINDEX, overlaySheetStyles } from './overlaySheetStyles';
import { useOverlayStore } from '../store/overlayStore';
import type { OverlayContentSpec, OverlayKey, OverlaySheetSnap } from './types';
import { useOverlayHeaderActionController, type OverlayHeaderActionMode } from './useOverlayHeaderActionController';
import { useOverlaySheetPositionStore } from './useOverlaySheetPositionStore';

type OverlaySheetShellProps = {
  visible: boolean;
  activeOverlayKey: OverlayKey;
  spec: OverlayContentSpec<unknown> | null;
  sheetY: SharedValue<number>;
  scrollOffset: SharedValue<number>;
  momentumFlag: SharedValue<boolean>;
  headerActionProgress?: SharedValue<number>;
  headerActionMode?: OverlayHeaderActionMode;
  navBarHeight?: number;
  applyNavBarCutout?: boolean;
};

const OverlaySheetShell: React.FC<OverlaySheetShellProps> = ({
  visible,
  activeOverlayKey,
  spec,
  sheetY,
  scrollOffset,
  momentumFlag,
  headerActionProgress,
  headerActionMode = 'fixed-close',
  navBarHeight = 0,
  applyNavBarCutout = false,
}) => {
  const { height: screenHeight } = useWindowDimensions();
  const setOverlayScrollOffset = useOverlayStore((state) => state.setOverlayScrollOffset);
  const previousOverlay = useOverlayStore((state) => state.previousOverlay);
  const rootOverlay = useOverlayStore((state) => state.overlayStack[0] ?? state.activeOverlay);
  const recordUserSnap = useOverlaySheetPositionStore((state) => state.recordUserSnap);

  const internalListRef = React.useRef<FlashListRef<unknown> | null>(null);
  const resolvedListRef = spec?.listRef ?? internalListRef;
  const specRef = React.useRef<OverlayContentSpec<unknown> | null>(null);
  specRef.current = spec;

  const [shellSnapTo, setShellSnapTo] = React.useState<OverlaySheetSnap | null>(null);
  const shellSnapToRef = React.useRef<OverlaySheetSnap | null>(null);
  React.useEffect(() => {
    shellSnapToRef.current = shellSnapTo;
  }, [shellSnapTo]);
  const currentSnapRef = React.useRef<OverlaySheetSnap>('hidden');
  const lastOverlayKeyRef = React.useRef<OverlayKey | null>(null);
  const lastSnapOverlayKeyRef = React.useRef<OverlayKey | null>(null);
  const lastSnapPointsKeyRef = React.useRef<string | null>(null);

  const lastInteractionOverlayKeyRef = React.useRef<OverlayKey | null>(null);
  const overlayJustChanged =
    lastInteractionOverlayKeyRef.current !== null &&
    lastInteractionOverlayKeyRef.current !== activeOverlayKey;
  if (visible && spec && overlayJustChanged) {
    lastInteractionOverlayKeyRef.current = activeOverlayKey;
  } else if (visible && spec && lastInteractionOverlayKeyRef.current === null) {
    lastInteractionOverlayKeyRef.current = activeOverlayKey;
  }

  const handleScrollOffsetChange = React.useCallback(
    (nextOffset: number) => {
      specRef.current?.onScrollOffsetChange?.(nextOffset);
      setOverlayScrollOffset(activeOverlayKey, nextOffset);
    },
    [activeOverlayKey, setOverlayScrollOffset, specRef]
  );

  const handleSnapChange = React.useCallback<
    NonNullable<BottomSheetWithFlashListProps<unknown>['onSnapChange']>
  >(
    (snap, meta) => {
      currentSnapRef.current = snap;
      specRef.current?.onSnapChange?.(snap, meta);
      if (meta?.source === 'gesture') {
        recordUserSnap({
          rootOverlay,
          activeOverlayKey,
          snap,
        });
      }
      if (shellSnapToRef.current && snap === shellSnapToRef.current) {
        setShellSnapTo(null);
      }
    },
    [activeOverlayKey, recordUserSnap, rootOverlay, setShellSnapTo]
  );

  const handleSnapStart = React.useCallback<
    NonNullable<BottomSheetWithFlashListProps<unknown>['onSnapStart']>
  >(
    (snap, meta) => {
      specRef.current?.onSnapStart?.(snap, meta);
      if (meta?.source === 'gesture') {
        recordUserSnap({
          rootOverlay,
          activeOverlayKey,
          snap,
        });
      }
    },
    [activeOverlayKey, recordUserSnap, rootOverlay]
  );

  const handleDragStateChange = React.useCallback(
    (isDragging: boolean) => {
      specRef.current?.onDragStateChange?.(isDragging);
    },
    [specRef]
  );

  const handleSettleStateChange = React.useCallback(
    (isSettling: boolean) => {
      specRef.current?.onSettleStateChange?.(isSettling);
    },
    [specRef]
  );

  React.useEffect(() => {
    if (!visible || !spec) {
      lastSnapOverlayKeyRef.current = null;
      lastSnapPointsKeyRef.current = null;
      setShellSnapTo(null);
      return;
    }

    const snapPointsKey = `${spec.snapPoints.expanded}:${spec.snapPoints.middle}:${
      spec.snapPoints.collapsed
    }:${spec.snapPoints.hidden ?? ''}`;
    const overlayChanged = lastSnapOverlayKeyRef.current !== activeOverlayKey;
    const snapPointsChanged = lastSnapPointsKeyRef.current !== snapPointsKey;
    if (overlayChanged || snapPointsChanged) {
      lastSnapOverlayKeyRef.current = activeOverlayKey;
      lastSnapPointsKeyRef.current = snapPointsKey;
    }

    if (spec.snapTo) {
      setShellSnapTo(null);
      return;
    }

    const sheetYValue = sheetY.value;
    const isSheetOffscreen =
      Number.isFinite(screenHeight) &&
      screenHeight > 0 &&
      Number.isFinite(sheetYValue) &&
      sheetYValue >= screenHeight - 0.5;
    if (currentSnapRef.current !== 'hidden' && !isSheetOffscreen) {
      if (shellSnapToRef.current !== null) {
        setShellSnapTo(null);
      }
      return;
    }

    if (isSheetOffscreen) {
      currentSnapRef.current = 'hidden';
    }

    const desiredSnap: OverlaySheetSnap = spec.initialSnapPoint ?? 'middle';
    if (shellSnapToRef.current !== desiredSnap) {
      setShellSnapTo(desiredSnap);
    }
  }, [activeOverlayKey, previousOverlay, screenHeight, sheetY, spec, visible]);

  React.useLayoutEffect(() => {
    if (!visible) {
      return;
    }

    const previousKey = lastOverlayKeyRef.current;
    if (previousKey && previousKey !== activeOverlayKey) {
      setOverlayScrollOffset(previousKey, scrollOffset.value);
    }
    lastOverlayKeyRef.current = activeOverlayKey;

    const storedOffset = useOverlayStore.getState().overlayScrollOffsets[activeOverlayKey] ?? 0;
    const nextOffset = Math.max(0, storedOffset);

    const applyOffset = () => {
      const list = (specRef.current?.listRef ?? internalListRef).current;
      scrollOffset.value = nextOffset;
      if (!list?.scrollToOffset) {
        return false;
      }
      list.scrollToOffset({ offset: nextOffset, animated: false });
      return true;
    };

    applyOffset();

    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        applyOffset();
      });
    });
    const timeout = setTimeout(() => {
      applyOffset();
    }, 80);

    return () => {
      task.cancel();
      clearTimeout(timeout);
    };
  }, [activeOverlayKey, internalListRef, scrollOffset, setOverlayScrollOffset, specRef, visible]);

  const bottomInset = applyNavBarCutout ? Math.max(navBarHeight, 0) : 0;

  useOverlayHeaderActionController({
    visible: visible && Boolean(spec),
    mode: headerActionMode,
    sheetY,
    collapseRange: {
      start: spec?.snapPoints.middle ?? 0,
      end: spec?.snapPoints.collapsed ?? 1,
    },
    progress: headerActionProgress,
  });

  if (!spec) {
    return null;
  }

  const resolvedInteractionEnabled = (spec.interactionEnabled ?? true) && !overlayJustChanged;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.sheetClip, bottomInset > 0 ? { bottom: bottomInset } : null]}
    >
      {spec.underlayComponent ?? null}
      <BottomSheetWithFlashList
        visible={visible}
        snapPoints={spec.snapPoints}
        preservePositionOnSnapPointsChange
        sheetYValue={sheetY}
        scrollOffsetValue={scrollOffset}
        momentumFlag={momentumFlag}
        listRef={resolvedListRef}
        {...spec}
        snapTo={spec.snapTo ?? shellSnapTo}
        snapToToken={spec.snapToToken}
        interactionEnabled={resolvedInteractionEnabled}
        onScrollOffsetChange={handleScrollOffsetChange}
        onSnapStart={handleSnapStart}
        onSnapChange={handleSnapChange}
        onDragStateChange={handleDragStateChange}
        onSettleStateChange={handleSettleStateChange}
        style={spec.style ?? overlaySheetStyles.container}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  sheetClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: OVERLAY_STACK_ZINDEX,
  },
});

export default OverlaySheetShell;
