import React from 'react';
import { View } from 'react-native';

import type { SearchMapRenderHostLayerRuntime } from '../runtime/shared/search-map-render-host-layer-runtime-contract';
import styles from '../styles';
import SearchMapWithMarkerEngine from './SearchMapWithMarkerEngine';
export const SearchMapRenderHostLayers = React.memo(
  ({ hostLayerRuntime }: { hostLayerRuntime: SearchMapRenderHostLayerRuntime }) => {
    const { isInitialCameraReady, markerEngineRef, engineInputs, hostConfig, presentationProps } =
      hostLayerRuntime;
    // F1618: read the callback off `hostConfig` — its one owner — instead of a duplicate
    // top-level field that plumbed the identical value into the same composite twice.
    const { onProfilerRender } = hostConfig;

    if (!onProfilerRender) {
      return (
        <View style={styles.container}>
          {!isInitialCameraReady ? (
            <View pointerEvents="none" style={styles.mapPlaceholder} />
          ) : (
            <SearchMapWithMarkerEngine
              ref={markerEngineRef}
              {...engineInputs}
              {...hostConfig}
              {...presentationProps}
            />
          )}
        </View>
      );
    }

    return (
      <React.Profiler id="SearchScreen" onRender={onProfilerRender}>
        <View style={styles.container}>
          {!isInitialCameraReady ? (
            <React.Profiler id="SearchMapPlaceholder" onRender={onProfilerRender}>
              <View pointerEvents="none" style={styles.mapPlaceholder} />
            </React.Profiler>
          ) : (
            <React.Profiler id="SearchMapTree" onRender={onProfilerRender}>
              <SearchMapWithMarkerEngine
                ref={markerEngineRef}
                {...engineInputs}
                {...hostConfig}
                {...presentationProps}
              />
            </React.Profiler>
          )}
        </View>
      </React.Profiler>
    );
  }
);
