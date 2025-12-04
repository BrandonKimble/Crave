import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type DropShadowProps = {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

const DropShadow: React.FC<DropShadowProps> = ({ style, children }) => {
  return <View style={[styles.shadow, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  shadow: {},
});

export default DropShadow;
