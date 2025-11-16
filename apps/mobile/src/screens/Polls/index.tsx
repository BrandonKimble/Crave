import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { io, Socket } from 'socket.io-client';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchPolls, voteOnPoll, addPollOption, Poll } from '../../services/polls';
import { API_BASE_URL } from '../../services/api';
import { logger } from '../../utils';
import { autocompleteService, type AutocompleteMatch } from '../../services/autocomplete';
import type { MainTabParamList } from '../../types/navigation';
import { useCityStore } from '../../store/cityStore';

type PollsScreenProps = BottomTabScreenProps<MainTabParamList, 'Polls'>;

const PollsScreen: React.FC<PollsScreenProps> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const persistedCity = useCityStore((state) => state.selectedCity);
  const setPersistedCity = useCityStore((state) => state.setSelectedCity);
  const [cityInput, setCityInput] = useState(persistedCity);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);
  const [restaurantQuery, setRestaurantQuery] = useState('');
  const [dishQuery, setDishQuery] = useState('');
  const [restaurantSelection, setRestaurantSelection] = useState<AutocompleteMatch | null>(null);
  const [dishSelection, setDishSelection] = useState<AutocompleteMatch | null>(null);
  const [restaurantSuggestions, setRestaurantSuggestions] = useState<AutocompleteMatch[]>([]);
  const [dishSuggestions, setDishSuggestions] = useState<AutocompleteMatch[]>([]);
  const [showRestaurantSuggestions, setShowRestaurantSuggestions] = useState(false);
  const [showDishSuggestions, setShowDishSuggestions] = useState(false);
  const [restaurantLoading, setRestaurantLoading] = useState(false);
  const [dishLoading, setDishLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const pendingPollIdRef = useRef<string | null>(null);

  const activePoll = polls.find((poll) => poll.pollId === selectedPollId);
  const activePollType = activePoll?.topic?.topicType ?? 'best_dish';

  useEffect(() => {
    setCityInput(persistedCity);
  }, [persistedCity]);

  const routeCity = route.params?.city;
  const routePollId = route.params?.pollId;

  useEffect(() => {
    if (typeof routeCity !== 'string') {
      return;
    }
    const normalized = routeCity.trim();
    if (!normalized) {
      return;
    }
    setCityInput(normalized);
    setPersistedCity(normalized);
    navigation.setParams({ city: undefined });
  }, [navigation, routeCity, setPersistedCity]);

  useEffect(() => {
    if (!routePollId) {
      return;
    }
    pendingPollIdRef.current = routePollId;
    const exists = polls.some((poll) => poll.pollId === routePollId);
    if (exists) {
      setSelectedPollId(routePollId);
      pendingPollIdRef.current = null;
      navigation.setParams({ pollId: undefined });
      return;
    }
    void loadPolls({ focusPollId: routePollId });
  }, [loadPolls, navigation, polls, routePollId]);

  const loadPolls = useCallback(
    async (options?: { focusPollId?: string | null }) => {
      setLoading(true);
      const targetCity = cityInput.trim();
      setPersistedCity(targetCity);
      const focusPollId = options?.focusPollId ?? null;
      try {
        const normalized = await fetchPolls(targetCity || undefined);
        setPolls(normalized);

        if (!normalized.length) {
          setSelectedPollId(null);
          return;
        }

        const hasCurrentSelection =
          selectedPollId && normalized.some((poll) => poll.pollId === selectedPollId);
        let nextSelection: string | null = null;

        if (focusPollId && normalized.some((poll) => poll.pollId === focusPollId)) {
          nextSelection = focusPollId;
        } else if (
          pendingPollIdRef.current &&
          normalized.some((poll) => poll.pollId === pendingPollIdRef.current)
        ) {
          nextSelection = pendingPollIdRef.current;
        } else if (hasCurrentSelection) {
          nextSelection = selectedPollId;
        } else {
          nextSelection = normalized[0].pollId;
        }

        if (nextSelection) {
          setSelectedPollId(nextSelection);
          if (pendingPollIdRef.current === nextSelection) {
            pendingPollIdRef.current = null;
          }
        } else {
          setSelectedPollId(null);
        }
      } catch (error) {
        logger.error('Failed to load polls', error);
        setPolls([]);
      } finally {
        setLoading(false);
      }
    },
    [cityInput, selectedPollId, setPersistedCity],
  );

  useEffect(() => {
    void loadPolls();
  }, [loadPolls]);

  useEffect(() => {
    setRestaurantQuery('');
    setDishQuery('');
    setRestaurantSelection(null);
    setDishSelection(null);
    setShowRestaurantSuggestions(false);
    setShowDishSuggestions(false);
  }, [selectedPollId]);

  useEffect(() => {
    const base = API_BASE_URL.replace(/\/api$/, '');
    socketRef.current = io(`${base}/polls`, {
      transports: ['websocket'],
    });
    socketRef.current.on('poll:update', () => {
      void loadPolls();
    });
    return () => {
      socketRef.current?.disconnect();
    };
  }, [loadPolls]);

  useEffect(() => {
    if (!activePoll || activePoll.topic?.topicType !== 'best_dish') {
      setShowRestaurantSuggestions(false);
      setRestaurantSuggestions([]);
      setRestaurantLoading(false);
      return;
    }
    const trimmed = restaurantQuery.trim();
    if (trimmed.length < 2) {
      setShowRestaurantSuggestions(false);
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
          setShowRestaurantSuggestions(matches.length > 0);
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }
          logger.warn('Restaurant autocomplete failed', {
            message: error instanceof Error ? error.message : 'unknown',
          });
          setRestaurantSuggestions([]);
          setShowRestaurantSuggestions(false);
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
  }, [restaurantQuery, activePoll]);

  useEffect(() => {
    if (!activePoll) {
      setShowDishSuggestions(false);
      setDishSuggestions([]);
      setDishLoading(false);
      return;
    }
    const trimmed = dishQuery.trim();
    if (trimmed.length < 2) {
      setShowDishSuggestions(false);
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
          setShowDishSuggestions(matches.length > 0);
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }
          logger.warn('Dish autocomplete failed', {
            message: error instanceof Error ? error.message : 'unknown',
          });
          setDishSuggestions([]);
          setShowDishSuggestions(false);
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
  }, [dishQuery, activePoll]);

  const handleVote = async (pollId: string, optionId: string) => {
    try {
      await voteOnPoll(pollId, { optionId });
      await loadPolls();
    } catch (error) {
      logger.error('Vote failed', error);
    }
  };

  const handleAddOption = async () => {
    if (!selectedPollId || !activePoll) {
      return;
    }

    const pollType = activePollType;
    const targetRestaurantId = activePoll.topic?.targetRestaurantId ?? null;

    if (pollType === 'best_dish' && !restaurantSelection) {
      Alert.alert('Select a restaurant', 'Pick a restaurant before adding your vote.');
      return;
    }

    if (pollType === 'what_to_order' && !dishSelection) {
      Alert.alert('Select a dish', 'Pick a dish before adding your vote.');
      return;
    }

    const restaurantLabel =
      pollType === 'best_dish'
        ? restaurantSelection?.name ?? restaurantQuery.trim()
        : activePoll.question;

    const dishLabel = dishSelection?.name ?? dishQuery.trim();

    const labelParts: string[] = [];
    if (dishLabel) {
      labelParts.push(dishLabel);
    }
    if (restaurantLabel) {
      labelParts.push(`@ ${restaurantLabel}`);
    }
    const label =
      labelParts.length > 0 ? labelParts.join(' ') : restaurantLabel || dishLabel || 'Poll option';

    const payload: {
      label: string;
      restaurantId?: string;
      dishEntityId?: string;
    } = {
      label: label.trim(),
    };

    if (pollType === 'best_dish' && restaurantSelection?.entityId) {
      payload.restaurantId = restaurantSelection.entityId;
    } else if (pollType === 'what_to_order' && targetRestaurantId) {
      payload.restaurantId = targetRestaurantId;
    }
    if (dishSelection?.entityId) {
      payload.dishEntityId = dishSelection.entityId;
    }

    try {
      await addPollOption(selectedPollId, payload);
      setRestaurantQuery('');
      setDishQuery('');
      setRestaurantSelection(null);
      setDishSelection(null);
      setShowRestaurantSuggestions(false);
      setShowDishSuggestions(false);
      await loadPolls({ focusPollId: selectedPollId });
    } catch (error) {
      logger.error('Failed to add poll option', error);
    }
  };

  const handleRestaurantSuggestionPress = useCallback((match: AutocompleteMatch) => {
    setRestaurantQuery(match.name);
    setRestaurantSelection(match);
    setShowRestaurantSuggestions(false);
  }, []);

  const handleDishSuggestionPress = useCallback((match: AutocompleteMatch) => {
    setDishQuery(match.name);
    setDishSelection(match);
    setShowDishSuggestions(false);
  }, []);

  const renderSuggestionList = (
    loading: boolean,
    matches: AutocompleteMatch[],
    emptyText: string,
    onSelect: (match: AutocompleteMatch) => void
  ) => (
    <View style={styles.autocompleteBox}>
      {loading ? (
        <View style={styles.autocompleteLoadingRow}>
          <ActivityIndicator size="small" color="#7c3aed" />
          <Text style={styles.autocompleteLoadingText}>Searching…</Text>
        </View>
      ) : matches.length === 0 ? (
        <Text style={styles.autocompleteEmptyText}>{emptyText}</Text>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled">
          {matches.map((match) => (
            <TouchableOpacity
              key={match.entityId}
              style={styles.autocompleteItem}
              onPress={() => onSelect(match)}
            >
              <Text style={styles.autocompletePrimary}>{match.name}</Text>
              <Text style={styles.autocompleteSecondary}>
                {match.entityType.replace(/_/g, ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const renderPoll = ({ item }: { item: Poll }) => (
    <TouchableOpacity
      style={[styles.pollCard, item.pollId === selectedPollId && styles.pollCardActive]}
      onPress={() => setSelectedPollId(item.pollId)}
    >
      <Text style={styles.pollQuestion}>{item.question}</Text>
      <Text style={styles.pollMeta}>
        {item.city ? `${item.city}` : 'All locations'} · {item.options.length} options
      </Text>
    </TouchableOpacity>
  );

  const pollData = polls;

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          paddingTop: Math.max(insets.top, 16),
        },
      ]}
      edges={['left', 'right', 'top']}
    >
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
      >
        <View style={styles.cityRow}>
          <Text style={styles.cityLabel}>City / Region</Text>
          <TextInput
            value={cityInput}
            onChangeText={setCityInput}
            placeholder="City"
            style={styles.cityInput}
            returnKeyType="done"
          />
          <TouchableOpacity onPress={() => void loadPolls()} style={styles.refreshButton}>
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#A78BFA" style={styles.loader} />
        ) : (
          <ScrollView
            horizontal
            contentContainerStyle={styles.pollList}
            showsHorizontalScrollIndicator={false}
          >
            {pollData.map((item) => (
              <React.Fragment key={item.pollId}>{renderPoll({ item })}</React.Fragment>
            ))}
          </ScrollView>
        )}

        {activePoll ? (
          <View style={styles.detailCard}>
          <Text style={styles.detailQuestion}>{activePoll.question}</Text>
            {activePoll.options.map((option) => (
              <TouchableOpacity
                key={option.optionId}
                style={styles.optionRow}
                onPress={() => handleVote(activePoll.pollId, option.optionId)}
              >
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionVotes}>{option.voteCount} votes</Text>
              </TouchableOpacity>
            ))}
            {activePollType === 'what_to_order' && (
              <Text style={styles.topicNote}>Votes apply to dishes at this restaurant.</Text>
            )}
            <View style={styles.addOptionBlock}>
              {activePollType === 'best_dish' && (
                <>
                  <Text style={styles.fieldLabel}>Restaurant</Text>
                  <TextInput
                    value={restaurantQuery}
                    onChangeText={(text) => {
                      setRestaurantQuery(text);
                      setRestaurantSelection(null);
                    }}
                    placeholder="Search for a restaurant"
                    style={styles.optionInput}
                    autoCapitalize="none"
                  />
                  {(showRestaurantSuggestions || restaurantLoading) &&
                    renderSuggestionList(
                      restaurantLoading,
                      restaurantSuggestions,
                      'Keep typing to add a restaurant',
                      handleRestaurantSuggestionPress
                    )}
                </>
              )}
              <Text style={styles.fieldLabel}>
                {activePollType === 'best_dish' ? 'Dish (optional)' : 'Dish'}
              </Text>
              <TextInput
                value={dishQuery}
                onChangeText={(text) => {
                  setDishQuery(text);
                  setDishSelection(null);
                }}
                placeholder={
                  activePollType === 'best_dish' ? 'Add a dish (optional)' : 'Search for a dish'
                }
                style={styles.optionInput}
                autoCapitalize="none"
              />
              {(showDishSuggestions || dishLoading) &&
                renderSuggestionList(
                  dishLoading,
                  dishSuggestions,
                  'Keep typing to add a dish',
                  handleDishSuggestionPress
                )}
              <TouchableOpacity onPress={handleAddOption} style={styles.submitButton}>
                <Text style={styles.submitButtonText}>Submit option</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={styles.emptyState}>No polls available yet.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  cityLabel: {
    fontSize: 14,
    color: '#475569',
  },
  cityInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
  },
  refreshText: {
    fontSize: 13,
    color: '#4C1D95',
    fontWeight: '600',
  },
  loader: {
    marginTop: 24,
  },
  pollList: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 12,
  },
  pollCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    width: 220,
  },
  pollCardActive: {
    borderWidth: 2,
    borderColor: '#A78BFA',
    backgroundColor: '#EEF2FF',
  },
  pollQuestion: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e1b4b',
  },
  pollMeta: {
    marginTop: 6,
    fontSize: 12,
    color: '#475569',
  },
  detailCard: {
    flex: 1,
    margin: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#faf5ff',
  },
  detailQuestion: {
    fontSize: 18,
    fontWeight: '700',
    color: '#312e81',
    marginBottom: 12,
  },
  optionRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#e9d5ff',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  optionLabel: {
    fontSize: 15,
    color: '#1f2937',
  },
  optionVotes: {
    fontSize: 13,
    color: '#6b21a8',
  },
  addOptionBlock: {
    marginTop: 16,
  },
  optionInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#4c1d95',
  },
  submitButton: {
    marginTop: 16,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  autocompleteBox: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    maxHeight: 200,
    overflow: 'hidden',
  },
  autocompleteLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  autocompleteLoadingText: {
    color: '#475569',
    fontSize: 13,
  },
  autocompleteEmptyText: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#94a3b8',
    fontSize: 13,
  },
  autocompleteItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  autocompletePrimary: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  autocompleteSecondary: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  topicNote: {
    marginTop: 12,
    fontSize: 12,
    color: '#6b21a8',
  },
  emptyState: {
    textAlign: 'center',
    marginTop: 32,
    color: '#94a3b8',
  },
});

export default PollsScreen;
