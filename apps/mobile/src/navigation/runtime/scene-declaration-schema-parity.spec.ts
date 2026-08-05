// ═══ THE ONE SCENE-DECLARATION SCHEMA — PARITY ORACLE ════════════════════════════════════
//
// (redteam-abstractions.md finding 6; ratified ladder item 3.) The schema collapse was a PURE
// RELOCATION: every scene must resolve to the SAME value it did before, for every consumer
// that was migrated. This spec is the falsifier — it sweeps EVERY OverlayKey and compares the
// schema-derived answer against a FROZEN FOSSIL of the pre-change answer.
//
// The fossils below are byte-copies of the pre-change sources, taken at the collapse commit:
//   • LEGACY_FOUNDATION_SPECS  — scene-foundation-spec.ts's own SCENE_FOUNDATION_SPECS table.
//   • LEGACY_POLICY_BY_KEY     — app-route-scene-policy-registry.ts's APP_ROUTE_SCENE_POLICY_BY_KEY.
//   • LEGACY_* sets            — TrackSheetRouteHost.tsx's ROOT_TRACK_SCENES /
//     RESIDENT_TRACK_SCENES / UNPADDED_BODY_SCENES / MOUNTED_BODY_COMPONENTS keys, and the
//     per-scene ternaries (parts source, rowSurface, scroll-activity, create fallback,
//     grab handle) written out as total functions over the key space.
//
// WHEN A SCENE IS INTENTIONALLY RETUNED, update the matching fossil in the same change — this
// spec pins ACCIDENTAL divergence, not the schema's freedom to evolve.
//
// EXHAUSTIVENESS is compile-time-tied to the union via `satisfies Record<OverlayKey, true>`
// (the house idiom): adding a scene key without extending the domain map is a tsc error, so
// the sweep can never silently under-cover a new scene.

import type { OverlayKey } from '../../overlays/types';
import type { AppRouteScenePolicy, SceneFoundationSpec } from './scene-foundation-spec';
import {
  SCENE_DECLARATIONS,
  getSceneFoundationSpec,
  resolveSceneCreateFallbackRoute,
  resolveSceneListPartsSource,
  sceneDeclaresSharedRowSurface,
  sceneHidesGrabHandle,
  sceneIsChildRole,
  sceneIsResidentTrackScene,
  sceneMountedBodyIsEdgeToEdge,
  sceneParticipatesInWorldJoin,
  sceneReportsUserScrollActivity,
  sceneUsesMountedTrackBody,
  SCENE_FOUNDATION_SPECS,
} from './scene-foundation-spec';
import {
  APP_ROUTE_SCENE_KEYS,
  resolveAppRouteSceneSheetHostSceneKey,
  resolveAppRouteSheetScenePolicy,
  appRouteSceneUsesSharedSheetTarget,
} from './app-route-scene-policy-registry';

const SCENE_KEY_DOMAIN = {
  search: true,
  sheetHost: true,
  polls: true,
  lists: true,
  profile: true,
  home: true,
  restaurant: true,
  saveList: true,
  price: true,
  scoreInfo: true,
  pollCreation: true,
  pollDetail: true,
  userProfile: true,
  listDetail: true,
  followList: true,
  notifications: true,
  settings: true,
  editProfile: true,
  postPhotos: true,
  messagesInbox: true,
  dmSession: true,
} satisfies Record<OverlayKey, true>;

const ALL_SCENE_KEYS = Object.keys(SCENE_KEY_DOMAIN) as readonly OverlayKey[];

const LEGACY_SHEET_HOST_TARGET_GROUP: OverlayKey = 'sheetHost';

