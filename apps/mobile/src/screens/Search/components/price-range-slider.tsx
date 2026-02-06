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
  PRICE_THUMB_DOT_SIZE,
  PRICE_THUMB_HIT_SIZE,
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
    const [trackLayoutWidth, setTrackLayoutWidth] = React.useState(0);
    const trackWidth = useSharedValue(PRICE_SLIDER_TRACK_WIDTH_ESTIMATE);
    const lowValue = useSharedValue(range[0]);
    const highValue = useSharedValue(range[1]);
    const lowStartValue = useSharedValue(range[0]);
    const highStartValue = useSharedValue(range[1]);
    const lastPreviewLow = useSharedValue(clampPriceSliderValue(range[0]));
    const lastPreviewHigh = useSharedValue(clampPriceSliderValue(range[1]));
    const lowActiveProgress = useSharedValue(0);
    const highActiveProgress = useSharedValue(0);
    const lowDidMove = useSharedValue(0);
    const highDidMove = useSharedValue(0);

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
          .hitSlop(8)
          .onTouchesDown(() => {
            lowActiveProgress.value = withTiming(1, {
              duration: 120,
              easing: Easing.out(Easing.cubic),
            });
          })
          .onTouchesUp(() => {
            lowActiveProgress.value = withTiming(0, {
              duration: 160,
              easing: Easing.out(Easing.cubic),
            });
          })
          .onTouchesCancelled(() => {
            lowActiveProgress.value = withTiming(0, {
              duration: 160,
              easing: Easing.out(Easing.cubic),
            });
          })
          .onBegin(() => {
            lowDidMove.value = 0;
            lowStartValue.value = lowValue.value;
          })
          .onUpdate((event) => {
            const width = trackWidth.value;
            if (width <= 0) {
              return;
            }
            if (Math.abs(event.translationX) > 0.5) {
              lowDidMove.value = 1;
            }
            const deltaValue = (event.translationX / width) * trackSpan;
            let nextLow = lowStartValue.value + deltaValue;
            nextLow = Math.max(PRICE_SLIDER_MIN, Math.min(nextLow, highValue.value - minGap));
            lowValue.value = nextLow;
            notifyPreview(lowValue.value, highValue.value);
          })
          .onFinalize(() => {
            lowActiveProgress.value = withTiming(0, {
              duration: 160,
              easing: Easing.out(Easing.cubic),
            });
            if (lowDidMove.value) {
              commitSnap();
            }
          }),
      [
        commitSnap,
        highValue,
        lowStartValue,
        lowActiveProgress,
        lowDidMove,
        lowValue,
        notifyPreview,
        trackSpan,
        trackWidth,
      ]
    );

    const highGesture = React.useMemo(
      () =>
        Gesture.Pan()
          .hitSlop(8)
          .onTouchesDown(() => {
            highActiveProgress.value = withTiming(1, {
              duration: 120,
              easing: Easing.out(Easing.cubic),
            });
          })
          .onTouchesUp(() => {
            highActiveProgress.value = withTiming(0, {
              duration: 160,
              easing: Easing.out(Easing.cubic),
            });
          })
          .onTouchesCancelled(() => {
            highActiveProgress.value = withTiming(0, {
              duration: 160,
              easing: Easing.out(Easing.cubic),
            });
          })
          .onBegin(() => {
            highDidMove.value = 0;
            highStartValue.value = highValue.value;
          })
          .onUpdate((event) => {
            const width = trackWidth.value;
            if (width <= 0) {
              return;
            }
            if (Math.abs(event.translationX) > 0.5) {
              highDidMove.value = 1;
            }
            const deltaValue = (event.translationX / width) * trackSpan;
            let nextHigh = highStartValue.value + deltaValue;
            nextHigh = Math.min(PRICE_SLIDER_MAX, Math.max(nextHigh, lowValue.value + minGap));
            highValue.value = nextHigh;
            notifyPreview(lowValue.value, highValue.value);
          })
          .onFinalize(() => {
            highActiveProgress.value = withTiming(0, {
              duration: 160,
              easing: Easing.out(Easing.cubic),
            });
            if (highDidMove.value) {
              commitSnap();
            }
          }),
      [
        commitSnap,
        highStartValue,
        highActiveProgress,
        highDidMove,
        highValue,
        lowValue,
        notifyPreview,
        trackSpan,
        trackWidth,
      ]
    );

    const haloStartScale = PRICE_THUMB_DOT_SIZE / PRICE_THUMB_SIZE;
    const haloMaxScale = 1.12;

    const lowThumbTranslateAnimatedStyle = useAnimatedStyle(() => ({
      transform: [
        {
          translateX: trackStart + valueToPosition(lowValue.value) - PRICE_THUMB_HIT_SIZE / 2,
        },
      ],
    }));

    const highThumbTranslateAnimatedStyle = useAnimatedStyle(() => ({
      transform: [
        {
          translateX: trackStart + valueToPosition(highValue.value) - PRICE_THUMB_HIT_SIZE / 2,
        },
      ],
    }));

    const lowHaloAnimatedStyle = useAnimatedStyle(() => {
      const progress = lowActiveProgress.value;
      const scale = haloStartScale + progress * (haloMaxScale - haloStartScale);
      return {
        opacity: progress,
        transform: [{ scale }],
      };
    });

    const highHaloAnimatedStyle = useAnimatedStyle(() => {
      const progress = highActiveProgress.value;
      const scale = haloStartScale + progress * (haloMaxScale - haloStartScale);
      return {
        opacity: progress,
        transform: [{ scale }],
      };
    });

    const lowDotAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: 1 - lowActiveProgress.value * 0.04 }],
    }));

    const highDotAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: 1 - highActiveProgress.value * 0.04 }],
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
        setTrackLayoutWidth((prev) => (Math.abs(prev - width) > 0.5 ? width : prev));
        const usable = Math.max(0, width - PRICE_THUMB_SIZE);
        if (Math.abs(trackWidth.value - usable) > 1) {
          trackWidth.value = usable;
        }
      },
      [trackWidth]
    );

    const stopGapOffsets = React.useMemo(() => {
      if (trackLayoutWidth <= 0) {
        return [];
      }
      const usable = Math.max(0, trackLayoutWidth - PRICE_THUMB_SIZE);
      if (usable <= 0) {
        return [];
      }
      const offsets: Array<{ value: number; left: number }> = [];
      for (let value = PRICE_SLIDER_MIN + 1; value <= PRICE_SLIDER_MAX - 1; value += 1) {
        const percent = (value - PRICE_SLIDER_MIN) / trackSpan;
        const x = trackStart + percent * usable;
        offsets.push({ value, left: x - 2 });
      }
      return offsets;
    }, [trackLayoutWidth, trackSpan, trackStart]);

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
        {stopGapOffsets.map((stop) => (
          <View
            key={stop.value}
            pointerEvents="none"
            style={[styles.priceSliderGap, { left: stop.left }]}
          />
        ))}
        <GestureDetector gesture={lowGesture}>
          <Reanimated.View style={[styles.priceSliderThumbHitTarget, lowThumbTranslateAnimatedStyle]}>
            <View pointerEvents="none" style={styles.priceSliderThumb}>
              <Reanimated.View
                pointerEvents="none"
                style={[styles.priceSliderThumbHalo, lowHaloAnimatedStyle]}
              />
              <Reanimated.View
                pointerEvents="none"
                style={[styles.priceSliderThumbDot, lowDotAnimatedStyle]}
              />
            </View>
          </Reanimated.View>
        </GestureDetector>
        <GestureDetector gesture={highGesture}>
          <Reanimated.View style={[styles.priceSliderThumbHitTarget, highThumbTranslateAnimatedStyle]}>
            <View pointerEvents="none" style={styles.priceSliderThumb}>
              <Reanimated.View
                pointerEvents="none"
                style={[styles.priceSliderThumbHalo, highHaloAnimatedStyle]}
              />
              <Reanimated.View
                pointerEvents="none"
                style={[styles.priceSliderThumbDot, highDotAnimatedStyle]}
              />
            </View>
          </Reanimated.View>
        </GestureDetector>
      </View>
    );
  }
);

export default PriceRangeSlider;
