import React from 'react';
import { Text as RNText, TextProps as RNTextProps, StyleProp, TextStyle, StyleSheet } from 'react-native';

export interface TextProps extends RNTextProps {
  variant?: 'title' | 'subtitle' | 'body' | 'caption';
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  style?: StyleProp<TextStyle>;
}

const variantStyles: Record<NonNullable<TextProps['variant']>, TextStyle> = {
  title: { fontSize: 28, lineHeight: 34 },
  subtitle: { fontSize: 20, lineHeight: 26 },
  body: { fontSize: 16, lineHeight: 22 },
  caption: { fontSize: 14, lineHeight: 18 },
};

const weightStyles: Record<NonNullable<TextProps['weight']>, TextStyle> = {
  regular: { fontWeight: '400' },
  medium: { fontWeight: '500' },
  semibold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
};

export const Text: React.FC<TextProps> = ({
  variant = 'body',
  weight = 'regular',
  style,
  children,
  ...rest
}) => {
  return (
    <RNText style={[styles.base, variantStyles[variant], weightStyles[weight], style]} {...rest}>
      {children}
    </RNText>
  );
};

const styles = StyleSheet.create({
  base: {
    color: '#0f172a',
  },
});

export default Text;
