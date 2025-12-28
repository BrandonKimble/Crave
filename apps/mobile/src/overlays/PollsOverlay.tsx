import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
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
import { Plus, X as LucideX } from 'lucide-react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Text } from '../components';
import { fetchPolls, voteOnPoll, addPollOption, Poll, PollTopicType } from '../services/polls';
import { resolveCoverage } from '../services/coverage';
import { API_BASE_URL } from '../services/api';
import { logger } from '../utils';
import { autocompleteService, type AutocompleteMatch } from '../services/autocomplete';
import { useCityStore } from '../store/cityStore';
import { useSystemStatusStore } from '../store/systemStatusStore';
import { colors as themeColors } from '../constants/theme';
import { FONT_SIZES, LINE_HEIGHTS } from '../constants/typography';
import { useOverlayStore } from '../store/overlayStore';
import {
  overlaySheetStyles,
  OVERLAY_HEADER_CLOSE_BUTTON_SIZE,
  OVERLAY_HORIZONTAL_PADDING,
  OVERLAY_STACK_ZINDEX,
} from './overlaySheetStyles';
import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import SquircleSpinner from '../components/SquircleSpinner';
import BottomSheetWithFlashList, { type SnapPoints } from './BottomSheetWithFlashList';
import { resolveExpandedTop } from './sheetUtils';
import { useHeaderCloseCutout } from './useHeaderCloseCutout';
import PollCreationSheet from './PollCreationSheet';
import { CONTROL_HEIGHT, CONTROL_RADIUS } from '../screens/Search/constants/ui';
import { NAV_BOTTOM_PADDING, NAV_TOP_PADDING } from '../screens/Search/constants/search';
import type { MapBounds } from '../types';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const OPTION_COLORS = ['#f97316', '#fb7185', '#c084fc', '#38bdf8', '#facc15', '#34d399'] as const;
const CARD_GAP = 4;
const CLOSE_ACTION_EPSILON = 2;
const LIVE_BADGE_HEIGHT = OVERLAY_HEADER_CLOSE_BUTTON_SIZE;
const NAV_ICON_SIZE = 24;
const NAV_ICON_LABEL_GAP = 2;
type PollsOverlayProps = {
  visible: boolean;
  bounds?: MapBounds | null;
  params?: { coverageKey?: string | null; pollId?: string | null };
  initialSnapPoint?: 'expanded' | 'middle' | 'collapsed';
  mode?: 'docked' | 'overlay';
  navBarTop?: number;
  navBarHeight?: number;
  searchBarTop?: number;
  onSnapChange?: (snap: 'expanded' | 'middle' | 'collapsed' | 'hidden') => void;
  onDragStateChange?: (isDragging: boolean) => void;
  sheetYObserver?: SharedValue<number>;
  snapTo?: 'expanded' | 'middle' | 'collapsed' | 'hidden' | null;
};

const ACCENT = themeColors.primary;
const ACCENT_DARK = themeColors.primaryDark;
const BORDER = themeColors.border;
const SURFACE = themeColors.surface;

