import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenProps extends ViewProps {
  safeArea?: boolean;
  fullBleed?: boolean;
}

export const Screen: React.FC<ScreenProps> = ({
  children,
  style,
  safeArea = true,
  fullBleed = false,
  ...rest
}) => {
  const Container = safeArea ? SafeAreaView : View;
  return (
    <Container style={[styles.base, !fullBleed && styles.padded, style]} {...rest}>
      {children}
    </Container>
  );
};

const styles = StyleSheet.create({
  base: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  padded: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
});

export default Screen;
