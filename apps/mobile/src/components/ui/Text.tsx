import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import clsx from 'clsx';

export interface TextProps extends RNTextProps {
  variant?: 'title' | 'subtitle' | 'body' | 'caption';
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
}

const variantStyles: Record<NonNullable<TextProps['variant']>, string> = {
  title: 'text-3xl',
  subtitle: 'text-xl',
  body: 'text-base',
  caption: 'text-sm',
};

const weightStyles: Record<NonNullable<TextProps['weight']>, string> = {
  regular: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

export const Text: React.FC<TextProps> = ({
  variant = 'body',
  weight = 'regular',
  className,
  children,
  ...rest
}) => {
  return (
    <RNText
      className={clsx('text-text', variantStyles[variant], weightStyles[weight], className)}
      {...rest}
    >
      {children}
    </RNText>
  );
};

export default Text;