const PollsOverlay: React.FC<PollsOverlayProps> = ({
  visible,
  bounds,
  params,
  initialSnapPoint,
  mode = 'docked',
  navBarTop = 0,
  navBarHeight = 0,
  searchBarTop = 0,
  onSnapChange,
  onDragStateChange,
  sheetYObserver,
  snapTo,
}) => {
  const insets = useSafeAreaInsets();
  const setOverlay = useOverlayStore((state) => state.setOverlay);
  const setPersistedCity = useCityStore((state) => state.setSelectedCity);
  const isOffline = useSystemStatusStore((state) => state.isOffline);
  const serviceIssue = useSystemStatusStore((state) => state.serviceIssue);
  const isSystemUnavailable = isOffline || Boolean(serviceIssue);
  const closeCutout = useHeaderCloseCutout({
    badgePadding: 0,
    badgeRadius: LIVE_BADGE_HEIGHT / 2,
  });
  const headerHeight = closeCutout.headerHeight;
  const estimatedNavBarHeight =
    NAV_TOP_PADDING +
    NAV_BOTTOM_PADDING +
    NAV_ICON_SIZE +
    NAV_ICON_LABEL_GAP +
    LINE_HEIGHTS.body +
    insets.bottom;
  const navBarInset = Math.max(navBarHeight > 0 ? navBarHeight : estimatedNavBarHeight, 0);
  const navBarOffset = Math.max(navBarTop > 0 ? navBarTop : SCREEN_HEIGHT - navBarInset, 0);
  const dismissThreshold = navBarOffset > 0 ? navBarOffset : undefined;

  const [polls, setPolls] = useState<Poll[]>([]);
  const [coverageKey, setCoverageKey] = useState<string | null>(null);
  const [coverageName, setCoverageName] = useState<string | null>(null);
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
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [snapRequest, setSnapRequest] = useState<
    'expanded' | 'middle' | 'collapsed' | 'hidden' | null
  >(null);
  const socketRef = useRef<Socket | null>(null);
  const pendingPollIdRef = useRef<string | null>(null);
  const lastResolvedCoverageKeyRef = useRef<string | null>(null);
  const activeSnapRequest = snapTo ?? snapRequest;

  useEffect(() => {
    if (snapTo) {
      setSnapRequest(null);
    }
  }, [snapTo]);

  const contentBottomPadding = Math.max(insets.bottom + 48, 72);
  const snapPoints = useMemo<SnapPoints>(() => {
    const expanded = resolveExpandedTop(searchBarTop ?? 0, insets.top);
    const middle = Math.max(expanded + 140, SCREEN_HEIGHT * 0.45);
    const hidden = SCREEN_HEIGHT + 80;
    const fallbackCollapsed = SCREEN_HEIGHT - 160;
    const navAlignedCollapsed =
      navBarOffset > 0 && headerHeight > 0 ? navBarOffset - headerHeight : fallbackCollapsed;
    const collapsed = Math.max(navAlignedCollapsed, middle + 24);
    return {
      expanded,
      middle,
      collapsed,
      hidden,
    };
  }, [headerHeight, insets.top, navBarOffset, searchBarTop]);

  const initialSnap = initialSnapPoint ?? (mode === 'overlay' ? 'middle' : 'collapsed');
  const [headerAction, setHeaderAction] = useState<'create' | 'close'>(
    initialSnap === 'collapsed' ? 'create' : 'close'
  );

  const activePoll = polls.find((poll) => poll.pollId === selectedPollId);
  const activePollType = (activePoll?.topic?.topicType ?? 'best_dish') as PollTopicType;
  const totalVotes = activePoll?.options.reduce((sum, option) => sum + option.voteCount, 0) ?? 0;
  const coverageOverride = mode === 'overlay' ? params?.coverageKey?.trim() || null : null;

  const needsRestaurantInput =
    activePollType === 'best_dish' ||
    activePollType === 'best_restaurant_attribute' ||
    activePollType === 'best_dish_attribute';
  const needsDishInput =
    activePollType === 'what_to_order' || activePollType === 'best_dish_attribute';

  const hasCoverageKey = Boolean(coverageOverride ?? coverageKey);
  const showResolvingLocation = loading && !coverageName && !hasCoverageKey;
  const headerBaseTitle = showResolvingLocation
    ? 'Finding location...'
    : coverageName
    ? `Polls in ${coverageName}`
    : hasCoverageKey
    ? 'Polls'
    : 'Polls near here';
  const isLiveActive = polls.length > 0;

  const loadPolls = useCallback(
    async (options?: {
      focusPollId?: string | null;
      skipSpinner?: boolean;
      coverageKeyOverride?: string | null;
    }) => {
      const skipSpinner = options?.skipSpinner ?? false;
      const focusPollId = options?.focusPollId ?? null;
      const coverageKeyOverride = options?.coverageKeyOverride ?? null;

      if (!skipSpinner) {
        setLoading(true);
      }

      const resolvedCoverageKey = coverageKeyOverride ?? coverageOverride ?? null;
      const payload = resolvedCoverageKey
        ? { coverageKey: resolvedCoverageKey }
        : bounds
        ? { bounds }
        : null;

      if (!payload) {
        if (!skipSpinner) {
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetchPolls(payload);
        const normalizedPolls = response.polls ?? [];
        const nextCoverageKey = response.coverageKey ?? resolvedCoverageKey ?? null;
        const normalizedKey =
          typeof nextCoverageKey === 'string' ? nextCoverageKey.trim().toLowerCase() : null;
        if (normalizedKey) {
          lastResolvedCoverageKeyRef.current = normalizedKey;
        }
        const nextCoverageName = response.coverageName ?? normalizedPolls[0]?.coverageName ?? null;

        setPolls(normalizedPolls);
        setCoverageKey(nextCoverageKey);
        setCoverageName(nextCoverageName);
        if (nextCoverageKey && !coverageOverride) {
          setPersistedCity(nextCoverageKey);
        }

        if (!normalizedPolls.length) {
          setSelectedPollId(null);
          return;
        }

        const hasCurrentSelection =
          selectedPollId && normalizedPolls.some((poll) => poll.pollId === selectedPollId);
        let nextSelection: string | null = null;

        if (focusPollId && normalizedPolls.some((poll) => poll.pollId === focusPollId)) {
          nextSelection = focusPollId;
        } else if (
          pendingPollIdRef.current &&
          normalizedPolls.some((poll) => poll.pollId === pendingPollIdRef.current)
        ) {
          nextSelection = pendingPollIdRef.current;
        } else if (hasCurrentSelection) {
          nextSelection = selectedPollId;
        } else {
          nextSelection = normalizedPolls[0].pollId;
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
      } finally {
        if (!skipSpinner) {
          setLoading(false);
        }
      }
    },
    [bounds, coverageOverride, selectedPollId, setPersistedCity]
  );

  useEffect(() => {
    if (!visible || isSystemUnavailable || !coverageOverride) {
      return;
    }
    void loadPolls({ coverageKeyOverride: coverageOverride });
  }, [coverageOverride, isSystemUnavailable, loadPolls, visible]);

  useEffect(() => {
    if (!visible || isSystemUnavailable || coverageOverride) {
      return;
    }
    if (!bounds) {
      return;
    }
    let isActive = true;
    resolveCoverage(bounds)
      .then((response) => {
        if (!isActive) {
          return;
        }
        const nextKey =
          typeof response.coverageKey === 'string' ? response.coverageKey.trim().toLowerCase() : '';
        const nextName =
          typeof response.coverageName === 'string' && response.coverageName.trim()
            ? response.coverageName.trim()
            : null;
        if (!nextKey) {
          setLoading(true);
          lastResolvedCoverageKeyRef.current = null;
          setCoverageName(null);
          setCoverageKey(null);
          setPolls([]);
          setSelectedPollId(null);
          void loadPolls();
          return;
        }
        if (lastResolvedCoverageKeyRef.current === nextKey) {
          if (nextName) {
            setCoverageName(nextName);
          }
          return;
        }
        lastResolvedCoverageKeyRef.current = nextKey;
        setCoverageKey(nextKey);
        setCoverageName(nextName);
        void loadPolls({ coverageKeyOverride: nextKey });
      })
      .catch((error) => {
        logger.warn('Coverage resolve failed', {
          message: error instanceof Error ? error.message : 'unknown',
        });
      });
    return () => {
      isActive = false;
    };
  }, [bounds, coverageOverride, isSystemUnavailable, loadPolls, visible]);

  useEffect(() => {
    if (!params?.pollId) {
      return;
    }
    pendingPollIdRef.current = params.pollId;
    if (!visible || isSystemUnavailable) {
      return;
    }
    void loadPolls({ focusPollId: params.pollId });
  }, [isSystemUnavailable, loadPolls, params?.pollId, visible]);

  useEffect(() => {
    setRestaurantQuery('');
    setDishQuery('');
    setRestaurantSelection(null);
    setDishSelection(null);
    setShowRestaurantSuggestions(false);
    setShowDishSuggestions(false);
  }, [selectedPollId]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const baseUrl = typeof API_BASE_URL === 'string' ? API_BASE_URL : '';
    if (!baseUrl) {
      return;
    }
    const base = baseUrl.replace(/\/api$/, '');
    socketRef.current = io(`${base}/polls`, {
      transports: ['websocket'],
    });
    socketRef.current.on('poll:update', () => {
      void loadPolls({ skipSpinner: true });
    });
    return () => {
      socketRef.current?.disconnect();
    };
  }, [loadPolls, visible]);

  useEffect(() => {
    if (!activePoll || !needsRestaurantInput) {
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
        .fetchEntities(trimmed, { entityType: 'restaurant' })
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
  }, [activePoll, needsRestaurantInput, restaurantQuery]);

  useEffect(() => {
    if (!activePoll || !needsDishInput) {
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
        .fetchEntities(trimmed, { entityType: 'food' })
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
  }, [activePoll, dishQuery, needsDishInput]);

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

    const restaurantLabel = restaurantSelection?.name ?? restaurantQuery.trim();
    const dishLabel = dishSelection?.name ?? dishQuery.trim();

    if (needsRestaurantInput && !restaurantLabel) {
      Alert.alert('Select a restaurant', 'Pick a restaurant before adding your vote.');
      return;
    }

    if (needsDishInput && !dishLabel) {
      Alert.alert('Select a dish', 'Pick a dish before adding your vote.');
      return;
    }

    const targetRestaurantId = activePoll.topic?.targetRestaurantId ?? null;
    let label = '';

    if (activePollType === 'best_dish_attribute') {
      label = dishLabel && restaurantLabel ? `${dishLabel} @ ${restaurantLabel}` : dishLabel;
    } else if (activePollType === 'what_to_order') {
      label = dishLabel || activePoll.question;
    } else {
      label = restaurantLabel || activePoll.question;
    }

    const payload: {
      label: string;
      restaurantId?: string;
      dishEntityId?: string;
      restaurantName?: string;
      dishName?: string;
    } = {
      label: label.trim() || 'Poll option',
    };

    if (activePollType === 'what_to_order' && targetRestaurantId) {
      payload.restaurantId = targetRestaurantId;
    } else if (needsRestaurantInput) {
      if (restaurantSelection?.entityId) {
        payload.restaurantId = restaurantSelection.entityId;
      } else if (restaurantLabel) {
        payload.restaurantName = restaurantLabel;
      }
    }

    if (needsDishInput) {
      if (dishSelection?.entityId) {
        payload.dishEntityId = dishSelection.entityId;
      } else if (dishLabel) {
        payload.dishName = dishLabel;
      }
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
          <Text variant="body" style={styles.autocompleteLoadingText}>
            Searching…
          </Text>
        </View>
      ) : matches.length === 0 ? (
        <Text variant="body" style={styles.autocompleteEmptyText}>
          {emptyText}
        </Text>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled">
          {matches.map((match) => (
            <TouchableOpacity
              key={match.entityId}
              style={styles.autocompleteItem}
              onPress={() => onSelect(match)}
            >
              <Text variant="subtitle" weight="semibold" style={styles.autocompletePrimary}>
                {match.name}
              </Text>
              <Text variant="body" style={styles.autocompleteSecondary}>
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
      <Text variant="subtitle" weight="semibold" style={styles.pollQuestion}>
        {item.question}
      </Text>
      {item.topic?.description ? (
        <Text variant="body" style={styles.pollDescription}>
          {item.topic.description}
        </Text>
      ) : null}
      <Text variant="body" style={styles.pollMeta}>
        {item.options.length} options
      </Text>
    </TouchableOpacity>
  );

  const handleClose = useCallback(() => {
    const targetSnap = mode === 'overlay' ? 'hidden' : 'collapsed';
    setSnapRequest(targetSnap);
    if (mode === 'overlay') {
      setOverlay('search');
    }
  }, [mode, setOverlay]);

  const handleHidden = useCallback(() => {
    if (!visible) {
      return;
    }
    setOverlay('search');
  }, [setOverlay, visible]);

  const handleOpenCreate = useCallback(() => {
    if (!coverageKey && !coverageOverride) {
      Alert.alert('Pick a city', 'Move the map to a city before creating a poll.');
      return;
    }
    setShowCreateSheet(true);
  }, [coverageKey, coverageOverride]);

  const handlePollCreated = useCallback(
    async (poll: Poll) => {
      setShowCreateSheet(false);
      await loadPolls({ focusPollId: poll.pollId });
    },
    [loadPolls]
  );

  const internalSheetY = useSharedValue(snapPoints[initialSnap]);
  const observedSheetY = sheetYObserver ?? internalSheetY;
  const plusRotationStyle = useAnimatedStyle(() => {
    const range = snapPoints.collapsed - snapPoints.middle;
    const rawProgress = range !== 0 ? (observedSheetY.value - snapPoints.middle) / range : 0;
    const clamped = Math.min(Math.max(rawProgress, 0), 1);
    const rotation = 45 * clamped;
    return { transform: [{ rotate: `${rotation}deg` }] };
  }, [observedSheetY, snapPoints.collapsed, snapPoints.middle]);

  useAnimatedReaction(
    () => observedSheetY.value,
    (value, previous) => {
      const threshold = snapPoints.middle + CLOSE_ACTION_EPSILON;
      const shouldClose = value <= threshold;
      const previousShouldClose = previous == null ? shouldClose : previous <= threshold;
      if (previous == null || shouldClose !== previousShouldClose) {
        runOnJS(setHeaderAction)(shouldClose ? 'close' : 'create');
      }
    },
    [observedSheetY, snapPoints.middle]
  );

  const handleSnapChange = useCallback(
    (snap: 'expanded' | 'middle' | 'collapsed' | 'hidden') => {
      if (mode === 'overlay' && snap === 'collapsed') {
        setSnapRequest('hidden');
        return;
      }
      onSnapChange?.(snap);
      if (snapRequest && snapRequest === snap) {
        setSnapRequest(null);
      }
      if (!sheetYObserver) {
        const target =
          snap === 'expanded'
            ? snapPoints.expanded
            : snap === 'middle'
            ? snapPoints.middle
            : snap === 'collapsed'
            ? snapPoints.collapsed
            : snapPoints.hidden ?? snapPoints.collapsed;
        internalSheetY.value = target;
      }
    },
    [
      internalSheetY,
      onSnapChange,
      sheetYObserver,
      snapPoints.collapsed,
      snapPoints.expanded,
      snapPoints.hidden,
      snapPoints.middle,
      snapRequest,
      mode,
    ]
  );

  const headerComponent = (
    <View
      style={[overlaySheetStyles.header, overlaySheetStyles.headerTransparent, { paddingTop: 0 }]}
      onLayout={closeCutout.onHeaderLayout}
    >
      {closeCutout.background}
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
      <View
        style={[overlaySheetStyles.headerRow, overlaySheetStyles.headerRowSpaced, styles.headerRow]}
        onLayout={closeCutout.onHeaderRowLayout}
      >
        <Text
          variant="title"
          weight="semibold"
          style={styles.sheetTitle}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {headerBaseTitle}
        </Text>
        <View style={styles.liveBadgeShell} onLayout={closeCutout.onBadgeLayout}>
          <View style={styles.liveBadgeContent} pointerEvents="none">
            <Text
              variant="title"
              weight="semibold"
              style={[styles.liveBadgeText, !isLiveActive && styles.liveBadgeTextMuted]}
            >
              {polls.length}
            </Text>
            <Text
              variant="title"
              weight="semibold"
              style={[styles.liveBadgeText, !isLiveActive && styles.liveBadgeTextMuted]}
            >
              live
            </Text>
          </View>
        </View>
        <Pressable
          onPress={headerAction === 'close' ? handleClose : handleOpenCreate}
          accessibilityRole="button"
          accessibilityLabel={headerAction === 'close' ? 'Close polls' : 'Create a new poll'}
          style={overlaySheetStyles.closeButton}
          onLayout={closeCutout.onCloseLayout}
          hitSlop={8}
        >
          <View style={overlaySheetStyles.closeIcon}>
            <Animated.View style={plusRotationStyle}>
              <LucideX size={20} color={ACCENT} strokeWidth={2.5} />
            </Animated.View>
          </View>
        </Pressable>
      </View>
      <View style={overlaySheetStyles.headerDivider} />
    </View>
  );

  const listHeaderComponent = (
    <View style={styles.listHeader}>
      <TouchableOpacity
        onPress={handleOpenCreate}
        style={styles.createButton}
        accessibilityRole="button"
        accessibilityLabel="Create a new poll"
      >
        <Plus size={16} color="#ffffff" strokeWidth={2.5} />
        <Text variant="body" weight="semibold" style={styles.createButtonText}>
          new poll
        </Text>
      </TouchableOpacity>
      {loading || (isSystemUnavailable && polls.length === 0) ? (
        <View style={styles.loader}>
          <SquircleSpinner size={22} color="#A78BFA" />
        </View>
      ) : null}
    </View>
  );

  const listEmptyComponent = useCallback(() => {
    if (loading || (isSystemUnavailable && polls.length === 0)) {
      return (
        <View style={styles.loader}>
          <SquircleSpinner size={22} color="#A78BFA" />
        </View>
      );
    }
    return (
      <Text variant="body" style={styles.emptyState}>
        No polls available yet.
      </Text>
    );
  }, [isSystemUnavailable, loading, polls.length]);

  const listFooterComponent = activePoll ? (
    <View style={styles.detailCard}>
      <Text variant="title" weight="semibold" style={styles.detailQuestion}>
        {activePoll.question}
      </Text>
      {activePoll.topic?.description ? (
        <Text variant="body" style={styles.detailDescription}>
          {activePoll.topic.description}
        </Text>
      ) : null}
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
                <Text variant="body" weight="semibold" style={styles.optionLabelText}>
                  {option.label}
                </Text>
                <Text variant="body" style={styles.optionVoteCount}>
                  {option.voteCount} votes
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
      {activePollType === 'what_to_order' ? (
        <Text variant="body" style={styles.topicNote}>
          Votes apply to dishes at this restaurant.
        </Text>
      ) : null}
      <View style={styles.addOptionBlock}>
        {needsRestaurantInput ? (
          <View style={styles.inputGroup}>
            <Text variant="body" weight="semibold" style={styles.fieldLabel}>
              Restaurant
            </Text>
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
        ) : null}
        {needsDishInput ? (
          <View style={styles.inputGroup}>
            <Text variant="body" weight="semibold" style={styles.fieldLabel}>
              Dish
            </Text>
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
        ) : null}
        <TouchableOpacity onPress={handleAddOption} style={styles.submitButton}>
          <Text variant="body" weight="semibold" style={styles.submitButtonText}>
            Submit option
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  ) : null;

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[styles.sheetClip, navBarInset > 0 ? { bottom: navBarInset } : null]}
      >
        <BottomSheetWithFlashList
          visible={visible}
          snapPoints={snapPoints}
          initialSnapPoint={initialSnap}
          snapTo={activeSnapRequest}
          data={polls}
          renderItem={renderPoll}
          keyExtractor={(item) => item.pollId}
          estimatedItemSize={108}
          ItemSeparatorComponent={() => <View style={{ height: CARD_GAP }} />}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
          ListHeaderComponent={listHeaderComponent}
          ListFooterComponent={listFooterComponent}
          ListEmptyComponent={listEmptyComponent}
          keyboardShouldPersistTaps="handled"
          backgroundComponent={<FrostedGlassBackground />}
          headerComponent={headerComponent}
          style={overlaySheetStyles.container}
          onHidden={handleHidden}
          onSnapChange={handleSnapChange}
          onDragStateChange={onDragStateChange}
          sheetYObserver={sheetYObserver}
          dismissThreshold={dismissThreshold}
        />
      </View>
      <PollCreationSheet
        visible={showCreateSheet}
        coverageKey={coverageOverride ?? coverageKey}
        coverageName={coverageName ?? null}
        onClose={() => setShowCreateSheet(false)}
        onCreated={handlePollCreated}
      />
    </>
  );
};

const styles = StyleSheet.create({
  sheetTitle: {
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
    color: themeColors.text,
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  headerRow: {
    justifyContent: 'flex-start',
    gap: 10,
  },
  liveBadgeShell: {
    height: LIVE_BADGE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: LIVE_BADGE_HEIGHT / 2,
    backgroundColor: 'transparent',
  },
  liveBadgeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveBadgeText: {
    color: ACCENT,
  },
  liveBadgeTextMuted: {
    color: themeColors.textBody,
  },
  scrollContent: {
    paddingBottom: 32,
    paddingTop: 16,
  },
  sheetClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: OVERLAY_STACK_ZINDEX,
  },
  listHeader: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
  },
  createButton: {
    height: CONTROL_HEIGHT,
    borderRadius: CONTROL_RADIUS,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  createButtonText: {
    color: '#ffffff',
  },
  loader: {
    marginTop: 12,
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
    color: ACCENT_DARK,
  },
  pollDescription: {
    marginTop: 6,
    color: themeColors.textBody,
  },
  pollMeta: {
    marginTop: 6,
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
    color: ACCENT_DARK,
    marginBottom: 8,
  },
  detailDescription: {
    color: themeColors.textBody,
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
    color: '#1f2937',
  },
  optionVoteCount: {
    color: ACCENT_DARK,
  },
  addOptionBlock: {
    marginTop: 16,
  },
  inputGroup: {
    marginTop: 8,
  },
  optionInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    backgroundColor: SURFACE,
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 6,
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
    color: themeColors.textBody,
  },
  autocompleteEmptyText: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: themeColors.textBody,
  },
  autocompleteItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  autocompletePrimary: {
    color: '#111827',
  },
  autocompleteSecondary: {
    color: themeColors.textBody,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  topicNote: {
    marginTop: 12,
    color: ACCENT,
  },
  emptyState: {
    textAlign: 'center',
    marginTop: 32,
    color: ACCENT,
  },
});

export default PollsOverlay;
