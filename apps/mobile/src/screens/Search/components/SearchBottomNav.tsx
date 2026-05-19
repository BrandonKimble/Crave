import React from 'react';
import {
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Reanimated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { Text } from '../../../components';
import {
  FROSTED_GLASS_DEFAULT_INTENSITY,
  FROSTED_GLASS_DEFAULT_TINT,
  FROSTED_GLASS_DEFAULT_TINT_COLOR,
  resolveFrostedGlassBlurAmount,
} from '../../../components/frosted-glass-style';
import { colors as themeColors } from '../../../constants/theme';
import type { OverlayKey } from '../../../navigation/runtime/app-overlay-route-types';
import {
  APP_ROUTE_NAV_SILHOUETTE_BOUNDARY_SHAPE,
  resolveAppRouteNavSilhouetteBottomNavGeometry,
} from '../../../navigation/runtime/app-route-nav-silhouette-authority';
import { SearchRouteNavSilhouetteHostNativeView } from '../../../overlays/SearchRouteNavSilhouetteHostNativeView';
import { ACTIVE_TAB_COLOR, NAV_BOTTOM_PADDING } from '../constants/search';
import type { SearchBottomNavMotionRuntime } from '../runtime/shared/search-bottom-nav-motion-runtime';
import styles from '../styles';

type NavItem = {
  key: OverlayKey;
  label: string;
};

type NavIconRenderer = (color: string, active: boolean) => React.ReactNode;

export type SearchBottomNavProps = {
  bottomNavMotionRuntime: SearchBottomNavMotionRuntime;
  shouldHideBottomNav: boolean;
  bottomInset: number;
  handleBottomNavLayout: (event: LayoutChangeEvent) => void;
  navItems: readonly NavItem[];
  activeTabIndexValue: SharedValue<number>;
  navIconRenderers: Partial<
    Record<OverlayKey, (color: string, active: boolean) => React.ReactNode>
  >;
  handleProfilePress: () => void;
  handleOverlaySelect: (key: OverlayKey) => void;
};

const SearchBottomNavItem = React.memo(
  function SearchBottomNavItem({
    item,
    itemIndex,
    activeTabIndexValue,
    renderIcon,
    handleProfilePress,
    handleOverlaySelect,
  }: {
    item: NavItem;
    itemIndex: number;
    activeTabIndexValue: SharedValue<number>;
    renderIcon: NavIconRenderer;
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
        <Reanimated.View style={localStyles.itemVisualStack}>
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
    previousProps.handleProfilePress === nextProps.handleProfilePress &&
    previousProps.handleOverlaySelect === nextProps.handleOverlaySelect
);

const SearchBottomNavComponent = ({
  bottomNavMotionRuntime,
  shouldHideBottomNav,
  bottomInset,
  handleBottomNavLayout,
  navItems,
  activeTabIndexValue,
  navIconRenderers,
  handleProfilePress,
  handleOverlaySelect,
}: SearchBottomNavProps) => {
  const { bottomInset: resolvedBottomInset, bottomNavHeight: resolvedBottomNavHeight } =
    resolveAppRouteNavSilhouetteBottomNavGeometry(bottomInset);
  const { materialTopInset, cutoutHeight, cutoutRadius } = APP_ROUTE_NAV_SILHOUETTE_BOUNDARY_SHAPE;
  const bottomNavMotionStyle = useAnimatedStyle(
    () => ({
      opacity: bottomNavMotionRuntime.navOpacity.value,
      transform: [{ translateY: bottomNavMotionRuntime.navTranslateY.value }],
    }),
    [bottomNavMotionRuntime]
  );

  return (
    <Reanimated.View
      style={[styles.bottomNavWrapper, bottomNavMotionStyle]}
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
        <SearchRouteNavSilhouetteHostNativeView
          pointerEvents="none"
          materialEnabled={!shouldHideBottomNav}
          materialBlurAmount={resolveFrostedGlassBlurAmount(FROSTED_GLASS_DEFAULT_INTENSITY)}
          materialBlurType={FROSTED_GLASS_DEFAULT_TINT}
          materialTintColor={FROSTED_GLASS_DEFAULT_TINT_COLOR}
          navMaterialTopInset={materialTopInset}
          cutoutHeight={cutoutHeight}
          cutoutRadius={cutoutRadius}
          style={[
            localStyles.materialHost,
            {
              top: -materialTopInset,
              height: resolvedBottomNavHeight + materialTopInset,
            },
          ]}
        />
        <Pressable style={styles.navTouchShield} onPress={() => {}} />
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
    previousProps.bottomNavMotionRuntime === nextProps.bottomNavMotionRuntime &&
    previousProps.shouldHideBottomNav === nextProps.shouldHideBottomNav &&
    previousProps.bottomInset === nextProps.bottomInset &&
    previousProps.handleBottomNavLayout === nextProps.handleBottomNavLayout &&
    previousProps.navItems === nextProps.navItems &&
    previousProps.navIconRenderers === nextProps.navIconRenderers &&
    previousProps.handleProfilePress === nextProps.handleProfilePress &&
    previousProps.handleOverlaySelect === nextProps.handleOverlaySelect
);

export default SearchBottomNav;

const localStyles = StyleSheet.create({
  materialHost: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
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
