import React from 'react';
import { Linking, Share, StyleSheet, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import RestaurantPanelSnapshotNativeView, {
  type RestaurantPanelSnapshotActionPayload,
} from './RestaurantPanelSnapshotNativeView';
import type {
  RestaurantOverlayData,
  RestaurantRoutePanelContract,
} from './restaurantRoutePanelContract';

export type RestaurantOverlaySurfaceModel = {
  contentComponent: React.ReactNode;
  contentContainerStyle: {
    paddingBottom: number;
  };
  backgroundComponent: React.ReactNode;
};

type UseRestaurantOverlayPanelSurfaceRuntimeArgs = {
  snapshotPayload: RestaurantOverlayData;
  shouldFreezeContent?: boolean;
  onRequestClose: RestaurantRoutePanelContract['onRequestClose'];
  onToggleFavorite: RestaurantRoutePanelContract['onToggleFavorite'];
};

export const useRestaurantOverlayPanelSurfaceRuntime = ({
  snapshotPayload,
  shouldFreezeContent = false,
  onRequestClose,
  onToggleFavorite,
}: UseRestaurantOverlayPanelSurfaceRuntimeArgs): RestaurantOverlaySurfaceModel => {
  const insets = useSafeAreaInsets();
  const visibleSnapshotPayloadRef = React.useRef(snapshotPayload);
  const incomingRestaurantId = snapshotPayload.restaurantId;
  const visibleSnapshotRestaurantId = visibleSnapshotPayloadRef.current?.restaurantId ?? null;

  if (
    !shouldFreezeContent ||
    visibleSnapshotPayloadRef.current == null ||
    (incomingRestaurantId != null && incomingRestaurantId !== visibleSnapshotRestaurantId)
  ) {
    visibleSnapshotPayloadRef.current = snapshotPayload;
  }

  const nativeSnapshotPayload = shouldFreezeContent
    ? visibleSnapshotPayloadRef.current ?? snapshotPayload
    : snapshotPayload;
  const isLoading = nativeSnapshotPayload.isLoading;

  const handleNativeAction = React.useCallback(
    (action: RestaurantPanelSnapshotActionPayload) => {
      switch (action.kind) {
        case 'close':
          onRequestClose();
          break;
        case 'favorite':
          if (action.restaurantId) {
            onToggleFavorite(action.restaurantId);
          }
          break;
        case 'share':
          if (action.shareMessage) {
            void Share.share({ message: action.shareMessage }).catch(() => {
              // no-op
            });
          }
          break;
        case 'website':
          if (action.websiteUrl) {
            void Linking.openURL(action.websiteUrl);
            break;
          }
          if (action.websiteSearchQuery) {
            void Linking.openURL(
              `https://www.google.com/search?q=${encodeURIComponent(action.websiteSearchQuery)}`
            );
          }
          break;
        case 'call':
          if (action.phoneNumber) {
            void Linking.openURL(`tel:${action.phoneNumber}`);
            break;
          }
          if (action.phoneSearchQuery) {
            void Linking.openURL(
              `https://www.google.com/search?q=${encodeURIComponent(action.phoneSearchQuery)}`
            );
          }
          break;
      }
    },
    [onRequestClose, onToggleFavorite]
  );

  const backgroundComponent = React.useMemo(
    () => (isLoading ? <View style={styles.loadingBackground} /> : <FrostedGlassBackground />),
    [isLoading]
  );
  const contentComponent = React.useMemo(
    () => (
      <RestaurantPanelSnapshotNativeView
        payload={nativeSnapshotPayload}
        onAction={handleNativeAction}
        style={styles.nativeContentHost}
      />
    ),
    [handleNativeAction, nativeSnapshotPayload]
  );
  const contentBottomPadding = Math.max(insets.bottom + 48, 72);

  return React.useMemo(
    () => ({
      contentComponent,
      contentContainerStyle: {
        paddingBottom: contentBottomPadding,
      },
      backgroundComponent,
    }),
    [backgroundComponent, contentBottomPadding, contentComponent]
  );
};

const styles = StyleSheet.create({
  nativeContentHost: {
    width: '100%',
  },
  loadingBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
  },
});
