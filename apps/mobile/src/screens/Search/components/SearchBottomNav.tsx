import React from 'react';
import {
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Reanimated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { Text } from '../../../components';
import { colors as themeColors } from '../../../constants/theme';
import type { OverlayKey } from '../../../navigation/runtime/app-overlay-route-types';
import { ACTIVE_TAB_COLOR, NAV_BOTTOM_PADDING } from '../constants/search';
import {
  resolveSearchBottomInset,
  resolveSearchBottomNavHeight,
} from '../runtime/shared/search-startup-geometry';
import styles from '../styles';
import NavBarSilhouetteBackground from './NavBarSilhouetteBackground';

type NavItem = {
  key: OverlayKey;
  label: string;
};

type NavIconRenderer = (color: string, active: boolean) => React.ReactNode;

export type SearchBottomNavProps = {
  bottomNavAnimatedStyle: StyleProp<ViewStyle>;
  shouldHideBottomNav: boolean;
  bottomInset: number;
  handleBottomNavLayout: (event: LayoutChangeEvent) => void;
  shouldDisableSearchBlur: boolean;
  navItems: readonly NavItem[];
  activeTabIndexValue: SharedValue<number>;
  navIconRenderers: Partial<
    Record<OverlayKey, (color: string, active: boolean) => React.ReactNode>
  >;
  handleProfilePress: () => void;
  handleOverlaySelect: (key: OverlayKey) => void;
  bottomNavItemVisibilityAnimatedStyle: StyleProp<ViewStyle>;
};

const SearchBottomNavItem = React.memo(
  function SearchBottomNavItem({
    item,
    itemIndex,
    activeTabIndexValue,
    renderIcon,
    bottomNavItemVisibilityAnimatedStyle,
    handleProfilePress,
    handleOverlaySelect,
  }: {
    item: NavItem;
    itemIndex: number;
    activeTabIndexValue: SharedValue<number>;
    renderIcon: NavIconRenderer;
    bottomNavItemVisibilityAnimatedStyle: StyleProp<ViewStyle>;
    handleProfilePress: () => void;
    handleOverlaySelect: (key: OverlayKey) => void;
  }) {
    const handlePress = React.useCallback(() => {
      if (item.key === 'profile') {
        handleProfilePress();
        return;
      }
      handleOverlaySelect(item.key);
    }, [handleOverlaySelect, handleProfilePress, item.key]);
    const inactiveVisualStyle = useAnimatedStyle(
      () => ({
        opacity: activeTabIndexValue.value === itemIndex ? 0 : 1,
      }),
      [activeTabIndexValue, itemIndex]
    );
    const activeVisualStyle = useAnimatedStyle(
      () => ({
        opacity: activeTabIndexValue.value === itemIndex ? 1 : 0,
      }),
      [activeTabIndexValue, itemIndex]
    );

    return (
      <TouchableOpacity style={styles.navButton} onPress={handlePress} activeOpacity={0.85}>
        <Reanimated.View
          style={[localStyles.itemVisualStack, bottomNavItemVisibilityAnimatedStyle]}
        >
          <Reanimated.View style={[localStyles.itemVisual, inactiveVisualStyle]}>
            <View style={styles.navIcon}>{renderIcon(themeColors.textBody, false)}</View>
            <Text variant="body" weight="regular" style={styles.navLabel}>
              {item.label}
            </Text>
          </Reanimated.View>
          <Reanimated.View
            pointerEvents="none"
            style={[localStyles.itemVisual, localStyles.activeItemVisual, activeVisualStyle]}
          >
            <View style={styles.navIcon}>{renderIcon(ACTIVE_TAB_COLOR, true)}</View>
            <Text variant="body" weight="semibold" style={[styles.navLabel, styles.navLabelActive]}>
              {item.label}
            </Text>
          </Reanimated.View>
        </Reanimated.View>
      </TouchableOpacity>
    );
  },
  (previousProps, nextProps) =>
    previousProps.item === nextProps.item &&
    previousProps.itemIndex === nextProps.itemIndex &&
    previousProps.activeTabIndexValue === nextProps.activeTabIndexValue &&
    previousProps.renderIcon === nextProps.renderIcon &&
    previousProps.bottomNavItemVisibilityAnimatedStyle ===
      nextProps.bottomNavItemVisibilityAnimatedStyle &&
    previousProps.handleProfilePress === nextProps.handleProfilePress &&
    previousProps.handleOverlaySelect === nextProps.handleOverlaySelect
);

const SearchBottomNavComponent = ({
  bottomNavAnimatedStyle,
  shouldHideBottomNav,
  bottomInset,
  handleBottomNavLayout,
  shouldDisableSearchBlur,
  navItems,
  activeTabIndexValue,
  navIconRenderers,
  handleProfilePress,
  handleOverlaySelect,
  bottomNavItemVisibilityAnimatedStyle,
}: SearchBottomNavProps) => {
  const resolvedBottomInset = resolveSearchBottomInset(bottomInset);
  const resolvedBottomNavHeight = resolveSearchBottomNavHeight(resolvedBottomInset);

  return (
    <Reanimated.View
      style={[styles.bottomNavWrapper, bottomNavAnimatedStyle]}
      pointerEvents={shouldHideBottomNav ? 'none' : 'box-none'}
    >
      <View
        style={[
          styles.bottomNav,
          {
            height: resolvedBottomNavHeight,
            minHeight: resolvedBottomNavHeight,
            paddingBottom: resolvedBottomInset + NAV_BOTTOM_PADDING,
          },
        ]}
        onLayout={handleBottomNavLayout}
      >
        <Pressable style={styles.navTouchShield} onPress={() => {}} />
        <NavBarSilhouetteBackground
          bottomInset={resolvedBottomInset}
          disableBlur={shouldDisableSearchBlur}
        />
        {navItems.map((item, itemIndex) => {
          const renderIcon = navIconRenderers[item.key];
          if (typeof renderIcon !== 'function') {
            return null;
          }
          return (
            <SearchBottomNavItem
              key={item.key}
              item={item}
              itemIndex={itemIndex}
              activeTabIndexValue={activeTabIndexValue}
              renderIcon={renderIcon}
              bottomNavItemVisibilityAnimatedStyle={bottomNavItemVisibilityAnimatedStyle}
              handleProfilePress={handleProfilePress}
              handleOverlaySelect={handleOverlaySelect}
            />
          );
        })}
      </View>
    </Reanimated.View>
  );
};

const SearchBottomNav = React.memo(
  SearchBottomNavComponent,
  (previousProps, nextProps) =>
    previousProps.activeTabIndexValue === nextProps.activeTabIndexValue &&
    previousProps.shouldHideBottomNav === nextProps.shouldHideBottomNav &&
    previousProps.shouldDisableSearchBlur === nextProps.shouldDisableSearchBlur &&
    previousProps.bottomInset === nextProps.bottomInset &&
    previousProps.handleBottomNavLayout === nextProps.handleBottomNavLayout &&
    previousProps.bottomNavAnimatedStyle === nextProps.bottomNavAnimatedStyle &&
    previousProps.bottomNavItemVisibilityAnimatedStyle ===
      nextProps.bottomNavItemVisibilityAnimatedStyle &&
    previousProps.navItems === nextProps.navItems &&
    previousProps.navIconRenderers === nextProps.navIconRenderers &&
    previousProps.handleProfilePress === nextProps.handleProfilePress &&
    previousProps.handleOverlaySelect === nextProps.handleOverlaySelect
);

export default SearchBottomNav;

const localStyles = StyleSheet.create({
  itemVisualStack: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  itemVisual: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  activeItemVisual: {
    ...StyleSheet.absoluteFillObject,
  },
});
