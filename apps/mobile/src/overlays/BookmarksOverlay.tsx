import React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Text } from '../components';
import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import { favoritesService, type Favorite } from '../services/favorites';
import { logger } from '../utils';
import { colors as themeColors } from '../constants/theme';
import { useOverlayStore } from '../store/overlayStore';
import { overlaySheetStyles, OVERLAY_HORIZONTAL_PADDING } from './overlaySheetStyles';
import BottomSheetWithFlashList, { type SnapPoints } from './BottomSheetWithFlashList';

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
  const snapPoints = React.useMemo<SnapPoints>(() => {
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

  const renderFavorite = React.useCallback(
    ({ item }: { item: Favorite }) => (
      <View style={styles.card}>
        <View style={styles.cardInfo}>
          <Text variant="body" weight="bold" style={styles.cardTitle}>
            {item.entity?.name ?? 'Saved experience'}
          </Text>
          <Text variant="caption" style={styles.cardMeta}>
            {item.entityType}
            {item.entity?.city ? ` • ${item.entity.city}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => void handleRemoveFavorite(item)}
          style={styles.removeButton}
        >
          <Text variant="caption" weight="semibold" style={styles.removeButtonText}>
            Remove
          </Text>
        </TouchableOpacity>
      </View>
    ),
    [handleRemoveFavorite]
  );

  const headerComponent = (
    <View style={[overlaySheetStyles.header, { paddingTop: headerPaddingTop }]}>
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
    </View>
  );

  const ListEmptyComponent = React.useCallback(() => {
    if (loading) {
      return (
        <ActivityIndicator
          size="large"
          color={themeColors.primary}
          style={styles.loadingIndicator}
        />
      );
    }
    return (
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
    );
  }, [error, loading]);

  return (
    <BottomSheetWithFlashList
      visible={visible}
      snapPoints={snapPoints}
      initialSnapPoint="middle"
      data={favorites}
      renderItem={renderFavorite}
      keyExtractor={(item) => item.favoriteId}
      estimatedItemSize={86}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingBottom: contentBottomPadding,
        },
      ]}
      ListEmptyComponent={ListEmptyComponent}
      backgroundComponent={<FrostedGlassBackground />}
      headerComponent={headerComponent}
      style={overlaySheetStyles.container}
      onHidden={handleClose}
    />
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
