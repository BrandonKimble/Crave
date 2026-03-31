import React from 'react';
import { View } from 'react-native';

import { buildMapStyleURL } from '../../../constants/map';
import SearchMapWithMarkerEngine from './SearchMapWithMarkerEngine';
import styles from '../styles';
import { getQualityColorFromScore } from '../utils/quality';

const MAX_FULL_PINS = 30;
const LOD_PIN_TOGGLE_STABLE_MS_MOVING = 190;
const LOD_PIN_TOGGLE_STABLE_MS_IDLE = 0;
const LOD_PIN_OFFSCREEN_TOGGLE_STABLE_MS_MOVING = 120;
const LOD_VISIBLE_CANDIDATE_BUFFER = 16;
const USA_FALLBACK_ZOOM = 3.2;

type SearchMapStageProps = {
  isInitialCameraReady: boolean;
  onProfilerRender: React.ProfilerOnRenderCallback;
  accessToken: string;
} & Omit<
  React.ComponentProps<typeof SearchMapWithMarkerEngine>,
  | 'getQualityColorFromScore'
  | 'maxFullPins'
  | 'lodVisibleCandidateBuffer'
  | 'lodPinToggleStableMsMoving'
  | 'lodPinToggleStableMsIdle'
  | 'lodPinOffscreenToggleStableMsMoving'
  | 'mapZoom'
  | 'disableMarkers'
  | 'styleURL'
>;
type SearchMapStageOwnedProps = {
  mapZoom: number | null;
};

const SearchMapStage = React.memo(
  React.forwardRef<
    React.ElementRef<typeof SearchMapWithMarkerEngine>,
    SearchMapStageProps & SearchMapStageOwnedProps
  >(({ isInitialCameraReady, onProfilerRender, accessToken, mapZoom, ...searchMapProps }, ref) => {
    const styleURL = React.useMemo(() => buildMapStyleURL(accessToken), [accessToken]);

    if (!isInitialCameraReady) {
      return (
        <React.Profiler id="SearchMapPlaceholder" onRender={onProfilerRender}>
          <View pointerEvents="none" style={styles.mapPlaceholder} />
        </React.Profiler>
      );
    }

    return (
      <React.Profiler id="SearchMapTree" onRender={onProfilerRender}>
        <SearchMapWithMarkerEngine
          ref={ref}
          {...searchMapProps}
          styleURL={styleURL}
          mapZoom={mapZoom ?? USA_FALLBACK_ZOOM}
          disableMarkers={false}
          getQualityColorFromScore={getQualityColorFromScore}
          maxFullPins={MAX_FULL_PINS}
          lodVisibleCandidateBuffer={LOD_VISIBLE_CANDIDATE_BUFFER}
          lodPinToggleStableMsMoving={LOD_PIN_TOGGLE_STABLE_MS_MOVING}
          lodPinToggleStableMsIdle={LOD_PIN_TOGGLE_STABLE_MS_IDLE}
          lodPinOffscreenToggleStableMsMoving={LOD_PIN_OFFSCREEN_TOGGLE_STABLE_MS_MOVING}
        />
      </React.Profiler>
    );
  })
);

export default SearchMapStage;
