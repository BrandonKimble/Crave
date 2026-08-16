import React from 'react';
import { Pressable, type LayoutRectangle, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { Store } from 'lucide-react-native';

import { Text } from '../../../components';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../perf/perf-scenario-runtime-store';
import styles from '../styles';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

// R2 (2026-08-16, owner-ratified): the "Best restaurants" / "Best dishes" pair both ran
// the SAME unfiltered browse — duplicates. Collapsed to ONE "All" chip wired to the
// restaurants-tab browse submit (the browse result set is identical either way; the tab
// only picks the landing pane). The dishes-chip prop thread was then deleted end-to-end
// (red-team lens A, same day): the R7 shortcut row replaces this shape wholesale, so the
// retained plumbing preserved nothing reusable. The row's visual/layout machinery
// (animated styles, row/chip layout callbacks) stays.
type SearchShortcutsRowProps = {
  containerAnimatedStyle: StyleProp<ViewStyle>;
  chipAnimatedStyle: StyleProp<ViewStyle>;
  contentAnimatedStyle: StyleProp<ViewStyle>;
  interactionEnabledRef: React.RefObject<boolean>;
  onPressBestRestaurants: () => void;
  onRowLayout: (layout: LayoutRectangle) => void;
  onRestaurantsChipLayout: (layout: LayoutRectangle) => void;
};

const SearchShortcutsRow = ({
  containerAnimatedStyle,
  chipAnimatedStyle,
  contentAnimatedStyle,
  interactionEnabledRef,
  onPressBestRestaurants,
  onRowLayout,
  onRestaurantsChipLayout,
}: SearchShortcutsRowProps) => {
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  const logShortcutPress = React.useCallback(
    (target: 'restaurants', handled: boolean) => {
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
  const handleAllPress = React.useCallback(() => {
    if (interactionEnabledRef.current) {
      logShortcutPress('restaurants', true);
      onPressBestRestaurants();
      return;
    }
    logShortcutPress('restaurants', false);
  }, [interactionEnabledRef, logShortcutPress, onPressBestRestaurants]);

  return (
    <Reanimated.View
      style={containerAnimatedStyle}
      pointerEvents="box-none"
      onLayout={({ nativeEvent: { layout } }) => {
        onRowLayout(layout);
      }}
    >
      <AnimatedPressable
        onPress={handleAllPress}
        style={[styles.searchShortcutChip, chipAnimatedStyle]}
        accessibilityRole="button"
        accessibilityLabel="Show all results here"
        hitSlop={8}
        onLayout={({ nativeEvent: { layout } }) => {
          onRestaurantsChipLayout(layout);
        }}
      >
        <Reanimated.View style={[styles.searchShortcutContent, contentAnimatedStyle]}>
          <Store size={16} color="#111827" strokeWidth={2} />
          <Text variant="caption" weight="semibold" style={styles.searchShortcutChipText}>
            All
          </Text>
        </Reanimated.View>
      </AnimatedPressable>
    </Reanimated.View>
  );
};

export default React.memo(SearchShortcutsRow);
