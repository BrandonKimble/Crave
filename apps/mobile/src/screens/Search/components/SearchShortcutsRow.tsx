import React from 'react';
import {
  Pressable,
  ScrollView,
  type LayoutRectangle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Reanimated from 'react-native-reanimated';

import { Text } from '../../../components';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../perf/perf-scenario-runtime-store';
import styles from '../styles';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

// R7 groundwork (2026-08-19): the row is a horizontal scroll container — Google-Maps
// style — and chips are DATA, not layout. A future chip (Food, Drinks, time-of-day,
// Restaurants, Bars, ...) is one more `chips` array entry: {id, label, submit intent}.
// Only "All" exists today (R2 collapse, 1134a5302); the venue-axis chips land behind
// their own gate, not here.
//
// Touch-geometry contract: chip onLayout coordinates are relative to the SCROLL CONTENT
// (the content container carries the row's horizontal padding, so at offset 0 they match
// the pre-scroll single-chip geometry exactly). The scroll offset is reported upward via
// `onScrollOffsetChange` so the layout-resolution runtime can shift + viewport-clip the
// chip frames before the native hit-target regions and the suggestion-header hole mask
// consume them. While the chips fit the viewport the scroll surface is inert
// (`scrollEnabled=false`, pointerEvents box-none) so empty row space keeps passing
// touches through to the map, exactly as the plain row did.
export type SearchShortcutChip = {
  id: string;
  label: string;
  accessibilityLabel?: string;
  Icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
  testID?: string;
};

type SearchShortcutsRowProps = {
  containerAnimatedStyle: StyleProp<ViewStyle>;
  chipAnimatedStyle: StyleProp<ViewStyle>;
  contentAnimatedStyle: StyleProp<ViewStyle>;
  interactionEnabledRef: React.RefObject<boolean>;
  chips: SearchShortcutChip[];
  onRowLayout: (layout: LayoutRectangle) => void;
  onChipLayout: (chipId: string, layout: LayoutRectangle) => void;
  onScrollOffsetChange: (offsetX: number) => void;
};

const SearchShortcutsRow = ({
  containerAnimatedStyle,
  chipAnimatedStyle,
  contentAnimatedStyle,
  interactionEnabledRef,
  chips,
  onRowLayout,
  onChipLayout,
  onScrollOffsetChange,
}: SearchShortcutsRowProps) => {
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  const [rowWidth, setRowWidth] = React.useState(0);
  const [contentWidth, setContentWidth] = React.useState(0);
  const isScrollEnabled = contentWidth > rowWidth + 1;

  const logShortcutPress = React.useCallback(
    (target: string, handled: boolean) => {
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

  const handleChipPress = React.useCallback(
    (chip: SearchShortcutChip) => {
      if (interactionEnabledRef.current) {
        logShortcutPress(chip.id, true);
        chip.onPress();
        return;
      }
      logShortcutPress(chip.id, false);
    },
    [interactionEnabledRef, logShortcutPress]
  );

  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onScrollOffsetChange(event.nativeEvent.contentOffset.x);
    },
    [onScrollOffsetChange]
  );

  const handleContentSizeChange = React.useCallback((width: number) => {
    setContentWidth(width);
  }, []);

  return (
    <Reanimated.View
      style={containerAnimatedStyle}
      pointerEvents="box-none"
      onLayout={({ nativeEvent: { layout } }) => {
        setRowWidth(layout.width);
        onRowLayout(layout);
      }}
    >
      <ScrollView
        horizontal
        scrollEnabled={isScrollEnabled}
        pointerEvents={isScrollEnabled ? 'auto' : 'box-none'}
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        style={styles.searchShortcutsScroll}
        contentContainerStyle={styles.searchShortcutsScrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
        testID="search-shortcuts-scroll"
      >
        {chips.map((chip) => {
          const Icon = chip.Icon;
          return (
            <AnimatedPressable
              key={chip.id}
              onPress={() => handleChipPress(chip)}
              style={[styles.searchShortcutChip, chipAnimatedStyle]}
              accessibilityRole="button"
              accessibilityLabel={chip.accessibilityLabel ?? chip.label}
              testID={chip.testID}
              hitSlop={8}
              onLayout={({ nativeEvent: { layout } }) => {
                onChipLayout(chip.id, layout);
              }}
            >
              <Reanimated.View style={[styles.searchShortcutContent, contentAnimatedStyle]}>
                {Icon ? <Icon size={16} color="#111827" strokeWidth={2} /> : null}
                <Text variant="caption" weight="semibold" style={styles.searchShortcutChipText}>
                  {chip.label}
                </Text>
              </Reanimated.View>
            </AnimatedPressable>
          );
        })}
      </ScrollView>
    </Reanimated.View>
  );
};

export default React.memo(SearchShortcutsRow);
