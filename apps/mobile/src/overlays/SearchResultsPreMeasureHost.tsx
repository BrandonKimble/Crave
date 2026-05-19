import React from 'react';
import { StyleSheet, View } from 'react-native';

type Listener = () => void;

const listeners = new Set<Listener>();
let preMeasureOverlay: React.ReactNode = null;

export const syncSearchResultsPreMeasureOverlay = (nextOverlay: React.ReactNode): void => {
  if (Object.is(preMeasureOverlay, nextOverlay)) {
    return;
  }

  preMeasureOverlay = nextOverlay;
  listeners.forEach((listener) => {
    listener();
  });
};

const subscribeSearchResultsPreMeasureOverlay = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSearchResultsPreMeasureOverlaySnapshot = (): React.ReactNode => preMeasureOverlay;

export const SearchResultsExternalPreMeasureHost = React.memo(() => {
  const overlay = React.useSyncExternalStore(
    subscribeSearchResultsPreMeasureOverlay,
    getSearchResultsPreMeasureOverlaySnapshot,
    getSearchResultsPreMeasureOverlaySnapshot
  );

  if (overlay == null) {
    return null;
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {overlay}
    </View>
  );
});

SearchResultsExternalPreMeasureHost.displayName = 'SearchResultsExternalPreMeasureHost';
