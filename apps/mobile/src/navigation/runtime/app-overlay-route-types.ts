import type { OverlayKey } from '../../overlays/types';
// Type-only import (erased at runtime — no module cycle): OriginSnapshot is the shared
// captured-presentation payload; its value home moves nav-side with the S-C rename pass.
import type { OriginSnapshot } from '../../overlays/searchRouteSessionTypes';
import type { SearchQueryIdentity } from '../../screens/Search/runtime/shared/search-desired-state-contract';
import type { MapBounds } from '../../types';

export type { OverlayKey } from '../../overlays/types';

// Docked-scene constants live in the LEAF module docked-scene-target.ts (imports nothing
// at runtime) — hosting them here produced a boot-order TDZ through this file's import
// cycles. Import values from './docked-scene-target' directly; the type re-export below
// is safe (erased at runtime).
import type { AppOverlayTopLevelProductRouteKey } from './docked-scene-target';
export type { AppOverlayTopLevelProductRouteKey } from './docked-scene-target';

export type AppOverlaySaveListType = 'restaurant' | 'dish';

export type AppOverlaySaveListTarget = {
  restaurantId?: string;
  connectionId?: string;
  /** Location-centric saves (master plan §7): the IN-CONTEXT location the save
   *  was triggered from (row displayLocation / dish restaurantLocationId /
   *  profile focus). Rides the addItem/favorite payload so ListDetail renders
   *  exactly the saved pin. */
  locationId?: string | null;
};

export type AppOverlayRouteRole = 'topLevel' | 'child' | 'modalExtension' | 'shell';

export type AppOverlayRouteSheetPolicy =
  | 'sharedPhysicalSheet'
  | 'routeShell'
  | 'commandOverlayState'
  | 'modalExtension';

export type AppOverlayRouteChromePolicy = 'searchChrome' | 'preserve' | 'modal';

// Leg 6 (§4): headerActionPolicy is DELETED — the header action derives from route ROLE on the
// PresentationFrame (resolveHeaderNavAction); 'follow-collapse' had been visually dead since
// e9bd105a pinned the polls button.

// F1366: `parentSceneKeys` is DELETED. It was populated on every one of the 20 metadata
// rows and read by NOTHING — `saveList: ['search','lists','profile']` read as enforced
// policy while the runtime applied no such rule, so a wrong entry cost nothing and taught
// the next reader a law that did not exist. The dmSession row admitted this inline. If a
// parent-scope rule is ever wanted, it comes back as the INPUT TO A REAL CHECK.
export type AppOverlayRouteMetadata = {
  role: AppOverlayRouteRole;
  productSceneKey: AppOverlayTopLevelProductRouteKey | null;
  sceneSwitch: boolean;
  sceneInput: boolean;
  staticSceneInput: boolean;
  /** Paints its OWN shell on frame 1 from route params -> a forward open hard-swaps to
   *  that seed instead of holding the outgoing surface (see SEEDED_FORWARD_OPEN_SCENES). */
  seededForwardOpen: boolean;
  sheetPolicy: AppOverlayRouteSheetPolicy;
  chromePolicy: AppOverlayRouteChromePolicy;
};

