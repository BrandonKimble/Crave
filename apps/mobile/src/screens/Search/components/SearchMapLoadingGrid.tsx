import React from 'react';
import Reanimated from 'react-native-reanimated';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';

import styles from '../styles';

const MAP_GRID_MINOR_SIZE = 32;
const MAP_GRID_MAJOR_SIZE = 128;
const MAP_GRID_MINOR_STROKE = 'rgba(15, 23, 42, 0.05)';
const MAP_GRID_MAJOR_STROKE = 'rgba(15, 23, 42, 0.08)';

type SearchMapLoadingGridProps = {
  mapLoadingAnimatedStyle: React.ComponentProps<typeof Reanimated.View>['style'];
};

const SearchMapLoadingGrid = ({ mapLoadingAnimatedStyle }: SearchMapLoadingGridProps) => {
  return (
    <Reanimated.View pointerEvents="none" style={[styles.mapLoadingGrid, mapLoadingAnimatedStyle]}>
      <Svg width="100%" height="100%" style={styles.mapLoadingGridSvg}>
        <Defs>
          <Pattern
            id="map-grid-minor"
            width={MAP_GRID_MINOR_SIZE}
            height={MAP_GRID_MINOR_SIZE}
            patternUnits="userSpaceOnUse"
          >
            <Path
              d={`M ${MAP_GRID_MINOR_SIZE} 0 L 0 0 0 ${MAP_GRID_MINOR_SIZE}`}
              fill="none"
              stroke={MAP_GRID_MINOR_STROKE}
              strokeWidth={1}
            />
          </Pattern>
          <Pattern
            id="map-grid-major"
            width={MAP_GRID_MAJOR_SIZE}
            height={MAP_GRID_MAJOR_SIZE}
            patternUnits="userSpaceOnUse"
          >
            <Path
              d={`M ${MAP_GRID_MAJOR_SIZE} 0 L 0 0 0 ${MAP_GRID_MAJOR_SIZE}`}
              fill="none"
              stroke={MAP_GRID_MAJOR_STROKE}
              strokeWidth={1}
            />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#map-grid-minor)" />
        <Rect width="100%" height="100%" fill="url(#map-grid-major)" />
      </Svg>
    </Reanimated.View>
  );
};

export default React.memo(SearchMapLoadingGrid);
