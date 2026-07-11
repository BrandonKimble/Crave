import React from 'react';
import {
  Dimensions,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import {
  useSharedValue,
  type AnimatedStyle as ReanimatedAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import type { OperatingStatus } from '@crave-search/shared';
import { Text } from '../../components';
import { CardPhotoStrip } from '../../components/photos/CardPhotoStrip';
import type { FoodResult } from '../../types';
import type { RestaurantProfileSeed } from '../../navigation/runtime/app-route-profile-transition-state-contract';
import { FONT_SIZES, LINE_HEIGHTS } from '../../constants/typography';
import { colors as themeColors } from '../../constants/theme';
import {
  overlaySheetStyles,
  OVERLAY_HORIZONTAL_PADDING,
  OVERLAY_TAB_HEADER_HEIGHT,
} from '../overlaySheetStyles';
import OverlayHeaderActionButton from '../OverlayHeaderActionButton';
import { CutoutSkeletonTitle, SceneLoadingSurface } from '../../components/skeletons';
import { getPriceRangeLabel } from '../../constants/pricing';
import { calculateSnapPoints } from '../sheetUtils';
import type { OverlayContentSpec } from '../types';
import { registerPersistentHeaderDescriptor } from '../../navigation/runtime/app-route-persistent-header-registry';
import { useRestaurantHeaderLiveState } from '../restaurant-header-live-state';
import { openPostPhotosFunnel } from '../PostPhotosFunnelHost';
import CraveScoreText from '../../screens/Search/components/CraveScoreText';
import {
  RestaurantMentionsView,
  RestaurantOverviewMentions,
  RestaurantPhotosView,
  RestaurantViewSwitcher,
  type RestaurantProfileViewKey,
} from './RestaurantProfileViews';

export type RestaurantOverlayData = {
  restaurant: RestaurantProfileSeed;
  dishes: FoodResult[];
  queryLabel: string;
  isFavorite: boolean;
  isLoading?: boolean;
};

type AnimatedStyle = ReanimatedAnimatedStyle<ViewStyle>;
type RestaurantPanelLocation = NonNullable<NonNullable<RestaurantProfileSeed['locations']>[number]>;

type UseRestaurantPanelSpecOptions = {
  data: RestaurantOverlayData | null;
  onDismiss: () => void;
  navBarTop?: number;
  searchBarTop?: number;
  interactionEnabled?: boolean;
  containerStyle?: AnimatedStyle;
};

const SCREEN_HEIGHT = Dimensions.get('window').height;
const PHONE_FALLBACK_SEARCH = 'phone';
const WEBSITE_FALLBACK_SEARCH = 'website';

const CARD_GAP = 4;
const EMPTY_RESTAURANT_DISHES: FoodResult[] = [];
const DAY_LABELS: Array<{ key: string; label: string }> = [
  { key: 'sunday', label: 'Sun' },
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
];

// The header (title / heart-share-close actions / grab press) no longer rides this spec — it is
// extracted to the persistent-header descriptor below (P3), fed by the restaurant-header
// live-state store. The spec itself only consumes what the BODY needs.
export const useRestaurantPanelSpec = ({
  data,
  onDismiss,
  navBarTop = 0,
  searchBarTop = 0,
  interactionEnabled = true,
  containerStyle,
}: UseRestaurantPanelSpecOptions): OverlayContentSpec<FoodResult> | null => {
  const insets = useSafeAreaInsets();
  const contentBottomPadding = Math.max(insets.bottom + 48, 72);
  const headerHeight = OVERLAY_TAB_HEADER_HEIGHT;
  const navBarOffset = Math.max(navBarTop, 0);
  const dismissThreshold = navBarOffset > 0 ? navBarOffset : undefined;
  const snapPoints = React.useMemo(
    () => calculateSnapPoints(SCREEN_HEIGHT, searchBarTop, insets.top, navBarOffset, headerHeight),
    [headerHeight, insets.top, navBarOffset, searchBarTop]
  );
  const [expandedLocations, setExpandedLocations] = React.useState<Record<string, boolean>>({});

  const restaurant = data?.restaurant ?? null;
  const dishes = data?.dishes ?? [];
  const queryLabel = data?.queryLabel ?? '';
  const isLoading = data?.isLoading ?? false;
  const restaurantName = restaurant?.restaurantName ?? '';
  const restaurantId = restaurant?.restaurantId ?? '';

  // W3 (§8.4): the FOUR segmented views. Panel-local state, default Overview.
  // Reset on restaurant change is RENDER-TIME derived state (the useEffect
  // pattern is dead code in these spec hooks — CLAUDE.md).
  const [viewState, setViewState] = React.useState<{
    restaurantId: string;
    view: RestaurantProfileViewKey;
  }>({ restaurantId: '', view: 'overview' });
  if (viewState.restaurantId !== restaurantId) {
    setViewState({ restaurantId, view: 'overview' });
  }
  const activeView = viewState.restaurantId === restaurantId ? viewState.view : 'overview';
  const setActiveView = React.useCallback(
    (view: RestaurantProfileViewKey) => {
      setViewState({ restaurantId, view });
    },
    [restaurantId]
  );

  React.useEffect(() => {
    setExpandedLocations({});
  }, [restaurantId]);

  const emptyAreaMinHeight = Math.max(0, SCREEN_HEIGHT - snapPoints.middle - headerHeight);
  const priceLabel = restaurant
    ? (getPriceRangeLabel(restaurant.priceLevel) ??
      restaurant.priceText ??
      restaurant.priceSymbol ??
      null)
    : null;
  const locationCandidates = React.useMemo<RestaurantPanelLocation[]>(() => {
    if (!restaurant) {
      return [];
    }
    const source: RestaurantPanelLocation[] =
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
    restaurant?.displayLocation?.phoneNumber ?? locationCandidates[0]?.phoneNumber ?? null;

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

  const handleWebsitePress = React.useCallback(() => {
    if (sharedWebsiteUrl) {
      void Linking.openURL(sharedWebsiteUrl);
      return;
    }
    const query = `${restaurantName} ${queryLabel} ${WEBSITE_FALLBACK_SEARCH}`.trim();
    void Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  }, [queryLabel, restaurantName, sharedWebsiteUrl]);

  const handleCallPress = React.useCallback(() => {
    if (primaryPhone) {
      void Linking.openURL(`tel:${primaryPhone}`);
      return;
    }
    const query = `${restaurantName} ${PHONE_FALLBACK_SEARCH}`.trim();
    void Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
  }, [primaryPhone, restaurantName]);

  const hoursSummary =
    formatOperatingStatus(restaurant?.displayLocation?.operatingStatus) ?? 'Hours unavailable';
  const locationsLabel =
    locationCandidates.length === 1 ? '1 location' : `${locationCandidates.length} locations`;

  // connectionId → { name, rank } for the Photos view's ranked dish slices.
  const dishByConnectionId = React.useMemo(() => {
    const map = new Map<string, { name: string; rank: number }>();
    dishes.forEach((dish, index) => {
      map.set(dish.connectionId, { name: dish.foodName, rank: index + 1 });
    });
    return map;
  }, [dishes]);

  const viewSwitcher = React.useMemo(
    () =>
      restaurant && !isLoading ? (
        <RestaurantViewSwitcher active={activeView} onSelect={setActiveView} />
      ) : null,
    [activeView, isLoading, restaurant, setActiveView]
  );

  const listHeaderComponent = React.useMemo(() => {
    if (!restaurant || isLoading) {
      return null;
    }
    return (
      <View>
        {viewSwitcher}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Crave rating</Text>
            <CraveScoreText score={restaurant.craveScore} style={styles.metricValue} />
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
          {/* W2 (page-registry §7.4): the restaurant-profile add-photo entry — crude chip;
              the real chip-row is W3's design pass. Plain-function funnel entry (this is a
              spec hook — effects/hooks-with-effects are off the table here). */}
          <Pressable
            style={styles.primaryAction}
            onPress={() =>
              openPostPhotosFunnel({
                restaurantId: restaurant.restaurantId,
                restaurantName: restaurant.restaurantName,
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Add photo"
            testID="restaurant-add-photo"
          >
            <Feather name="camera" size={18} color="#0f172a" />
            <Text style={styles.primaryActionText}>Add photo</Text>
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
        {/* §8.4 Overview extras: mention-tag collage + top discussions,
            both linking into the Discussions view. Real component — its
            queries/effects fire (unlike this spec hook's). */}
        <RestaurantOverviewMentions
          restaurantId={restaurant.restaurantId}
          onSeeAllDiscussions={() => setActiveView('discussions')}
        />
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top dishes</Text>
          <Text style={styles.sectionSubtitle}>Ranked by dish rating</Text>
        </View>
      </View>
    );
  }, [
    expandedLocations,
    formatOperatingStatus,
    formatHoursRows,
    handleCallPress,
    handleWebsitePress,
    hoursSummary,
    isLoading,
    locationCandidates,
    locationsLabel,
    normalizeWebsiteUrl,
    priceLabel,
    queryLabel,
    resolveLocationLabel,
    restaurant?.craveScore,
    restaurant?.restaurantId,
    restaurant?.restaurantName,
    setActiveView,
    sharedWebsiteUrl,
    shouldShowPerLocationWebsite,
    toggleLocationExpanded,
    viewSwitcher,
  ]);

  // ── Per-view body assembly (W3 §8.4) ─────────────────────────────────────
  // Photos/Discussions render entirely inside the list header (data = []);
  // Overview = composite header + top-5 dishes; Dishes = the full ranked list.
  const OVERVIEW_DISH_COUNT = 5;
  const dishesViewHeaderComponent = React.useMemo(() => {
    if (!restaurant || isLoading) {
      return null;
    }
    return (
      <View>
        {viewSwitcher}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Menu highlights</Text>
          <Text style={styles.sectionSubtitle}>Ranked by dish rating</Text>
        </View>
      </View>
    );
  }, [isLoading, restaurant, viewSwitcher]);

  const photosViewHeaderComponent = React.useMemo(() => {
    if (!restaurant || isLoading) {
      return null;
    }
    return (
      <View>
        {viewSwitcher}
        <RestaurantPhotosView
          restaurantId={restaurant.restaurantId}
          restaurantName={restaurant.restaurantName}
          dishByConnectionId={dishByConnectionId}
        />
      </View>
    );
  }, [dishByConnectionId, isLoading, restaurant, viewSwitcher]);

  const discussionsViewHeaderComponent = React.useMemo(() => {
    if (!restaurant || isLoading) {
      return null;
    }
    return (
      <View>
        {viewSwitcher}
        <RestaurantMentionsView restaurantId={restaurant.restaurantId} />
      </View>
    );
  }, [isLoading, restaurant, viewSwitcher]);

  const overviewFooterComponent = React.useMemo(() => {
    if (!restaurant || isLoading || dishes.length <= OVERVIEW_DISH_COUNT) {
      return null;
    }
    return (
      <Pressable
        style={styles.seeAllDishesRow}
        onPress={() => setActiveView('dishes')}
        accessibilityRole="button"
        testID="restaurant-see-all-dishes"
      >
        <Text style={styles.seeAllDishesText}>See all {dishes.length} dishes</Text>
        <Feather name="chevron-right" size={16} color={themeColors.textBody} />
      </Pressable>
    );
  }, [dishes.length, isLoading, restaurant, setActiveView]);

  const activeViewParts = React.useMemo(() => {
    switch (activeView) {
      case 'dishes':
        return {
          data: dishes,
          header: dishesViewHeaderComponent,
          footer: null as React.ReactElement | null,
          showsDishEmptyState: true,
        };
      case 'photos':
        return {
          data: EMPTY_RESTAURANT_DISHES,
          header: photosViewHeaderComponent,
          footer: null as React.ReactElement | null,
          showsDishEmptyState: false,
        };
      case 'discussions':
        return {
          data: EMPTY_RESTAURANT_DISHES,
          header: discussionsViewHeaderComponent,
          footer: null as React.ReactElement | null,
          showsDishEmptyState: false,
        };
      case 'overview':
      default:
        return {
          data: dishes.slice(0, OVERVIEW_DISH_COUNT),
          header: listHeaderComponent,
          footer: overviewFooterComponent,
          showsDishEmptyState: true,
        };
    }
  }, [
    activeView,
    discussionsViewHeaderComponent,
    dishes,
    dishesViewHeaderComponent,
    listHeaderComponent,
    overviewFooterComponent,
    photosViewHeaderComponent,
  ]);

  const renderDish = React.useCallback(
    ({ item, index }: { item: FoodResult; index: number }) => (
      <View style={styles.dishCard}>
        <View style={styles.dishHeader}>
          <View style={styles.dishRank}>
            <Text style={styles.dishRankText}>{index + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dishName}>{item.foodName}</Text>
            <Text style={styles.dishMeta}>
              Dish rating:{' '}
              <CraveScoreText score={item.craveScore} style={styles.dishMetaScoreValue} />
            </Text>
          </View>
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
        {/* §7.1: every dish row carries its (dish-linked) photo strip as the
            card's last element. Display context — placeholder when empty. */}
        <View style={styles.dishPhotoStripSection}>
          <CardPhotoStrip
            restaurantId={item.restaurantId}
            connectionId={item.connectionId}
            height={72}
          />
        </View>
      </View>
    ),
    []
  );

  const keyExtractor = React.useCallback((item: FoodResult) => item.connectionId, []);

  const renderSeparator = React.useCallback(() => <View style={{ height: CARD_GAP }} />, []);

  const listEmptyComponent = React.useCallback(() => {
    if (isLoading) {
      // Hard-swap skeleton: while the committed single-restaurant search resolves, paint a
      // structure-matched dish-card skeleton (mirrors the dish list) instead of a bare spinner.
      return (
        <View style={[styles.loadingEmptyState, { minHeight: emptyAreaMinHeight }]}>
          <SceneLoadingSurface rowType="dish" />
        </View>
      );
    }
    if (!activeViewParts.showsDishEmptyState) {
      // Photos/Discussions live in the list header — an empty data array is
      // structural there, not an empty state.
      return null;
    }
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>No dishes found for this restaurant.</Text>
      </View>
    );
  }, [activeViewParts.showsDishEmptyState, emptyAreaMinHeight, isLoading]);

  // Seed-frame skeleton (used by the `!data` hard-swap seed spec): always paints the dish
  // skeleton over the empty list so the first frame is structure, not a blank or empty-state text.
  const renderSeedSkeleton = React.useCallback(
    () => (
      <View style={[styles.loadingEmptyState, { minHeight: emptyAreaMinHeight }]}>
        <SceneLoadingSurface rowType="dish" />
      </View>
    ),
    [emptyAreaMinHeight]
  );

  // Frost is the shared page-frame foundation now; the restaurant body is frost-through (dish
  // cards paint their own white), so it contributes no extra background material.
  const backgroundComponent = null;

  if (!data) {
    // Hard-swap seed frame: restaurant is now swapImmediately, so the panel paints its FIRST
    // frame the moment the route opens — before `data` resolves. Render a skeleton seed shell
    // (dish-card skeleton; the seeded header rides the persistent-header descriptor) instead of
    // a TRUE BLANK so the hard swap lands on structure, never an empty map see-through. The
    // committed search fills the content in.
    return {
      overlayKey: 'restaurant',
      semanticOverlayKey: 'restaurant',
      sceneIdentityKey: 'restaurant',
      surfaceKind: 'list',
      snapPoints,
      animateOnMount: false,
      data: EMPTY_RESTAURANT_DISHES,
      renderItem: renderDish,
      keyExtractor,
      estimatedItemSize: 136,
      ItemSeparatorComponent: renderSeparator,
      contentContainerStyle: {
        paddingBottom: contentBottomPadding,
      },
      ListHeaderComponent: null,
      ListEmptyComponent: renderSeedSkeleton,
      keyboardShouldPersistTaps: 'handled',
      backgroundComponent: backgroundComponent,
      // P3: the restaurant header is the persistent-header descriptor (registered below) — the
      // per-scene header lane stays NULL (shape-preserving; other chrome surfaces stay).
      headerComponent: null,
      style: [overlaySheetStyles.container, containerStyle as ViewStyle],
      onHidden: onDismiss,
      dismissThreshold,
      preventSwipeDismiss: true,
      interactionEnabled,
    };
  }

  return {
    overlayKey: 'restaurant',
    semanticOverlayKey: 'restaurant',
    sceneIdentityKey: restaurantId ? `restaurant:${restaurantId}` : 'restaurant',
    surfaceKind: 'list',
    snapPoints,
    animateOnMount: false,
    data: activeViewParts.data,
    renderItem: renderDish,
    keyExtractor,
    estimatedItemSize: 136,
    ItemSeparatorComponent: renderSeparator,
    contentContainerStyle: {
      paddingBottom: contentBottomPadding,
    },
    ListHeaderComponent: activeViewParts.header,
    ListFooterComponent: activeViewParts.footer,
    ListEmptyComponent: listEmptyComponent,
    keyboardShouldPersistTaps: 'handled',
    backgroundComponent: backgroundComponent,
    // P3: the restaurant header is the persistent-header descriptor (registered below) — the
    // per-scene header lane stays NULL (shape-preserving; other chrome surfaces stay).
    headerComponent: null,
    style: [overlaySheetStyles.container, containerStyle as ViewStyle],
    onHidden: onDismiss,
    dismissThreshold,
    preventSwipeDismiss: true,
    interactionEnabled,
  };
};

// ─── Persistent header descriptor (P3, page-switch-master-plan.md §6-P3) ────────────────────
// The restaurant header is extracted OUT of the panel spec into the hoisted persistent chrome
// (PersistentSheetHeaderHost). Title/Action/grab read the restaurant-header live-state store —
// the winning presentation's freeze-retained data + handlers, published by
// RestaurantRouteSceneInputHost from the same `parent ?? search` authority resolution that
// feeds the leg body — so the entity-tap seeded name still paints at frame 1 and the heart
// reflects the same favorite state/handler as before.

const RestaurantPersistentHeaderTitle = React.memo(() => {
  const headerState = useRestaurantHeaderLiveState();
  const restaurantName = headerState?.data?.restaurant?.restaurantName ?? '';
  if (!restaurantName) {
    // Title not yet resolved (e.g. a deep-link open with no seeded name) — skeletonize
    // ONLY the title; the grab handle + close button stay live for cancel.
    return <CutoutSkeletonTitle width={150} height={18} />;
  }
  return (
    <Text style={styles.restaurantName} numberOfLines={1} ellipsizeMode="tail">
      {restaurantName}
    </Text>
  );
});
RestaurantPersistentHeaderTitle.displayName = 'RestaurantPersistentHeaderTitle';

const RestaurantPersistentHeaderAction = React.memo(() => {
  const headerState = useRestaurantHeaderLiveState();
  const closeButtonProgress = useSharedValue(0);
  const data = headerState?.data ?? null;
  const restaurant = data?.restaurant ?? null;
  const isFavorite = data?.isFavorite ?? false;
  const isLoading = data?.isLoading ?? false;
  const restaurantName = restaurant?.restaurantName ?? '';
  const restaurantId = restaurant?.restaurantId ?? '';
  const onToggleFavorite = headerState?.onToggleFavorite;
  const onRequestClose = headerState?.onRequestClose;

  const handleToggleFavorite = React.useCallback(() => {
    if (!restaurantId) {
      return;
    }
    onToggleFavorite?.(restaurantId);
  }, [onToggleFavorite, restaurantId]);

  // Same primary-address coalesce the inline header shared with the panel body: displayLocation
  // → seed address → first location candidate (dedupe keeps order, so [0] is source[0]) → the
  // loading-aware fallback.
  const firstLocationCandidate = React.useMemo<RestaurantPanelLocation | null>(() => {
    if (!restaurant) {
      return null;
    }
    const source: RestaurantPanelLocation[] =
      Array.isArray(restaurant.locations) && restaurant.locations.length > 0
        ? restaurant.locations
        : restaurant.displayLocation
          ? [restaurant.displayLocation]
          : [];
    return source[0] ?? null;
  }, [restaurant]);
  const addressFallback = isLoading ? 'Loading details...' : 'Address unavailable';
  const primaryAddress =
    restaurant?.displayLocation?.address ??
    restaurant?.address ??
    firstLocationCandidate?.address ??
    addressFallback;

  const handleShare = React.useCallback(async () => {
    try {
      await Share.share({
        message: `${restaurantName} · ${primaryAddress}`,
      });
    } catch (error) {
      // no-op
    }
  }, [primaryAddress, restaurantName]);

  const handleRequestClose = React.useCallback(() => {
    onRequestClose?.();
  }, [onRequestClose]);

  return (
    <View style={styles.headerActions}>
      <Pressable
        onPress={handleToggleFavorite}
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
        onPress={() => void handleShare()}
        style={styles.headerIconButton}
        accessibilityLabel="Share"
      >
        <Feather name="share-2" size={18} color="#1f2937" />
      </Pressable>
      <OverlayHeaderActionButton
        progress={closeButtonProgress}
        onPress={handleRequestClose}
        accessibilityLabel="Close restaurant"
        accentColor={themeColors.primary}
        closeColor="#1f2937"
        style={styles.headerCloseButton}
      />
    </View>
  );
});
RestaurantPersistentHeaderAction.displayName = 'RestaurantPersistentHeaderAction';

registerPersistentHeaderDescriptor('restaurant', {
  Title: RestaurantPersistentHeaderTitle,
  Action: RestaurantPersistentHeaderAction,
});

const styles = StyleSheet.create({
  headerCloseButton: {
    marginLeft: 2,
  },
  restaurantName: {
    flex: 1,
    marginRight: 12,
    fontSize: FONT_SIZES.title,
    lineHeight: LINE_HEIGHTS.title,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  seeAllDishesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 14,
  },
  seeAllDishesText: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    fontWeight: '600',
    color: themeColors.textBody,
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
  loadingEmptyState: {
    alignItems: 'center',
    justifyContent: 'flex-start',
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
  dishMetaScoreValue: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    fontWeight: '600',
    color: themeColors.textBody,
  },
  dishStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  dishStat: {
    flex: 1,
  },
  dishPhotoStripSection: {
    marginTop: 12,
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
