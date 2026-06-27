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
    backgroundColor: 'transparent',
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
