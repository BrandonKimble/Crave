import { StyleSheet } from 'react-native';

import { overlaySheetStyles } from './overlaySheetStyles';

export const bottomSheetSceneStackHostStyles = StyleSheet.create({
  contentHost: {
    flex: 1,
    position: 'relative',
  },
  fixedHeader: {
    zIndex: 3,
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
  transparentFlashListSurface: {
    backgroundColor: 'transparent',
  },
});
