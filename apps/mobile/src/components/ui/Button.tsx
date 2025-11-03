import React from 'react';
import { Pressable, PressableProps, Text } from 'react-native';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends PressableProps {
  label: string;
  variant?: ButtonVariant;
  isLoading?: boolean;
}

const baseStyles = 'h-12 rounded-lg flex-row items-center justify-center px-4 active:opacity-90';

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  ghost: 'bg-transparent border border-primary',
};

const textStyles: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-white',
  ghost: 'text-primary',
};

export const Button: React.FC<ButtonProps> = ({
  label,
  variant = 'primary',
  isLoading = false,
  disabled,
  className,
  ...pressableProps
}) => {
  const isDisabled = disabled ?? isLoading;

  return (
    <Pressable
      accessibilityRole="button"
      className={clsx(baseStyles, variantStyles[variant], className, {
        'opacity-50': isDisabled,
      })}
      disabled={isDisabled}
      {...pressableProps}
    >
      <Text className={clsx('text-base font-semibold', textStyles[variant])}>
        {isLoading ? 'Loading...' : label}
      </Text>
    </Pressable>
  );
};

export default Button;
