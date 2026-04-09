import type { OverlayKey } from '../store/overlayStore';

export type SearchOverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';

export type TabOverlaySnap = Exclude<SearchOverlaySheetSnap, 'hidden'>;

export type SearchSessionOriginContext = {
  rootOverlay: OverlayKey;
  tabSnap: TabOverlaySnap;
};
