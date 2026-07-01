import { StyleSheet } from 'react-native';

import { overlaySheetStyles } from './overlaySheetStyles';

export const bottomSheetSceneStackHostStyles = StyleSheet.create({
  contentHost: {
    flex: 1,
    position: 'relative',
  },
  sceneStackPageBundle: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  sceneStackPageUnderlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    elevation: 0,
  },
  sceneStackPageBackgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    elevation: 1,
  },
  sceneStackPageBodyLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flex: 1,
    overflow: 'hidden',
    zIndex: 2,
    elevation: 2,
  },
  sceneStackPageHeaderLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    elevation: 40,
  },
  sceneStackPageHeaderScrollDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15, 23, 42, 0.14)',
    zIndex: 41,
    elevation: 41,
  },
  sceneStackPageOverlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
  },
  scrollHeaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  singleListLayer: {
    flex: 1,
  },
  listBodySurfaceHost: {
    flex: 1,
    position: 'relative',
  },
  listChromeOverlay: {
    // Fills the body frame (box-none) so list chrome can anchor to top OR bottom and
    // ride with the sheet — e.g. the poll-detail compose chin pinned to the bottom.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  dualListLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  visibleLayer: {
    opacity: 1,
  },
  hiddenLayer: {
    opacity: 0,
  },
  sceneStackSurface: {
    ...overlaySheetStyles.surface,
    // LAYERING CORRECTION (sheet-frost-architecture): the surface must NOT be an opaque-white
    // window — that would (a) make the frost blur white instead of the map and (b) block the
    // toggle-strip + close-button CUTOUTS from seeing through to the frosted-map. The CONSTANT
    // backing is the FROST ALONE (sceneStackSurfaceHoistedBacking = FrostedGlassBackground, which
    // blurs the MAP behind the sheet → the frosted-map). Frosted-glass is opaque-ENOUGH to stop
    // the SHARP-map see-through while still showing the blurred map through the cutouts. The
    // per-scene WHITE PLATES WITH CUTOUTS (backgroundComponent, zIndex 1) own the solid-white areas
    // ABOVE the frost; their holes reveal the constant frosted-map. So the surface stays transparent
    // (inherits overlaySheetStyles.surface 'transparent') — no white fill here.
  },
  // The ONE hoisted CONSTANT backing — the FROST ALONE (a single FrostedGlassBackground blurring the
  // map behind the sheet), mounted once below all content at constant opacity 1.0, NO white fill and
  // NO animated/engine handle. NOTE: removing the prior backgroundColor:'#ffffff' is the layering
  // fix — an opaque white here made the frost blur white and blocked the cutouts from revealing the
  // frosted-map. The frosted blur+tint is the opaque-ENOUGH constant that prevents the sharp-map
  // see-through in the SOLID areas (belt: the per-scene white plates also cover those), while the
  // toggle-strip/close-button cutouts (holes in those plates) keep revealing the blurred map through
  // to here. Absolute-fill; clipped to the sheet's rounded corners by the surface overflow:hidden.
  sceneStackSurfaceHoistedBacking: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    elevation: 0,
  },
  sceneHeaderActive: {},
  sceneHeaderHidden: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  sceneHeaderLayer: {},
  sceneStackBodyLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  sceneStackBodyLayerVisible: {
    elevation: 2,
    opacity: 1,
    zIndex: 2,
  },
  sceneStackBodyLayerHidden: {
    elevation: 0,
    opacity: 0,
    zIndex: 0,
  },
  transparentFlashListSurface: {
    backgroundColor: 'transparent',
  },
});
