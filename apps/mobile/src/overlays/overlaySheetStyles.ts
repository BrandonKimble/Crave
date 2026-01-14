import { StyleSheet } from 'react-native';
import { CONTROL_HEIGHT } from '../screens/Search/constants/ui';
import { OVERLAY_SHEET_SHADOW_SHELL } from '../constants/shadows';

export const OVERLAY_HORIZONTAL_PADDING = 12;
export const OVERLAY_CORNER_RADIUS = 22;
export const OVERLAY_HEADER_CLOSE_BUTTON_SIZE = CONTROL_HEIGHT;
export const OVERLAY_STACK_ZINDEX = 10;
export const OVERLAY_GRAB_HANDLE_WIDTH = 40;
export const OVERLAY_GRAB_HANDLE_HEIGHT = 3.25;
export const OVERLAY_GRAB_HANDLE_RADIUS = 2;
export const OVERLAY_GRAB_HANDLE_PADDING_TOP = 8;

export const OVERLAY_HEADER_PADDING_BOTTOM = 10;
export const OVERLAY_HEADER_ROW_MARGIN_TOP = 7;
export const OVERLAY_HEADER_ROW_SPACED_MARGIN_BOTTOM = 8;

export const OVERLAY_TAB_HEADER_HEIGHT =
  OVERLAY_GRAB_HANDLE_PADDING_TOP +
  OVERLAY_GRAB_HANDLE_HEIGHT +
  OVERLAY_HEADER_ROW_MARGIN_TOP +
  OVERLAY_HEADER_CLOSE_BUTTON_SIZE +
  OVERLAY_HEADER_ROW_SPACED_MARGIN_BOTTOM +
  OVERLAY_HEADER_PADDING_BOTTOM;

export const overlaySheetStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: OVERLAY_STACK_ZINDEX,
    backgroundColor: 'transparent',
  },
  surface: {
    flex: 1,
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  contentSurfaceWhite: {
    backgroundColor: '#ffffff',
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
  headerDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 0,
    backgroundColor: 'transparent',
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
