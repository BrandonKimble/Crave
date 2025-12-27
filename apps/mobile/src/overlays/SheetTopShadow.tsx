import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { OVERLAY_CORNER_RADIUS } from './overlaySheetStyles';

const SHADOW_HEIGHT = 8;
const MASK_HEIGHT = OVERLAY_CORNER_RADIUS * 2;
const SHADOW_START = 1 - SHADOW_HEIGHT / MASK_HEIGHT;

type SheetTopShadowProps = {
  style?: StyleProp<ViewStyle>;
};

const SheetTopShadow: React.FC<SheetTopShadowProps> = ({ style }) => (
  <MaskedView
    pointerEvents="none"
    style={[styles.container, style]}
    maskElement={<View style={styles.mask} />}
  >
    <LinearGradient
      colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.24)']}
      locations={[0, SHADOW_START, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={StyleSheet.absoluteFillObject}
    />
  </MaskedView>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -MASK_HEIGHT,
    height: MASK_HEIGHT,
    zIndex: 10,
  },
  mask: {
    flex: 1,
    backgroundColor: '#000000',
    borderBottomLeftRadius: OVERLAY_CORNER_RADIUS,
    borderBottomRightRadius: OVERLAY_CORNER_RADIUS,
  },
});

export default SheetTopShadow;
