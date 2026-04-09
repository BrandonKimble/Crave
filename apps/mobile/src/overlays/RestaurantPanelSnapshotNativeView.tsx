import React from 'react';
import {
  type NativeSyntheticEvent,
  requireNativeComponent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type RestaurantPanelSnapshotAction = 'close' | 'favorite' | 'share' | 'website' | 'call';

export type RestaurantPanelSnapshotActionPayload = {
  kind: RestaurantPanelSnapshotAction;
  restaurantId: string | null;
  shareMessage: string | null;
  websiteUrl: string | null;
  websiteSearchQuery: string | null;
  phoneNumber: string | null;
  phoneSearchQuery: string | null;
};

export type RestaurantPanelSnapshotNativePayload = {
  restaurantId: string | null;
  restaurantName: string;
  primaryAddress: string;
  shareMessage: string | null;
  restaurantScore: string;
  queryScoreLabel: string;
  queryScoreValue: string;
  priceLabel: string;
  hoursSummary: string;
  locationsLabel: string;
  websiteUrl: string | null;
  websiteSearchQuery: string | null;
  phoneNumber: string | null;
  phoneSearchQuery: string | null;
  isLoading: boolean;
  isFavorite: boolean;
  favoriteEnabled: boolean;
  showWebsiteAction: boolean;
  showCallAction: boolean;
  locations: Array<{
    title: string;
    status: string | null;
    address: string;
    phone: string | null;
    hoursRows: Array<{ label: string; value: string }>;
    websiteHost: string | null;
  }>;
  dishes: Array<{
    id: string;
    name: string;
    score: string;
    activity: string;
    pollCount: string;
    totalVotes: string;
  }>;
};

type NativeProps = {
  snapshot: RestaurantPanelSnapshotNativePayload;
  style?: StyleProp<ViewStyle>;
  onAction?: (event: NativeSyntheticEvent<RestaurantPanelSnapshotActionPayload>) => void;
};

const NativeRestaurantPanelSnapshotView = requireNativeComponent<NativeProps>(
  'CraveRestaurantPanelSnapshotView'
);

const normalizeOptionalString = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

type RestaurantPanelSnapshotNativeViewProps = {
  payload: RestaurantPanelSnapshotNativePayload;
  style?: StyleProp<ViewStyle>;
  onAction?: (action: RestaurantPanelSnapshotActionPayload) => void;
};

const RestaurantPanelSnapshotNativeView = ({
  payload,
  style,
  onAction,
}: RestaurantPanelSnapshotNativeViewProps) => {
  const handleAction = React.useCallback(
    (event: NativeSyntheticEvent<RestaurantPanelSnapshotActionPayload>) => {
      const payload = event.nativeEvent;
      onAction?.({
        kind: payload.kind,
        restaurantId: normalizeOptionalString(payload.restaurantId),
        shareMessage: normalizeOptionalString(payload.shareMessage),
        websiteUrl: normalizeOptionalString(payload.websiteUrl),
        websiteSearchQuery: normalizeOptionalString(payload.websiteSearchQuery),
        phoneNumber: normalizeOptionalString(payload.phoneNumber),
        phoneSearchQuery: normalizeOptionalString(payload.phoneSearchQuery),
      });
    },
    [onAction]
  );
  return (
    <NativeRestaurantPanelSnapshotView
      snapshot={payload}
      style={style}
      onAction={onAction ? handleAction : undefined}
    />
  );
};

export default React.memo(RestaurantPanelSnapshotNativeView);
