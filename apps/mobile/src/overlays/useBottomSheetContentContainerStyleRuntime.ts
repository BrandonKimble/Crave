import React from 'react';
import { StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';

import type { BottomSheetWithFlashListProps } from './bottomSheetWithFlashListContract';

type UseBottomSheetContentContainerStyleRuntimeArgs<T> = {
  contentContainerStyle: BottomSheetWithFlashListProps<T>['contentContainerStyle'];
};

export const useBottomSheetContentContainerStyleRuntime = <T>({
  contentContainerStyle,
}: UseBottomSheetContentContainerStyleRuntimeArgs<T>) =>
  React.useMemo(() => {
    if (!contentContainerStyle) {
      return undefined;
    }
    const flat = StyleSheet.flatten(contentContainerStyle) || {};
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
  }, [contentContainerStyle]);
