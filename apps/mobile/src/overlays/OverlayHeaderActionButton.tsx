import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { X as LucideX } from 'lucide-react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { overlaySheetStyles } from './overlaySheetStyles';

type OverlayHeaderActionButtonProps = {
  progress: SharedValue<number>;
  onPress: () => void;
  accessibilityLabel: string;
  accentColor: string;
  closeColor?: string;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
};

const OverlayHeaderActionButton: React.FC<OverlayHeaderActionButtonProps> = ({
  progress,
  onPress,
  accessibilityLabel,
  accentColor,
  closeColor = '#000000',
  onLayout,
  style,
}) => {
  const rotationStyle = useAnimatedStyle(() => {
    const rotation = 45 * progress.value;
    return { transform: [{ rotate: `${rotation}deg` }] };
  }, [progress]);

  const plusAccentOpacityStyle = useAnimatedStyle(() => ({ opacity: progress.value }), [progress]);
  const closeOpacityStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }), [progress]);

  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      onLayout?.(event);
    },
    [onLayout]
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[overlaySheetStyles.closeButton, style]}
      onLayout={handleLayout}
      collapsable={false}
      hitSlop={8}
    >
      <View style={overlaySheetStyles.closeIcon} collapsable={false}>
        <Animated.View style={rotationStyle}>
          <View style={styles.iconStack} pointerEvents="none">
            <Animated.View style={[styles.iconLayer, plusAccentOpacityStyle]}>
              <LucideX size={20} color={accentColor} strokeWidth={2.5} />
            </Animated.View>
            <Animated.View style={[styles.iconLayer, closeOpacityStyle]}>
              <LucideX size={20} color={closeColor} strokeWidth={2.5} />
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  iconStack: {
    position: 'relative',
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default OverlayHeaderActionButton;