export const APP_OVERLAY_ROUTE_METADATA_BY_KEY = {
  search: {
    role: 'topLevel',
    productSceneKey: 'search',
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: false,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'searchChrome',
  },
  sheetHost: {
    role: 'shell',
    productSceneKey: null,
    sceneSwitch: false,
    sceneInput: false,
    staticSceneInput: false,
    seededForwardOpen: false,
    sheetPolicy: 'routeShell',
    chromePolicy: 'preserve',
  },
  // HOME (home-surface-charter): THE docked scene — presents under the search root
  // (DOCKED_SCENE_KEY), searchChrome like the old polls-as-docked posture.
  home: {
    role: 'topLevel',
    productSceneKey: 'home',
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: false,
    seededForwardOpen: false,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'searchChrome',
  },
  // Polls demotion (home-surface-charter): a regular content tab page now — chrome
  // preserved like lists; the docked searchChrome posture moved to 'home'.
  polls: {
    role: 'topLevel',
    productSceneKey: 'polls',
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: false,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  lists: {
    role: 'topLevel',
    productSceneKey: 'lists',
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  profile: {
    role: 'topLevel',
    productSceneKey: 'profile',
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  restaurant: {
    role: 'child',
    productSceneKey: null,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: false,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  saveList: {
    role: 'child',
    productSceneKey: null,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  price: {
    role: 'modalExtension',
    productSceneKey: null,
    sceneSwitch: false,
    sceneInput: false,
    staticSceneInput: false,
    seededForwardOpen: false,
    sheetPolicy: 'modalExtension',
    chromePolicy: 'modal',
  },
  scoreInfo: {
    role: 'modalExtension',
    productSceneKey: null,
    sceneSwitch: false,
    sceneInput: false,
    staticSceneInput: false,
    seededForwardOpen: false,
    sheetPolicy: 'modalExtension',
    chromePolicy: 'modal',
  },
  pollCreation: {
    role: 'child',
    productSceneKey: null,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: false,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  pollDetail: {
    role: 'child',
    productSceneKey: null,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: false,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  // ── Stub-pass child scenes (plans/page-registry.md §1) — metadata + policy only; no entry
  // points yet.
  userProfile: {
    role: 'child',
    productSceneKey: null,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  listDetail: {
    role: 'child',
    productSceneKey: null,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  followList: {
    role: 'child',
    productSceneKey: null,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  notifications: {
    role: 'child',
    productSceneKey: null,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  settings: {
    role: 'child',
    productSceneKey: null,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  editProfile: {
    role: 'child',
    productSceneKey: null,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  // W2 (§7.4): the post page — the photo funnel's terminal child scene.
  postPhotos: {
    role: 'child',
    productSceneKey: null,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  // W3 messaging (plans/w3-messaging-design.md §4.1): the inbox — child with
  // SINGLETON semantics (no params; re-push pops-to-existing, standard child behavior).
  messagesInbox: {
    role: 'child',
    productSceneKey: null,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
  // W3 messaging (§4.1): the DM thread — ENTRY-KEYED per conversation (RT-19:
  // child role ⇒ entry-keyed mounts; params flow FROM THE ENTRY as props, C2).
  dmSession: {
    role: 'child',
    productSceneKey: null,
    sceneSwitch: true,
    sceneInput: true,
    staticSceneInput: true,
    seededForwardOpen: true,
    sheetPolicy: 'sharedPhysicalSheet',
    chromePolicy: 'preserve',
  },
} as const satisfies Record<OverlayKey, AppOverlayRouteMetadata>;

export const APP_OVERLAY_ROUTE_SCENE_SWITCH_KEYS = [
  'search',
  'home',
  'polls',
  'lists',
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
  'postPhotos',
  'messagesInbox',
  'dmSession',
] as const satisfies readonly OverlayKey[];

export const APP_OVERLAY_STATIC_ROUTE_SCENE_INPUT_KEYS = [
  'saveList',
  'lists',
  'profile',
  // stub-pass scenes (append-only — order is mount order)
  'userProfile',
  'listDetail',
  'followList',
  'notifications',
  'settings',
  'editProfile',
  'postPhotos',
  'messagesInbox',
  'dmSession',
] as const satisfies readonly OverlayKey[];

export const APP_OVERLAY_ROUTE_SCENE_INPUT_KEYS = [
  'search',
  'restaurant',
  'home',
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

export const createPollCreationChildRouteParams = (
  params?: OverlayRouteParamsMap['pollCreation']
): NonNullable<OverlayRouteParamsMap['pollCreation']> => ({
  ...params,
  ownerSceneKey: 'polls',
});

export const createPollDetailChildRouteParams = (
  params: OverlayRouteParamsMap['pollDetail']
): NonNullable<OverlayRouteParamsMap['pollDetail']> => ({
  ...params,
  pollId: params?.pollId ?? '',
  ownerSceneKey: 'polls',
});

export type OverlayRouteParamsMap = {
  search?: undefined;
  sheetHost?: undefined;
  /** Home takes no params — the shelves derive from the viewport. */
  home?: undefined;
  lists?: undefined;
  polls?: {
    pollId?: string | null;
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
  };
  saveList?: {
    listType: AppOverlaySaveListType;
    target: AppOverlaySaveListTarget | null;
    ownerSceneKey: AppOverlayTopLevelProductRouteKey;
    openerRouteKey?: OverlayKey | null;
    routeInstanceId: string;
  };
  price?: undefined;
  scoreInfo?: undefined;
  pollCreation?: {
    /** Display label for the creation header (the feed's §2 place verdict). */
    placeName?: string | null;
    bounds?: MapBounds | null;
    ownerSceneKey?: 'polls' | null;
    routeInstanceId?: string | null;
  };
  pollDetail?: {
    pollId: string;
    /** Optional snapshot for an instant header render (the feed card already has it). */
    poll?: import('../../services/polls').Poll | null;
    ownerSceneKey?: 'polls' | null;
    routeInstanceId?: string | null;
    // The comment a cross-surface reveal launched from. Set only when the route is RE-PUSHED by the
    // return-to-origin dismiss (resolveChildOriginRePush) so the panel scrolls-to + flashes that
    // comment. The routing layer guarantees the right poll re-mounts; the scroll-to + flash is a
    // panel-layer concern (PollDetailPanel's anchor restore effect).
    commentAnchorId?: string | null;
  };
  // ── Stub-pass scenes — param shapes only (all optional/nullable until real opens land).
  // F5900: NOT a stub shape. A profile route without a person is not a route, and
  // the four consumers were enumerated to prove no null is stored or serialized:
  // the URL codec only emits `/u/<id>` from `entity-ref-action-policy`'s already
  // non-null `params: { userId: string }` and only parses a route when the segment
  // is present; the equality map compares the field and does not depend on its
  // nullability; the entry-restore path forwards `sceneParams` and has NO producer
  // (zero call sites pass `getSceneParams` today); and every push site narrows
  // through `isInteractableAuthor`. The optional/nullable placeholder was doing
  // one thing only — it made F5802's proving mutation UNABLE to go red, because
  // `pushRoute('userProfile', { userId: possiblyNull })` typechecked. It does not
  // anymore.
  userProfile: {
    userId: string;
  };
  // W1 slice 4 (spec D.5 adjudication): the Desire-shaped list identity arm — listId is the
  // identity (a concrete list id OR the virtual 'all:restaurants'/'all:dishes'); shareSlug is
  // ACCESS MATERIAL (RT-18: the slug IS the capability — passed through to the server reads),
  // never identity; targetUserId scopes the virtual All to another user's public lists.
  listDetail?: {
    listId?: string | null;
    /** Home-surface Job 2: 'curated' = an app-curated list (GET /home/lists/:id,
     *  viewerRole 'viewer'); absent/null = a favorites list (the default). */
    source?: 'curated' | null;
    shareSlug?: string | null;
    targetUserId?: string | null;
    /** True only when the entry came from an invite-intent link (crave://l/<slug>?join=1). */
    joinIntent?: boolean | null;
    /** Leg 9 (listdetail-ideal §2a): warm-seed for the persistent-header title — the tap
     *  label paints the list name at frame 1; slug opens resolve it at meta time. */
    title?: string | null;
    /** Wave-4 §3: TRUE when this entry rode the listWorld composite (the executor
     *  dispatched the world half alongside the push) — the panel then reads the
     *  presented world's results for the default slice instead of self-fetching. */
    worldBacked?: boolean | null;
  };
  followList?: {
    userId?: string | null;
    mode?: 'followers' | 'following' | null;
  };
  notifications?: undefined;
  settings?: undefined;
  editProfile?: undefined;
  // W2 (§7.4): the post page. Trigger CONTEXT (restaurant/dish pre-fill) + the pending-assets
  // nonce — the picker/camera assets are NON-serializable and ride the module-scope
  // postPhotosPendingAssets store; sessionNonce is the key into it.
  postPhotos?: {
    restaurantId?: string | null;
    restaurantName?: string | null;
    dishId?: string | null;
    dishName?: string | null;
    sessionNonce?: string | null;
  };
  // W3 messaging (§4.1). Inbox is param-less; dmSession is entry-keyed per
  // conversation — conversationId is the identity, peerName an optional
  // instant-header snapshot (the DTO hydrate replaces it).
  messagesInbox?: undefined;
  dmSession?: {
    conversationId?: string | null;
    peerName?: string | null;
  };
};

export type OverlayRouteEntry<K extends OverlayKey = OverlayKey> = {
  /**
   * Stack-instance identity (S-B, entries-as-values): minted once at construction, preserved
   * across param updates. Two entries with the same scene key are DIFFERENT instances. Only
   * the stack algebra (app-overlay-route-stack-algebra.ts) constructs entries.
   */
  entryId: string;
  key: K;
  params: OverlayRouteParamsMap[K];
  /**
   * The committed presentation of the scene this push DEPARTED from (verdict §5.3: origin
   * lives on the PUSHED entry; pop applies the popped entry's origin to the scene it
   * reveals). Captured at push commit; null for roots/sentinels and non-push entries.
   */
  origin: OriginSnapshot | null;
  /**
   * Leg 4 (phase-1 design §1.3): the world identity this entry PRESENTS — present ⟺ the
   * entry is world-backed. Stamped at the ONE launch chokepoint (the launch-intent
   * consumer writes it onto the active entry alongside the tuple write), so every mouth
   * — executor pushes, the slug lane, future mouths — inherits it with zero per-surface
   * wiring. This is the honest session fact the dismiss algebra reads (the interim
   * `worldBacked` param sniff and the per-panel close registration both die on it).
   */
  desire: SearchQueryIdentity | null;
};
