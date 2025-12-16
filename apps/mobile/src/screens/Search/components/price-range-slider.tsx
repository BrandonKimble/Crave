import React from 'react';
import { View } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { OVERLAY_HORIZONTAL_PADDING } from '../../../overlays/overlaySheetStyles';
import {
  PRICE_SLIDER_WRAPPER_HORIZONTAL_PADDING,
  PRICE_THUMB_SIZE,
  SCREEN_WIDTH,
} from '../constants/search';
import type { PriceRangeTuple } from '../utils/price';
import { PRICE_SLIDER_MAX, PRICE_SLIDER_MIN, clampPriceSliderValue } from '../utils/price';
import styles from '../styles';

const PRICE_SLIDER_TRACK_WIDTH_ESTIMATE = Math.max(
  0,
  SCREEN_WIDTH -
    (OVERLAY_HORIZONTAL_PADDING + PRICE_SLIDER_WRAPPER_HORIZONTAL_PADDING) * 2 -
    PRICE_THUMB_SIZE
);

type PriceRangeSliderProps = {
  range: PriceRangeTuple;
  onRangePreview?: (range: PriceRangeTuple) => void;
  onRangeCommit: (range: PriceRangeTuple) => void;
};

const PriceRangeSlider: React.FC<PriceRangeSliderProps> = React.memo(
  ({ range, onRangePreview, onRangeCommit }) => {
    const trackWidth = useSharedValue(PRICE_SLIDER_TRACK_WIDTH_ESTIMATE);
    const lowValue = useSharedValue(range[0]);
    const highValue = useSharedValue(range[1]);
    const lowStartValue = useSharedValue(range[0]);
    const highStartValue = useSharedValue(range[1]);
    const lastPreviewLow = useSharedValue(clampPriceSliderValue(range[0]));
    const lastPreviewHigh = useSharedValue(clampPriceSliderValue(range[1]));

    const normalizeWorklet = React.useCallback((low: number, high: number): PriceRangeTuple => {
      'worklet';
      const clamp = (value: number, min: number, max: number) =>
        Math.min(max, Math.max(min, value));
      let min = clamp(Math.round(low), PRICE_SLIDER_MIN, PRICE_SLIDER_MAX);
      let max = clamp(Math.round(high), PRICE_SLIDER_MIN, PRICE_SLIDER_MAX);
      if (min > max) {
        const temp = min;
        min = max;
        max = temp;
      }
      if (min === max) {
        if (max < PRICE_SLIDER_MAX) {
          max = clamp(max + 1, PRICE_SLIDER_MIN, PRICE_SLIDER_MAX);
        } else if (min > PRICE_SLIDER_MIN) {
          min = clamp(min - 1, PRICE_SLIDER_MIN, PRICE_SLIDER_MAX);
        }
      }
      return [min, max];
    }, []);

    const trackStart = PRICE_THUMB_SIZE / 2;
    const trackSpan = PRICE_SLIDER_MAX - PRICE_SLIDER_MIN;
    const minGap = 1;

    const valueToPosition = (value: number) => {
      'worklet';
      const width = Math.max(trackWidth.value, 1);
      const clamped = Math.max(PRICE_SLIDER_MIN, Math.min(PRICE_SLIDER_MAX, value));
      return ((clamped - PRICE_SLIDER_MIN) / trackSpan) * width;
    };

    const notifyPreview = React.useCallback(
      (low: number, high: number) => {
        'worklet';
        if (!onRangePreview) {
          return;
        }
        const normalized = normalizeWorklet(low, high);
        const nextLow = normalized[0];
        const nextHigh = normalized[1];
        if (nextLow === lastPreviewLow.value && nextHigh === lastPreviewHigh.value) {
          return;
        }
        lastPreviewLow.value = nextLow;
        lastPreviewHigh.value = nextHigh;
        runOnJS(onRangePreview)(normalized);
      },
      [lastPreviewHigh, lastPreviewLow, normalizeWorklet, onRangePreview]
    );

    const commitSnap = React.useCallback(() => {
      'worklet';
      const snapped = normalizeWorklet(lowValue.value, highValue.value);
      lowValue.value = withTiming(snapped[0], { duration: 160, easing: Easing.out(Easing.cubic) });
      highValue.value = withTiming(snapped[1], { duration: 160, easing: Easing.out(Easing.cubic) });
      runOnJS(onRangeCommit)(snapped);
    }, [highValue, lowValue, normalizeWorklet, onRangeCommit]);

    const lowGesture = React.useMemo(
      () =>
        Gesture.Pan()
          .hitSlop(12)
          .onBegin(() => {
            lowStartValue.value = lowValue.value;
          })
          .onUpdate((event) => {
            const width = trackWidth.value;
            if (width <= 0) {
              return;
            }
            const deltaValue = (event.translationX / width) * trackSpan;
            let nextLow = lowStartValue.value + deltaValue;
            nextLow = Math.max(PRICE_SLIDER_MIN, Math.min(nextLow, highValue.value - minGap));
            lowValue.value = nextLow;
            notifyPreview(lowValue.value, highValue.value);
          })
          .onFinalize(() => {
            commitSnap();
          }),
      [commitSnap, highValue, lowStartValue, lowValue, notifyPreview, trackSpan, trackWidth]
    );

    const highGesture = React.useMemo(
      () =>
        Gesture.Pan()
          .hitSlop(12)
          .onBegin(() => {
            highStartValue.value = highValue.value;
          })
          .onUpdate((event) => {
            const width = trackWidth.value;
            if (width <= 0) {
              return;
            }
            const deltaValue = (event.translationX / width) * trackSpan;
            let nextHigh = highStartValue.value + deltaValue;
            nextHigh = Math.min(PRICE_SLIDER_MAX, Math.max(nextHigh, lowValue.value + minGap));
            highValue.value = nextHigh;
            notifyPreview(lowValue.value, highValue.value);
          })
          .onFinalize(() => {
            commitSnap();
          }),
      [commitSnap, highStartValue, highValue, lowValue, notifyPreview, trackSpan, trackWidth]
    );

    const lowThumbAnimatedStyle = useAnimatedStyle(() => ({
      transform: [
        {
          translateX: trackStart + valueToPosition(lowValue.value) - PRICE_THUMB_SIZE / 2,
        },
      ],
    }));

    const highThumbAnimatedStyle = useAnimatedStyle(() => ({
      transform: [
        {
          translateX: trackStart + valueToPosition(highValue.value) - PRICE_THUMB_SIZE / 2,
        },
      ],
    }));

    const selectedRailAnimatedStyle = useAnimatedStyle(() => {
      const left = trackStart + valueToPosition(lowValue.value);
      const right = trackStart + valueToPosition(highValue.value);
      return {
        left,
        width: Math.max(0, right - left),
      };
    });

    const handleTrackLayout = React.useCallback(
      (event: { nativeEvent: { layout: { width: number } } }) => {
        const width = event.nativeEvent.layout.width;
        const usable = Math.max(0, width - PRICE_THUMB_SIZE);
        if (Math.abs(trackWidth.value - usable) > 1) {
          trackWidth.value = usable;
        }
      },
      [trackWidth]
    );

    return (
      <View
        style={styles.priceTrackContainer}
        onLayout={handleTrackLayout}
        pointerEvents="box-none"
        collapsable={false}
      >
        <View style={styles.priceSliderRail} pointerEvents="none" />
        <Reanimated.View
          style={[styles.priceSliderRailSelected, selectedRailAnimatedStyle]}
          pointerEvents="none"
        />
        <GestureDetector gesture={lowGesture}>
          <Reanimated.View style={[styles.priceSliderThumb, lowThumbAnimatedStyle]} />
        </GestureDetector>
        <GestureDetector gesture={highGesture}>
          <Reanimated.View style={[styles.priceSliderThumb, highThumbAnimatedStyle]} />
        </GestureDetector>
      </View>
    );
  }
);

export default PriceRangeSlider;

