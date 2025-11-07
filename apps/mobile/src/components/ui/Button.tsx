import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  PressableStateCallbackType,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
} from 'react-native';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends PressableProps {
  label: string;
  variant?: ButtonVariant;
  isLoading?: boolean;
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  primary: {
    backgroundColor: '#6366f1',
  },
  primaryText: {
    color: '#ffffff',
  },
  secondary: {
    backgroundColor: '#1e293b',
  },
  secondaryText: {
    color: '#ffffff',
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  ghostText: {
    color: '#6366f1',
  },
  disabled: {
    opacity: 0.5,
  },
});

const containerVariants: Record<ButtonVariant, StyleProp<ViewStyle>> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
};

const labelVariants: Record<ButtonVariant, StyleProp<TextStyle>> = {
  primary: styles.primaryText,
  secondary: styles.secondaryText,
  ghost: styles.ghostText,
};

export const Button: React.FC<ButtonProps> = ({
  label,
  variant = 'primary',
  isLoading = false,
  disabled,
  style,
  ...pressableProps
}) => {
  const isDisabled = disabled ?? isLoading;

  const computedStyle = (state: PressableStateCallbackType) => [
    styles.base,
    containerVariants[variant],
    isDisabled ? styles.disabled : null,
    typeof style === 'function' ? style(state) : style,
  ];

  return (
    <Pressable
      accessibilityRole="button"
      style={computedStyle}
      disabled={isDisabled}
      {...pressableProps}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'ghost' ? '#6366f1' : '#ffffff'} />
      ) : (
        <Text style={[styles.label, labelVariants[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
};

export default Button;
