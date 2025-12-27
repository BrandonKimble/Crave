import { StyleSheet } from 'react-native';

export const OVERLAY_HORIZONTAL_PADDING = 15;
export const OVERLAY_CORNER_RADIUS = 22;
export const OVERLAY_HEADER_CLOSE_BUTTON_SIZE = 30;
export const OVERLAY_STACK_ZINDEX = 10;

export const overlaySheetStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    zIndex: OVERLAY_STACK_ZINDEX,
    backgroundColor: 'transparent',
  },
  surface: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  header: {
    backgroundColor: '#ffffff',
    paddingTop: 0,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    paddingBottom: 10,
    position: 'relative',
  },
  headerTransparent: {
    backgroundColor: 'transparent',
  },
  grabHandleWrapper: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 0,
    marginTop: 0,
    marginBottom: 0,
    backgroundColor: '#ffffff',
  },
  grabHandle: {
    width: 50,
    height: 3.25,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  headerRowSpaced: {
    marginBottom: 8,
  },
  headerDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15, 23, 42, 0.14)',
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
