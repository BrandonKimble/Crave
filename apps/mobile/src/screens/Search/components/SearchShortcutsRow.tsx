import React from 'react';
import {
  Pressable,
  type LayoutRectangle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import { HandPlatter, Store } from 'lucide-react-native';

import { Text } from '../../../components';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../perf/perf-scenario-runtime-store';
import styles from '../styles';
import { useSearchChromeScalarSurfaceMeasuredControlRef } from '../runtime/native/use-search-chrome-scalar-surface-measured-control-ref';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

type SearchShortcutsRowProps = {
  containerAnimatedStyle: StyleProp<ViewStyle>;
  chipAnimatedStyle: StyleProp<ViewStyle>;
  contentAnimatedStyle: StyleProp<ViewStyle>;
  interactionEnabledRef: React.RefObject<boolean>;
  onPressBestRestaurants: () => void;
  onPressBestDishes: () => void;
  onRowLayout: (layout: LayoutRectangle) => void;
  onRestaurantsChipLayout: (layout: LayoutRectangle) => void;
  onDishesChipLayout: (layout: LayoutRectangle) => void;
};

const SearchShortcutsRow = ({
  containerAnimatedStyle,
  chipAnimatedStyle,
  contentAnimatedStyle,
  interactionEnabledRef,
  onPressBestRestaurants,
  onPressBestDishes,
  onRowLayout,
  onRestaurantsChipLayout,
  onDishesChipLayout,
}: SearchShortcutsRowProps) => {
  const restaurantsScalarSurfaceRef =
    useSearchChromeScalarSurfaceMeasuredControlRef('shortcut_restaurants');
  const dishesScalarSurfaceRef = useSearchChromeScalarSurfaceMeasuredControlRef('shortcut_dishes');
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  const logShortcutPress = React.useCallback(
    (target: 'restaurants' | 'dishes', handled: boolean) => {
      if (!isPerfScenarioAttributionActive(activeScenarioConfig)) {
        return;
      }
      logPerfScenarioAttributionEvent('VisualReadiness', activeScenarioConfig, {
        event: 'search_shortcut_press_dispatch_contract',
        source: 'react_pressable',
        target,
        handled,
        interactionEnabled: interactionEnabledRef.current,
      });
    },
    [activeScenarioConfig, interactionEnabledRef]
  );
  const handleRestaurantsPress = React.useCallback(() => {
    if (interactionEnabledRef.current) {
      logShortcutPress('restaurants', true);
      onPressBestRestaurants();
      return;
    }
    logShortcutPress('restaurants', false);
  }, [interactionEnabledRef, logShortcutPress, onPressBestRestaurants]);
  const handleDishesPress = React.useCallback(() => {
    if (interactionEnabledRef.current) {
      logShortcutPress('dishes', true);
      onPressBestDishes();
      return;
    }
    logShortcutPress('dishes', false);
  }, [interactionEnabledRef, logShortcutPress, onPressBestDishes]);

  return (
    <Reanimated.View
      style={containerAnimatedStyle}
      pointerEvents="box-none"
      onLayout={({ nativeEvent: { layout } }) => {
        onRowLayout(layout);
      }}
    >
      <AnimatedPressable
        ref={restaurantsScalarSurfaceRef}
        onPress={handleRestaurantsPress}
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
        ref={dishesScalarSurfaceRef}
        onPress={handleDishesPress}
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
