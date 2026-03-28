import React from 'react';
import { ImageBackground, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import splashArt from '../assets/splash.png';

type StaticSplashArtShellProps = {
  children?: React.ReactNode;
  foregroundStyle?: StyleProp<ViewStyle>;
};

const StaticSplashArtShell: React.FC<StaticSplashArtShellProps> = ({
  children,
  foregroundStyle,
}) => (
  <ImageBackground source={splashArt} resizeMode="cover" style={styles.container}>
    {children ? (
      <View pointerEvents="box-none" style={[styles.foreground, foregroundStyle]}>
        {children}
      </View>
    ) : null}
  </ImageBackground>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf4f7',
  },
  foreground: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default React.memo(StaticSplashArtShell);
