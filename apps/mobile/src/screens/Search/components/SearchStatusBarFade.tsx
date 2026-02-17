import React from 'react';
import { View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';

import AppBlurView from '../../../components/app-blur-view';
import styles from '../styles';

const STATUS_BAR_FADE_RAISE_PX = 4;

type SearchStatusBarFadeProps = {
  statusBarFadeHeight: number;
};

const SearchStatusBarFade = ({ statusBarFadeHeight }: SearchStatusBarFadeProps) => {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.statusBarFade,
        { top: -STATUS_BAR_FADE_RAISE_PX, height: statusBarFadeHeight },
      ]}
    >
      <MaskedView
        style={styles.statusBarFadeLayer}
        maskElement={
          <LinearGradient
            colors={[
              'rgba(0, 0, 0, 1)',
              'rgba(0, 0, 0, 1)',
              'rgba(0, 0, 0, 0.99)',
              'rgba(0, 0, 0, 0.97)',
              'rgba(0, 0, 0, 0.9)',
              'rgba(0, 0, 0, 0.7)',
              'rgba(0, 0, 0, 0.35)',
              'rgba(0, 0, 0, 0.12)',
              'rgba(0, 0, 0, 0.04)',
              'rgba(0, 0, 0, 0)',
            ]}
            locations={[0, 0.6, 0.63, 0.66, 0.7, 0.8, 0.88, 0.945, 0.965, 0.985]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.statusBarFadeLayer}
          />
        }
      >
        <AppBlurView intensity={12} tint="default" style={styles.statusBarFadeLayer} />
      </MaskedView>
    </View>
  );
};

export default React.memo(SearchStatusBarFade);
