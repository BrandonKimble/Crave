import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

// Import screens
import HomeScreen from '../screens/Home';
import SearchScreen from '../screens/Search';
import DetailsScreen from '../screens/Details';
import BookmarksScreen from '../screens/Bookmarks';
import ProfileScreen from '../screens/Profile';

// Define navigation types
export type RootStackParamList = {
  Main: undefined;
  Details: { id: string; name: string };
};

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Bookmarks: undefined;
  Profile: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Main tab navigator
const MainNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Search') {
            iconName = focused ? 'search' : 'search-outline';
          } else if (route.name === 'Bookmarks') {
            iconName = focused ? 'bookmark' : 'bookmark-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else {
            iconName = 'help-circle';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen id="Home" component={HomeScreen} />
      <Tab.Screen id="Search" component={SearchScreen} />
      <Tab.Screen id="Bookmarks" component={BookmarksScreen} />
      <Tab.Screen id="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

// Root stack navigator
const RootNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen id="Main" component={MainNavigator} options={{ headerShown: false }} />
        <Stack.Screen id="Details" component={DetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
