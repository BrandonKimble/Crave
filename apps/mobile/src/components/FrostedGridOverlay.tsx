import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';

const DEFAULT_GRID_MINOR_SIZE = 32;
const DEFAULT_GRID_MAJOR_SIZE = 128;
const DEFAULT_MINOR_STROKE = 'rgba(31, 41, 55, 0.055)';
const DEFAULT_MAJOR_STROKE = 'rgba(31, 41, 55, 0.095)';

type FrostedGridOverlayProps = {
  style?: StyleProp<ViewStyle>;
  minorSize?: number;
  majorSize?: number;
  minorStroke?: string;
  majorStroke?: string;
};

const FrostedGridOverlay: React.FC<FrostedGridOverlayProps> = ({
  style,
  minorSize = DEFAULT_GRID_MINOR_SIZE,
  majorSize = DEFAULT_GRID_MAJOR_SIZE,
  minorStroke = DEFAULT_MINOR_STROKE,
  majorStroke = DEFAULT_MAJOR_STROKE,
}) => (
  <View pointerEvents="none" style={[styles.container, style]}>
    <Svg width="100%" height="100%" style={styles.svg}>
      <Defs>
        <Pattern
          id="frosted-grid-minor"
          width={minorSize}
          height={minorSize}
          patternUnits="userSpaceOnUse"
        >
          <Path
            d={`M ${minorSize} 0 L 0 0 0 ${minorSize}`}
            fill="none"
            stroke={minorStroke}
            strokeWidth={1}
          />
        </Pattern>
        <Pattern
          id="frosted-grid-major"
          width={majorSize}
          height={majorSize}
          patternUnits="userSpaceOnUse"
        >
          <Path
            d={`M ${majorSize} 0 L 0 0 0 ${majorSize}`}
            fill="none"
            stroke={majorStroke}
            strokeWidth={1}
          />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#frosted-grid-minor)" />
      <Rect width="100%" height="100%" fill="url(#frosted-grid-major)" />
    </Svg>
  </View>
);

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  svg: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default React.memo(FrostedGridOverlay);
