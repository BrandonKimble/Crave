import { StyleSheet } from 'react-native';
import { OVERLAY_SHEET_SHADOW_SHELL } from '../constants/shadows';
import {
  OVERLAY_CORNER_RADIUS,
  OVERLAY_GRAB_HANDLE_HEIGHT,
  OVERLAY_GRAB_HANDLE_PADDING_TOP,
  OVERLAY_GRAB_HANDLE_RADIUS,
  OVERLAY_GRAB_HANDLE_WIDTH,
  OVERLAY_HEADER_CLOSE_BUTTON_SIZE,
  OVERLAY_HEADER_PADDING_BOTTOM,
  OVERLAY_HEADER_ROW_MARGIN_TOP,
  OVERLAY_HEADER_ROW_SPACED_MARGIN_BOTTOM,
  OVERLAY_HORIZONTAL_PADDING,
  OVERLAY_TAB_HEADER_HEIGHT,
} from './overlay-chrome-metrics';

// L1: the chrome-row metric constants live RN-free in overlay-chrome-metrics.ts (the
// computed chrome geometry + its jest contracts consume them there); re-exported here
// so style consumers keep their import path.
export * from './overlay-chrome-metrics';
// Route overlay layer order: search chrome < dim scrim < sheet < bottom nav.
export const OVERLAY_CHROME_ZINDEX = 10;
export const OVERLAY_BACKDROP_SCRIM_ZINDEX = 80;
export const OVERLAY_STACK_ZINDEX = 90;
export const OVERLAY_NAV_SILHOUETTE_ZINDEX = 120;

export const overlaySheetStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: OVERLAY_STACK_ZINDEX,
    elevation: OVERLAY_STACK_ZINDEX,
    backgroundColor: 'transparent',
  },
  surface: {
    flex: 1,
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  shadowShell: {
    flex: 1,
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS,
    ...OVERLAY_SHEET_SHADOW_SHELL,
  },
  shadowShellAndroid: {
    backgroundColor: 'rgba(255, 255, 255, 0.001)',
  },
  header: {
    backgroundColor: '#ffffff',
    paddingTop: 0,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    paddingBottom: OVERLAY_HEADER_PADDING_BOTTOM,
    position: 'relative',
    // Clip the white cutout plate to the header box (canonical: the result header does this via
    // `resultsHeaderSurface`) so its bottom overhang can't extend past the header / scroll divider.
    overflow: 'hidden',
  },
  tabHeader: {
    height: OVERLAY_TAB_HEADER_HEIGHT,
  },
  headerTransparent: {
    backgroundColor: 'transparent',
  },
  grabHandleWrapper: {
    alignItems: 'center',
    paddingTop: OVERLAY_GRAB_HANDLE_PADDING_TOP,
    paddingBottom: 0,
    marginTop: 0,
    marginBottom: 0,
    backgroundColor: 'transparent',
  },
  grabHandle: {
    width: OVERLAY_GRAB_HANDLE_WIDTH,
    height: OVERLAY_GRAB_HANDLE_HEIGHT,
    borderRadius: OVERLAY_GRAB_HANDLE_RADIUS,
    backgroundColor: '#cbd5e1',
  },
  grabHandleCutout: {
    backgroundColor: 'transparent',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: OVERLAY_HEADER_ROW_MARGIN_TOP,
  },
  headerRowSpaced: {
    marginBottom: OVERLAY_HEADER_ROW_SPACED_MARGIN_BOTTOM,
  },
  closeButton: {
    marginRight: 0,
  },
  closeIcon: {
    width: OVERLAY_HEADER_CLOSE_BUTTON_SIZE,
    height: OVERLAY_HEADER_CLOSE_BUTTON_SIZE,
    borderRadius: OVERLAY_HEADER_CLOSE_BUTTON_SIZE / 2,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
