import React from 'react';
import {
  StyleSheet,
  type StyleProp,
  type View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, G, Mask, Rect } from 'react-native-svg';
import Reanimated, { type AnimatedStyle } from 'react-native-reanimated';

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
  renderWhenEmpty?: boolean;
  /**
   * THE POSITIONING MODEL, NAMED (F884, 2026-08-03).
   *
   * `true` (default) — the plate ABSOLUTE-FILLS its parent.
   * `false`          — the plate is an absolutely-positioned top-left box and `style` MUST
   *                    carry its geometry (left/width/height, or equivalent).
   *
   * This used to be INFERRED FROM `style`'s TRUTHINESS: with no style the component filled
   * the parent, with ANY style it silently became a top-left box with NO width or height.
   * So a caller passing a purely decorative `{ opacity: 0.5 }` got an invisible zero-size
   * plate, with nothing in the types or the name to warn them — the only working callers
   * worked because they all happened to pass left/width/height. The branch is a decision
   * now, not an accident of what else you wanted to style.
   */
  fill?: boolean;
  style?: StyleProp<AnimatedStyle<ViewStyle>>;
} & Pick<ViewProps, 'pointerEvents'>;

const MaskedHoleOverlay = React.forwardRef<View, MaskedHoleOverlayProps>(
  (
    {
      holes,
      backgroundColor = '#ffffff',
      opacity = 1,
      renderWhenEmpty = false,
      fill = true,
      style,
      pointerEvents,
    },
    ref
  ) => {
    // Collision-free per-instance id (Math.random's 6 base-36 chars were birthday-bounded — two
    // concurrent surfaces could share an id and one plate would render the other's holes).
    const maskId = `masked-hole-overlay-mask-${React.useId().replace(/:/g, '')}`;

    const containerStyle = fill
      ? [StyleSheet.absoluteFillObject, style]
      : [overlayStyles.absoluteTopLeft, style];

    if (!holes.length) {
      if (!renderWhenEmpty) {
        return null;
      }
      return (
        <Reanimated.View
          ref={ref}
          pointerEvents={pointerEvents ?? 'none'}
          style={[containerStyle, { backgroundColor, opacity }]}
        />
      );
    }

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
