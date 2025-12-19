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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { Text, Button } from '../../components';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useNotificationStore } from '../../store/notificationStore';
import { logger } from '../../utils';
import { notificationsService } from '../../services/notifications';
import { createManualPoll, type ManualPollPayload, type PollTopicType } from '../../services/polls';
import { autocompleteService, type AutocompleteMatch } from '../../services/autocomplete';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';

const ADMIN_USER_IDS = (process.env.EXPO_PUBLIC_ADMIN_USER_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const ProfileScreen: React.FC = () => {
  const resetOnboarding = useOnboardingStore((state) => state.__forceOnboarding);
  const { signOut, isSignedIn, userId } = useAuth();
  const pushToken = useNotificationStore((state) => state.pushToken);
  const setPushToken = useNotificationStore((state) => state.setPushToken);
  const isAdmin = React.useMemo(() => Boolean(userId && ADMIN_USER_IDS.includes(userId)), [userId]);

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
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
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
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    color: '#0f172a',
  },
  multilineInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  selectionHelper: {
    marginTop: 4,
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
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
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    fontWeight: '600',
    color: '#111827',
  },
  suggestionSecondary: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
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
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
    flex: 1,
    marginRight: 12,
  },
  adminSubmitButton: {
    marginTop: 20,
  },
});

export default ProfileScreen;
