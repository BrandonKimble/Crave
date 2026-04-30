import type { LayoutRectangle } from 'react-native';

export type SearchChromeTouchSurfaceHitRegion = LayoutRectangle;

export type SearchChromeTouchSurfaceShortcutKey = 'restaurants' | 'dishes';

export type SearchChromeTouchSurfaceTouchable = {
  hitRegion: SearchChromeTouchSurfaceHitRegion | null;
  enabled: boolean;
  onPress: () => void;
};

export type SearchChromeTouchSurfaceRuntime = {
  shortcuts: Record<SearchChromeTouchSurfaceShortcutKey, SearchChromeTouchSurfaceTouchable>;
  searchThisArea: SearchChromeTouchSurfaceTouchable;
  handleSearchThisAreaButtonLayout: (layout: LayoutRectangle) => void;
};
