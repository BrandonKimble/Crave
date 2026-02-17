import React from 'react';
import { TouchableOpacity, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated from 'react-native-reanimated';

import { Text } from '../../../components';
import { FrostedGlassBackground } from '../../../components/FrostedGlassBackground';
import { colors as themeColors } from '../../../constants/theme';
import { ACTIVE_TAB_COLOR, NAV_BOTTOM_PADDING } from '../constants/search';
import styles from '../styles';

type NavItem = {
  key: string;
  label: string;
};

type SearchBottomNavProps = {
  bottomNavAnimatedStyle: StyleProp<ViewStyle>;
  shouldHideBottomNav: boolean;
  bottomInset: number;
  handleBottomNavLayout: (event: LayoutChangeEvent) => void;
  shouldDisableSearchBlur: boolean;
  navItems: readonly NavItem[];
  rootOverlay: string | null;
  navIconRenderers: Record<string, (color: string, active: boolean) => React.ReactNode>;
  handleProfilePress: () => void;
  handleOverlaySelect: (key: string) => void;
  bottomNavItemVisibilityAnimatedStyle: StyleProp<ViewStyle>;
};

const SearchBottomNavComponent = ({
  bottomNavAnimatedStyle,
  shouldHideBottomNav,
  bottomInset,
  handleBottomNavLayout,
  shouldDisableSearchBlur,
  navItems,
  rootOverlay,
  navIconRenderers,
  handleProfilePress,
  handleOverlaySelect,
  bottomNavItemVisibilityAnimatedStyle,
}: SearchBottomNavProps) => {
  return (
    <Reanimated.View
      style={[styles.bottomNavWrapper, bottomNavAnimatedStyle]}
      pointerEvents={shouldHideBottomNav ? 'none' : 'box-none'}
    >
      <View
        style={[styles.bottomNav, { paddingBottom: bottomInset + NAV_BOTTOM_PADDING }]}
        onLayout={handleBottomNavLayout}
      >
        <View style={styles.bottomNavBackground} pointerEvents="none">
          {!shouldDisableSearchBlur && <FrostedGlassBackground />}
        </View>
        {navItems.map((item) => {
          const active = rootOverlay === item.key;
          const iconColor = active ? ACTIVE_TAB_COLOR : themeColors.textBody;
          const renderIcon = navIconRenderers[item.key];
          if (typeof renderIcon !== 'function') {
            return null;
          }
          const onPress = item.key === 'profile' ? handleProfilePress : () => handleOverlaySelect(item.key);
          return (
            <TouchableOpacity key={item.key} style={styles.navButton} onPress={onPress}>
              <Reanimated.View
                style={[
                  { alignItems: 'center', justifyContent: 'center' },
                  bottomNavItemVisibilityAnimatedStyle,
                ]}
              >
                <View style={styles.navIcon}>{renderIcon(iconColor, active)}</View>
                <Text
                  variant="body"
                  weight={active ? 'semibold' : 'regular'}
                  style={[styles.navLabel, active && styles.navLabelActive]}
                >
                  {item.label}
                </Text>
              </Reanimated.View>
            </TouchableOpacity>
          );
        })}
      </View>
    </Reanimated.View>
  );
};

const SearchBottomNav = React.memo(SearchBottomNavComponent);

export default SearchBottomNav;
