import React from 'react';
import { View } from 'react-native';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { OVERLAY_HORIZONTAL_PADDING } from '../../../overlays/overlaySheetStyles';
import {
  PRICE_SLIDER_WRAPPER_HORIZONTAL_PADDING,
  PRICE_SLIDER_GAP_WIDTH,
  PRICE_THUMB_DOT_SIZE,
  PRICE_THUMB_HIT_SIZE,
  PRICE_THUMB_SIZE,
  SCREEN_WIDTH,
} from '../constants/search';
import type { PriceRangeTuple } from '../utils/price';
import { PRICE_SLIDER_MAX, PRICE_SLIDER_MIN } from '../utils/price';
import styles from '../styles';

const PRICE_SLIDER_TRACK_WIDTH_ESTIMATE = Math.max(
  0,
  SCREEN_WIDTH -
    (OVERLAY_HORIZONTAL_PADDING + PRICE_SLIDER_WRAPPER_HORIZONTAL_PADDING) * 2 -
    PRICE_THUMB_SIZE
);
const THUMB_ACTIVE_IN_DURATION_MS = 90;
const THUMB_ACTIVE_OUT_DURATION_MS = 120;
const THUMB_ACTIVE_DOT_SCALE_DELTA = 0.1;
const THUMB_ACTIVE_HALO_MAX_SCALE = 1.08;
const VALUE_UPDATE_EPSILON = 0.0005;

type PriceRangeSliderProps = {
  motionLow: SharedValue<number>;
  motionHigh: SharedValue<number>;
  onRangeCommit: (range: PriceRangeTuple) => void;
};

type TrackSegment = {
  value: number;
  start: number;
  end: number;
};

type SelectedRailSegmentProps = {
  segment: TrackSegment;
  trackStart: number;
  trackSpan: number;
  trackWidth: SharedValue<number>;
  lowValue: SharedValue<number>;
  highValue: SharedValue<number>;
};

const SelectedRailSegment: React.FC<SelectedRailSegmentProps> = React.memo(
  ({ segment, trackStart, trackSpan, trackWidth, lowValue, highValue }) => {
    const segmentAnimatedStyle = useAnimatedStyle(() => {
      const width = Math.max(trackWidth.value, 1);
      const valueToPosition = (value: number) => {
        const clamped = Math.max(PRICE_SLIDER_MIN, Math.min(PRICE_SLIDER_MAX, value));
        return ((clamped - PRICE_SLIDER_MIN) / trackSpan) * width;
      };
      const selectedStart = valueToPosition(lowValue.value);
      const selectedEnd = valueToPosition(highValue.value);
      const left = Math.max(segment.start, selectedStart);
      const right = Math.min(segment.end, selectedEnd);
      const segmentWidth = Math.max(0, right - left);

      return {
        left: trackStart + left,
        width: segmentWidth,
      };
    }, [highValue, lowValue, segment.end, segment.start, trackSpan, trackStart, trackWidth]);

    return (
      <Reanimated.View
        pointerEvents="none"
        style={[styles.priceSliderRailSelectedSegment, segmentAnimatedStyle]}
      />
    );
  }
);

SelectedRailSegment.displayName = 'SelectedRailSegment';

