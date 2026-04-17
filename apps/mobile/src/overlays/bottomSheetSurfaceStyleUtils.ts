import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';

export const sanitizeContentContainerStyle = (
  contentContainerStyle?: StyleProp<ViewStyle>
): ViewStyle | undefined => {
  if (!contentContainerStyle) {
    return undefined;
  }
  const flat = (StyleSheet.flatten(contentContainerStyle) || {}) as ViewStyle;
  const {
    padding,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    paddingHorizontal,
    paddingVertical,
    backgroundColor,
  } = flat;
  const sanitized: ViewStyle = {};
  if (padding !== undefined) {
    sanitized.padding = padding;
  }
  if (paddingTop !== undefined) {
    sanitized.paddingTop = paddingTop;
  }
  if (paddingRight !== undefined) {
    sanitized.paddingRight = paddingRight;
  }
  if (paddingBottom !== undefined) {
    sanitized.paddingBottom = paddingBottom;
  }
  if (paddingLeft !== undefined) {
    sanitized.paddingLeft = paddingLeft;
  }
  if (paddingHorizontal !== undefined) {
    sanitized.paddingHorizontal = paddingHorizontal;
  }
  if (paddingVertical !== undefined) {
    sanitized.paddingVertical = paddingVertical;
  }
  if (backgroundColor !== undefined) {
    sanitized.backgroundColor = backgroundColor;
  }
  return sanitized;
};

export const resolveListContentContainerStyle = ({
  baseStyle,
  hasScrollHeaderOverlay,
  scrollHeaderHeight,
}: {
  baseStyle?: ViewStyle;
  hasScrollHeaderOverlay: boolean;
  scrollHeaderHeight: number;
}): ViewStyle | undefined => {
  const base: ViewStyle = baseStyle ?? {};
  const shouldForceTransparentBackground =
    hasScrollHeaderOverlay && base.backgroundColor === undefined;
  if (scrollHeaderHeight <= 0) {
    if (!shouldForceTransparentBackground) {
      return baseStyle;
    }
    return {
      ...base,
      backgroundColor: 'transparent',
    };
  }
  const existingPaddingTop =
    typeof base.paddingTop === 'number'
      ? base.paddingTop
      : typeof base.paddingVertical === 'number'
        ? base.paddingVertical
        : typeof base.padding === 'number'
          ? base.padding
          : 0;
  return {
    ...base,
    paddingTop: existingPaddingTop + scrollHeaderHeight,
    ...(shouldForceTransparentBackground ? { backgroundColor: 'transparent' } : null),
  };
};
