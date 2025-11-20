import React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
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
import { Text } from '../components';
import { favoritesService, type Favorite } from '../services/favorites';
import { logger } from '../utils';
import { colors as themeColors } from '../constants/theme';
import { useOverlayStore } from '../store/overlayStore';
import { overlaySheetStyles, OVERLAY_HORIZONTAL_PADDING } from './overlaySheetStyles';
import {
  SHEET_SPRING_CONFIG,
  SHEET_STATES,
  SMALL_MOVEMENT_THRESHOLD,
  clampValue,
  snapPointForState,
  type SheetGestureContext,
  type SheetPosition,
} from './sheetUtils';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const ACTIVE_TAB_COLOR = themeColors.primary;
const CARD_GAP = 4;

type BookmarksOverlayProps = {
  visible: boolean;
};

const BookmarksOverlay: React.FC<BookmarksOverlayProps> = ({ visible }) => {
  const [favorites, setFavorites] = React.useState<Favorite[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const setOverlay = useOverlayStore((state) => state.setOverlay);
  const headerPaddingTop = 0;
  const contentBottomPadding = Math.max(insets.bottom + 48, 72);
  const snapPoints = React.useMemo<Record<SheetPosition, number>>(() => {
    const expanded = Math.max(insets.top, 0);
    const rawMiddle = SCREEN_HEIGHT * 0.4;
    const middle = Math.max(expanded + 96, rawMiddle);
    const collapsed = SCREEN_HEIGHT - 160;
    const hidden = SCREEN_HEIGHT + 80;
    return {
      expanded,
      middle: Math.min(middle, hidden - 120),
      collapsed,
      hidden,
    };
  }, [insets.top]);
  const sheetTranslateY = useSharedValue(snapPoints.hidden);
  const sheetStateShared = useSharedValue<SheetPosition>('hidden');

  const loadFavorites = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await favoritesService.list();
      setFavorites(data);
      setError(null);
    } catch (fetchError) {
      logger.error('Failed to load favorites', fetchError);
      setError('Unable to load favorites. Pull to refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!visible) {
      return;
    }
    void loadFavorites();
  }, [loadFavorites, visible]);

  const animateSheetTo = React.useCallback(
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

  React.useEffect(() => {
    if (visible) {
      animateSheetTo('middle');
    } else {
      animateSheetTo('hidden');
    }
  }, [animateSheetTo, visible]);

  const handleRemoveFavorite = React.useCallback(async (favorite: Favorite) => {
    setFavorites((prev) => prev.filter((item) => item.favoriteId !== favorite.favoriteId));
    try {
      await favoritesService.remove(favorite.favoriteId);
    } catch (removeError) {
      logger.error('Failed to remove favorite from bookmarks', removeError);
      setFavorites((prev) => [favorite, ...prev]);
    }
  }, []);

  const handleClose = React.useCallback(() => {
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
            ? SHEET_STATES[SHEET_STATES.length - 2]
            : sheetStateShared.value;
        const startIndex = SHEET_STATES.indexOf(currentState);
        context.startStateIndex = startIndex >= 0 ? startIndex : SHEET_STATES.length - 1;
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
          context.startStateIndex < SHEET_STATES.length - 1
        ) {
          targetIndex = context.startStateIndex + 1;
        } else if (event.translationY < -SMALL_MOVEMENT_THRESHOLD && context.startStateIndex > 0) {
          targetIndex = context.startStateIndex - 1;
        } else {
          const distances = SHEET_STATES.map((state) => {
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

        let targetState: SheetPosition = SHEET_STATES[targetIndex];
        const beforeHiddenState = SHEET_STATES[SHEET_STATES.length - 2];
        if (event.velocityY > 1200 || sheetTranslateY.value > snapPoints[beforeHiddenState] + 40) {
          targetState = 'hidden';
        } else if (event.velocityY < -1200) {
          targetState = SHEET_STATES[0];
        }

        const clampedVelocity = Math.max(Math.min(event.velocityY, 2500), -2500);
        runOnJS(animateSheetTo)(targetState, clampedVelocity);
        if (targetState === 'hidden') {
          runOnJS(handleClose)();
        }
      },
    },
    [animateSheetTo, handleClose, snapPoints]
  );

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  return (
    <Reanimated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[overlaySheetStyles.container, containerAnimatedStyle]}
    >
      <BlurView
        pointerEvents="none"
        intensity={45}
        tint="light"
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={overlaySheetStyles.surfaceTint} />
      <View pointerEvents="none" style={overlaySheetStyles.highlight} />
      <PanGestureHandler onGestureEvent={sheetPanGesture} enabled={visible}>
        <Reanimated.View style={[overlaySheetStyles.header, { paddingTop: headerPaddingTop }]}>
          <View style={overlaySheetStyles.grabHandleWrapper}>
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close bookmarks"
              hitSlop={10}
            >
              <View style={overlaySheetStyles.grabHandle} />
            </Pressable>
          </View>
          <View style={[overlaySheetStyles.headerRow, overlaySheetStyles.headerRowSpaced]}>
            <View style={styles.headerTextGroup}>
              <Text variant="body" weight="semibold" style={styles.headerTitle}>
                Bookmarks
              </Text>
              <Text variant="caption" style={styles.headerSubtitle}>
                Your saved favorites
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close bookmarks"
              style={overlaySheetStyles.closeButton}
              hitSlop={8}
            >
              <Feather name="x" size={20} color={ACTIVE_TAB_COLOR} />
            </Pressable>
          </View>
          <View style={overlaySheetStyles.headerDivider} />
        </Reanimated.View>
      </PanGestureHandler>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: contentBottomPadding,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={themeColors.primary}
            style={styles.loadingIndicator}
          />
        ) : favorites.length === 0 ? (
          <View style={styles.emptyState}>
            <Text variant="body" style={styles.emptyText}>
              No bookmarks yet
            </Text>
            {error ? (
              <Text variant="caption" style={styles.errorText}>
                {error}
              </Text>
            ) : null}
          </View>
        ) : (
          favorites.map((favorite) => (
            <View key={favorite.favoriteId} style={styles.card}>
              <View style={styles.cardInfo}>
                <Text variant="body" weight="bold" style={styles.cardTitle}>
                  {favorite.entity?.name ?? 'Saved experience'}
                </Text>
                <Text variant="caption" style={styles.cardMeta}>
                  {favorite.entityType}
                  {favorite.entity?.city ? ` • ${favorite.entity.city}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => void handleRemoveFavorite(favorite)}
                style={styles.removeButton}
              >
                <Text variant="caption" weight="semibold" style={styles.removeButtonText}>
                  Remove
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </Reanimated.View>
  );
};

const styles = StyleSheet.create({
  headerTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    color: themeColors.text,
  },
  headerSubtitle: {
    color: themeColors.muted,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
  },
  loadingIndicator: {
    marginTop: 24,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    color: themeColors.muted,
  },
  errorText: {
    color: themeColors.primaryDark,
    marginTop: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: CARD_GAP,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    paddingVertical: 14,
    borderRadius: 0,
    backgroundColor: '#ffffff',
    alignSelf: 'stretch',
    width: '100%',
  },
  cardInfo: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    color: themeColors.text,
  },
  cardMeta: {
    color: themeColors.primary,
    marginTop: 4,
  },
  removeButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ffe4e6',
  },
  removeButtonText: {
    color: themeColors.primaryDark,
  },
});

export default BookmarksOverlay;
