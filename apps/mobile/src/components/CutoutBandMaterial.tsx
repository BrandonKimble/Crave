import React from 'react';
import { View } from 'react-native';

import MaskedHoleOverlay, { type MaskedHole } from './MaskedHoleOverlay';
import { resolveCutoutBandGeometry } from './cutout-band-geometry';

/**
 * THE cutout-band material — one shared implementation of the infinite-edge
 * illusion (see cutout-band-geometry.ts for the full doctrine + seam math).
 *
 * Renders, inside the caller's relatively-positioned scroll-content box:
 *   · a masked white plate over the CONTENT extent only (the sacred cutouts —
 *     real mask holes punched through to the frost, geometry untouched);
 *   · two plain white flanking panes running a full viewport width past each
 *     content end, overlapping the plate's solid apron by 1px (same color
 *     token) so no hairline seam can ever open.
 *
 * Consumers: ToggleStrip's toggle-row plate and HomePanel's shelf rows. The
 * action-row plate (renderWhenEmpty absolute-fill, no scrolling) and the
 * skeleton cutout system are NOT this mechanism and stay on MaskedHoleOverlay
 * directly.
 *
 * `holes` are in CONTENT coordinates (as measured by onLayout), radius already
 * resolved — the plate offset is applied here.
 */
const CutoutBandMaterial: React.FC<{
  holes: MaskedHole[];
  /** Rightmost material-relevant content x (max hole extent / content width). */
  contentExtent: number;
  /** Measured band viewport width. */
  viewportWidth: number;
  /** Page-content horizontal inset (scrollable inset / overlay padding). */
  edgeInset: number;
  /** Material height (row height + the band's rounding-hairline overshoot). */
  height: number;
  surfaceColor: string;
  /** Layer order within the caller's content box (both consumers use 1). */
  zIndex?: number;
}> = ({ holes, contentExtent, viewportWidth, edgeInset, height, surfaceColor, zIndex }) => {
  const geometry = resolveCutoutBandGeometry({ viewportWidth, edgeInset, contentExtent });
  const plateHoles = React.useMemo(
    () => holes.map((hole) => ({ ...hole, x: hole.x + geometry.holeOffsetX })),
    [holes, geometry.holeOffsetX]
  );
  const paneBaseStyle = {
    position: 'absolute' as const,
    top: 0,
    height,
    backgroundColor: surfaceColor,
    zIndex,
  };
  return (
    <>
      <MaskedHoleOverlay
        // F884: geometry comes from `style` below, not from filling the parent.
        fill={false}
        pointerEvents="none"
        holes={plateHoles}
        backgroundColor={surfaceColor}
        style={{
          position: 'absolute',
          top: 0,
          left: geometry.plateLeft,
          width: geometry.plateWidth,
          height,
          zIndex,
        }}
      />
      <View
        pointerEvents="none"
        testID="cutout-band-pane-left"
        style={[paneBaseStyle, { left: geometry.leftPane.left, width: geometry.leftPane.width }]}
      />
      <View
        pointerEvents="none"
        testID="cutout-band-pane-right"
        style={[paneBaseStyle, { left: geometry.rightPane.left, width: geometry.rightPane.width }]}
      />
    </>
  );
};

export default CutoutBandMaterial;
