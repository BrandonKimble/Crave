import React from 'react';
import { Pressable, type LayoutRectangle, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { HandPlatter, Store } from 'lucide-react-native';

import { Text } from '../../../components';
import styles from '../styles';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

type SearchShortcutsRowProps = {
  visible: boolean;
  interactive: boolean;
  containerAnimatedStyle: StyleProp<ViewStyle>;
  chipAnimatedStyle: StyleProp<ViewStyle>;
  contentAnimatedStyle: StyleProp<ViewStyle>;
  onPressBestRestaurants: () => void;
  onPressBestDishes: () => void;
  onRowLayout: (layout: LayoutRectangle) => void;
  onRestaurantsChipLayout: (layout: LayoutRectangle) => void;
  onDishesChipLayout: (layout: LayoutRectangle) => void;
};

const SearchShortcutsRow = ({
  visible,
  interactive,
  containerAnimatedStyle,
  chipAnimatedStyle,
  contentAnimatedStyle,
  onPressBestRestaurants,
  onPressBestDishes,
  onRowLayout,
  onRestaurantsChipLayout,
  onDishesChipLayout,
}: SearchShortcutsRowProps) => {
  if (!visible) {
    return null;
  }

  return (
    <Reanimated.View
      style={containerAnimatedStyle}
      pointerEvents={interactive ? 'box-none' : 'none'}
      onLayout={({ nativeEvent: { layout } }) => {
        onRowLayout(layout);
      }}
    >
      <AnimatedPressable
        onPress={onPressBestRestaurants}
        style={[styles.searchShortcutChip, chipAnimatedStyle]}
        accessibilityRole="button"
        accessibilityLabel="Show best restaurants here"
        hitSlop={8}
        onLayout={({ nativeEvent: { layout } }) => {
          onRestaurantsChipLayout(layout);
        }}
      >
        <Reanimated.View style={[styles.searchShortcutContent, contentAnimatedStyle]}>
          <Store size={18} color="#0f172a" strokeWidth={2} />
          <Text variant="body" weight="semibold" style={styles.searchShortcutChipText}>
            Best restaurants
          </Text>
        </Reanimated.View>
      </AnimatedPressable>
      <AnimatedPressable
        onPress={onPressBestDishes}
        style={[styles.searchShortcutChip, chipAnimatedStyle]}
        accessibilityRole="button"
        accessibilityLabel="Show best dishes here"
        hitSlop={8}
        onLayout={({ nativeEvent: { layout } }) => {
          onDishesChipLayout(layout);
        }}
      >
        <Reanimated.View style={[styles.searchShortcutContent, contentAnimatedStyle]}>
          <HandPlatter size={18} color="#0f172a" strokeWidth={2} />
          <Text variant="body" weight="semibold" style={styles.searchShortcutChipText}>
            Best dishes
          </Text>
        </Reanimated.View>
      </AnimatedPressable>
    </Reanimated.View>
  );
};

export default React.memo(SearchShortcutsRow);