const PriceRangeSlider: React.FC<PriceRangeSliderProps> = React.memo(
  ({ motionLow, motionHigh, onRangeCommit }) => {
    const [trackLayoutWidth, setTrackLayoutWidth] = React.useState(0);
    const trackWidth = useSharedValue(PRICE_SLIDER_TRACK_WIDTH_ESTIMATE);
    const lowValue = motionLow;
    const highValue = motionHigh;
    const lowStartValue = useSharedValue(lowValue.value);
    const highStartValue = useSharedValue(highValue.value);
    const lastCommittedLow = useSharedValue(Math.round(lowValue.value));
    const lastCommittedHigh = useSharedValue(Math.round(highValue.value));
    const lowActiveProgress = useSharedValue(0);
    const highActiveProgress = useSharedValue(0);
    const activeGestureCount = useSharedValue(0);

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

    const commitSnap = React.useCallback(() => {
      'worklet';
      const snapped = normalizeWorklet(lowValue.value, highValue.value);
      const sameAsCommitted =
        snapped[0] === lastCommittedLow.value && snapped[1] === lastCommittedHigh.value;
      if (
        Math.abs(snapped[0] - lowValue.value) < 0.0001 &&
        Math.abs(snapped[1] - highValue.value) < 0.0001
      ) {
        if (!sameAsCommitted) {
          lastCommittedLow.value = snapped[0];
          lastCommittedHigh.value = snapped[1];
          runOnJS(onRangeCommit)(snapped);
        }
        return;
      }
      const snapConfig = { duration: 160, easing: Easing.out(Easing.cubic) };
      lowValue.value = withTiming(snapped[0], snapConfig);
      highValue.value = withTiming(snapped[1], snapConfig, (finished) => {
        if (finished && !sameAsCommitted) {
          lastCommittedLow.value = snapped[0];
          lastCommittedHigh.value = snapped[1];
          runOnJS(onRangeCommit)(snapped);
        }
      });
    }, [
      highValue,
      lastCommittedHigh,
      lastCommittedLow,
      lowValue,
      normalizeWorklet,
      onRangeCommit,
    ]);

    const lowGesture = React.useMemo(
      () =>
        Gesture.Pan()
          .minDistance(0)
          .hitSlop(8)
          .onTouchesDown(() => {
            lowActiveProgress.value = withTiming(1, {
              duration: THUMB_ACTIVE_IN_DURATION_MS,
              easing: Easing.out(Easing.quad),
            });
          })
          .onTouchesUp(() => {
            lowActiveProgress.value = withTiming(0, {
              duration: THUMB_ACTIVE_OUT_DURATION_MS,
              easing: Easing.out(Easing.cubic),
            });
          })
          .onTouchesCancelled(() => {
            lowActiveProgress.value = withTiming(0, {
              duration: THUMB_ACTIVE_OUT_DURATION_MS,
              easing: Easing.out(Easing.cubic),
            });
          })
          .onBegin(() => {
            cancelAnimation(lowValue);
            cancelAnimation(highValue);
            activeGestureCount.value += 1;
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
            if (Math.abs(nextLow - lowValue.value) < VALUE_UPDATE_EPSILON) {
              return;
            }
            lowValue.value = nextLow;
          })
          .onFinalize(() => {
            lowActiveProgress.value = withTiming(0, {
              duration: THUMB_ACTIVE_OUT_DURATION_MS,
              easing: Easing.out(Easing.cubic),
            });
            activeGestureCount.value = Math.max(0, activeGestureCount.value - 1);
            commitSnap();
          }),
      [
        activeGestureCount,
        commitSnap,
        highValue,
        lowStartValue,
        lowActiveProgress,
        lowValue,
        trackSpan,
        trackWidth,
      ]
    );

    const highGesture = React.useMemo(
      () =>
        Gesture.Pan()
          .minDistance(0)
          .hitSlop(8)
          .onTouchesDown(() => {
            highActiveProgress.value = withTiming(1, {
              duration: THUMB_ACTIVE_IN_DURATION_MS,
              easing: Easing.out(Easing.quad),
            });
          })
          .onTouchesUp(() => {
            highActiveProgress.value = withTiming(0, {
              duration: THUMB_ACTIVE_OUT_DURATION_MS,
              easing: Easing.out(Easing.cubic),
            });
          })
          .onTouchesCancelled(() => {
            highActiveProgress.value = withTiming(0, {
              duration: THUMB_ACTIVE_OUT_DURATION_MS,
              easing: Easing.out(Easing.cubic),
            });
          })
          .onBegin(() => {
            cancelAnimation(lowValue);
            cancelAnimation(highValue);
            activeGestureCount.value += 1;
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
            if (Math.abs(nextHigh - highValue.value) < VALUE_UPDATE_EPSILON) {
              return;
            }
            highValue.value = nextHigh;
          })
          .onFinalize(() => {
            highActiveProgress.value = withTiming(0, {
              duration: THUMB_ACTIVE_OUT_DURATION_MS,
              easing: Easing.out(Easing.cubic),
            });
            activeGestureCount.value = Math.max(0, activeGestureCount.value - 1);
            commitSnap();
          }),
      [
        activeGestureCount,
        commitSnap,
        highStartValue,
        highActiveProgress,
        highValue,
        lowValue,
        trackSpan,
        trackWidth,
      ]
    );

    const haloStartScale = PRICE_THUMB_DOT_SIZE / PRICE_THUMB_SIZE;
    const haloMaxScale = THUMB_ACTIVE_HALO_MAX_SCALE;

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
        opacity: progress * 0.85,
        transform: [{ scale }],
      };
    });

    const highHaloAnimatedStyle = useAnimatedStyle(() => {
      const progress = highActiveProgress.value;
      const scale = haloStartScale + progress * (haloMaxScale - haloStartScale);
      return {
        opacity: progress * 0.85,
        transform: [{ scale }],
      };
    });

    const lowDotAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: 1 + lowActiveProgress.value * THUMB_ACTIVE_DOT_SCALE_DELTA }],
    }));

    const highDotAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: 1 + highActiveProgress.value * THUMB_ACTIVE_DOT_SCALE_DELTA }],
    }));

    const handleTrackLayout = React.useCallback(
      (event: { nativeEvent: { layout: { width: number } } }) => {
        if (activeGestureCount.value > 0) {
          return;
        }
        const width = event.nativeEvent.layout.width;
        setTrackLayoutWidth((prev) => (Math.abs(prev - width) > 0.5 ? width : prev));
        const usable = Math.max(0, width - PRICE_THUMB_SIZE);
        if (Math.abs(trackWidth.value - usable) > 1) {
          trackWidth.value = usable;
        }
      },
      [activeGestureCount, trackWidth]
    );

    const trackSegments = React.useMemo<TrackSegment[]>(() => {
      const measuredWidth =
        trackLayoutWidth > 0 ? trackLayoutWidth : PRICE_SLIDER_TRACK_WIDTH_ESTIMATE + PRICE_THUMB_SIZE;
      const usable = Math.max(0, measuredWidth - PRICE_THUMB_SIZE);
      if (usable <= 0) {
        return [];
      }
      const halfGap = PRICE_SLIDER_GAP_WIDTH / 2;
      const segments: TrackSegment[] = [];
      for (let value = PRICE_SLIDER_MIN; value <= PRICE_SLIDER_MAX - 1; value += 1) {
        const startPercent = (value - PRICE_SLIDER_MIN) / trackSpan;
        const endPercent = (value + 1 - PRICE_SLIDER_MIN) / trackSpan;
        const rawStart = startPercent * usable;
        const rawEnd = endPercent * usable;
        const start = rawStart + (value > PRICE_SLIDER_MIN ? halfGap : 0);
        const end = rawEnd - (value + 1 < PRICE_SLIDER_MAX ? halfGap : 0);
        if (end > start) {
          segments.push({ value, start, end });
        }
      }
      return segments;
    }, [trackLayoutWidth, trackSpan]);

    return (
      <View
        style={styles.priceTrackContainer}
        onLayout={handleTrackLayout}
        pointerEvents="box-none"
        collapsable={false}
      >
        {trackSegments.map((segment) => (
          <View
            key={`rail-${segment.value}`}
            pointerEvents="none"
            style={[
              styles.priceSliderRailSegment,
              {
                left: trackStart + segment.start,
                width: Math.max(0, segment.end - segment.start),
              },
            ]}
          />
        ))}
        {trackSegments.map((segment) => (
          <SelectedRailSegment
            key={`selected-${segment.value}`}
            segment={segment}
            trackStart={trackStart}
            trackSpan={trackSpan}
            trackWidth={trackWidth}
            lowValue={lowValue}
            highValue={highValue}
          />
        ))}
        <GestureDetector gesture={lowGesture}>
          <Reanimated.View
            renderToHardwareTextureAndroid
            shouldRasterizeIOS
            style={[styles.priceSliderThumbHitTarget, lowThumbTranslateAnimatedStyle]}
          >
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
          <Reanimated.View
            renderToHardwareTextureAndroid
            shouldRasterizeIOS
            style={[styles.priceSliderThumbHitTarget, highThumbTranslateAnimatedStyle]}
          >
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
