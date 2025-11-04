import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { SearchScreen, BookmarksScreen, ProfileScreen } from '../screens';
import type { MainTabParamList } from '../types/navigation';

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICON_SIZE = 22;

const BottomTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#A78BFA',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.tabBar,
        tabBarIcon: ({ color }) => {
          const iconName: Record<keyof MainTabParamList, keyof typeof Feather.glyphMap> = {
            Search: 'search',
            Bookmarks: 'bookmark',
            Profile: 'user',
          };

          return <Feather name={iconName[route.name as keyof MainTabParamList]} size={ICON_SIZE} color={color} />;
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
    height: 88,
    paddingTop: 12,
    paddingBottom: Platform.select({ ios: 18, android: 12 }),
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});

export default BottomTabNavigator;