const LEGACY_FOUNDATION_SPECS: Record<string, SceneFoundationSpec> = {
  // HOME (home-surface-charter): shelves of curated-list cards — tile skeleton,
  // NO filter strip on home by design (strip: 'none').
  home: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  polls: {
    skeleton: { rowType: 'restaurant' },
    // Leg 3: migrated to the persistent-header extension mount (PollsFeedStrip,
    // registered on the polls persistent-header descriptor) — the audited snap-in
    // gate died with the in-list strip.
    strip: 'header',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  lists: {
    skeleton: { rowType: 'tile' },
    // Leg 3: migrated to the persistent-header extension mount (ListsHomeStrip —
    // ONE ToggleStrip whose action-row slot carries the edit morph). The leg-2
    // 'in-list' row described the hand-rolled two-strip morph, deleted with it.
    strip: 'header',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  profile: {
    skeleton: { rowType: 'restaurant' },
    strip: 'none',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  restaurant: {
    skeleton: { rowType: 'dish' },
    strip: 'none',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  saveList: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  pollDetail: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  pollCreation: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  // Stub-pass scenes (plans/page-registry.md §1) — foundation decisions stated ahead
  // of the real bodies; their design passes revise values, never optionality.
  userProfile: {
    skeleton: { rowType: 'restaurant' },
    strip: 'none',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  listDetail: {
    skeleton: { rowType: 'restaurant' },
    // Leg 9 (listdetail-ideal §2b): the real ToggleStrip in-list mount — the hand-rolled
    // SortChips band is deleted; this declaration is load-bearing via the strip-law assert
    // in ListDetailPanel's ToggleStrip.
    strip: 'in-list',
    grabHandle: 'visible',
    snapLock: 'none',
    // OA1: listDetail is IN the world-join family — the list world presents into
    // this child and its rows hold on the same admission gate as results.
    worldJoin: true,
  },
  followList: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  notifications: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  settings: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    // §7.7/§9a: full-page illusion — NO grab handle, X close. Settings rides the STANDARD
    // child shell (same snaps as every child, so profile↔settings never moves the sheet)
    // and is LOCKED at the top snap instead: drags rubber-band back.
    grabHandle: 'hidden',
    snapLock: 'expanded',
    worldJoin: false,
  },
  editProfile: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  // W2 (page-registry §7.4): the post page — photo tiles; no filter strip.
  postPhotos: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  // W3 messaging (§4.1): inbox = person rows; DM thread = message rows.
  messagesInbox: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
  dmSession: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    grabHandle: 'visible',
    snapLock: 'none',
    worldJoin: false,
  },
};

const LEGACY_POLICY_BY_KEY: Record<OverlayKey, AppRouteScenePolicy> = {
  search: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'collapsed',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: false,
    canSwipeDismiss: false,
    postureSeat: 'home',
    chromePolicy: { kind: 'search-chrome-from-snap' },
  },
  // HOME — THE docked scene (took polls' old docked policy row verbatim).
  home: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'collapsed',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: false,
    // Non-dismissable by swipe (like every other route sheet): a downward drag rubber-bands at
    // the docked bar (collapsed) instead of swiping the lane to hidden. The docked bar is a
    // permanent fixture; the programmatic dismiss path (`dismissDockedScene`) still works
    // since explicit snap targets aren't bounded by the gesture upperBound.
    canSwipeDismiss: false,
    postureSeat: 'home',
    chromePolicy: { kind: 'search-chrome-from-snap' },
  },
  // Polls demotion: a regular content page (mirrors lists' seat + chrome).
  polls: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: 'content',
    chromePolicy: { kind: 'preserve' },
  },
  lists: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: 'content',
    chromePolicy: { kind: 'preserve' },
  },
  profile: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: 'content',
    chromePolicy: { kind: 'preserve' },
  },
  saveList: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  pollCreation: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  pollDetail: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  restaurant: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'middle',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: false,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  sheetHost: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'collapsed',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: false,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  price: {
    sheetTargetGroup: null,
    defaultFirstEntrySnap: null,
    allowedSnaps: [],
    requiresExpandedPresentation: false,
    canSwipeDismiss: true,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  // ── Stub-pass child scenes (plans/page-registry.md §1) — clone the saveList policy.
  userProfile: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  listDetail: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  followList: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  notifications: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  settings: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  editProfile: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  // W2 (page-registry §7.4): the post page — full-page child, same policy family.
  postPhotos: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  // W3 messaging (§4.1/§7.9): both full-page children — tapping Message/inbox
  // fully extends the sheet (requiresExpandedPresentation), back restores the
  // prior snap via the standard child-dismiss glide.
  messagesInbox: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  dmSession: {
    sheetTargetGroup: LEGACY_SHEET_HOST_TARGET_GROUP,
    defaultFirstEntrySnap: 'expanded',
    allowedSnaps: ['expanded', 'middle', 'collapsed', 'hidden'],
    requiresExpandedPresentation: true,
    canSwipeDismiss: false,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
  scoreInfo: {
    sheetTargetGroup: null,
    defaultFirstEntrySnap: null,
    allowedSnaps: [],
    requiresExpandedPresentation: false,
    canSwipeDismiss: true,
    postureSeat: null,
    chromePolicy: { kind: 'preserve' },
  },
};

// ─── TrackSheetRouteHost.tsx fossils (the three hand-kept Sets + the per-scene ternaries) ──
const LEGACY_ROOT_TRACK_SCENES = new Set<OverlayKey>([
  'home',
  'polls',
  'lists',
  'profile',
  'search',
] as OverlayKey[]);

const LEGACY_UNPADDED_BODY_SCENES = new Set<OverlayKey>(['listDetail'] as OverlayKey[]);

const LEGACY_RESIDENT_TRACK_SCENES = new Set<OverlayKey>([
  'search',
  'home',
  'polls',
  'lists',
  'profile',
] as OverlayKey[]);

// The keys of MOUNTED_BODY_COMPONENTS — the set MOUNTED_TRACK_SCENES was derived from.
const LEGACY_MOUNTED_TRACK_SCENES = new Set<OverlayKey>([
  'lists',
  'profile',
  'saveList',
  'userProfile',
  'listDetail',
  'followList',
  'notifications',
  'settings',
  'editProfile',
  'postPhotos',
  'messagesInbox',
  'dmSession',
] as OverlayKey[]);

/** `legScene === 'polls' ? pollsParts : legScene === 'home' || legScene === 'search' ? homeParts : null` */
const legacyPartsSource = (sceneKey: OverlayKey): 'home' | 'polls' | null =>
  sceneKey === 'polls' ? 'polls' : sceneKey === 'home' || sceneKey === 'search' ? 'home' : null;

/** the `|| legScene === 'polls'` arm of the rowSurfaceStyle ternary */
const legacyDeclaresSharedRowSurface = (sceneKey: OverlayKey): boolean => sceneKey === 'polls';

/** `legScene === 'polls' ? pollsParts.sceneBodyTransport.onUserListScrollActivity : undefined` */
const legacyReportsUserScrollActivity = (sceneKey: OverlayKey): boolean => sceneKey === 'polls';

/** `if (!runHeaderCreateAction(scene) && scene === 'polls') pushRoute('pollCreation')` */
const legacyCreateFallbackRoute = (sceneKey: OverlayKey): OverlayKey | null =>
  sceneKey === 'polls' ? 'pollCreation' : null;

/** `grabHandleHidden={scene === 'settings'}` */
const legacyHidesGrabHandle = (sceneKey: OverlayKey): boolean => sceneKey === 'settings';

describe('the one scene-declaration schema — parity with the five dialects it folded in', () => {
  it('covers every OverlayKey with exactly one row (no key missing, no extra)', () => {
    expect(new Set(Object.keys(SCENE_DECLARATIONS))).toEqual(new Set(ALL_SCENE_KEYS));
    expect(new Set(APP_ROUTE_SCENE_KEYS)).toEqual(new Set(ALL_SCENE_KEYS));
  });

  describe('dialect 1 — the foundation table', () => {
    it.each(ALL_SCENE_KEYS)('%s resolves the same foundation row', (sceneKey) => {
      expect(getSceneFoundationSpec(sceneKey)).toEqual(LEGACY_FOUNDATION_SPECS[sceneKey]);
    });

    it('the derived SCENE_FOUNDATION_SPECS view equals the legacy table exactly', () => {
      expect(SCENE_FOUNDATION_SPECS).toEqual(LEGACY_FOUNDATION_SPECS);
    });

    it('the foundation-null rows are exactly the four keys excluded by design', () => {
      const nullRows = ALL_SCENE_KEYS.filter(
        (sceneKey) => SCENE_DECLARATIONS[sceneKey].foundation == null
      );
      expect(new Set(nullRows)).toEqual(new Set(['search', 'sheetHost', 'price', 'scoreInfo']));
    });

    it.each(ALL_SCENE_KEYS)('%s resolves the same world-join membership', (sceneKey) => {
      const legacy = sceneKey === 'search' || LEGACY_FOUNDATION_SPECS[sceneKey]?.worldJoin === true;
      expect(sceneParticipatesInWorldJoin(sceneKey)).toBe(legacy);
    });
  });

  describe('dialect 2 — the scene-policy registry', () => {
    it.each(ALL_SCENE_KEYS)('%s resolves the same sheet policy', (sceneKey) => {
      const legacy = LEGACY_POLICY_BY_KEY[sceneKey];
      expect(resolveAppRouteSheetScenePolicy(sceneKey)).toEqual({
        sheetTargetGroup: legacy.sheetTargetGroup,
        defaultFirstEntrySnap: legacy.defaultFirstEntrySnap,
        allowedSnaps: legacy.allowedSnaps,
        requiresExpandedPresentation: legacy.requiresExpandedPresentation,
        canSwipeDismiss: legacy.canSwipeDismiss,
        postureSeat: legacy.postureSeat,
      });
    });

    it.each(ALL_SCENE_KEYS)('%s resolves the same sheet host + chrome policy', (sceneKey) => {
      const legacy = LEGACY_POLICY_BY_KEY[sceneKey];
      expect(resolveAppRouteSceneSheetHostSceneKey(sceneKey)).toBe(legacy.sheetTargetGroup);
      expect(appRouteSceneUsesSharedSheetTarget({ sceneKey, sheetTargetGroup: 'sheetHost' })).toBe(
        legacy.sheetTargetGroup === 'sheetHost'
      );
      expect(SCENE_DECLARATIONS[sceneKey].policy.chromePolicy).toEqual(legacy.chromePolicy);
    });
  });

  describe("dialect 3 — TrackSheetRouteHost's hand-kept sets", () => {
    it.each(ALL_SCENE_KEYS)('%s resolves the same role (isChildScene)', (sceneKey) => {
      expect(sceneIsChildRole(sceneKey)).toBe(!LEGACY_ROOT_TRACK_SCENES.has(sceneKey));
    });

    it.each(ALL_SCENE_KEYS)('%s resolves the same residency', (sceneKey) => {
      expect(sceneIsResidentTrackScene(sceneKey)).toBe(LEGACY_RESIDENT_TRACK_SCENES.has(sceneKey));
    });

    it.each(ALL_SCENE_KEYS)('%s resolves the same mounted-body membership', (sceneKey) => {
      expect(sceneUsesMountedTrackBody(sceneKey)).toBe(LEGACY_MOUNTED_TRACK_SCENES.has(sceneKey));
    });

    it.each(ALL_SCENE_KEYS)('%s resolves the same body inset', (sceneKey) => {
      expect(sceneMountedBodyIsEdgeToEdge(sceneKey)).toBe(
        LEGACY_MOUNTED_TRACK_SCENES.has(sceneKey) && LEGACY_UNPADDED_BODY_SCENES.has(sceneKey)
      );
    });
  });

  describe('dialect 4 — the per-scene ternaries inlined in the host', () => {
    it.each(ALL_SCENE_KEYS)('%s resolves the same list-parts source', (sceneKey) => {
      expect(resolveSceneListPartsSource(sceneKey)).toBe(legacyPartsSource(sceneKey));
    });

    it.each(ALL_SCENE_KEYS)('%s resolves the same shared row surface', (sceneKey) => {
      expect(sceneDeclaresSharedRowSurface(sceneKey)).toBe(
        legacyDeclaresSharedRowSurface(sceneKey)
      );
    });

    it.each(ALL_SCENE_KEYS)('%s resolves the same scroll-activity wiring', (sceneKey) => {
      expect(sceneReportsUserScrollActivity(sceneKey)).toBe(
        legacyReportsUserScrollActivity(sceneKey)
      );
    });

    it.each(ALL_SCENE_KEYS)('%s resolves the same header create fallback', (sceneKey) => {
      expect(resolveSceneCreateFallbackRoute(sceneKey)).toBe(legacyCreateFallbackRoute(sceneKey));
    });

    it.each(ALL_SCENE_KEYS)('%s resolves the same grab-handle decision', (sceneKey) => {
      expect(sceneHidesGrabHandle(sceneKey)).toBe(legacyHidesGrabHandle(sceneKey));
    });
  });

  describe('MUTATION PROOFS — every derived selector can show RED', () => {
    it('a mutated role column flips isChildScene', () => {
      const row = SCENE_DECLARATIONS.polls.track;
      const restore = row.role;
      row.role = 'child';
      expect(sceneIsChildRole('polls')).toBe(true);
      expect(sceneIsChildRole('polls')).not.toBe(!LEGACY_ROOT_TRACK_SCENES.has('polls'));
      row.role = restore;
      expect(sceneIsChildRole('polls')).toBe(false);
    });

    it('a mutated residency column flips the resident answer', () => {
      const row = SCENE_DECLARATIONS.lists.track;
      const restore = row.residency;
      row.residency = 'transient';
      expect(sceneIsResidentTrackScene('lists')).toBe(false);
      row.residency = restore;
      expect(sceneIsResidentTrackScene('lists')).toBe(true);
    });

    it('a mutated body kind flips mounted membership and the parts source', () => {
      const row = SCENE_DECLARATIONS.lists.track;
      const restore = row.body;
      row.body = {
        kind: 'parts',
        source: 'polls',
        rowSurface: true,
        reportsUserScrollActivity: true,
      };
      expect(sceneUsesMountedTrackBody('lists')).toBe(false);
      expect(resolveSceneListPartsSource('lists')).toBe('polls');
      expect(sceneDeclaresSharedRowSurface('lists')).toBe(true);
      expect(sceneReportsUserScrollActivity('lists')).toBe(true);
      row.body = restore;
      expect(sceneUsesMountedTrackBody('lists')).toBe(true);
      expect(resolveSceneListPartsSource('lists')).toBeNull();
    });

    it('a mutated inset flips the edge-to-edge answer', () => {
      const row = SCENE_DECLARATIONS.listDetail.track;
      const restore = row.body;
      row.body = { kind: 'mounted', inset: 'padded' };
      expect(sceneMountedBodyIsEdgeToEdge('listDetail')).toBe(false);
      row.body = restore;
      expect(sceneMountedBodyIsEdgeToEdge('listDetail')).toBe(true);
    });

    it('a mutated createFallbackRoute flips the header create answer', () => {
      const row = SCENE_DECLARATIONS.polls.track;
      const restore = row.createFallbackRoute;
      row.createFallbackRoute = null;
      expect(resolveSceneCreateFallbackRoute('polls')).toBeNull();
      row.createFallbackRoute = restore;
      expect(resolveSceneCreateFallbackRoute('polls')).toBe('pollCreation');
    });

    it('a mutated grabHandle column flips the host grab-handle answer', () => {
      const foundation = SCENE_DECLARATIONS.settings.foundation as SceneFoundationSpec;
      foundation.grabHandle = 'visible';
      expect(sceneHidesGrabHandle('settings')).toBe(false);
      foundation.grabHandle = 'hidden';
      expect(sceneHidesGrabHandle('settings')).toBe(true);
    });

    it('a mutated worldJoin column flips world-join membership', () => {
      const foundation = SCENE_DECLARATIONS.listDetail.foundation as SceneFoundationSpec;
      foundation.worldJoin = false;
      expect(sceneParticipatesInWorldJoin('listDetail')).toBe(false);
      foundation.worldJoin = true;
      expect(sceneParticipatesInWorldJoin('listDetail')).toBe(true);
    });

    it('a mutated policy column flips the resolved policy', () => {
      const policy = SCENE_DECLARATIONS.restaurant.policy as AppRouteScenePolicy;
      policy.defaultFirstEntrySnap = 'expanded';
      expect(resolveAppRouteSheetScenePolicy('restaurant').defaultFirstEntrySnap).toBe('expanded');
      policy.defaultFirstEntrySnap = 'middle';
      expect(resolveAppRouteSheetScenePolicy('restaurant').defaultFirstEntrySnap).toBe('middle');
    });
  });
});

void LEGACY_SHEET_HOST_TARGET_GROUP;
