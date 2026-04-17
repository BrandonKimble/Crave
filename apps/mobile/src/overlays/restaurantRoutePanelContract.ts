import type { AnimatedStyle as ReanimatedAnimatedStyle } from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

import type { OperatingStatus } from '@crave-search/shared';

import { getPriceRangeLabel } from '../constants/pricing';
import type { FoodResult, RestaurantResult } from '../types';
import type { RestaurantPanelSnapshotNativePayload } from './RestaurantPanelSnapshotNativeView';

export type RestaurantOverlayData = {
  restaurant: RestaurantResult;
  dishes: FoodResult[];
  queryLabel: string;
  isFavorite: boolean;
  isLoading?: boolean;
};

type AnimatedStyle = ReanimatedAnimatedStyle<ViewStyle>;

export type RestaurantRoutePanelContract = {
  snapshotPayload: RestaurantPanelSnapshotNativePayload;
  onRequestClose: () => void;
  onToggleFavorite: (id: string) => void;
};

export type RestaurantRoutePanelDraft = {
  snapshotPayload: RestaurantPanelSnapshotNativePayload;
  onToggleFavorite: (id: string) => void;
};

export type RestaurantRoutePanelHostConfig = {
  shouldFreezeContent?: boolean;
  interactionEnabled?: boolean;
  containerStyle?: AnimatedStyle;
};

const PHONE_FALLBACK_SEARCH = 'phone';
const WEBSITE_FALLBACK_SEARCH = 'website';
const DAY_LABELS: Array<{ key: string; label: string }> = [
  { key: 'sunday', label: 'Sun' },
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
];

const normalizeWebsiteUrl = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;
};

const formatOperatingStatus = (status?: OperatingStatus | null): string | null => {
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
};

const formatHoursValue = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    const filtered = value.filter((entry) => typeof entry === 'string' && entry.trim().length);
    return filtered.length ? filtered.join(', ') : null;
  }
  if (typeof value === 'string' && value.trim().length) {
    return value.trim();
  }
  return null;
};

const formatHoursRows = (
  hours?: Record<string, unknown> | null
): Array<{ label: string; value: string }> =>
  DAY_LABELS.map((day) => {
    const value = formatHoursValue(hours?.[day.key]);
    return value ? { label: day.label, value } : null;
  }).filter((entry): entry is { label: string; value: string } => Boolean(entry));

const resolveLocationLabel = (address?: string | null): string => {
  if (!address) {
    return 'Location';
  }
  const [street] = address.split(',');
  return street?.trim() || 'Location';
};

const resolveLocationCandidates = (restaurant: RestaurantResult | null) => {
  if (!restaurant) {
    return [];
  }
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
};

const formatMatchedTagLabel = (name: string, mentionCount: number): string => {
  const trimmedName = name.trim();
  if (!trimmedName.length) {
    return '';
  }
  if (!Number.isFinite(mentionCount) || mentionCount <= 0) {
    return trimmedName;
  }
  return `${trimmedName} ${mentionCount}`;
};

