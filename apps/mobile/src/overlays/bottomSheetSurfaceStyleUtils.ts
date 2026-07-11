import type { ViewStyle } from 'react-native';

/**
 * The ONLY layout a scene may send through the sheet-body transport's
 * `contentContainerStyle`: content insets + an optional background. This type
 * REPLACES the old `sanitizeContentContainerStyle` runtime whitelist, which
 * silently stripped everything else (a `flex` sent this way vanished — the W4
 * dmSession static-column regression). Now the contract is compile-enforced:
 * an unsupported style key is a type error at the producer, not a silent no-op.
 * Frame-filling layout is the body runtime's job (see staticContentFillStyle in
 * useBottomSheetSceneStackBodyContentRuntime), never the transport's.
 */
export type SceneBodyContentInsets = {
  padding?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingHorizontal?: number;
  paddingVertical?: number;
  backgroundColor?: ViewStyle['backgroundColor'];
};

export const resolveListContentContainerStyle = ({
  baseStyle,
  hasScrollHeaderOverlay,
  scrollHeaderHeight,
}: {
  baseStyle?: SceneBodyContentInsets;
  hasScrollHeaderOverlay: boolean;
  scrollHeaderHeight: number;
}): ViewStyle | undefined => {
  const base: SceneBodyContentInsets = baseStyle ?? {};
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
