import type { ViewStyle } from 'react-native';

type ShadowToken = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

export const SEARCH_BAR_SHADOW: ShadowToken = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.2,
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

// F1557: `SEARCH_THIS_AREA_SHADOW` was a bare alias of SEARCH_SHORTCUT_SHADOW — an alias is a
// rename, not a token: it promised the two surfaces could diverge while guaranteeing they
// could not, and editing one would have silently edited the other. The one consumer
// (Search/styles.ts:200, the "search this area" pill) spreads the shortcut shadow directly.

export const OVERLAY_SHEET_SHADOW_SHELL: ShadowToken = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.1,
  shadowRadius: 7,
  elevation: 2,
};
