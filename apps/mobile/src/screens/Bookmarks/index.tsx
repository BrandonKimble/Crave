import React from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Text } from '../../components';
import { favoritesService, type Favorite } from '../../services/favorites';
import { logger } from '../../utils';

const BookmarksScreen: React.FC = () => {
  const [favorites, setFavorites] = React.useState<Favorite[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

  useFocusEffect(
    React.useCallback(() => {
      void loadFavorites();
    }, [loadFavorites])
  );

  const handleRemoveFavorite = React.useCallback(async (favorite: Favorite) => {
    setFavorites((prev) => prev.filter((item) => item.favoriteId !== favorite.favoriteId));
    try {
      await favoritesService.remove(favorite.favoriteId);
    } catch (removeError) {
      logger.error('Failed to remove favorite from bookmarks', removeError);
      setFavorites((prev) => [favorite, ...prev]);
    }
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text variant="title" weight="bold" style={styles.title}>
          Bookmarks
        </Text>
        <Text variant="caption" style={styles.subtitle}>
          Your saved favorites
        </Text>
      </View>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {loading ? (
          <ActivityIndicator size="large" color="#7c3aed" style={styles.loadingIndicator} />
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
            <View key={favorite.favoriteId} style={styles.favoriteCard}>
              <View style={styles.favoriteInfo}>
                <Text variant="body" weight="bold" style={styles.favoriteName}>
                  {favorite.entity?.name ?? 'Saved entity'}
                </Text>
                <Text variant="caption" style={styles.favoriteMeta}>
                  {favorite.entityType}
                  {favorite.entity?.city ? ` • ${favorite.entity.city}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleRemoveFavorite(favorite)}
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
  errorText: {
    color: '#ef4444',
    marginTop: 8,
  },
  loadingIndicator: {
    marginTop: 32,
  },
  favoriteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  favoriteInfo: {
    flex: 1,
    marginRight: 12,
  },
  favoriteName: {
    color: '#0f172a',
  },
  favoriteMeta: {
    color: '#94a3b8',
    marginTop: 4,
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
  },
  removeButtonText: {
    color: '#b91c1c',
  },
});

export default BookmarksScreen;
