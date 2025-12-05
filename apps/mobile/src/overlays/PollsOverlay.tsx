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
  Dimensions,
  Pressable,
} from 'react-native';
import { io, Socket } from 'socket.io-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PanGestureHandler,
  type PanGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { fetchPolls, voteOnPoll, addPollOption, Poll } from '../services/polls';
import { API_BASE_URL } from '../services/api';
import { logger } from '../utils';
import { autocompleteService, type AutocompleteMatch } from '../services/autocomplete';
import { useCityStore } from '../store/cityStore';
import { colors as themeColors } from '../constants/theme';
import { useOverlayStore } from '../store/overlayStore';
import { overlaySheetStyles, OVERLAY_HORIZONTAL_PADDING } from './overlaySheetStyles';
import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import {
  SHEET_SPRING_CONFIG,
  SMALL_MOVEMENT_THRESHOLD,
  clampValue,
  snapPointForState,
  type SheetGestureContext,
  type SheetPosition,
} from './sheetUtils';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const OPTION_COLORS = ['#f97316', '#fb7185', '#c084fc', '#38bdf8', '#facc15', '#34d399'] as const;
const CARD_GAP = 4;

type PollsOverlayProps = {
  visible: boolean;
  params?: { city?: string | null; pollId?: string | null };
};

const ACCENT = themeColors.primary;
const ACCENT_DARK = themeColors.primaryDark;
const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

