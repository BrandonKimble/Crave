import React from 'react';
import {
  Pressable,
  View,
  type LayoutRectangle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import { HandPlatter, Store } from 'lucide-react-native';

import { Text } from '../../../components';
import styles from '../styles';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

type SearchShortcutsRowProps = {
  interactive: boolean;
  containerAnimatedStyle: StyleProp<ViewStyle>;
  chipAnimatedStyle: StyleProp<ViewStyle>;
  onPressBestRestaurants: () => void;
  onPressBestDishes: () => void;
  onRowLayout: (layout: LayoutRectangle) => void;
  onRestaurantsChipLayout: (layout: LayoutRectangle) => void;
  onDishesChipLayout: (layout: LayoutRectangle) => void;
};

const SearchShortcutsRow = ({
  interactive,
  containerAnimatedStyle,
  chipAnimatedStyle,
  onPressBestRestaurants,
  onPressBestDishes,
  onRowLayout,
  onRestaurantsChipLayout,
  onDishesChipLayout,
}: SearchShortcutsRowProps) => {
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
        <View style={styles.searchShortcutContent}>
          <Store size={18} color="#0f172a" strokeWidth={2} />
          <Text variant="body" weight="semibold" style={styles.searchShortcutChipText}>
            Best restaurants
          </Text>
        </View>
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
        <View style={styles.searchShortcutContent}>
          <HandPlatter size={18} color="#0f172a" strokeWidth={2} />
          <Text variant="body" weight="semibold" style={styles.searchShortcutChipText}>
            Best dishes
          </Text>
        </View>
      </AnimatedPressable>
    </Reanimated.View>
  );
};

export default React.memo(SearchShortcutsRow);
