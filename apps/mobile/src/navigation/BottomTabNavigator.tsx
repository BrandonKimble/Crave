import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SearchScreen, BookmarksScreen, ProfileScreen } from '../screens';
import type { MainTabParamList } from '../types/navigation';

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICON_SIZE = 22;

const TabBarGradientBackground: React.FC = () => (
  <LinearGradient
    pointerEvents="none"
    style={StyleSheet.absoluteFillObject}
    colors={[
      'rgba(255, 255, 255, 0)',
      'rgba(255, 255, 255, 0.6)',
      'rgba(255, 255, 255, 0.85)',
      'rgba(255, 255, 255, 1)',
      'rgba(255, 255, 255, 1)',
    ]}
    locations={[0, 0.18, 0.32, 0.6, 1]}
    start={{ x: 0.5, y: 0 }}
    end={{ x: 0.5, y: 1 }}
  />
);

const BottomTabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  const basePadding = insets.bottom > 0 ? insets.bottom : 6;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#A78BFA',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarLabelStyle: styles.label,
        tabBarBackground: () => <TabBarGradientBackground />,
        tabBarStyle: [
          styles.tabBar,
          {
            height: Math.max(60, 44 + basePadding * 2),
            paddingBottom: basePadding,
            paddingTop: basePadding,
          },
        ],
        tabBarIcon: ({ color }) => {
          const iconName: Record<keyof MainTabParamList, keyof typeof Feather.glyphMap> = {
            Search: 'search',
            Bookmarks: 'bookmark',
            Profile: 'user',
          };

          return (
            <Feather
              name={iconName[route.name as keyof MainTabParamList]}
              size={ICON_SIZE}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Bookmarks" component={BookmarksScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    height: 62,
    paddingTop: 2,
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    borderTopColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});

export default BottomTabNavigator;
