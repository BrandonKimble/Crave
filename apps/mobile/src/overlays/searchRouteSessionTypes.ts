import type { OverlayKey } from '../navigation/runtime/app-overlay-route-types';

export type SearchOverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';

export type TabOverlaySnap = Exclude<SearchOverlaySheetSnap, 'hidden'>;

export type SearchSessionOriginContext = {
  rootOverlay: OverlayKey;
  tabSnap: TabOverlaySnap;
};
