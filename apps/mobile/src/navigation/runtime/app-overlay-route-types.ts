import type { OverlayKey } from '../../overlays/types';
import type { MapBounds } from '../../types';

export type { OverlayKey } from '../../overlays/types';

export type AppOverlayTopLevelProductRouteKey = 'search' | 'polls' | 'bookmarks' | 'profile';

export type AppOverlaySaveListType = 'restaurant' | 'dish';

export type AppOverlaySaveListTarget = {
  restaurantId?: string;
  connectionId?: string;
};

export type AppOverlayRouteRole = 'topLevel' | 'child' | 'modalExtension' | 'shell';

export type AppOverlayRouteSheetPolicy =
  | 'sharedPhysicalSheet'
  | 'routeShell'
  | 'commandOverlayState'
  | 'modalExtension';

export type AppOverlayRouteChromePolicy = 'searchChrome' | 'preserve' | 'modal';

export type AppOverlayRouteHeaderActionPolicy = 'fixed-close' | 'follow-collapse' | 'preserve';

export type AppOverlayRouteMetadata = {
  role: AppOverlayRouteRole;
  productSceneKey: AppOverlayTopLevelProductRouteKey | null;
  parentSceneKeys: readonly AppOverlayTopLevelProductRouteKey[];
  requiresOwnerSceneKey: boolean;
  sceneSwitch: boolean;
  sceneInput: boolean;
  staticSceneInput: boolean;
  sheetPolicy: AppOverlayRouteSheetPolicy;
  chromePolicy: AppOverlayRouteChromePolicy;
  headerActionPolicy: AppOverlayRouteHeaderActionPolicy;
};

export const APP_OVERLAY_ROUTE_METADATA_BY_KEY = {
  search: {
    role: 'topLevel',
    productSceneKey: 'search',
    parentSceneKeys: [],
    requiresOwnerSceneKey: false,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: false,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'searchChrome',
    headerActionPolicy: 'fixed-close',
  },
  searchRoute: {
    role: 'shell',
    productSceneKey: null,
    parentSceneKeys: [],
    requiresOwnerSceneKey: false,
    sceneSwitch: false,
    sceneInput: false,
    staticSceneInput: false,
    sheetPolicy: 'routeShell',
    chromePolicy: 'preserve',
    headerActionPolicy: 'fixed-close',
  },
  polls: {
    role: 'topLevel',
    productSceneKey: 'polls',
    parentSceneKeys: [],
    requiresOwnerSceneKey: false,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: false,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'searchChrome',
    headerActionPolicy: 'follow-collapse',
  },
  bookmarks: {
    role: 'topLevel',
    productSceneKey: 'bookmarks',
    parentSceneKeys: [],
    requiresOwnerSceneKey: false,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
    headerActionPolicy: 'fixed-close',
  },
  profile: {
    role: 'topLevel',
    productSceneKey: 'profile',
    parentSceneKeys: [],
    requiresOwnerSceneKey: false,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
    headerActionPolicy: 'fixed-close',
  },
  restaurant: {
    role: 'child',
    productSceneKey: null,
    parentSceneKeys: ['search', 'bookmarks', 'profile'],
    requiresOwnerSceneKey: true,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: false,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
    headerActionPolicy: 'fixed-close',
  },
  favoriteListDetail: {
    role: 'child',
    productSceneKey: null,
    parentSceneKeys: ['bookmarks', 'profile'],
    requiresOwnerSceneKey: true,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: false,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
    headerActionPolicy: 'fixed-close',
  },
  saveList: {
    role: 'child',
    productSceneKey: null,
    parentSceneKeys: ['search', 'bookmarks', 'profile'],
    requiresOwnerSceneKey: true,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
    headerActionPolicy: 'fixed-close',
  },
  price: {
    role: 'modalExtension',
    productSceneKey: null,
    parentSceneKeys: [],
    requiresOwnerSceneKey: false,
    sceneSwitch: false,
    sceneInput: false,
    staticSceneInput: false,
    sheetPolicy: 'modalExtension',
    chromePolicy: 'modal',
    headerActionPolicy: 'preserve',
  },
  scoreInfo: {
    role: 'modalExtension',
    productSceneKey: null,
    parentSceneKeys: [],
    requiresOwnerSceneKey: false,
    sceneSwitch: false,
    sceneInput: false,
    staticSceneInput: false,
    sheetPolicy: 'modalExtension',
    chromePolicy: 'modal',
    headerActionPolicy: 'preserve',
  },
  pollCreation: {
    role: 'child',
    productSceneKey: null,
    parentSceneKeys: ['polls'],
    requiresOwnerSceneKey: true,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: false,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
    headerActionPolicy: 'fixed-close',
  },
} as const satisfies Record<OverlayKey, AppOverlayRouteMetadata>;

