import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BottomSheetNativeHost, type BottomSheetNativeHostProps } from './BottomSheetNativeHost';
import { overlaySheetStyles } from './overlaySheetStyles';

type BottomSheetHostShellProps = {
  hostProps: Omit<BottomSheetNativeHostProps, 'children'>;
  content: React.ReactNode;
  backgroundComponent?: React.ReactNode;
  headerComponent?: React.ReactNode;
  overlayComponent?: React.ReactNode;
  onHeaderLayout?: ((event: unknown) => void) | undefined;
  surfaceStyle?: StyleProp<ViewStyle>;
  shadowStyle?: StyleProp<ViewStyle>;
  contentSurfaceStyle?: StyleProp<ViewStyle>;
};

export const BottomSheetHostShell = ({
  hostProps,
  content,
  backgroundComponent,
  headerComponent,
  overlayComponent,
  onHeaderLayout,
  surfaceStyle,
  shadowStyle,
  contentSurfaceStyle,
}: BottomSheetHostShellProps): React.ReactElement => {
  const resolvedSurfaceStyle = surfaceStyle ?? overlaySheetStyles.surface;
  const resolvedShadowStyle = shadowStyle ?? overlaySheetStyles.shadowShell;
  const shadowShellStyle = React.useMemo(
    () => [
      resolvedShadowStyle,
      Platform.OS === 'android' ? overlaySheetStyles.shadowShellAndroid : null,
    ],
    [resolvedShadowStyle]
  );

  return (
    <BottomSheetNativeHost {...hostProps}>
      <View style={shadowShellStyle}>
        <View style={resolvedSurfaceStyle}>
          {backgroundComponent ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
              {backgroundComponent}
            </View>
          ) : null}
          {headerComponent ? (
            <View
              onLayout={onHeaderLayout as ((event: never) => void) | undefined}
              style={styles.fixedHeader}
            >
              {headerComponent}
            </View>
          ) : null}
          <View style={[styles.contentHost, contentSurfaceStyle]}>{content}</View>
          {overlayComponent ? (
            <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
              {overlayComponent}
            </View>
          ) : null}
        </View>
      </View>
    </BottomSheetNativeHost>
  );
};

const styles = StyleSheet.create({
  contentHost: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  fixedHeader: {
    zIndex: 3,
  },
});