const PollsOverlay: React.FC<PollsOverlayProps> = ({ visible, params }) => {
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
  const setOverlay = useOverlayStore((state) => state.setOverlay);
  const headerPaddingTop = 0;
  const contentBottomPadding = Math.max(insets.bottom + 48, 72);
  const snapPoints = React.useMemo<Record<SheetPosition, number>>(() => {
    const expanded = Math.max(insets.top, 0);
    const hidden = SCREEN_HEIGHT + 80;
    return {
      expanded,
      middle: expanded,
      collapsed: expanded,
      hidden,
    };
  }, [insets.top]);
  const sheetTranslateY = useSharedValue(snapPoints.hidden);
  const sheetStateShared = useSharedValue<SheetPosition>('hidden');
  const stateOrder = React.useMemo<SheetPosition[]>(() => ['expanded', 'hidden'], []);

  const activePoll = polls.find((poll) => poll.pollId === selectedPollId);
  const activePollType = activePoll?.topic?.topicType ?? 'best_dish';
  const totalVotes = activePoll?.options.reduce((sum, option) => sum + option.voteCount, 0) ?? 0;

  useEffect(() => {
    setCityInput(persistedCity);
  }, [persistedCity]);

  const routeCity = params?.city;
  const routePollId = params?.pollId;

  const animateSheetTo = useCallback(
    (position: SheetPosition, velocity = 0) => {
      const target = snapPoints[position];
      sheetStateShared.value = position;
      sheetTranslateY.value = withSpring(target, {
        ...SHEET_SPRING_CONFIG,
        velocity,
      });
    },
    [snapPoints, sheetStateShared, sheetTranslateY]
  );

  useEffect(() => {
    if (visible) {
      animateSheetTo('expanded');
    } else {
      animateSheetTo('hidden');
    }
  }, [animateSheetTo, visible]);

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
  }, [routeCity, setPersistedCity]);

  useEffect(() => {
    if (!routePollId) {
      return;
    }
    pendingPollIdRef.current = routePollId;
    if (!visible) {
      return;
    }
    const exists = polls.some((poll) => poll.pollId === routePollId);
    if (exists) {
      setSelectedPollId(routePollId);
      pendingPollIdRef.current = null;
      return;
    }
    void loadPolls({ focusPollId: routePollId });
  }, [loadPolls, polls, routePollId, visible]);

  const loadPolls = useCallback(
    async (options?: { focusPollId?: string | null; skipSpinner?: boolean }) => {
      const skipSpinner = options?.skipSpinner ?? false;
      if (!skipSpinner) {
        setLoading(true);
      }
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
        if (!skipSpinner) {
          setLoading(false);
        }
      }
    },
    [cityInput, selectedPollId, setPersistedCity]
  );

  useEffect(() => {
    if (!visible) {
      return;
    }
    void loadPolls();
  }, [loadPolls, visible]);

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
      void loadPolls({ skipSpinner: true });
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
        ? (restaurantSelection?.name ?? restaurantQuery.trim())
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
          <ActivityIndicator size="small" color={ACCENT} />
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
  const handleClose = useCallback(() => {
    setOverlay('search');
  }, [setOverlay]);

  const sheetPanGesture = useAnimatedGestureHandler<
    PanGestureHandlerGestureEvent,
    SheetGestureContext
  >(
    {
      onStart: (_, context) => {
        context.startY = sheetTranslateY.value;
        const currentState =
          sheetStateShared.value === 'hidden'
            ? stateOrder[Math.max(stateOrder.length - 2, 0)]
            : sheetStateShared.value;
        const startIndex = stateOrder.indexOf(currentState);
        context.startStateIndex = startIndex >= 0 ? startIndex : stateOrder.length - 1;
      },
      onActive: (event, context) => {
        const minY = snapPoints.expanded;
        const maxY = snapPoints.hidden;
        sheetTranslateY.value = clampValue(context.startY + event.translationY, minY, maxY);
      },
      onEnd: (event, context) => {
        const minY = snapPoints.expanded;
        const maxY = snapPoints.hidden;
        const projected = clampValue(sheetTranslateY.value + event.velocityY * 0.05, minY, maxY);
        let targetIndex = context.startStateIndex;
        if (
          event.translationY > SMALL_MOVEMENT_THRESHOLD &&
          context.startStateIndex < stateOrder.length - 1
        ) {
          targetIndex = context.startStateIndex + 1;
        } else if (event.translationY < -SMALL_MOVEMENT_THRESHOLD && context.startStateIndex > 0) {
          targetIndex = context.startStateIndex - 1;
        } else {
          const distances = stateOrder.map((state) => {
            return Math.abs(
              projected -
                snapPointForState(
                  state,
                  snapPoints.expanded,
                  snapPoints.middle,
                  snapPoints.collapsed,
                  snapPoints.hidden
                )
            );
          });
          const smallest = Math.min(...distances);
          targetIndex = Math.max(distances.indexOf(smallest), 0);
        }

        let targetState: SheetPosition = stateOrder[targetIndex];
        const beforeHiddenState = stateOrder[Math.max(stateOrder.length - 2, 0)];
        if (event.velocityY > 1200 || sheetTranslateY.value > snapPoints[beforeHiddenState] + 40) {
          targetState = 'hidden';
        } else if (event.velocityY < -1200) {
          targetState = stateOrder[0];
        }

        const clampedVelocity = Math.max(Math.min(event.velocityY, 2500), -2500);
        runOnJS(animateSheetTo)(targetState, clampedVelocity);
        if (targetState === 'hidden') {
          runOnJS(handleClose)();
        }
      },
    },
    [animateSheetTo, handleClose, snapPoints, stateOrder]
  );

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  return (
    <Reanimated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[overlaySheetStyles.container, containerAnimatedStyle]}
    >
      <FrostedGlassBackground />
      <PanGestureHandler onGestureEvent={sheetPanGesture} enabled={visible}>
        <Reanimated.View style={[overlaySheetStyles.header, { paddingTop: headerPaddingTop }]}>
          <View style={overlaySheetStyles.grabHandleWrapper}>
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close polls"
              hitSlop={10}
            >
              <View style={overlaySheetStyles.grabHandle} />
            </Pressable>
          </View>
          <View style={[overlaySheetStyles.headerRow, overlaySheetStyles.headerRowSpaced]}>
            <Text style={styles.sheetTitle}>Polls</Text>
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close polls"
              style={overlaySheetStyles.closeButton}
              hitSlop={8}
            >
              <Feather name="x" size={20} color={ACCENT} />
            </Pressable>
          </View>
          <View style={overlaySheetStyles.headerDivider} />
        </Reanimated.View>
      </PanGestureHandler>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
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
          <View style={styles.pollList}>
            {pollData.map((item) => (
              <React.Fragment key={item.pollId}>{renderPoll({ item })}</React.Fragment>
            ))}
          </View>
        )}

        {activePoll ? (
          <View style={styles.detailCard}>
            <Text style={styles.detailQuestion}>{activePoll.question}</Text>
            {activePoll.options.map((option, index) => {
              const color = OPTION_COLORS[index % OPTION_COLORS.length];
              const rawFill = totalVotes > 0 ? (option.voteCount / totalVotes) * 100 : 0;
              const minFill = option.voteCount > 0 ? 10 : 2;
              const fillWidth = Math.min(Math.max(rawFill, minFill), 100);
              return (
                <TouchableOpacity
                  key={option.optionId}
                  style={styles.optionBarWrapper}
                  onPress={() => handleVote(activePoll.pollId, option.optionId)}
                >
                  <View style={styles.optionBarTrack}>
                    <View
                      style={[
                        styles.optionBarFill,
                        {
                          width: `${fillWidth}%`,
                          backgroundColor: color,
                        },
                      ]}
                    />
                    <View style={styles.optionLabelBubble}>
                      <Text style={styles.optionLabelText}>{option.label}</Text>
                      <Text style={styles.optionVoteCount}>{option.voteCount} votes</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            {activePollType === 'what_to_order' && (
              <Text style={styles.topicNote}>Votes apply to dishes at this restaurant.</Text>
            )}
            <View style={styles.addOptionBlock}>
              {activePollType === 'best_dish' ? (
                <View style={styles.inputRow}>
                  <View style={[styles.inputColumn, styles.inputColumnSpacing]}>
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
                  </View>
                  <View style={styles.inputColumn}>
                    <Text style={styles.fieldLabel}>Dish (optional)</Text>
                    <TextInput
                      value={dishQuery}
                      onChangeText={(text) => {
                        setDishQuery(text);
                        setDishSelection(null);
                      }}
                      placeholder="Add a dish (optional)"
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
                  </View>
                </View>
              ) : (
                <View style={styles.singleInputColumn}>
                  <Text style={styles.fieldLabel}>Dish</Text>
                  <TextInput
                    value={dishQuery}
                    onChangeText={(text) => {
                      setDishQuery(text);
                      setDishSelection(null);
                    }}
                    placeholder="Search for a dish"
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
                </View>
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
    </Reanimated.View>
  );
};

const styles = StyleSheet.create({
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: ACCENT_DARK,
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
    paddingTop: 16,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
  },
  cityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: ACCENT,
  },
  cityInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: SURFACE,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(249, 115, 131, 0.12)',
    borderRadius: 12,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: '600',
    color: ACCENT_DARK,
  },
  loader: {
    marginTop: 24,
  },
  pollList: {
    paddingVertical: 16,
    gap: CARD_GAP,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
  },
  pollCard: {
    paddingVertical: 16,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    borderRadius: 0,
    backgroundColor: '#ffffff',
    width: '100%',
    alignSelf: 'stretch',
  },
  pollCardActive: {
    borderWidth: 2,
    borderColor: ACCENT,
  },
  pollQuestion: {
    fontSize: 16,
    fontWeight: '700',
    color: ACCENT_DARK,
  },
  pollMeta: {
    marginTop: 6,
    fontSize: 12,
    color: ACCENT,
  },
  detailCard: {
    flex: 1,
    marginTop: CARD_GAP,
    paddingVertical: 16,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    borderRadius: 0,
    backgroundColor: '#ffffff',
    alignSelf: 'stretch',
    width: '100%',
  },
  detailQuestion: {
    fontSize: 18,
    fontWeight: '700',
    color: ACCENT_DARK,
    marginBottom: 12,
  },
  optionBarWrapper: {
    marginTop: 12,
  },
  optionBarTrack: {
    position: 'relative',
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(249, 115, 131, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 131, 0.2)',
    justifyContent: 'center',
  },
  optionBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 16,
  },
  optionLabelBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  optionLabelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  optionVoteCount: {
    fontSize: 12,
    color: ACCENT_DARK,
    fontWeight: '600',
  },
  addOptionBlock: {
    marginTop: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  inputColumn: {
    flex: 1,
  },
  inputColumnSpacing: {
    marginRight: 4,
  },
  singleInputColumn: {
    marginTop: 8,
  },
  optionInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: SURFACE,
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
    color: ACCENT,
  },
  submitButton: {
    marginTop: 16,
    backgroundColor: ACCENT,
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
    borderColor: BORDER,
    backgroundColor: SURFACE,
    maxHeight: 200,
    overflow: 'hidden',
  },
  autocompleteLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
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
    borderBottomColor: BORDER,
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
    color: ACCENT,
  },
  emptyState: {
    textAlign: 'center',
    marginTop: 32,
    color: ACCENT,
  },
});

export default PollsOverlay;
