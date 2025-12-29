import React from 'react';
import { Dimensions, Linking, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Text } from '../components';
import type { OperatingStatus } from '@crave-search/shared';
import type { FoodResult, RestaurantResult } from '../types';
import { FONT_SIZES, LINE_HEIGHTS } from '../constants/typography';
import { colors as themeColors } from '../constants/theme';
import { overlaySheetStyles, OVERLAY_HORIZONTAL_PADDING } from './overlaySheetStyles';
import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import { getPriceRangeLabel } from '../constants/pricing';
import BottomSheetWithFlashList, { type SnapPoints } from './BottomSheetWithFlashList';
import { useHeaderCloseCutout } from './useHeaderCloseCutout';
import { calculateSnapPoints } from './sheetUtils';

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
  navBarTop?: number;
  searchBarTop?: number;
};

type RestaurantOverlayContentProps = {
  visible: boolean;
  data: RestaurantOverlayData;
  onDismiss: () => void;
  onRequestClose: () => void;
  onToggleFavorite: (id: string) => void;
  navBarTop?: number;
  searchBarTop?: number;
};

const SCREEN_HEIGHT = Dimensions.get('window').height;
const PHONE_FALLBACK_SEARCH = 'phone';
const WEBSITE_FALLBACK_SEARCH = 'website';

const CARD_GAP = 4;
const DAY_LABELS: Array<{ key: string; label: string }> = [
  { key: 'sunday', label: 'Sun' },
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
];

