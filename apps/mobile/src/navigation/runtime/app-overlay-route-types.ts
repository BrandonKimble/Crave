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
    parentSceneKeys: ['search', 'bookmarks', 'profile', 'polls'],
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
  pollDetail: {
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
  // ── Stub-pass child scenes (plans/page-registry.md §1) — metadata + policy only; no entry
  // points yet. requiresOwnerSceneKey is FALSE on all of them for now.
  // stub: flip to true when real open params land.
  userProfile: {
    role: 'child',
    productSceneKey: null,
    parentSceneKeys: ['search', 'bookmarks', 'profile', 'polls'],
    requiresOwnerSceneKey: false,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
    headerActionPolicy: 'fixed-close',
  },
  listDetail: {
    role: 'child',
    productSceneKey: null,
    parentSceneKeys: ['search', 'bookmarks', 'profile', 'polls'],
    requiresOwnerSceneKey: false,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
    headerActionPolicy: 'fixed-close',
  },
  followList: {
    role: 'child',
    productSceneKey: null,
    parentSceneKeys: ['search', 'bookmarks', 'profile', 'polls'],
    requiresOwnerSceneKey: false,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
    headerActionPolicy: 'fixed-close',
  },
  notifications: {
    role: 'child',
    productSceneKey: null,
    parentSceneKeys: ['search', 'bookmarks', 'profile', 'polls'],
    requiresOwnerSceneKey: false,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
    headerActionPolicy: 'fixed-close',
  },
  settings: {
    role: 'child',
    productSceneKey: null,
    parentSceneKeys: ['profile'],
    requiresOwnerSceneKey: false,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
    headerActionPolicy: 'fixed-close',
  },
  editProfile: {
    role: 'child',
    productSceneKey: null,
    parentSceneKeys: ['profile'],
    requiresOwnerSceneKey: false,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
    headerActionPolicy: 'fixed-close',
  },
  shareConfig: {
    role: 'child',
    productSceneKey: null,
    parentSceneKeys: ['bookmarks', 'profile'],
    requiresOwnerSceneKey: false,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
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
  'saveList',
  'pollCreation',
  'pollDetail',
  'restaurant',
  // stub-pass scenes (append-only — order is mount order)
  'userProfile',
  'listDetail',
  'followList',
  'notifications',
  'settings',
  'editProfile',
  'shareConfig',
] as const satisfies readonly OverlayKey[];

export const APP_OVERLAY_STATIC_ROUTE_SCENE_INPUT_KEYS = [
  'saveList',
  'bookmarks',
  'profile',
  // stub-pass scenes (append-only — order is mount order)
  'userProfile',
  'listDetail',
  'followList',
  'notifications',
  'settings',
  'editProfile',
  'shareConfig',
] as const satisfies readonly OverlayKey[];

export const APP_OVERLAY_ROUTE_SCENE_INPUT_KEYS = [
  'search',
  'restaurant',
  'polls',
  'pollCreation',
  'pollDetail',
  ...APP_OVERLAY_STATIC_ROUTE_SCENE_INPUT_KEYS,
] as const satisfies readonly OverlayKey[];

// ─── Completeness guards ─────────────────────────────────────────────────────
// The three arrays above stay EXPLICIT (their declaration order is the scene
// mount/render order, and their `as const` tuple is the source of the
// AppRouteSceneInputKey union type — deriving them with .filter() would silently
// reorder mounts and widen the type). Instead, these compile-time assertions
// prove each array contains EXACTLY the scenes whose metadata flag says it
// should. Add a scene with `sceneSwitch: true` (etc.) but forget the array — or
// vice-versa — and the build fails, naming the offending key. This is the
// exhaustiveness the scattered Set/string-OR predicates lacked.
type AppOverlayRouteMetadataMap = typeof APP_OVERLAY_ROUTE_METADATA_BY_KEY;
type OverlayKeysWithMetadataFlag<Field extends 'sceneSwitch' | 'sceneInput' | 'staticSceneInput'> =
  {
    [K in OverlayKey]: AppOverlayRouteMetadataMap[K][Field] extends true ? K : never;
  }[OverlayKey];
type AssertNoOverlayKeys<T extends never> = T;

/* eslint-disable @typescript-eslint/no-unused-vars -- these aliases exist only to
   be type-checked; a non-empty Exclude makes one error and names the offending key. */
// sceneSwitch flag ⇔ APP_OVERLAY_ROUTE_SCENE_SWITCH_KEYS
type _SwitchFlaggedNotInArray = AssertNoOverlayKeys<
  Exclude<
    OverlayKeysWithMetadataFlag<'sceneSwitch'>,
    (typeof APP_OVERLAY_ROUTE_SCENE_SWITCH_KEYS)[number]
  >
>;
type _SwitchArrayNotFlagged = AssertNoOverlayKeys<
  Exclude<
    (typeof APP_OVERLAY_ROUTE_SCENE_SWITCH_KEYS)[number],
    OverlayKeysWithMetadataFlag<'sceneSwitch'>
  >
>;

// sceneInput flag ⇔ APP_OVERLAY_ROUTE_SCENE_INPUT_KEYS
type _InputFlaggedNotInArray = AssertNoOverlayKeys<
  Exclude<
    OverlayKeysWithMetadataFlag<'sceneInput'>,
    (typeof APP_OVERLAY_ROUTE_SCENE_INPUT_KEYS)[number]
  >
>;
type _InputArrayNotFlagged = AssertNoOverlayKeys<
  Exclude<
    (typeof APP_OVERLAY_ROUTE_SCENE_INPUT_KEYS)[number],
    OverlayKeysWithMetadataFlag<'sceneInput'>
  >
>;

// staticSceneInput flag ⇔ APP_OVERLAY_STATIC_ROUTE_SCENE_INPUT_KEYS
type _StaticFlaggedNotInArray = AssertNoOverlayKeys<
  Exclude<
    OverlayKeysWithMetadataFlag<'staticSceneInput'>,
    (typeof APP_OVERLAY_STATIC_ROUTE_SCENE_INPUT_KEYS)[number]
  >
>;
type _StaticArrayNotFlagged = AssertNoOverlayKeys<
  Exclude<
    (typeof APP_OVERLAY_STATIC_ROUTE_SCENE_INPUT_KEYS)[number],
    OverlayKeysWithMetadataFlag<'staticSceneInput'>
  >
>;
/* eslint-enable @typescript-eslint/no-unused-vars */

const APP_OVERLAY_ROUTE_SCENE_SWITCH_KEY_SET = new Set<OverlayKey>(
  APP_OVERLAY_ROUTE_SCENE_SWITCH_KEYS
);

export const getAppOverlayRouteMetadata = (routeKey: OverlayKey): AppOverlayRouteMetadata =>
  APP_OVERLAY_ROUTE_METADATA_BY_KEY[routeKey];

const ALL_OVERLAY_ROUTE_KEYS = Object.keys(
  APP_OVERLAY_ROUTE_METADATA_BY_KEY
) as readonly OverlayKey[];

/**
 * Derive a scene-key set from the central metadata. Use this instead of
 * hand-maintaining a scattered list of scene keys whenever the membership is a
 * function of metadata the registry already encodes (role, sheetPolicy, …) — so
 * adding a scene is one metadata entry, not "edit N places and hope". Returns
 * keys in metadata-declaration order; only safe to consume where order is
 * irrelevant (membership / Set construction), which is the case for every
 * current caller. Arrays whose ORDER or literal-tuple TYPE is load-bearing
 * (e.g. APP_OVERLAY_ROUTE_SCENE_INPUT_KEYS) stay explicit + are guarded by a
 * compile-time completeness assertion instead.
 */
export const selectOverlayRouteKeysWhere = (
  predicate: (metadata: AppOverlayRouteMetadata, routeKey: OverlayKey) => boolean
): readonly OverlayKey[] =>
  ALL_OVERLAY_ROUTE_KEYS.filter((routeKey) =>
    predicate(APP_OVERLAY_ROUTE_METADATA_BY_KEY[routeKey], routeKey)
  );

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

export const createPollDetailChildRouteParams = (
  params: OverlayRouteParamsMap['pollDetail']
): NonNullable<OverlayRouteParamsMap['pollDetail']> => ({
  ...params,
  pollId: params?.pollId ?? '',
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
  // Return-to-origin foundation (P5) — the profile identity axis. Own profile leaves
  // profileUserId undefined/null (self-default re-root, byte-identical to today's param-less
  // profile); the FOREIGN-profile source sets a non-null profileUserId so restore re-roots the
  // right person's profile. Optional + nullable so the existing param-less profile push and
  // every current consumer (none read profile params today) are unaffected.
  profile?: {
    profileUserId?: string | null;
  };
  restaurant?: {
    restaurantId: string | null;
    source?: 'search';
    parentSceneKey?: AppOverlayTopLevelProductRouteKey | null;
    ownerSceneKey?: AppOverlayTopLevelProductRouteKey | null;
    openerRouteKey?: OverlayKey | null;
    routeInstanceId?: string | null;
    sessionToken?: number | null;
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
  pollDetail?: {
    pollId: string;
    /** Optional snapshot for an instant header render (the feed card already has it). */
    poll?: import('../../services/polls').Poll | null;
    parentSceneKey?: 'polls' | null;
    ownerSceneKey?: 'polls' | null;
    routeInstanceId?: string | null;
    // The comment a cross-surface reveal launched from. Set only when the route is RE-PUSHED by the
    // return-to-origin dismiss (resolveChildOriginRePush) so the panel scrolls-to + flashes that
    // comment. The routing layer guarantees the right poll re-mounts; the scroll-to + flash is a
    // panel-layer concern (PollDetailPanel's anchor restore effect).
    commentAnchorId?: string | null;
  };
  // ── Stub-pass scenes — param shapes only (all optional/nullable until real opens land).
  userProfile?: {
    userId?: string | null;
  };
  listDetail?: {
    listId?: string | null;
    ownerUserId?: string | null;
  };
  followList?: {
    userId?: string | null;
    mode?: 'followers' | 'following' | null;
  };
  notifications?: undefined;
  settings?: undefined;
  editProfile?: undefined;
  shareConfig?: {
    listId?: string | null;
  };
};

export type OverlayRouteEntry<K extends OverlayKey = OverlayKey> = {
  key: K;
  params: OverlayRouteParamsMap[K];
};
