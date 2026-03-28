import React from 'react';
import { PixelRatio, StyleSheet, View, useWindowDimensions } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';

import { FrostedGlassBackground } from '../../../components/FrostedGlassBackground';
import { LINE_HEIGHTS } from '../../../constants/typography';
import { OVERLAY_CORNER_RADIUS } from '../../../overlays/overlaySheetStyles';
import { NAV_BOTTOM_PADDING, NAV_TOP_PADDING } from '../constants/search';

const ESTIMATED_NAV_ICON_SIZE = 24;
const ESTIMATED_NAV_ICON_LABEL_GAP = 2;
const NAV_BAR_SILHOUETTE_EXTRA_TOP = OVERLAY_CORNER_RADIUS + 2;
const NAV_BAR_SILHOUETTE_SOLID_BG = 'rgba(248, 251, 255, 0.94)';

type NavBarSilhouetteBackgroundProps = {
  bottomInset: number;
  disableBlur: boolean;
};

const NavBarSilhouetteBackground = ({
  bottomInset,
  disableBlur,
}: NavBarSilhouetteBackgroundProps) => {
  const { width: windowWidth } = useWindowDimensions();
  const estimatedBodyHeight = PixelRatio.roundToNearestPixel(
    NAV_TOP_PADDING +
      ESTIMATED_NAV_ICON_SIZE +
      ESTIMATED_NAV_ICON_LABEL_GAP +
      LINE_HEIGHTS.body +
      bottomInset +
      NAV_BOTTOM_PADDING
  );
  const bodyTop = NAV_BAR_SILHOUETTE_EXTRA_TOP;
  const fullHeight = estimatedBodyHeight + bodyTop;
  const cutoutWidth = Math.max(windowWidth, 0);
  const cutoutHeight = bodyTop + OVERLAY_CORNER_RADIUS;
  const cutoutY = bodyTop - cutoutHeight;
  const maskId = 'nav-bar-silhouette-mask';
  const maskElement = (
    <Svg width={windowWidth} height={fullHeight} style={styles.fill}>
      <Defs>
        <Mask id={maskId}>
          <Rect x={0} y={0} width={windowWidth} height={fullHeight} fill="#ffffff" />
          <Rect
            x={0}
            y={cutoutY}
            width={cutoutWidth}
            height={cutoutHeight}
            rx={OVERLAY_CORNER_RADIUS}
            ry={OVERLAY_CORNER_RADIUS}
            fill="#000000"
          />
        </Mask>
      </Defs>
      <Rect
        x={0}
        y={0}
        width={windowWidth}
        height={fullHeight}
        fill="#ffffff"
        mask={`url(#${maskId})`}
      />
    </Svg>
  );

  return (
    <View pointerEvents="none" style={[styles.container, { top: -bodyTop, height: fullHeight }]}>
      <MaskedView style={styles.fill} maskElement={maskElement}>
        {disableBlur ? (
          <View style={[styles.fill, styles.solidBackground]} />
        ) : (
          <FrostedGlassBackground />
        )}
      </MaskedView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'visible',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  solidBackground: {
    backgroundColor: NAV_BAR_SILHOUETTE_SOLID_BG,
  },
});

export { NAV_BAR_SILHOUETTE_EXTRA_TOP };
export default React.memo(NavBarSilhouetteBackground);