const RestaurantOverlayContent: React.FC<RestaurantOverlayContentProps> = ({
  visible,
  data,
  onDismiss,
  onRequestClose,
  onToggleFavorite,
  navBarTop = 0,
  searchBarTop = 0,
}) => {
  const insets = useSafeAreaInsets();
  const contentBottomPadding = Math.max(insets.bottom + 48, 72);
  const closeCutout = useHeaderCloseCutout();
  const headerHeight = closeCutout.headerHeight;
  const navBarOffset = Math.max(navBarTop, 0);
  const dismissThreshold = navBarOffset > 0 ? navBarOffset : undefined;
  const snapPoints = React.useMemo<SnapPoints>(
    () => calculateSnapPoints(SCREEN_HEIGHT, searchBarTop, insets.top, navBarOffset, headerHeight),
    [headerHeight, insets.top, navBarOffset, searchBarTop]
  );
  const [expandedLocations, setExpandedLocations] = React.useState<Record<string, boolean>>({});

  const { restaurant, dishes, queryLabel, isFavorite } = data;
  const priceLabel =
    getPriceRangeLabel(restaurant.priceLevel) ??
    restaurant.priceText ??
    restaurant.priceSymbol ??
    null;
  const locationCandidates = React.useMemo(() => {
    const source =
      Array.isArray(restaurant.locations) && restaurant.locations.length > 0
        ? restaurant.locations
        : restaurant.displayLocation
        ? [restaurant.displayLocation]
        : [];
    const seen = new Set<string>();
    return source.filter((location, index) => {
      const locationId = location.locationId ?? `${restaurant.restaurantId}-${index}`;
      if (seen.has(locationId)) {
        return false;
      }
      seen.add(locationId);
      return true;
    });
  }, [restaurant]);

  const normalizeWebsiteUrl = React.useCallback((value?: string | null): string | null => {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const withScheme =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`;
    return withScheme;
  }, []);

  const uniqueWebsiteUrls = React.useMemo(() => {
    const candidates = locationCandidates
      .map((location) => normalizeWebsiteUrl(location.websiteUrl))
      .filter((value): value is string => Boolean(value));
    return Array.from(new Set(candidates));
  }, [locationCandidates, normalizeWebsiteUrl]);

  const sharedWebsiteUrl = uniqueWebsiteUrls.length === 1 ? uniqueWebsiteUrls[0] : null;
  const shouldShowPerLocationWebsite = uniqueWebsiteUrls.length > 1;
  const primaryPhone =
    restaurant.displayLocation?.phoneNumber ?? locationCandidates[0]?.phoneNumber ?? null;
  const primaryAddress =
    restaurant.displayLocation?.address ??
    restaurant.address ??
    locationCandidates[0]?.address ??
    'Address unavailable';

  const formatOperatingStatus = React.useCallback((status?: OperatingStatus | null) => {
    if (!status) {
      return null;
    }
    if (status.isOpen) {
      return status.closesAtDisplay ? `Open until ${status.closesAtDisplay}` : 'Open';
    }
    if (status.isOpen === false) {
      return status.nextOpenDisplay ? `Closed until ${status.nextOpenDisplay}` : 'Closed';
    }
    return null;
  }, []);

  const toggleLocationExpanded = React.useCallback((locationId: string) => {
    setExpandedLocations((prev) => ({
      ...prev,
      [locationId]: !prev[locationId],
    }));
  }, []);

  const formatHoursValue = React.useCallback((value: unknown): string | null => {
    if (Array.isArray(value)) {
      const filtered = value.filter((entry) => typeof entry === 'string' && entry.trim().length);
      return filtered.length ? filtered.join(', ') : null;
    }
    if (typeof value === 'string' && value.trim().length) {
      return value.trim();
    }
    return null;
  }, []);

  const formatHoursRows = React.useCallback(
    (hours?: Record<string, unknown> | null) =>
      DAY_LABELS.map((day) => {
        const value = formatHoursValue(hours?.[day.key]);
        return value ? { label: day.label, value } : null;
      }).filter((entry): entry is { label: string; value: string } => Boolean(entry)),
    [formatHoursValue]
  );

  const resolveLocationLabel = React.useCallback((address?: string | null) => {
    if (!address) {
      return 'Location';
    }
    const [street] = address.split(',');
    const trimmed = street?.trim();
    return trimmed || 'Location';
  }, []);

  const handleWebsitePress = () => {
    if (sharedWebsiteUrl) {
      void Linking.openURL(sharedWebsiteUrl);
      return;
    }
    const query = `${restaurant.restaurantName} ${queryLabel} ${WEBSITE_FALLBACK_SEARCH}`.trim();
    void Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  };

  const handleCallPress = () => {
    if (primaryPhone) {
      void Linking.openURL(`tel:${primaryPhone}`);
      return;
    }
    const query = `${restaurant.restaurantName} ${PHONE_FALLBACK_SEARCH}`.trim();
    void Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${restaurant.restaurantName} · ${primaryAddress}`,
      });
    } catch (error) {
      // no-op
    }
  };

  const hoursSummary =
    formatOperatingStatus(restaurant.displayLocation?.operatingStatus) ?? 'Hours unavailable';
  const locationsLabel =
    locationCandidates.length === 1 ? '1 location' : `${locationCandidates.length} locations`;

  const headerComponent = (
    <View
      style={[overlaySheetStyles.header, overlaySheetStyles.headerTransparent]}
      onLayout={closeCutout.onHeaderLayout}
    >
      {closeCutout.background}
      <View style={overlaySheetStyles.grabHandleWrapper}>
        <View style={overlaySheetStyles.grabHandle} />
      </View>
      <View
        style={[overlaySheetStyles.headerRow, overlaySheetStyles.headerRowSpaced, styles.headerRow]}
        onLayout={closeCutout.onHeaderRowLayout}
      >
        <View style={styles.headerTextGroup}>
          <Text style={styles.restaurantName} numberOfLines={1} ellipsizeMode="tail">
            {restaurant.restaurantName}
          </Text>
          <Text style={styles.restaurantAddress} numberOfLines={1}>
            {primaryAddress}
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
          <Pressable
            onPress={handleShare}
            style={styles.headerIconButton}
            accessibilityLabel="Share"
          >
            <Feather name="share-2" size={18} color="#1f2937" />
          </Pressable>
        </View>
        <Pressable
          onPress={onRequestClose}
          accessibilityLabel="Close"
          accessibilityRole="button"
          style={[overlaySheetStyles.closeButton, styles.headerCloseButton]}
          onLayout={closeCutout.onCloseLayout}
          hitSlop={8}
        >
          <View style={overlaySheetStyles.closeIcon}>
            <Feather name="x" size={20} color="#1f2937" />
          </View>
        </Pressable>
      </View>
      <View style={overlaySheetStyles.headerDivider} />
    </View>
  );

  const listHeaderComponent = (
    <View>
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Restaurant score</Text>
          <Text style={styles.metricValue}>
            {restaurant.restaurantQualityScore?.toFixed(1) ?? '—'}
          </Text>
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
        <Text style={styles.detailValue}>{hoursSummary}</Text>
      </View>
      <View style={styles.actionsRow}>
        {sharedWebsiteUrl ? (
          <Pressable style={styles.primaryAction} onPress={handleWebsitePress}>
            <Feather name="globe" size={18} color="#0f172a" />
            <Text style={styles.primaryActionText}>Website</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.primaryAction} onPress={handleCallPress}>
          <Feather name="phone" size={18} color="#0f172a" />
          <Text style={styles.primaryActionText}>Call</Text>
        </Pressable>
      </View>
      {locationCandidates.length > 0 ? (
        <View style={styles.locationsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Locations</Text>
            <Text style={styles.sectionSubtitle}>{locationsLabel}</Text>
          </View>
          {locationCandidates.map((location, index) => {
            const locationId = location.locationId ?? `${restaurant.restaurantId}-${index}`;
            const isExpanded = Boolean(expandedLocations[locationId]);
            const statusLabel = formatOperatingStatus(location.operatingStatus);
            const hoursRows = formatHoursRows(location.hours ?? null);
            const locationWebsite = normalizeWebsiteUrl(location.websiteUrl);
            const locationPhone = location.phoneNumber;
            return (
              <View key={locationId} style={styles.locationCard}>
                <Pressable
                  style={styles.locationRow}
                  onPress={() => toggleLocationExpanded(locationId)}
                >
                  <Text style={styles.locationTitle} numberOfLines={1}>
                    {resolveLocationLabel(location.address ?? null)}
                  </Text>
                  <View style={styles.locationRowRight}>
                    {statusLabel ? (
                      <Text style={styles.locationStatus} numberOfLines={1}>
                        {statusLabel}
                      </Text>
                    ) : null}
                    <Feather
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={themeColors.textBody}
                    />
                  </View>
                </Pressable>
                {isExpanded ? (
                  <View style={styles.locationDetails}>
                    <Text style={styles.locationDetailLabel}>Address</Text>
                    <Text style={styles.locationDetailValue}>
                      {location.address ?? 'Address unavailable'}
                    </Text>
                    {locationPhone ? (
                      <Pressable
                        style={styles.locationDetailRow}
                        onPress={() => void Linking.openURL(`tel:${locationPhone}`)}
                      >
                        <Text style={styles.locationDetailLabel}>Phone</Text>
                        <Text style={styles.locationDetailLink}>{locationPhone}</Text>
                      </Pressable>
                    ) : null}
                    <View style={styles.locationDetailRow}>
                      <Text style={styles.locationDetailLabel}>Hours</Text>
                      {hoursRows.length ? (
                        <View style={styles.locationHoursList}>
                          {hoursRows.map((entry) => (
                            <View key={entry.label} style={styles.locationHoursRow}>
                              <Text style={styles.locationHoursDay}>{entry.label}</Text>
                              <Text style={styles.locationHoursValue}>{entry.value}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.locationDetailValue}>Hours unavailable</Text>
                      )}
                    </View>
                    {shouldShowPerLocationWebsite && locationWebsite ? (
                      <Pressable
                        style={styles.locationDetailRow}
                        onPress={() => void Linking.openURL(locationWebsite)}
                      >
                        <Text style={styles.locationDetailLabel}>Website</Text>
                        <Text style={styles.locationDetailLink} numberOfLines={1}>
                          {locationWebsite.replace(/^https?:\/\//, '')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
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
          <Text style={styles.dishMeta}>
            Dish score: {(item.displayScore ?? item.qualityScore).toFixed(1)}
          </Text>
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
      dismissThreshold={dismissThreshold}
      preventSwipeDismiss
    />
  );
};

const RestaurantOverlay: React.FC<RestaurantOverlayProps> = ({ data, searchBarTop, ...rest }) => {
  if (!data) {
    return null;
  }

  return <RestaurantOverlayContent {...rest} data={data} searchBarTop={searchBarTop} />;
};

const styles = StyleSheet.create({
  headerRow: {
    justifyContent: 'flex-start',
  },
  headerCloseButton: {
    marginLeft: 8,
  },
  headerTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  restaurantName: {
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
    fontWeight: '700',
    color: '#0f172a',
  },
  restaurantAddress: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    color: themeColors.textBody,
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
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    color: themeColors.textBody,
  },
  metricValue: {
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
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
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    fontWeight: '600',
    color: '#0f172a',
  },
  detailValue: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    color: themeColors.textBody,
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
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    fontWeight: '600',
    color: '#0f172a',
  },
  locationsSection: {
    marginTop: 12,
  },
  locationCard: {
    marginTop: 12,
    marginHorizontal: OVERLAY_HORIZONTAL_PADDING,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    overflow: 'hidden',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  locationTitle: {
    flex: 1,
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    fontWeight: '600',
    color: '#0f172a',
  },
  locationRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationStatus: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    color: themeColors.textBody,
    maxWidth: 160,
  },
  locationDetails: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  locationDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  locationDetailLabel: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    fontWeight: '600',
    color: '#0f172a',
    minWidth: 64,
  },
  locationDetailValue: {
    flex: 1,
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    color: themeColors.textBody,
  },
  locationDetailLink: {
    flex: 1,
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    color: '#0ea5e9',
    textAlign: 'right',
  },
  locationHoursList: {
    flex: 1,
    gap: 6,
  },
  locationHoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  locationHoursDay: {
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
    color: themeColors.textBody,
    minWidth: 32,
  },
  locationHoursValue: {
    flex: 1,
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
    color: themeColors.textBody,
    textAlign: 'right',
  },
  sectionHeader: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    fontWeight: '700',
    color: '#0f172a',
  },
  sectionSubtitle: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    color: themeColors.textBody,
    marginTop: 2,
  },
  emptyState: {
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    color: themeColors.textBody,
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
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    fontWeight: '600',
    color: '#0f172a',
  },
  dishMeta: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    color: themeColors.textBody,
  },
  dishActivity: {
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
    color: themeColors.textBody,
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
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
    color: themeColors.textBody,
  },
  dishStatValue: {
    fontSize: FONT_SIZES.subtitle,
    lineHeight: LINE_HEIGHTS.subtitle,
    fontWeight: '600',
    color: '#0f172a',
  },
});

export type { RestaurantOverlayData };
export default RestaurantOverlay;
