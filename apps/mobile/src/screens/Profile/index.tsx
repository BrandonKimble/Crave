import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import Svg, { Path } from 'react-native-svg';
import { Text, Button } from '../../components';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useNotificationStore } from '../../store/notificationStore';
import { logger } from '../../utils';
import { notificationsService } from '../../services/notifications';
import { createManualPoll, type ManualPollPayload, type PollTopicType } from '../../services/polls';
import { autocompleteService, type AutocompleteMatch } from '../../services/autocomplete';
import { useOverlayStore } from '../../store/overlayStore';
import { colors as themeColors } from '../../constants/theme';
import { Heart } from 'lucide-react-native';
import type { RootStackParamList } from '../../types/navigation';

const ADMIN_USER_IDS = (process.env.EXPO_PUBLIC_ADMIN_USER_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const ACTIVE_TAB_COLOR = themeColors.primary;

const PollIcon = ({ color, size = 20 }: { color: string; size?: number }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transform: [{ rotate: '90deg' }] }}
  >
    <Path d="M5 21v-6" />
    <Path d="M12 21V3" />
    <Path d="M19 21V9" />
  </Svg>
);

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const resetOnboarding = useOnboardingStore((state) => state.__forceOnboarding);
  const { signOut, isSignedIn, userId } = useAuth();
  const pushToken = useNotificationStore((state) => state.pushToken);
  const setPushToken = useNotificationStore((state) => state.setPushToken);
  const isAdmin = React.useMemo(() => Boolean(userId && ADMIN_USER_IDS.includes(userId)), [userId]);
  const { setOverlay } = useOverlayStore();

  const [manualTopicType, setManualTopicType] = React.useState<PollTopicType>('best_dish');
  const [manualCity, setManualCity] = React.useState('');
  const [manualQuestion, setManualQuestion] = React.useState('');
  const [manualDescription, setManualDescription] = React.useState('');
  const [manualAllowAdditions, setManualAllowAdditions] = React.useState(true);
  const [manualNotify, setManualNotify] = React.useState(false);
  const [manualSubmitting, setManualSubmitting] = React.useState(false);
  const [dishQuery, setDishQuery] = React.useState('');
  const [dishSuggestions, setDishSuggestions] = React.useState<AutocompleteMatch[]>([]);
  const [dishLoading, setDishLoading] = React.useState(false);
  const [dishSelection, setDishSelection] = React.useState<AutocompleteMatch | null>(null);
  const [restaurantQuery, setRestaurantQuery] = React.useState('');
  const [restaurantSuggestions, setRestaurantSuggestions] = React.useState<AutocompleteMatch[]>([]);
  const [restaurantLoading, setRestaurantLoading] = React.useState(false);
  const [restaurantSelection, setRestaurantSelection] = React.useState<AutocompleteMatch | null>(
    null
  );
  const insets = useSafeAreaInsets();
  const navItems = React.useMemo(
    () =>
      [
        { key: 'search' as const, label: 'Search' },
        { key: 'bookmarks' as const, label: 'Saves' },
        { key: 'polls' as const, label: 'Polls' },
        { key: 'profile' as const, label: 'Profile' },
      ],
    []
  );

  const handleNavPress = React.useCallback(
    (key: 'search' | 'bookmarks' | 'polls' | 'profile') => {
      if (key === 'profile') {
        return;
      }
      setOverlay(key as any);
      navigation.navigate('Search');
    },
    [navigation, setOverlay]
  );

  const navIconRenderers = React.useMemo<
    Record<
      'search' | 'bookmarks' | 'polls' | 'profile',
      (color: string, active: boolean) => React.ReactNode
    >
  >(
    () => ({
      search: (color) => (
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <Path
            d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
            fill={color}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Svg
            width={0}
            height={0}
            viewBox="0 0 1 1"
            accessible={false}
          />
        </Svg>
      ),
      bookmarks: (color, active) => (
        <Heart
          size={20}
          color={color}
          strokeWidth={active ? 0 : 2}
          fill={active ? color : 'none'}
        />
      ),
      polls: (color) => <PollIcon color={color} size={20} />,
      profile: (color, active) => {
        if (active) {
          return (
            <Svg width={20} height={20} viewBox="0 0 24 24" fill={color} stroke="none">
              <Path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
              />
            </Svg>
          );
        }
        return (
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
            <Path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </Svg>
        );
      },
    }),
    []
  );

  React.useEffect(() => {
    if (!isAdmin || manualTopicType !== 'best_dish') {
      setDishSuggestions([]);
      setDishLoading(false);
      return;
    }
    const trimmed = dishQuery.trim();
    if (trimmed.length < 2) {
      setDishSuggestions([]);
      setDishLoading(false);
      return;
    }

    let isActive = true;
    setDishLoading(true);
    const handle = setTimeout(() => {
      autocompleteService
        .fetchEntities(trimmed)
        .then((response) => {
          if (!isActive) {
            return;
          }
          const matches = response.matches.filter((match) => match.entityType === 'food');
          setDishSuggestions(matches);
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }
          logger.warn('Dish autocomplete failed', {
            message: error instanceof Error ? error.message : 'unknown',
          });
          setDishSuggestions([]);
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setDishLoading(false);
        });
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(handle);
    };
  }, [dishQuery, isAdmin, manualTopicType]);

  React.useEffect(() => {
    if (!isAdmin || manualTopicType !== 'what_to_order') {
      setRestaurantSuggestions([]);
      setRestaurantLoading(false);
      return;
    }
    const trimmed = restaurantQuery.trim();
    if (trimmed.length < 2) {
      setRestaurantSuggestions([]);
      setRestaurantLoading(false);
      return;
    }

    let isActive = true;
    setRestaurantLoading(true);
    const handle = setTimeout(() => {
      autocompleteService
        .fetchEntities(trimmed)
        .then((response) => {
          if (!isActive) {
            return;
          }
          const matches = response.matches.filter((match) => match.entityType === 'restaurant');
          setRestaurantSuggestions(matches);
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }
          logger.warn('Restaurant autocomplete failed', {
            message: error instanceof Error ? error.message : 'unknown',
          });
          setRestaurantSuggestions([]);
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setRestaurantLoading(false);
        });
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(handle);
    };
  }, [isAdmin, manualTopicType, restaurantQuery]);

  React.useEffect(() => {
    if (manualTopicType === 'best_dish') {
      setRestaurantSelection(null);
      setRestaurantQuery('');
      setRestaurantSuggestions([]);
      setRestaurantLoading(false);
    } else {
      setDishSelection(null);
      setDishQuery('');
      setDishSuggestions([]);
      setDishLoading(false);
    }
  }, [manualTopicType]);

  const unregisterPushToken = React.useCallback(async () => {
    if (!pushToken) {
      return;
    }
    try {
      await notificationsService.unregisterDevice(pushToken);
    } catch (error) {
      logger.warn('Failed to unregister push token', error);
    } finally {
      setPushToken(null);
    }
  }, [pushToken, setPushToken]);

  const handleSignOut = React.useCallback(async () => {
    try {
      await unregisterPushToken();
      await signOut();
      Alert.alert('Signed out', 'Sign in again the next time you open the app.');
    } catch (error) {
      logger.error('Sign out failed', error);
      Alert.alert(
        'Unable to sign out',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  }, [signOut, unregisterPushToken]);
  const handleReplayOnboarding = React.useCallback(async () => {
    try {
      await unregisterPushToken();
      await signOut();
    } catch (error) {
      logger.warn('Replay onboarding sign-out failed', error);
    } finally {
      resetOnboarding();
      Alert.alert('Onboarding reset', 'Restart the app to walk through onboarding again.');
    }
  }, [resetOnboarding, signOut, unregisterPushToken]);

  const handleDishSelect = React.useCallback((match: AutocompleteMatch) => {
    setDishSelection(match);
    setDishQuery(match.name);
    setDishSuggestions([]);
  }, []);

  const handleRestaurantSelect = React.useCallback((match: AutocompleteMatch) => {
    setRestaurantSelection(match);
    setRestaurantQuery(match.name);
    setRestaurantSuggestions([]);
  }, []);

  const handleManualPollSubmit = React.useCallback(async () => {
    if (manualTopicType === 'best_dish' && !dishSelection) {
      Alert.alert('Pick a dish', 'Select a dish before publishing your poll.');
      return;
    }
    if (manualTopicType === 'what_to_order' && !restaurantSelection) {
      Alert.alert('Pick a restaurant', 'Select a restaurant before publishing your poll.');
      return;
    }

    const fallbackQuestion =
      manualTopicType === 'best_dish'
        ? `What's the best ${dishSelection?.name ?? 'dish'} in ${manualCity || 'your city'}?`
        : `What should we order at ${restaurantSelection?.name ?? 'this spot'}?`;

    const payload: ManualPollPayload = {
      question: manualQuestion.trim() || fallbackQuestion,
      topicType: manualTopicType,
      city: manualCity.trim() || undefined,
      description: manualDescription.trim() || undefined,
      allowUserAdditions: manualAllowAdditions,
      notifySubscribers: manualNotify,
      targetDishId: manualTopicType === 'best_dish' ? dishSelection?.entityId : undefined,
      targetRestaurantId:
        manualTopicType === 'what_to_order' ? restaurantSelection?.entityId : undefined,
    };

    setManualSubmitting(true);
    try {
      await createManualPoll(payload);
      Alert.alert('Poll created', 'Your poll is now live.');
      setManualQuestion('');
      setManualDescription('');
      setManualNotify(false);
      setDishSelection(null);
      setDishQuery('');
      setRestaurantSelection(null);
      setRestaurantQuery('');
    } catch (error) {
      logger.error('Failed to create manual poll', error);
      Alert.alert(
        'Unable to create poll',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setManualSubmitting(false);
    }
  }, [
    dishSelection,
    manualAllowAdditions,
    manualCity,
    manualDescription,
    manualNotify,
    manualQuestion,
    manualTopicType,
    restaurantSelection,
  ]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text variant="title" weight="bold" style={styles.title}>
          Profile
        </Text>
        <Text variant="caption" style={styles.subtitle}>
          Your account settings
        </Text>
      </View>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {isAdmin ? (
          <View style={styles.adminPanel}>
            <Text variant="subtitle" weight="bold" style={styles.adminTitle}>
              Manual poll tools
            </Text>
            <Text style={styles.adminSubtitle}>
              Quickly seed polls for new cities or restaurants.
            </Text>
            <View style={styles.typeToggleRow}>
              {(
                [
                  { label: 'Best dish', value: 'best_dish' },
                  { label: 'What to order', value: 'what_to_order' },
                ] as { label: string; value: PollTopicType }[]
              ).map((option, index) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.typeToggle,
                    index > 0 && styles.typeToggleSpacing,
                    manualTopicType === option.value && styles.typeToggleActive,
                  ]}
                  onPress={() => setManualTopicType(option.value)}
                >
                  <Text
                    style={[
                      styles.typeToggleLabel,
                      manualTopicType === option.value && styles.typeToggleLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.adminFieldLabel}>City / Region</Text>
            <TextInput
              value={manualCity}
              onChangeText={setManualCity}
              placeholder="Austin"
              style={styles.input}
            />
            <Text style={styles.adminFieldLabel}>Question</Text>
            <TextInput
              value={manualQuestion}
              onChangeText={setManualQuestion}
              placeholder="What's the best breakfast taco in Austin?"
              style={styles.input}
              multiline
            />
            <Text style={styles.adminFieldLabel}>Description (optional)</Text>
            <TextInput
              value={manualDescription}
              onChangeText={setManualDescription}
              placeholder="Add context or a short blurb"
              style={[styles.input, styles.multilineInput]}
              multiline
            />
            {manualTopicType === 'best_dish' ? (
              <View>
                <Text style={styles.adminFieldLabel}>Dish</Text>
                <TextInput
                  value={dishQuery}
                  onChangeText={(text) => {
                    setDishQuery(text);
                    setDishSelection(null);
                  }}
                  placeholder="Search for a dish"
                  style={styles.input}
                  autoCapitalize="none"
                />
                {dishSelection ? (
                  <Text style={styles.selectionHelper}>Selected: {dishSelection.name}</Text>
                ) : null}
                {dishLoading ? (
                  <ActivityIndicator size="small" color="#7c3aed" style={styles.suggestionLoader} />
                ) : null}
                {dishSuggestions.length > 0 ? (
                  <View style={styles.suggestionList}>
                    {dishSuggestions.map((match) => (
                      <TouchableOpacity
                        key={match.entityId}
                        style={styles.suggestionItem}
                        onPress={() => handleDishSelect(match)}
                      >
                        <Text style={styles.suggestionPrimary}>{match.name}</Text>
                        <Text style={styles.suggestionSecondary}>
                          {match.entityType.replace(/_/g, ' ')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : (
              <View>
                <Text style={styles.adminFieldLabel}>Restaurant</Text>
                <TextInput
                  value={restaurantQuery}
                  onChangeText={(text) => {
                    setRestaurantQuery(text);
                    setRestaurantSelection(null);
                  }}
                  placeholder="Search for a restaurant"
                  style={styles.input}
                  autoCapitalize="none"
                />
                {restaurantSelection ? (
                  <Text style={styles.selectionHelper}>Selected: {restaurantSelection.name}</Text>
                ) : null}
                {restaurantLoading ? (
                  <ActivityIndicator size="small" color="#7c3aed" style={styles.suggestionLoader} />
                ) : null}
                {restaurantSuggestions.length > 0 ? (
                  <View style={styles.suggestionList}>
                    {restaurantSuggestions.map((match) => (
                      <TouchableOpacity
                        key={match.entityId}
                        style={styles.suggestionItem}
                        onPress={() => handleRestaurantSelect(match)}
                      >
                        <Text style={styles.suggestionPrimary}>{match.name}</Text>
                        <Text style={styles.suggestionSecondary}>
                          {match.entityType.replace(/_/g, ' ')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            )}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Allow user submissions</Text>
              <Switch
                value={manualAllowAdditions}
                onValueChange={setManualAllowAdditions}
                trackColor={{ true: '#a78bfa', false: '#cbd5f5' }}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Send push notification</Text>
              <Switch
                value={manualNotify}
                onValueChange={setManualNotify}
                trackColor={{ true: '#a78bfa', false: '#cbd5f5' }}
              />
            </View>
            <Button
              label={manualSubmitting ? 'Publishing…' : 'Publish poll'}
              onPress={handleManualPollSubmit}
              isLoading={manualSubmitting}
              style={styles.adminSubmitButton}
            />
          </View>
        ) : null}
        <View style={styles.emptyState}>
          <Text variant="body" style={styles.emptyText}>
            Profile coming soon
          </Text>
          <Button
            label="Replay onboarding"
            variant="ghost"
            onPress={handleReplayOnboarding}
            style={styles.resetButton}
          />
          {isSignedIn ? (
            <Button
              label="Sign out"
              variant="ghost"
              onPress={handleSignOut}
              style={styles.resetButton}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: {
    color: '#0f172a',
  },
  subtitle: {
    color: '#64748b',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  adminPanel: {
    backgroundColor: '#f8f5ff',
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
  },
  adminTitle: {
    color: '#312e81',
  },
  adminSubtitle: {
    color: '#6b7280',
    marginTop: 4,
    marginBottom: 12,
  },
  adminFieldLabel: {
    marginTop: 12,
    marginBottom: 6,
    color: '#4c1d95',
    fontWeight: '600',
  },
  typeToggleRow: {
    flexDirection: 'row',
  },
  typeToggle: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  typeToggleActive: {
    backgroundColor: '#ede9fe',
    borderColor: '#a78bfa',
  },
  typeToggleLabel: {
    color: '#475569',
    fontWeight: '600',
  },
  typeToggleLabelActive: {
    color: '#4c1d95',
  },
  typeToggleSpacing: {
    marginLeft: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  selectionHelper: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
  },
  suggestionLoader: {
    marginTop: 8,
  },
  suggestionList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#fff',
    maxHeight: 200,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  suggestionPrimary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  suggestionSecondary: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    color: '#64748b',
  },
  resetButton: {
    marginTop: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  switchLabel: {
    color: '#1f2937',
    fontSize: 14,
    flex: 1,
    marginRight: 12,
  },
  adminSubmitButton: {
    marginTop: 20,
  },
});

export default ProfileScreen;
