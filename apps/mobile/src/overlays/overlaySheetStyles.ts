import { StyleSheet } from 'react-native';

export const OVERLAY_HORIZONTAL_PADDING = 15;
export const OVERLAY_CORNER_RADIUS = 22;

export const overlaySheetStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS,
    overflow: 'hidden',
  },
  surfaceTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  highlight: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: 120,
    left: -40,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    opacity: 0.25,
    transform: [{ rotate: '35deg' }],
  },
  header: {
    backgroundColor: '#ffffff',
    paddingTop: 0,
    paddingHorizontal: OVERLAY_HORIZONTAL_PADDING,
    paddingBottom: 0,
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
    marginTop: 2,
  },
  headerRowSpaced: {
    marginBottom: 8,
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15, 23, 42, 0.14)',
    marginHorizontal: -OVERLAY_HORIZONTAL_PADDING,
    marginBottom: 0,
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    padding: 8,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 0,
    marginRight: -8,
    borderWidth: 0,
  },
});
