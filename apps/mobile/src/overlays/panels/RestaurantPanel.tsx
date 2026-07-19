import React from 'react';
import {
  Dimensions,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  type AnimatedStyle as ReanimatedAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import type { OperatingStatus } from '@crave-search/shared';
import { Text } from '../../components';
import { showShareModal } from '../../components/share-modal-store';
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
import { CutoutSkeletonShape, SceneLoadingSurface } from '../../components/skeletons';
import { getPriceRangeLabel } from '../../constants/pricing';
import { calculateSnapPoints } from '../sheetUtils';
import type { OverlayContentSpec } from '../types';
import {
  registerPersistentHeaderDescriptor,
  type PersistentHeaderExtrasProps,
} from '../../navigation/runtime/app-route-persistent-header-registry';
import { registerHeaderCloseAction } from '../../navigation/runtime/header-nav-action-registry';
import {
  getRestaurantHeaderLiveState,
  useRestaurantHeaderLiveState,
} from '../restaurant-header-live-state';
import { openPostPhotosFunnel } from '../PostPhotosFunnelHost';
import CraveScoreText from '../../screens/Search/components/CraveScoreText';
import { RestaurantHoursCard } from '../../features/restaurant-hours/RestaurantHoursCard';
import {
  RestaurantMentionsView,
  RestaurantOverviewMentions,
  RestaurantPhotosView,
  RestaurantSavedNote,
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
// Leg 2 (geo-demand rebuild §7): the profile carries ALL locations, distance-sorted to the
// focus target (the tapped/selected location = displayLocation); the nearest few render
// inline and the tail collapses behind an "N more locations" expander.
const NEARBY_LOCATION_ROW_COUNT = 3;
const APPROX_METERS_PER_LAT_DEGREE = 111_320;

const approximateDistanceMeters = (
  first: { lat: number; lng: number },
  second: { lat: number; lng: number }
): number => {
  const averageLatRadians = (((first.lat + second.lat) / 2) * Math.PI) / 180;
  const metersPerLngDegree = APPROX_METERS_PER_LAT_DEGREE * Math.cos(averageLatRadians);
  const dx = (first.lng - second.lng) * metersPerLngDegree;
  const dy = (first.lat - second.lat) * APPROX_METERS_PER_LAT_DEGREE;
  return Math.sqrt(dx * dx + dy * dy);
};
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
  // Collapsed-tail expander state (render-time keyed by restaurantId — the useEffect reset
  // pattern is dead code in these spec hooks, CLAUDE.md).
  const [locationsTailState, setLocationsTailState] = React.useState<{
    restaurantId: string;
    expanded: boolean;
  }>({ restaurantId: '', expanded: false });

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
    ? // Prefer the REAL Google price range ("$10–20", revamp) over the fabricated
      // priceLevel bucket, then the level bucket, then the word/symbol.
      (restaurant.priceRangeText ??
      getPriceRangeLabel(restaurant.priceLevel) ??
      restaurant.priceText ??
      restaurant.priceSymbol ??
      null)
    : null;
  const categoryLabel = restaurant?.categoryLabel ?? null;
  // Score evidence / receipts (product doc §"Score evidence"): the rating is auditable, not
  // a black box — "Based on N mentions · M votes" near the rating.
  const scoreEvidence = React.useMemo(() => {
    if (!restaurant) {
      return null;
    }
    const mentions = restaurant.mentionCount ?? 0;
    const votes = restaurant.totalUpvotes ?? 0;
    if (mentions <= 0 && votes <= 0) {
      return null;
    }
    const parts: string[] = [];
    if (mentions > 0) {
      parts.push(`${mentions} ${mentions === 1 ? 'mention' : 'mentions'}`);
    }
    if (votes > 0) {
      parts.push(`${votes} ${votes === 1 ? 'vote' : 'votes'}`);
    }
    return `Based on ${parts.join(' · ')}`;
  }, [restaurant]);
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

  // The profile's focus target: the tapped/selected location — the seed/hydration snapshot
  // stamps it into displayLocation (profile-panel-hydration-snapshot-runtime).
  const focusCoordinate = React.useMemo(() => {
    const display = restaurant?.displayLocation;
    return display && typeof display.latitude === 'number' && typeof display.longitude === 'number'
      ? { lat: display.latitude, lng: display.longitude }
      : null;
  }, [restaurant?.displayLocation]);

  // ALL locations, distance-sorted to the focus target; without a coordinate context the
  // order degrades to isPrimary-then-address (never crashes on missing geometry).
  const sortedLocations = React.useMemo<RestaurantPanelLocation[]>(() => {
    if (locationCandidates.length <= 1) {
      return locationCandidates;
    }
    const fallbackCompare = (a: RestaurantPanelLocation, b: RestaurantPanelLocation): number => {
      const primaryDelta = Number(b.isPrimary === true) - Number(a.isPrimary === true);
      if (primaryDelta !== 0) {
        return primaryDelta;
      }
      return (a.address ?? '').localeCompare(b.address ?? '');
    };
    if (!focusCoordinate) {
      return [...locationCandidates].sort(fallbackCompare);
    }
    const distanceTo = (location: RestaurantPanelLocation): number =>
      typeof location.latitude === 'number' && typeof location.longitude === 'number'
        ? approximateDistanceMeters(focusCoordinate, {
            lat: location.latitude,
            lng: location.longitude,
          })
        : Number.POSITIVE_INFINITY;
    return [...locationCandidates].sort((a, b) => {
      const delta = distanceTo(a) - distanceTo(b);
      return delta !== 0 ? delta : fallbackCompare(a, b);
    });
  }, [focusCoordinate, locationCandidates]);

  const showAllLocations =
    locationsTailState.restaurantId === restaurantId && locationsTailState.expanded;
  const visibleLocations = showAllLocations
    ? sortedLocations
    : sortedLocations.slice(0, NEARBY_LOCATION_ROW_COUNT);
  const collapsedLocationCount = sortedLocations.length - visibleLocations.length;
  const expandLocationsTail = React.useCallback(() => {
    setLocationsTailState({ restaurantId, expanded: true });
  }, [restaurantId]);

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
    restaurant?.displayLocation?.phoneNumber ?? sortedLocations[0]?.phoneNumber ?? null;

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

  // Red-team W2 (§7.2 action chips): Directions opens Apple Maps at the
  // primary location — coords when we have them, else the address, else a
  // name query (same hide-nothing fallback ethos as Website/Call).
  const primaryDirectionsTarget = React.useMemo(() => {
    const candidates = [restaurant?.displayLocation, ...sortedLocations];
    for (const location of candidates) {
      if (location?.latitude != null && location?.longitude != null) {
        return `${location.latitude},${location.longitude}`;
      }
    }
    for (const location of candidates) {
      if (location?.address) {
        return location.address;
      }
    }
    return null;
  }, [restaurant?.displayLocation, sortedLocations]);

  const handleDirectionsPress = React.useCallback(() => {
    if (primaryDirectionsTarget) {
      void Linking.openURL(
        `http://maps.apple.com/?daddr=${encodeURIComponent(primaryDirectionsTarget)}`
      );
      return;
    }
    const query = `${restaurantName} ${queryLabel}`.trim();
    void Linking.openURL(`http://maps.apple.com/?q=${encodeURIComponent(query)}`);
  }, [primaryDirectionsTarget, queryLabel, restaurantName]);

  // The server caps the locations ARRAY (~30 nearest) but the COUNT stays global —
  // prefer locationCount for the label when present.
  const totalLocationCount = restaurant?.locationCount ?? locationCandidates.length;
  const locationsLabel =
    totalLocationCount === 1 ? '1 location' : `${totalLocationCount} locations`;

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
        {/* §8.4 Overview element 1: the viewer's saved note(s) for this place. */}
        <RestaurantSavedNote restaurantId={restaurant.restaurantId} />
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Crave rating</Text>
            <CraveScoreText score={restaurant.craveScore} style={styles.metricValue} />
            {scoreEvidence ? <Text style={styles.scoreEvidence}>{scoreEvidence}</Text> : null}
          </View>
        </View>
        {/* Google-style compact meta line: "Brunch restaurant · $10–20" (revamp). */}
        {categoryLabel || priceLabel ? (
          <Text style={styles.metaLine}>
            {[categoryLabel, priceLabel].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {/* Hours: the Google-style live status + expandable weekly schedule (revamp).
            Reads the immutable structured schedule; status is computed client-side. */}
        <RestaurantHoursCard schedule={restaurant?.displayLocation?.structuredHours} />
        {/* Google-style action pills: a horizontally scrollable row of compact pills —
            each pill hugs its label (no flex squeeze/text wrapping). */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.actionsRow}
          contentContainerStyle={styles.actionsRowContent}
        >
          <Pressable
            style={styles.actionPill}
            onPress={handleDirectionsPress}
            accessibilityRole="button"
            accessibilityLabel="Directions"
            testID="restaurant-directions"
          >
            <Feather name="navigation" size={16} color="#0f172a" />
            <Text style={styles.actionPillText}>Directions</Text>
          </Pressable>
          {sharedWebsiteUrl ? (
            <Pressable style={styles.actionPill} onPress={handleWebsitePress}>
              <Feather name="globe" size={16} color="#0f172a" />
              <Text style={styles.actionPillText}>Website</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.actionPill} onPress={handleCallPress}>
            <Feather name="phone" size={16} color="#0f172a" />
            <Text style={styles.actionPillText}>Call</Text>
          </Pressable>
          {/* W2 (page-registry §7.4): the restaurant-profile add-photo entry. Plain-function
              funnel entry (this is a spec hook — effects/hooks-with-effects are off the
              table here). */}
          <Pressable
            style={styles.actionPill}
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
            <Feather name="camera" size={16} color="#0f172a" />
            <Text style={styles.actionPillText}>Add photo</Text>
          </Pressable>
        </ScrollView>
        {sortedLocations.length > 0 ? (
          <View style={styles.locationsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Locations</Text>
              <Text style={styles.sectionSubtitle}>{locationsLabel}</Text>
            </View>
            {visibleLocations.map((location, index) => {
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
            {collapsedLocationCount > 0 ? (
              <Pressable
                style={[styles.locationCard, styles.locationsTailExpander]}
                onPress={expandLocationsTail}
                accessibilityRole="button"
                accessibilityLabel={`Show ${collapsedLocationCount} more ${
                  collapsedLocationCount === 1 ? 'location' : 'locations'
                }`}
                testID="restaurant-locations-expander"
              >
                <Text style={styles.locationsTailExpanderText}>
                  {collapsedLocationCount} more{' '}
                  {collapsedLocationCount === 1 ? 'location' : 'locations'}
                </Text>
                <Feather name="chevron-down" size={16} color={themeColors.textBody} />
              </Pressable>
            ) : null}
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
    collapsedLocationCount,
    expandedLocations,
    expandLocationsTail,
    formatOperatingStatus,
    formatHoursRows,
    categoryLabel,
    handleCallPress,
    handleWebsitePress,
    isLoading,
    locationsLabel,
    normalizeWebsiteUrl,
    sortedLocations,
    visibleLocations,
    priceLabel,
    queryLabel,
    resolveLocationLabel,
    restaurant?.craveScore,
    restaurant?.displayLocation?.structuredHours,
    restaurant?.restaurantId,
    restaurant?.restaurantName,
    scoreEvidence,
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
          <SceneLoadingSurface rowType="dish" frostBacking />
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
        <SceneLoadingSurface rowType="dish" frostBacking />
      </View>
    ),
    [emptyAreaMinHeight]
  );

  // Frost is the shared page-frame foundation, and the FOUNDATION WHITE LAYER
  // (scene-foundation-spec `bodySurface: 'white'` via SceneBodyFoundationSurface) paints the
  // body-lane white plate for every sheet scene - the panel contributes no extra background
  // material of its own.
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
    return <CutoutSkeletonShape width={150} height={18} />;
  }
  return (
    <Text style={styles.restaurantName} numberOfLines={1} ellipsizeMode="tail">
      {restaurantName}
    </Text>
  );
});
RestaurantPersistentHeaderTitle.displayName = 'RestaurantPersistentHeaderTitle';

// Leg 6 (§4 HeaderNavAction): the bespoke headerCloseButton is DELETED — the persistent header
// host owns the ONE plus↔X control. Restaurant's SESSION close (token-guarded
// closeRestaurantRoute via the header live state) registers as the host's close OVERRIDE; the
// heart + share affordances are per-scene EXTRAS chrome riding the host's transitionProgress
// (the §3.5 seam — they fade in synchronized with the plus→X rotation, starting on press-up).
const RestaurantPersistentHeaderExtras = React.memo(
  ({ transitionProgress }: PersistentHeaderExtrasProps) => {
    const headerState = useRestaurantHeaderLiveState();
    const data = headerState?.data ?? null;
    const restaurant = data?.restaurant ?? null;
    const isFavorite = data?.isFavorite ?? false;
    const restaurantName = restaurant?.restaurantName ?? '';
    const restaurantId = restaurant?.restaurantId ?? '';
    const onToggleFavorite = headerState?.onToggleFavorite;
    const extrasOpacityStyle = useAnimatedStyle(
      () => ({ opacity: transitionProgress.value }),
      [transitionProgress]
    );

    const handleToggleFavorite = React.useCallback(() => {
      if (!restaurantId) {
        return;
      }
      onToggleFavorite?.(restaurantId);
    }, [onToggleFavorite, restaurantId]);

    // W3 universal share modal replaces the ad-hoc OS share sheet (the sheet is
    // still reachable inside the modal as the "Share via…" row).
    const handleShare = React.useCallback(() => {
      if (!restaurantId) {
        return;
      }
      showShareModal({ kind: 'restaurant', id: restaurantId, title: restaurantName });
    }, [restaurantId, restaurantName]);

    return (
      <Animated.View style={[styles.headerActions, extrasOpacityStyle]}>
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
        <Pressable onPress={handleShare} style={styles.headerIconButton} accessibilityLabel="Share">
          <Feather name="share-2" size={18} color="#1f2937" />
        </Pressable>
      </Animated.View>
    );
  }
);
RestaurantPersistentHeaderExtras.displayName = 'RestaurantPersistentHeaderExtras';

registerPersistentHeaderDescriptor('restaurant', {
  Title: RestaurantPersistentHeaderTitle,
  Extras: RestaurantPersistentHeaderExtras,
});

// Restaurant's close is a SESSION verb (token-guarded closeRestaurantRoute), not the canonical
// pop — registered as the host's close override, reading the live state at press time.
registerHeaderCloseAction('restaurant', () => {
  getRestaurantHeaderLiveState()?.onRequestClose();
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
  metaLine: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    color: themeColors.textBody,
    marginTop: 12,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
  },
  scoreEvidence: {
    fontSize: FONT_SIZES.caption,
    lineHeight: LINE_HEIGHTS.caption,
    color: themeColors.textMuted,
    marginTop: 6,
  },
  actionsRow: {
    marginTop: 16,
  },
  actionsRowContent: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
  },
  actionPillText: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
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
  locationsTailExpander: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  locationsTailExpanderText: {
    fontSize: FONT_SIZES.body,
    lineHeight: LINE_HEIGHTS.body,
    fontWeight: '600',
    color: themeColors.textBody,
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
