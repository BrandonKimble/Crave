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
import { colors as themeColors } from '../../constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends PressableProps {
  label: string;
  variant?: ButtonVariant;
  isLoading?: boolean;
  labelStyle?: StyleProp<TextStyle>;
}

const PRIMARY_BUTTON_COLOR = themeColors.accentDark ?? '#6366f1';
const SECONDARY_BUTTON_COLOR = themeColors.secondary;

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
    backgroundColor: PRIMARY_BUTTON_COLOR,
  },
  primaryText: {
    color: '#ffffff',
  },
  secondary: {
    backgroundColor: SECONDARY_BUTTON_COLOR,
  },
  secondaryText: {
    color: '#ffffff',
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: PRIMARY_BUTTON_COLOR,
  },
  ghostText: {
    color: PRIMARY_BUTTON_COLOR,
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
  labelStyle,
  ...pressableProps
}) => {
  const isDisabled = disabled ?? isLoading;

  const computedStyle = (state: PressableStateCallbackType) => [
    styles.base,
    containerVariants[variant],
    state.pressed && variant === 'primary' ? { transform: [{ scale: 0.97 }] } : null,
    isDisabled && variant === 'primary'
      ? { backgroundColor: PRIMARY_BUTTON_COLOR, opacity: 0.9 }
      : null,
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
        <ActivityIndicator color={variant === 'ghost' ? PRIMARY_BUTTON_COLOR : '#ffffff'} />
      ) : (
        <Text style={[styles.label, labelVariants[variant], labelStyle]}>{label}</Text>
      )}
    </Pressable>
  );
};

export default Button;
