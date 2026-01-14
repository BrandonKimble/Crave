import type { ViewStyle } from 'react-native';

type ShadowToken = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

export const SEARCH_BAR_SHADOW: ShadowToken = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.20,
  shadowRadius: 2,
  elevation: 2,
};

export const SEARCH_SHORTCUT_SHADOW: ShadowToken = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.18,
  shadowRadius: 1.5,
  elevation: 2,
};

export const SEARCH_THIS_AREA_SHADOW: ShadowToken = SEARCH_SHORTCUT_SHADOW;

export const OVERLAY_SHEET_SHADOW_SHELL: ShadowToken = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.1,
  shadowRadius: 7,
  elevation: 2,
};
