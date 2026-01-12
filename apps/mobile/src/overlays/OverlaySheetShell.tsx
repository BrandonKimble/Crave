import React from 'react';
import { InteractionManager, StyleSheet, View } from 'react-native';

import type { FlashListRef } from '@shopify/flash-list';
import type { SharedValue } from 'react-native-reanimated';

import BottomSheetWithFlashList from './BottomSheetWithFlashList';
import { OVERLAY_STACK_ZINDEX, overlaySheetStyles } from './overlaySheetStyles';
import { useOverlayStore } from '../store/overlayStore';
import type { OverlayContentSpec, OverlayKey, OverlaySheetSnap } from './types';

type OverlaySheetShellProps = {
  visible: boolean;
  activeOverlayKey: OverlayKey;
  spec: OverlayContentSpec<unknown> | null;
  sheetY: SharedValue<number>;
  scrollOffset: SharedValue<number>;
  momentumFlag: SharedValue<boolean>;
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
  navBarHeight = 0,
  applyNavBarCutout = false,
}) => {
  const setOverlayScrollOffset = useOverlayStore((state) => state.setOverlayScrollOffset);
  const previousOverlay = useOverlayStore((state) => state.previousOverlay);

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

  const handleScrollOffsetChange = React.useCallback(
    (nextOffset: number) => {
      specRef.current?.onScrollOffsetChange?.(nextOffset);
      setOverlayScrollOffset(activeOverlayKey, nextOffset);
    },
    [activeOverlayKey, setOverlayScrollOffset, specRef]
  );

  const handleSnapChange = React.useCallback(
    (snap: OverlaySheetSnap) => {
      currentSnapRef.current = snap;
      specRef.current?.onSnapChange?.(snap);
      if (shellSnapToRef.current && snap === shellSnapToRef.current) {
        setShellSnapTo(null);
      }
    },
    [setShellSnapTo, shellSnapToRef, specRef]
  );

  React.useEffect(() => {
    if (!visible || !spec) {
      lastSnapOverlayKeyRef.current = null;
      lastSnapPointsKeyRef.current = null;
      return;
    }

    if (spec.snapTo) {
      setShellSnapTo(null);
      return;
    }

    const snapPointsKey = `${spec.snapPoints.expanded}:${spec.snapPoints.middle}:${
      spec.snapPoints.collapsed
    }:${spec.snapPoints.hidden ?? ''}`;
    const overlayChanged = lastSnapOverlayKeyRef.current !== activeOverlayKey;
    const snapPointsChanged = lastSnapPointsKeyRef.current !== snapPointsKey;
    if (!overlayChanged && !snapPointsChanged) {
      return;
    }
    lastSnapOverlayKeyRef.current = activeOverlayKey;
    lastSnapPointsKeyRef.current = snapPointsKey;

    if (overlayChanged && previousOverlay !== 'search' && currentSnapRef.current !== 'hidden') {
      setShellSnapTo(null);
      return;
    }

    const desiredSnap: OverlaySheetSnap =
      currentSnapRef.current === 'hidden'
        ? spec.initialSnapPoint ?? 'middle'
        : overlayChanged && previousOverlay === 'search'
        ? spec.initialSnapPoint ?? 'middle'
        : currentSnapRef.current;

    if (shellSnapToRef.current === desiredSnap) {
      return;
    }
    setShellSnapTo(desiredSnap);
  }, [activeOverlayKey, previousOverlay, spec, visible]);

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

  if (!spec) {
    return null;
  }

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
        onScrollOffsetChange={handleScrollOffsetChange}
        onSnapChange={handleSnapChange}
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
