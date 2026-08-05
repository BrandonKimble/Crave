import { PIN_MARKER_RENDER_SIZE } from '../constants/search';

/**
 * Overscan applied to the native map surface so markers near the viewport edge
 * don't get clipped mid-fade. Marker rendering + hit-testing are native now (see
 * SearchMapRenderController); this overscan style is still consumed by
 * `search-map.tsx`'s MapView `style` to extend the rendered surface beyond the
 * clipped viewport by ~1 marker radius in each direction.
 */

export const MARKER_VIEW_OVERSCAN_LEFT_PX = Math.max(0, Math.ceil(PIN_MARKER_RENDER_SIZE / 2) + 1);
export const MARKER_VIEW_OVERSCAN_RIGHT_PX = MARKER_VIEW_OVERSCAN_LEFT_PX;
export const MARKER_VIEW_OVERSCAN_TOP_PX = 2;
export const MARKER_VIEW_OVERSCAN_BOTTOM_PX = Math.max(0, Math.ceil(PIN_MARKER_RENDER_SIZE) + 2);

export const MARKER_VIEW_OVERSCAN_STYLE = {
  left: -MARKER_VIEW_OVERSCAN_LEFT_PX,
  right: -MARKER_VIEW_OVERSCAN_RIGHT_PX,
  top: -MARKER_VIEW_OVERSCAN_TOP_PX,
  bottom: -MARKER_VIEW_OVERSCAN_BOTTOM_PX,
};
