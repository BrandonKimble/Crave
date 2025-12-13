import React from 'react';
import {
  Text as RNText,
  TextProps as RNTextProps,
  StyleProp,
  TextStyle,
  StyleSheet,
} from 'react-native';

const typeScale: Record<'title' | 'subtitle' | 'body' | 'caption', TextStyle> = {
  title: { fontSize: 20, lineHeight: 26 },
  subtitle: { fontSize: 16, lineHeight: 24, includeFontPadding: false },
  body: { fontSize: 16, lineHeight: 22 },
  caption: { fontSize: 12, lineHeight: 15 },
};

// Standardize to two weights; legacy values map to the closest allowed option.
const WEIGHT_MAP: Record<'regular' | 'medium' | 'semibold' | 'bold', 'regular' | 'semibold'> = {
  regular: 'regular',
  medium: 'semibold',
  semibold: 'semibold',
  bold: 'semibold',
};

const weightStyles: Record<'regular' | 'semibold', TextStyle> = {
  regular: { fontWeight: '400' },
  semibold: { fontWeight: '600' },
};

export interface TextProps extends RNTextProps {
  variant?: 'title' | 'subtitle' | 'body' | 'caption';
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  style?: StyleProp<TextStyle>;
}

export const Text: React.FC<TextProps> = ({
  variant = 'body',
  weight = 'regular',
  style,
  children,
  ...rest
}) => {
  const resolvedWeight = WEIGHT_MAP[weight] ?? 'regular';
  return (
    <RNText
      style={[styles.base, typeScale[variant], weightStyles[resolvedWeight], style]}
      {...rest}
    >
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