export const createRestaurantPanelSnapshotPayload = (
  data: RestaurantOverlayData | null
): RestaurantPanelSnapshotNativePayload => {
  const restaurant = data?.restaurant ?? null;
  const dishes = data?.dishes ?? [];
  const queryLabel = data?.queryLabel ?? '';
  const isFavorite = data?.isFavorite ?? false;
  const isLoading = data?.isLoading ?? !data;
  const restaurantName = restaurant?.restaurantName ?? (isLoading ? 'Loading restaurant...' : '');
  const restaurantId = restaurant?.restaurantId ?? '';

  const locationCandidates = resolveLocationCandidates(restaurant);
  const uniqueWebsiteUrls = Array.from(
    new Set(
      locationCandidates
        .map((location) => normalizeWebsiteUrl(location.websiteUrl))
        .filter((value): value is string => Boolean(value))
    )
  );
  const sharedWebsiteUrl = uniqueWebsiteUrls.length === 1 ? uniqueWebsiteUrls[0] : null;
  const shouldShowPerLocationWebsite = uniqueWebsiteUrls.length > 1;
  const primaryPhone =
    restaurant?.displayLocation?.phoneNumber ?? locationCandidates[0]?.phoneNumber ?? null;
  const primaryAddress =
    restaurant?.displayLocation?.address ??
    restaurant?.address ??
    locationCandidates[0]?.address ??
    (isLoading ? 'Loading details...' : 'Address unavailable');
  const priceLabel = restaurant
    ? (getPriceRangeLabel(restaurant.priceLevel) ??
      restaurant.priceText ??
      restaurant.priceSymbol ??
      null)
    : null;
  const hoursSummary =
    formatOperatingStatus(restaurant?.displayLocation?.operatingStatus) ?? 'Hours unavailable';
  const locationsLabel =
    locationCandidates.length === 1 ? '1 location' : `${locationCandidates.length} locations`;
  const matchedTags = (restaurant?.matchedTags ?? [])
    .map((tag) => formatMatchedTagLabel(tag.name, tag.mentionCount))
    .filter((tag): tag is string => tag.length > 0)
    .slice(0, 3);

  return {
    restaurantId: restaurantId || null,
    restaurantName,
    primaryAddress,
    shareMessage: `${restaurantName} · ${primaryAddress}`,
    restaurantScore: restaurant?.restaurantQualityScore?.toFixed(1) ?? '—',
    queryScoreLabel: queryLabel ? `${queryLabel} score` : 'Query score',
    queryScoreValue: restaurant ? restaurant.contextualScore.toFixed(1) : '—',
    priceLabel: priceLabel ?? '—',
    hoursSummary,
    locationsLabel,
    websiteUrl: sharedWebsiteUrl,
    websiteSearchQuery: `${restaurantName} ${queryLabel} ${WEBSITE_FALLBACK_SEARCH}`.trim(),
    phoneNumber: primaryPhone,
    phoneSearchQuery: `${restaurantName} ${PHONE_FALLBACK_SEARCH}`.trim(),
    isLoading,
    isFavorite,
    favoriteEnabled: Boolean(restaurantId),
    showWebsiteAction: Boolean(sharedWebsiteUrl),
    showCallAction: true,
    matchedTags,
    locations: locationCandidates.map((location) => {
      const statusLabel = formatOperatingStatus(location.operatingStatus);
      const locationWebsite = normalizeWebsiteUrl(location.websiteUrl);
      return {
        title: resolveLocationLabel(location.address ?? null),
        status: statusLabel,
        address: location.address ?? 'Address unavailable',
        phone: location.phoneNumber ?? null,
        hoursRows: formatHoursRows(location.hours ?? null),
        websiteHost:
          shouldShowPerLocationWebsite && locationWebsite
            ? locationWebsite.replace(/^https?:\/\//, '')
            : null,
      };
    }),
    dishes: dishes.map((dish) => ({
      id: dish.connectionId,
      name: dish.foodName,
      score: (dish.contextualScore ?? dish.qualityScore).toFixed(1),
      activity: dish.activityLevel,
      pollCount: String(dish.mentionCount),
      totalVotes: String(dish.totalUpvotes),
    })),
  };
};

export const createRestaurantRoutePanelDraft = ({
  data,
  onToggleFavorite,
}: {
  data: RestaurantOverlayData | null;
  onToggleFavorite: (id: string) => void;
}): RestaurantRoutePanelDraft => ({
  snapshotPayload: createRestaurantPanelSnapshotPayload(data),
  onToggleFavorite,
});

export const createRestaurantRoutePanelContract = ({
  snapshotPayload,
  onRequestClose,
  onToggleFavorite,
}: RestaurantRoutePanelDraft & {
  onRequestClose: () => void;
}): RestaurantRoutePanelContract => ({
  snapshotPayload,
  onRequestClose,
  onToggleFavorite,
});
