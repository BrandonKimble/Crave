import React from 'react';
import { Linking, Share, StyleSheet, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FrostedGlassBackground } from '../components/FrostedGlassBackground';
import RestaurantPanelSnapshotNativeView, {
  type RestaurantPanelSnapshotActionPayload,
  type RestaurantPanelSnapshotNativePayload,
} from './RestaurantPanelSnapshotNativeView';
import type { RestaurantRoutePanelContract } from './restaurantRoutePanelContract';

export type RestaurantOverlaySurfaceModel = {
  contentComponent: React.ReactNode;
  contentContainerStyle: {
    paddingBottom: number;
  };
  backgroundComponent: React.ReactNode;
};

type UseRestaurantOverlayPanelSurfaceRuntimeArgs = {
  snapshotPayload: RestaurantPanelSnapshotNativePayload;
  shouldFreezeContent?: boolean;
  onRequestClose: RestaurantRoutePanelContract['onRequestClose'];
  onToggleFavorite: RestaurantRoutePanelContract['onToggleFavorite'];
};

const useStableEvent = <TArgs extends readonly unknown[], TResult>(
  handler: (...args: TArgs) => TResult
): ((...args: TArgs) => TResult) => {
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  return React.useCallback(
    (...args: TArgs) => handlerRef.current(...args),
    []
  );
};

export const useRestaurantOverlayPanelSurfaceRuntime = ({
  snapshotPayload,
  shouldFreezeContent = false,
  onRequestClose,
  onToggleFavorite,
}: UseRestaurantOverlayPanelSurfaceRuntimeArgs): RestaurantOverlaySurfaceModel => {
  const insets = useSafeAreaInsets();
  const visibleSnapshotPayloadRef = React.useRef(snapshotPayload);
  const incomingRestaurantId = snapshotPayload.restaurantId ?? null;
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
  const stableRequestClose = useStableEvent(onRequestClose);
  const stableToggleFavorite = useStableEvent(onToggleFavorite);

  const handleNativeAction = React.useCallback(
    (action: RestaurantPanelSnapshotActionPayload) => {
      switch (action.kind) {
        case 'close':
          stableRequestClose();
          break;
        case 'favorite':
          if (action.restaurantId) {
            stableToggleFavorite(action.restaurantId);
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
    [stableRequestClose, stableToggleFavorite]
  );

  const backgroundComponent = React.useMemo(
    () => (isLoading ? <View style={styles.loadingBackground} /> : <FrostedGlassBackground />),
    [isLoading]
  );
  const contentBottomPadding = Math.max(insets.bottom + 48, 72);
  const contentContainerStyle = React.useMemo(
    () => ({
      paddingBottom: contentBottomPadding,
    }),
    [contentBottomPadding]
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

  return React.useMemo(
    () => ({
      contentComponent,
      contentContainerStyle,
      backgroundComponent,
    }),
    [backgroundComponent, contentComponent, contentContainerStyle]
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
