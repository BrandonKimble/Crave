import type { OverlayKey } from '../../overlays/types';
import type { MapBounds } from '../../types';

export type { OverlayKey } from '../../overlays/types';

export type OverlayRouteParamsMap = {
  search?: undefined;
  searchRoute?: undefined;
  bookmarks?: undefined;
  polls?: {
    marketKey?: string | null;
    marketName?: string | null;
    pollId?: string | null;
    pinnedMarket?: boolean | null;
  };
  profile?: undefined;
  restaurant?: {
    restaurantId: string | null;
    source?: 'search' | 'global';
    sessionToken?: number | null;
  };
  saveList?: undefined;
  price?: undefined;
  scoreInfo?: undefined;
  pollCreation?: {
    marketKey?: string | null;
    marketName?: string | null;
    bounds?: MapBounds | null;
  };
};

export type OverlayRouteEntry<K extends OverlayKey = OverlayKey> = {
  key: K;
  params: OverlayRouteParamsMap[K];
};
