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
    if (!spec) {
      return;
    }

    const hiddenSnap = spec.snapPoints.hidden ?? spec.snapPoints.collapsed;
    const resolveSnapValue = (snap: OverlaySheetSnap): number => {
      if (snap === 'hidden') {
        return hiddenSnap;
      }
      return spec.snapPoints[snap];
    };

    if (!visible) {
      if (sheetY.value < hiddenSnap - 0.5) {
        setShellSnapTo('hidden');
      }
      return;
    }

    if (spec.snapTo) {
      return;
    }

    const currentY = sheetY.value;

    if (currentY >= hiddenSnap - 0.5) {
      setShellSnapTo(spec.initialSnapPoint ?? 'middle');
      return;
    }

    const lowerBound = spec.snapPoints.expanded;
    const upperBound = spec.preventSwipeDismiss ? spec.snapPoints.collapsed : hiddenSnap;

    if (currentY < lowerBound - 0.5) {
      setShellSnapTo('expanded');
      return;
    }

    if (currentY > upperBound + 0.5) {
      setShellSnapTo(spec.preventSwipeDismiss ? 'collapsed' : 'hidden');
      return;
    }

    const desiredSnap =
      currentSnapRef.current === 'hidden'
        ? spec.initialSnapPoint ?? 'middle'
        : currentSnapRef.current;
    const desiredTarget = resolveSnapValue(desiredSnap);
    if (Math.abs(currentY - desiredTarget) > 0.5) {
      setShellSnapTo(desiredSnap);
    }
  }, [activeOverlayKey, spec, sheetY, visible]);

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
