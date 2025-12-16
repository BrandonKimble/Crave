import React from 'react';
import { StyleSheet, type View, type ViewProps, type ViewStyle } from 'react-native';
import Svg, { Defs, G, Mask, Rect } from 'react-native-svg';
import Reanimated from 'react-native-reanimated';

type MaskedHole = {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
};

type MaskedHoleOverlayProps = {
  holes: MaskedHole[];
  backgroundColor?: string;
  opacity?: number;
  style?: Reanimated.AnimatedStyleProp<ViewStyle>;
} & Pick<ViewProps, 'pointerEvents'>;

const MaskedHoleOverlay = React.forwardRef<View, MaskedHoleOverlayProps>(
  ({ holes, backgroundColor = '#ffffff', opacity = 1, style, pointerEvents }, ref) => {
    const maskIdRef = React.useRef<string>(
      `masked-hole-overlay-mask-${Math.random().toString(36).slice(2, 8)}`
    );
    const maskId = maskIdRef.current;

    if (!holes.length) {
      return null;
    }

    const containerStyle = style
      ? [overlayStyles.absoluteTopLeft, style]
      : StyleSheet.absoluteFillObject;

    return (
      <Reanimated.View ref={ref} pointerEvents={pointerEvents ?? 'none'} style={containerStyle}>
        <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
          <Defs>
            <Mask
              id={maskId}
              x="0"
              y="0"
              width="100%"
              height="100%"
              maskUnits="userSpaceOnUse"
              maskContentUnits="userSpaceOnUse"
            >
              <Rect x={0} y={0} width="100%" height="100%" fill="white" />
              <G>
                {holes.map((hole, index) => (
                  <Rect
                    key={index}
                    x={hole.x}
                    y={hole.y}
                    width={hole.width}
                    height={hole.height}
                    rx={hole.borderRadius ?? 0}
                    ry={hole.borderRadius ?? 0}
                    fill="black"
                  />
                ))}
              </G>
            </Mask>
          </Defs>
          <Rect
            x={0}
            y={0}
            width="100%"
            height="100%"
            fill={backgroundColor}
            opacity={opacity}
            mask={`url(#${maskId})`}
          />
        </Svg>
      </Reanimated.View>
    );
  }
);

export type { MaskedHole };
export default MaskedHoleOverlay;

const overlayStyles = StyleSheet.create({
  absoluteTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
