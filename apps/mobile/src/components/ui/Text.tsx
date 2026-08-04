import React from 'react';
import {
  Text as RNText,
  TextProps as RNTextProps,
  StyleProp,
  TextStyle,
  StyleSheet,
} from 'react-native';

import { TYPE_SCALE } from '../../constants/typography';

const typeScale: Record<'title' | 'subtitle' | 'body' | 'caption', TextStyle> = TYPE_SCALE;

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
  // F887 (2026-08-03): the `?? 'regular'` fallback is DELETED — `weight` is a CLOSED
  // 4-member union with a `'regular'` default in the destructure above, so `WEIGHT_MAP`
  // is total over it and the fallback was unreachable. If the union grows, the missing
  // WEIGHT_MAP entry should be a compile error, not a silent downgrade to regular.
  const resolvedWeight = WEIGHT_MAP[weight];
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
