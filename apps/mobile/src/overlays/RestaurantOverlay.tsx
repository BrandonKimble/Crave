import React from 'react';
import { Dimensions, Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Text } from '../components';
import type { FoodResult, RestaurantResult } from '../types';
import { overlaySheetStyles, OVERLAY_HORIZONTAL_PADDING } from './overlaySheetStyles';
import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import { getPriceRangeLabel } from '../constants/pricing';
import BottomSheetWithFlashList, { type SnapPoints } from './BottomSheetWithFlashList';

type RestaurantOverlayData = {
  restaurant: RestaurantResult;
  dishes: FoodResult[];
  queryLabel: string;
  isFavorite: boolean;
};

type RestaurantOverlayProps = {
  visible: boolean;
  data: RestaurantOverlayData | null;
  onDismiss: () => void;
  onRequestClose: () => void;
  onToggleFavorite: (id: string) => void;
};

const SCREEN_HEIGHT = Dimensions.get('window').height;
const PHONE_FALLBACK_SEARCH = 'phone';
const WEBSITE_FALLBACK_SEARCH = 'website';

const CARD_GAP = 4;

const RestaurantOverlay: React.FC<RestaurantOverlayProps> = ({
  visible,
  data,
  onDismiss,
  onRequestClose,
  onToggleFavorite,
}) => {
  const insets = useSafeAreaInsets();
  const contentBottomPadding = Math.max(insets.bottom + 48, 72);
  const snapPoints = React.useMemo<SnapPoints>(() => {
    const expanded = Math.max(insets.top, 0);
    const middle = Math.max(expanded + 180, SCREEN_HEIGHT * 0.6);
    const collapsed = SCREEN_HEIGHT - 180;
    const hidden = SCREEN_HEIGHT + 80;
    return {
      expanded,
      middle,
      collapsed,
      hidden,
    };
  }, [insets.top]);

  if (!data) {
    return null;
  }

  const { restaurant, dishes, queryLabel, isFavorite } = data;
  const priceLabel =
    getPriceRangeLabel(restaurant.priceLevel) ??
    restaurant.priceText ??
    restaurant.priceSymbol ??
    null;
  const handleWebsitePress = () => {
    const query = `${restaurant.restaurantName} ${queryLabel} ${WEBSITE_FALLBACK_SEARCH}`.trim();
    void Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  };

  const handleCallPress = () => {
    const query = `${restaurant.restaurantName} ${PHONE_FALLBACK_SEARCH}`.trim();
    void Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${restaurant.restaurantName} · ${restaurant.address ?? 'View on Crave Search'}`,
      });
    } catch (error) {
      // no-op
    }
  };

  const headerComponent = (
    <View style={overlaySheetStyles.header}>
      <View style={overlaySheetStyles.grabHandleWrapper}>
        <View style={overlaySheetStyles.grabHandle} />
      </View>
      <View style={[overlaySheetStyles.headerRow, overlaySheetStyles.headerRowSpaced]}>
        <View style={styles.headerTextGroup}>
          <Text style={styles.restaurantName}>{restaurant.restaurantName}</Text>
          <Text style={styles.restaurantAddress} numberOfLines={1}>
            {restaurant.address ?? 'Address unavailable'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => onToggleFavorite(restaurant.restaurantId)}
            style={styles.headerIconButton}
            accessibilityLabel={isFavorite ? 'Unsave restaurant' : 'Save restaurant'}
          >
            <Feather
              name="heart"
              size={20}
              color={isFavorite ? '#ef4444' : '#1f2937'}
              {...(isFavorite ? { fill: '#ef4444' } : {})}
            />
          </Pressable>
          <Pressable onPress={handleShare} style={styles.headerIconButton} accessibilityLabel="Share">
            <Feather name="share-2" size={18} color="#1f2937" />
          </Pressable>
          <Pressable onPress={onRequestClose} style={styles.headerIconButton} accessibilityLabel="Close">
            <Feather name="x" size={20} color="#1f2937" />
          </Pressable>
        </View>
      </View>
      <View style={overlaySheetStyles.headerDivider} />
    </View>
  );

  const listHeaderComponent = (
    <View>
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Restaurant score</Text>
          <Text style={styles.metricValue}>{restaurant.restaurantQualityScore?.toFixed(1) ?? '—'}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>
            {queryLabel ? `${queryLabel} score` : 'Query score'}
          </Text>
          <Text style={styles.metricValue}>{restaurant.contextualScore.toFixed(1)}</Text>
        </View>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailText}>Price</Text>
        <Text style={styles.detailValue}>{priceLabel ?? '—'}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.detailText}>Hours</Text>
        <Text style={styles.detailValue}>Hours unavailable</Text>
      </View>
      <View style={styles.actionsRow}>
        <Pressable style={styles.primaryAction} onPress={handleWebsitePress}>
          <Feather name="globe" size={18} color="#0f172a" />
          <Text style={styles.primaryActionText}>Website</Text>
        </Pressable>
        <Pressable style={styles.primaryAction} onPress={handleCallPress}>
          <Feather name="phone" size={18} color="#0f172a" />
          <Text style={styles.primaryActionText}>Call</Text>
        </Pressable>
      </View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Menu highlights</Text>
        <Text style={styles.sectionSubtitle}>Ranked by dish score</Text>
      </View>
    </View>
  );

  const renderDish = ({ item, index }: { item: FoodResult; index: number }) => (
    <View style={styles.dishCard}>
      <View style={styles.dishHeader}>
        <View style={styles.dishRank}>
          <Text style={styles.dishRankText}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dishName}>{item.foodName}</Text>
          <Text style={styles.dishMeta}>Dish score: {item.qualityScore.toFixed(1)}</Text>
        </View>
        <Text style={styles.dishActivity}>{item.activityLevel}</Text>
      </View>
      <View style={styles.dishStatsRow}>
        <View style={styles.dishStat}>
          <Text style={styles.dishStatLabel}>Poll count</Text>
          <Text style={styles.dishStatValue}>{item.mentionCount}</Text>
        </View>
        <View style={styles.dishStat}>
          <Text style={styles.dishStatLabel}>Total votes</Text>
          <Text style={styles.dishStatValue}>{item.totalUpvotes}</Text>
        </View>
      </View>
    </View>
  );

  const listEmptyComponent = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>No dishes found for this restaurant.</Text>
    </View>
  );

  return (
    <BottomSheetWithFlashList
      visible={visible}
      snapPoints={snapPoints}
      initialSnapPoint="middle"
      data={dishes}
      renderItem={renderDish}
      keyExtractor={(item) => item.connectionId}
      estimatedItemSize={136}
      ItemSeparatorComponent={() => <View style={{ height: CARD_GAP }} />}
      contentContainerStyle={{
        paddingBottom: contentBottomPadding,
      }}
      ListHeaderComponent={listHeaderComponent}
      ListEmptyComponent={listEmptyComponent}
      keyboardShouldPersistTaps="handled"
      backgroundComponent={<FrostedGlassBackground />}
      headerComponent={headerComponent}
      style={overlaySheetStyles.container}
      onHidden={onDismiss}
    />
  );
};

const styles = StyleSheet.create({
  headerTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  restaurantName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  restaurantAddress: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    padding: 6,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    marginTop: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  metricLabel: {
    fontSize: 13,
    color: '#475569',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    marginTop: 16,
  },
  detailText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  detailValue: {
    fontSize: 14,
    color: '#475569',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    marginTop: 20,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  sectionHeader: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
  },
  emptyState: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  dishCard: {
    marginTop: CARD_GAP,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
  },
  dishHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dishRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishRankText: {
    fontWeight: '700',
    color: '#b45309',
  },
  dishName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  dishMeta: {
    fontSize: 13,
    color: '#475569',
  },
  dishActivity: {
    fontSize: 12,
    color: '#94a3b8',
    textTransform: 'capitalize',
  },
  dishStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  dishStat: {
    flex: 1,
  },
  dishStatLabel: {
    fontSize: 12,
    color: '#94a3b8',
  },
  dishStatValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
});

export type { RestaurantOverlayData };
export default RestaurantOverlay;