export const APP_OVERLAY_ROUTE_SCENE_SWITCH_KEYS = [
  'search',
  'polls',
  'bookmarks',
  'profile',
  'favoriteListDetail',
  'saveList',
  'pollCreation',
  'restaurant',
] as const satisfies readonly OverlayKey[];

export const APP_OVERLAY_STATIC_ROUTE_SCENE_INPUT_KEYS = [
  'saveList',
  'bookmarks',
  'profile',
] as const satisfies readonly OverlayKey[];

export const APP_OVERLAY_ROUTE_SCENE_INPUT_KEYS = [
  'search',
  'restaurant',
  'polls',
  'pollCreation',
  'favoriteListDetail',
  ...APP_OVERLAY_STATIC_ROUTE_SCENE_INPUT_KEYS,
] as const satisfies readonly OverlayKey[];

const APP_OVERLAY_ROUTE_SCENE_SWITCH_KEY_SET = new Set<OverlayKey>(
  APP_OVERLAY_ROUTE_SCENE_SWITCH_KEYS
);

export const getAppOverlayRouteMetadata = (routeKey: OverlayKey): AppOverlayRouteMetadata =>
  APP_OVERLAY_ROUTE_METADATA_BY_KEY[routeKey];

export const isAppOverlayRouteSceneSwitchKey = (routeKey: OverlayKey): boolean =>
  APP_OVERLAY_ROUTE_SCENE_SWITCH_KEY_SET.has(routeKey);

export const resolveAppOverlayRouteHeaderActionPolicy = (
  routeKey: OverlayKey
): AppOverlayRouteHeaderActionPolicy =>
  APP_OVERLAY_ROUTE_METADATA_BY_KEY[routeKey].headerActionPolicy;

export const createPollCreationChildRouteParams = (
  params?: OverlayRouteParamsMap['pollCreation']
): NonNullable<OverlayRouteParamsMap['pollCreation']> => ({
  ...params,
  parentSceneKey: 'polls',
  ownerSceneKey: 'polls',
});

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
    source?: 'search';
    parentSceneKey?: AppOverlayTopLevelProductRouteKey | null;
    ownerSceneKey?: AppOverlayTopLevelProductRouteKey | null;
    openerRouteKey?: OverlayKey | null;
    routeInstanceId?: string | null;
    sessionToken?: number | null;
  };
  favoriteListDetail?: {
    listId: string;
    parentSceneKey: AppOverlayTopLevelProductRouteKey;
    ownerSceneKey: AppOverlayTopLevelProductRouteKey;
    openerRouteKey?: OverlayKey | null;
    routeInstanceId: string;
  };
  saveList?: {
    listType: AppOverlaySaveListType;
    target: AppOverlaySaveListTarget | null;
    parentSceneKey: AppOverlayTopLevelProductRouteKey;
    ownerSceneKey: AppOverlayTopLevelProductRouteKey;
    openerRouteKey?: OverlayKey | null;
    routeInstanceId: string;
  };
  price?: undefined;
  scoreInfo?: undefined;
  pollCreation?: {
    marketKey?: string | null;
    marketName?: string | null;
    bounds?: MapBounds | null;
    parentSceneKey?: 'polls' | null;
    ownerSceneKey?: 'polls' | null;
    routeInstanceId?: string | null;
  };
};

export type OverlayRouteEntry<K extends OverlayKey = OverlayKey> = {
  key: K;
  params: OverlayRouteParamsMap[K];
};
