import type { SceneLoadingRowType } from '../../components/skeletons';
import type { BottomSheetSnap } from '../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../overlays/types';

/**
 * ═══ THE ONE SCENE-DECLARATION SCHEMA ═══════════════════════════════════════════════
 *
 * (redteam-abstractions.md finding 6 — "five dialects of declaring a scene"; the ratified
 * ladder item 3.) EVERY per-scene decision this app makes lives in ONE exhaustive
 * `Record<OverlayKey, SceneDeclaration>` below. Adding an `OverlayKey` fails the build
 * until the new scene STATES every decision — a forgotten key is a build error that names
 * the key, never a silent default; a HALF-configured scene is unrepresentable.
 *
 * The row has three groups, each formerly its own dialect:
 *   • `policy`     — sheet/route policy (was app-route-scene-policy-registry's own Record).
 *   • `track`      — the track-sheet role/residency/body facts (was THREE hand-kept `Set`s
 *                    plus per-scene ternaries inside TrackSheetRouteHost.tsx — the host's
 *                    own F872 NOT-DONE note asked for exactly this move).
 *   • `foundation` — the page-foundation decisions (skeleton/strip/grabHandle/snapLock/
 *                    worldJoin). `null` is a STATED decision, not an omission: the four
 *                    keys excluded from the sheet foundation by design are
 *                    - 'search'    — owns its never-null page (the mounted scene bundle authority);
 *                    - 'sheetHost' — the shell sentinel frame, not a scene;
 *                    - 'price' / 'scoreInfo' — modals (the OverlayModalSheet system sits
 *                      outside the sheet foundation).
 *
 * THE SHAPE THIS GENERALIZES is `worldJoin` (R7 checkpoint): a REQUIRED literal column with
 * an exhaustiveness guarantee, so a new scene cannot silently inherit a wrong behavior. Every
 * column added here follows it — required literals over optional-with-default.
 *
 * DELIBERATELY NOT COLUMNS (stated, not implied):
 *   • The persistent-header descriptors (Title/Extras/Strip/navActionLabels) stay a runtime
 *     REGISTRY (app-route-persistent-header-registry.ts): they are React COMPONENTS that must
 *     be registered by the module that owns the scene's runtime, and hoisting them here would
 *     invert the dependency (this pure, hermetically-testable table would import every panel).
 *     The strip PLACEMENT decision is the column; the strip COMPONENT is the registration.
 *   • The mounted-body COMPONENT map (MOUNTED_BODY_COMPONENTS in tracksheet/use-track-leg-resolver,
 *     key list in tracksheet/track-mounted-body-contract) — same reason;
 *     `track.body.kind === 'mounted'` is the declaration, the component is the registration.
 *   • The sheet-motion descriptor TABLE (app-route-sheet-motion-descriptor-table.ts) stays a
 *     separate table: its rows are keyed on (from, to, transitionKind) with a precedence
 *     lattice — an EDGE relation, not a per-scene column. It already DERIVES its per-scene
 *     content from this schema (the topLevelSwitch rows are generated from `postureSeat`).
 */

// ─── FOUNDATION GROUP ────────────────────────────────────────────────────────────────
export type SceneFoundationSpec = {
  /** The cutout skeleton the shared loading leg renders for this scene. */
  skeleton: { rowType: SceneLoadingRowType };
  /**
   * THE STRIP LAW (load-bearing since leg 2 — plans/toggle-strip-rebuild-ledger.md):
   * whether this page renders a toggle/filter strip, and WHERE it mounts.
   * 'in-list' = the strip rides the list content (results pattern); 'header' = the
   * persistent-header extension mount (leg 3). Consumed by `useSceneStripLawAssert`
   * (toggle-strip-scene-law.ts): a strip rendering on a scene declared 'none', or
   * under a placement this row contradicts, is a dev CONTRACT bark — the declaration
   * can show RED, it is not documentation.
   */
  strip: 'none' | 'in-list' | 'header';
  // F1389: `failure: 'announcer'` and `header: 'persistent'` used to live here as
  // single-inhabitant literal types repeated on all 18 rows — every `===` test against
  // them had a structurally unreachable false arm, so the "every scene must STATE its
  // decision" claim was 18x repetition of what the type already forced. `failure` had
  // zero readers anywhere and is deleted outright; `header` was compared at
  // PersistentSheetHeaderHost.tsx:260 only to pick console.error vs console.warn, and
  // is now console.error unconditionally there (the standard both fields asserted is
  // unchanged — a sheet scene without a registered header descriptor is ALWAYS a
  // contract violation, never a warning).
  /**
   * W4 (§9a settings row / W0.2 adjudication): whether the persistent header
   * renders the grab handle. 'hidden' = the full-page-illusion scenes (settings
   * is the first consumer) — no handle bar, no handle cutout, no promote press;
   * the close X is the only exit affordance. Required literal on every row so a
   * new scene must STATE its handle decision (RED-provable: every other scene
   * says 'visible').
   */
  grabHandle: 'visible' | 'hidden';
  /**
   * Whether the sheet is PINNED to the expanded snap while this scene is presented.
   * 'expanded' (settings is the first consumer) = the scene rides the STANDARD child shell —
   * identical snap points, so page switches never move the sheet — but dragging down
   * rubber-bands back to the top snap (the §8.11 edit-lock mechanics, keyed off this
   * compile-time table instead of a runtime token; see overlaySheetSceneSnapLockRuntime).
   * Required literal so every scene must STATE its lock decision.
   */
  snapLock: 'expanded' | 'none';
  // F1389: `bodySurface: 'white'` used to live here, also single-inhabitant and repeated
  // on all 18 rows. THE FOUNDATION WHITE LAYER standard it asserted (owner standard,
  // 2026-07-11 — every page renders a white plate over the shared frosted foundation, no
  // page may sit on bare frost) is UNCHANGED; it is simply no longer a per-row field with
  // a structurally-unreachable false arm. The body host (post-R8: the track's leg bodies)
  // renders the white plate unconditionally for every sheet scene instead of gating
  // on `?.bodySurface === 'white'`. Per-page CUTOUTS (holes showing the frost through)
  // are still runtime-registered via `<FrostCutout>` — see ADDING_A_SCENE.md §5. The
  // search/results sheet stays excluded (owns its canonical composition).
  /**
   * THE WORLD-JOIN FAMILY (OA1, transition-endstate-contract; R7): whether this
   * scene's reveal rides the search surface's ONE world episode — a TransitionTxn
   * `revise` joining {paint (cards), mapFrame (map items), sheet}, so cards and map
   * items reveal at the exact same instant. Required literal: membership used to be
   * the IMPLICIT invariant "there is exactly one world surface" (ListDetailPanel's
   * bespoke `worldBacked` subscription), which breaks silently under entry stacking
   * (G-ENTRY). Consumed by `sceneParticipatesInWorldJoin` — the hold-gate and the
   * mismatch bark derive from THIS declaration, so deleting a row's flag is a dev
   * RED ([WORLD-JOIN]), never a silent gate bypass. 'search' is excluded from this
   * table by design and is the family's home surface by construction (see
   * sceneParticipatesInWorldJoin).
   */
  worldJoin: boolean;
};

/**
 * The keys that HAVE a foundation row. The four excluded keys are stated once, here and in
 * the schema's own `foundation: null` rows — the parity spec pins the two statements
 * together (a row that says null for a key inside SheetSceneKey, or non-null for one
 * outside it, is a test RED).
 */
export type SheetSceneKey = Exclude<OverlayKey, 'search' | 'sheetHost' | 'price' | 'scoreInfo'>;

// ─── POLICY GROUP ────────────────────────────────────────────────────────────────────
export type AppRouteSceneChromePolicy = { kind: 'search-chrome-from-snap' } | { kind: 'preserve' };

export type AppRouteSheetScenePolicy = {
  sheetTargetGroup: OverlayKey | null;
  defaultFirstEntrySnap: BottomSheetSnap | null;
  allowedSnaps: readonly BottomSheetSnap[];
  requiresExpandedPresentation: boolean;
  canSwipeDismiss: boolean;
  // F947: `snapPersistence: 'none' | 'scene'` used to live here. All 22 rows said 'none',
  // so the 'scene' arm of its only consumer was unreachable and the store it fed
  // (persistentSnaps / getPersistentSnap / recordPersistentSnap) had no reachable
  // writer or reader — A WHOLE PERSISTENCE LANE WIRED TO NOTHING. Root-page posture
  // memory is NOT persistence: it lives in the two posture seats (`postureSeat` below),
  // which is why nothing ever needed this. Deleted, lane and all; it comes back with a
  // scene that actually needs a second value.
  /**
   * TWO-POSTURE LAW membership (plans/root-snap-law.md §Leg 2/§Leg 3): which posture seat this
   * scene presents at when it is a NAV-PAGE (topLevelSwitch) target. 'home' = the search root's
   * docked posture; 'content' = the ONE shared posture of every other root page; null =
   * not a root page (children/modals never resolve through a posture seat). This field is the
   * SINGLE source of truth the seat resolver AND the descriptor table's topLevelSwitch rows
   * derive from — a new root page declares its seat HERE (the exhaustive Record makes skipping
   * the decision a compile error) and inherits the law by construction.
   */
  postureSeat: 'home' | 'content' | null;
};

export type AppRouteScenePolicy = AppRouteSheetScenePolicy & {
  chromePolicy: AppRouteSceneChromePolicy;
};

// ─── TRACK GROUP (folded in from TrackSheetRouteHost's hand-kept sets, F872) ──────────
/**
 * The scene's role on the ONE track. 'root' = a nav page (the header action is the red
 * plus; never a back/close). 'child' = a pushed page (the header action is the black X).
 * 'modal' = renders OUTSIDE the shared sheet (price/scoreInfo — the descriptor table's
 * mandate rows), 'shell' = the sheetHost sentinel frame. Replaces ROOT_TRACK_SCENES:
 * `isChildScene` is `role !== 'root'`, byte-identical to `!ROOT_TRACK_SCENES.has(scene)`
 * (no modal/shell key is ever the painted scene).
 */
export type SceneTrackRole = 'root' | 'child' | 'modal' | 'shell';

/**
 * WHERE THIS SCENE'S LEG BODY COMES FROM — the trichotomy that used to exist only as
 * inline `legScene === 'polls' ? pollsParts : homeParts` ternaries plus a derived
 * mounted-key set. Declaring it makes the host's body resolution total and data-driven.
 *
 * NOTE ON PRECEDENCE (unchanged behavior): the PUBLISHED scene-input lane still wins for
 * the PRESENTED entry regardless of this column — 'home'/'polls' publish list bodies too,
 * and the host checks the lane first. This column names the leg's OWN body source, which
 * is what every hidden/retained leg resolves through.
 */
export type SceneTrackBody =
  /** The body is built by a list-PARTS hook the host calls (home/search share one). */
  | {
      kind: 'parts';
      source: 'home' | 'polls';
      /**
       * Whether this scene's rows ride the shared `rowSurface` style. Today only polls
       * (home/search rows are wrapped by `wrapRowOnFoundation` instead) — the literal
       * that replaces the `legScene === 'polls'` arm of the rowSurfaceStyle ternary.
       */
      rowSurface: boolean;
      /** Whether the parts transport exposes an onUserListScrollActivity sink (polls only). */
      reportsUserScrollActivity: boolean;
    }
  /** The body is a mounted panel component (the mounted-body registry). */
  | {
      kind: 'mounted';
      /**
       * 'edge-to-edge' = the body owns its own insets (in-list strips must bleed — the
       * ToggleStrip band law barks inside any padded mount). Replaces UNPADDED_BODY_SCENES.
       */
      inset: 'padded' | 'edge-to-edge';
    }
  /** The body arrives only over the published scene-input lane (restaurant/poll pages). */
  | { kind: 'published-lane' }
  /** Not a track body at all (the shell sentinel and the modal scenes). */
  | { kind: 'none' };

export type SceneTrackDeclaration = {
  role: SceneTrackRole;
  /**
   * 'resident' = the leg mounts on first visit and STAYS (tab scenes, E1); 'transient' =
   * entry-keyed, retained only by the depth-K child LRU. Replaces RESIDENT_TRACK_SCENES.
   */
  residency: 'resident' | 'transient';
  body: SceneTrackBody;
  /**
   * The route the header CREATE (+) action pushes when the scene registered no create
   * action of its own. Replaces the host's `scene === 'polls'` create fallback.
   */
  createFallbackRoute: OverlayKey | null;
  /**
   * G-A11Y — THE DESTINATION NAME a screen reader hears when this scene becomes the
   * track's presented entry. The ONE TRACK swaps DATA on a persistent list instead of
   * mounting a screen, so assistive tech receives no navigation event of its own: the
   * host states one (announce + move focus) and this literal is what it says. Required
   * on every row for the worldJoin reason — a new scene that forgot its name would be
   * SILENTLY unannounced (the exact failure a screen-reader user cannot detect), so
   * omission is a tsc error instead. The header Title is a React COMPONENT (registry,
   * not this table) and cannot be read as text; this is the announcement's only home.
   */
  a11yName: string;
};

// ─── THE ROW ─────────────────────────────────────────────────────────────────────────
export type SceneDeclaration = {
  policy: AppRouteScenePolicy;
  track: SceneTrackDeclaration;
  /** `null` = deliberately outside the sheet foundation (see the header comment). */
  foundation: SceneFoundationSpec | null;
};

const SHEET_HOST_TARGET_GROUP: OverlayKey = 'sheetHost';
const ALL_SHEET_SNAPS: readonly BottomSheetSnap[] = ['expanded', 'middle', 'collapsed', 'hidden'];

export const SCENE_DECLARATIONS: Record<OverlayKey, SceneDeclaration> = {
  search: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'collapsed',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: false,
      canSwipeDismiss: false,
      postureSeat: 'home',
      chromePolicy: { kind: 'search-chrome-from-snap' },
    },
    // search shares the HOME list-parts hook (its dual-band composition is assembled by the
    // same parts owner); it is a resident root leg and never renders the shared rowSurface.
    track: {
      role: 'root',
      residency: 'resident',
      body: { kind: 'parts', source: 'home', rowSurface: false, reportsUserScrollActivity: false },
      createFallbackRoute: null,
      a11yName: 'Search results',
    },
    // Excluded by design: search owns its never-null page (the mounted scene bundle authority).
    foundation: null,
  },
  // HOME — THE docked scene (took polls' old docked policy row verbatim).
  home: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'collapsed',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: false,
      // Non-dismissable by swipe (like every other route sheet): a downward drag rubber-bands at
      // the docked bar (collapsed) instead of swiping the lane to hidden. The docked bar is a
      // permanent fixture; the programmatic dismiss path (`dismissDockedScene`) still works
      // since explicit snap targets aren't bounded by the gesture upperBound.
      canSwipeDismiss: false,
      postureSeat: 'home',
      chromePolicy: { kind: 'search-chrome-from-snap' },
    },
    track: {
      role: 'root',
      residency: 'resident',
      body: { kind: 'parts', source: 'home', rowSurface: false, reportsUserScrollActivity: false },
      createFallbackRoute: null,
      a11yName: 'Home',
    },
    // HOME (home-surface-charter): shelves of curated-list cards — tile skeleton,
    // NO filter strip on home by design (strip: 'none').
    foundation: {
      skeleton: { rowType: 'tile' },
      strip: 'none',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  // Polls demotion: a regular content page (mirrors lists' seat + chrome).
  polls: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: 'content',
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'root',
      residency: 'resident',
      body: { kind: 'parts', source: 'polls', rowSurface: true, reportsUserScrollActivity: true },
      // The polls header plus creates a poll when the scene registered no create action.
      createFallbackRoute: 'pollCreation',
      a11yName: 'Polls',
    },
    foundation: {
      skeleton: { rowType: 'restaurant' },
      // Leg 3: migrated to the persistent-header extension mount (PollsFeedStrip,
      // registered on the polls persistent-header descriptor) — the audited snap-in
      // gate died with the in-list strip.
      strip: 'header',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  lists: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: 'content',
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'root',
      residency: 'resident',
      body: { kind: 'mounted', inset: 'padded' },
      createFallbackRoute: null,
      a11yName: 'Lists',
    },
    foundation: {
      skeleton: { rowType: 'tile' },
      // Leg 3: migrated to the persistent-header extension mount (ListsHomeStrip —
      // ONE ToggleStrip whose action-row slot carries the edit morph). The leg-2
      // 'in-list' row described the hand-rolled two-strip morph, deleted with it.
      strip: 'header',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  profile: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: 'content',
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'root',
      residency: 'resident',
      body: { kind: 'mounted', inset: 'padded' },
      createFallbackRoute: null,
      a11yName: 'Profile',
    },
    foundation: {
      skeleton: { rowType: 'restaurant' },
      strip: 'none',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  saveList: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'child',
      residency: 'transient',
      body: { kind: 'mounted', inset: 'padded' },
      createFallbackRoute: null,
      a11yName: 'Save to list',
    },
    foundation: {
      // OA10 vocabulary: 'rows' — the SaveList sheet's interim skeleton matches
      // today's row content (the TODO(owner) is answered; end state is the
      // view-mode preference on both surfaces).
      skeleton: { rowType: 'rows' },
      strip: 'none',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  pollCreation: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'child',
      residency: 'transient',
      body: { kind: 'published-lane' },
      createFallbackRoute: null,
      a11yName: 'New poll',
    },
    foundation: {
      skeleton: { rowType: 'comment' },
      strip: 'none',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  pollDetail: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'child',
      residency: 'transient',
      body: { kind: 'published-lane' },
      createFallbackRoute: null,
      a11yName: 'Poll',
    },
    foundation: {
      skeleton: { rowType: 'comment' },
      strip: 'none',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  restaurant: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'middle',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: false,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'child',
      residency: 'transient',
      body: { kind: 'published-lane' },
      createFallbackRoute: null,
      a11yName: 'Restaurant',
    },
    foundation: {
      skeleton: { rowType: 'dish' },
      strip: 'none',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  sheetHost: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'collapsed',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: false,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'shell',
      residency: 'transient',
      body: { kind: 'none' },
      createFallbackRoute: null,
      a11yName: 'Sheet',
    },
    // Excluded by design: the shell sentinel frame, not a scene.
    foundation: null,
  },
  price: {
    policy: {
      sheetTargetGroup: null,
      defaultFirstEntrySnap: null,
      allowedSnaps: [],
      requiresExpandedPresentation: false,
      canSwipeDismiss: true,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'modal',
      residency: 'transient',
      body: { kind: 'none' },
      createFallbackRoute: null,
      a11yName: 'Price',
    },
    // Excluded by design: modal (the OverlayModalSheet system sits outside the foundation).
    foundation: null,
  },
  // ── Stub-pass child scenes (plans/page-registry.md §1) — clone the saveList policy.
  userProfile: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'child',
      residency: 'transient',
      body: { kind: 'mounted', inset: 'padded' },
      createFallbackRoute: null,
      a11yName: 'Profile',
    },
    // Stub-pass scenes (plans/page-registry.md §1) — foundation decisions stated ahead
    // of the real bodies; their design passes revise values, never optionality.
    foundation: {
      skeleton: { rowType: 'restaurant' },
      strip: 'none',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  listDetail: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'child',
      residency: 'transient',
      // The in-list strip must bleed edge-to-edge (the ToggleStrip band law barks inside
      // any padded mount) — the body owns its own insets.
      body: { kind: 'mounted', inset: 'edge-to-edge' },
      createFallbackRoute: null,
      a11yName: 'List',
    },
    foundation: {
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
  },
  followList: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'child',
      residency: 'transient',
      body: { kind: 'mounted', inset: 'padded' },
      createFallbackRoute: null,
      a11yName: 'Follows',
    },
    foundation: {
      skeleton: { rowType: 'tile' },
      strip: 'none',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  notifications: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'child',
      residency: 'transient',
      body: { kind: 'mounted', inset: 'padded' },
      createFallbackRoute: null,
      a11yName: 'Notifications',
    },
    foundation: {
      skeleton: { rowType: 'comment' },
      strip: 'none',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  settings: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'child',
      residency: 'transient',
      body: { kind: 'mounted', inset: 'padded' },
      createFallbackRoute: null,
      a11yName: 'Settings',
    },
    foundation: {
      skeleton: { rowType: 'tile' },
      strip: 'none',
      // §7.7/§9a: full-page illusion — NO grab handle, X close. Settings rides the STANDARD
      // child shell (same snaps as every child, so profile↔settings never moves the sheet)
      // and is LOCKED at the top snap instead: drags rubber-band back.
      grabHandle: 'hidden',
      snapLock: 'expanded',
      worldJoin: false,
    },
  },
  editProfile: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'child',
      residency: 'transient',
      body: { kind: 'mounted', inset: 'padded' },
      createFallbackRoute: null,
      a11yName: 'Edit profile',
    },
    foundation: {
      skeleton: { rowType: 'tile' },
      strip: 'none',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  // W2 (page-registry §7.4): the post page — full-page child, same policy family.
  postPhotos: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'child',
      residency: 'transient',
      body: { kind: 'mounted', inset: 'padded' },
      createFallbackRoute: null,
      a11yName: 'Add photos',
    },
    // W2 (page-registry §7.4): the post page — photo tiles; no filter strip.
    foundation: {
      skeleton: { rowType: 'tile' },
      strip: 'none',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  // W3 messaging (§4.1/§7.9): both full-page children — tapping Message/inbox
  // fully extends the sheet (requiresExpandedPresentation), back restores the
  // prior snap via the standard child-dismiss glide.
  messagesInbox: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'child',
      residency: 'transient',
      body: { kind: 'mounted', inset: 'padded' },
      createFallbackRoute: null,
      a11yName: 'Messages',
    },
    // W3 messaging (§4.1): inbox = person rows; DM thread = message rows.
    foundation: {
      skeleton: { rowType: 'comment' },
      strip: 'none',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  dmSession: {
    policy: {
      sheetTargetGroup: SHEET_HOST_TARGET_GROUP,
      defaultFirstEntrySnap: 'expanded',
      allowedSnaps: ALL_SHEET_SNAPS,
      requiresExpandedPresentation: true,
      canSwipeDismiss: false,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'child',
      residency: 'transient',
      body: { kind: 'mounted', inset: 'padded' },
      createFallbackRoute: null,
      a11yName: 'Conversation',
    },
    foundation: {
      skeleton: { rowType: 'comment' },
      strip: 'none',
      grabHandle: 'visible',
      snapLock: 'none',
      worldJoin: false,
    },
  },
  scoreInfo: {
    policy: {
      sheetTargetGroup: null,
      defaultFirstEntrySnap: null,
      allowedSnaps: [],
      requiresExpandedPresentation: false,
      canSwipeDismiss: true,
      postureSeat: null,
      chromePolicy: { kind: 'preserve' },
    },
    track: {
      role: 'modal',
      residency: 'transient',
      body: { kind: 'none' },
      createFallbackRoute: null,
      a11yName: 'Score details',
    },
    // Excluded by design: modal (the OverlayModalSheet system sits outside the foundation).
    foundation: null,
  },
};

// ─── DERIVED VIEWS (consumers READ the schema; no hand-kept duplicates) ───────────────

/**
 * The foundation-only view, kept for the readers that want the whole table. DERIVED from
 * the one schema — the `foundation: null` statements are what excludes a key, so the
 * "which scenes have a foundation row" fact has exactly one home.
 */
export const SCENE_FOUNDATION_SPECS = Object.fromEntries(
  Object.entries(SCENE_DECLARATIONS)
    .filter(([, declaration]) => declaration.foundation != null)
    .map(([sceneKey, declaration]) => [sceneKey, declaration.foundation as SceneFoundationSpec])
) as Record<SheetSceneKey, SceneFoundationSpec>;

export const getSceneFoundationSpec = (sceneKey: OverlayKey): SceneFoundationSpec | undefined =>
  SCENE_DECLARATIONS[sceneKey]?.foundation ?? undefined;

/** The track-group view. Total over OverlayKey by construction. */
export const resolveSceneTrackDeclaration = (sceneKey: OverlayKey): SceneTrackDeclaration =>
  SCENE_DECLARATIONS[sceneKey].track;

/**
 * THE ROLE derivation: every non-root scene wears the child header action (the black X).
 * Replaces `!ROOT_TRACK_SCENES.has(scene)` in TrackSheetRouteHost.
 */
export const sceneIsChildRole = (sceneKey: OverlayKey): boolean =>
  SCENE_DECLARATIONS[sceneKey]?.track.role !== 'root';

/** Replaces RESIDENT_TRACK_SCENES. */
export const sceneIsResidentTrackScene = (sceneKey: OverlayKey): boolean =>
  SCENE_DECLARATIONS[sceneKey]?.track.residency === 'resident';

/** Replaces MOUNTED_TRACK_SCENES (itself derived from the host's component map). */
export const sceneUsesMountedTrackBody = (sceneKey: OverlayKey): boolean =>
  SCENE_DECLARATIONS[sceneKey]?.track.body.kind === 'mounted';

/** Replaces UNPADDED_BODY_SCENES. */
export const sceneMountedBodyIsEdgeToEdge = (sceneKey: OverlayKey): boolean => {
  const body = SCENE_DECLARATIONS[sceneKey]?.track.body;
  return body?.kind === 'mounted' && body.inset === 'edge-to-edge';
};

/** The list-parts source for a leg, or null when the scene has no parts body. */
export const resolveSceneListPartsSource = (sceneKey: OverlayKey): 'home' | 'polls' | null => {
  const body = SCENE_DECLARATIONS[sceneKey]?.track.body;
  return body?.kind === 'parts' ? body.source : null;
};

/** Replaces the `legScene === 'polls'` arm of the host's rowSurfaceStyle ternary. */
export const sceneDeclaresSharedRowSurface = (sceneKey: OverlayKey): boolean => {
  const body = SCENE_DECLARATIONS[sceneKey]?.track.body;
  return body?.kind === 'parts' && body.rowSurface;
};

/** Replaces the `legScene === 'polls'` arm of the host's scroll-activity wiring. */
export const sceneReportsUserScrollActivity = (sceneKey: OverlayKey): boolean => {
  const body = SCENE_DECLARATIONS[sceneKey]?.track.body;
  return body?.kind === 'parts' && body.reportsUserScrollActivity;
};

/** G-A11Y: the destination name announced when this scene becomes the presented entry. */
export const resolveSceneA11yName = (sceneKey: OverlayKey): string =>
  SCENE_DECLARATIONS[sceneKey].track.a11yName;

/** Replaces the host's `scene === 'polls'` header-create fallback. */
export const resolveSceneCreateFallbackRoute = (sceneKey: OverlayKey): OverlayKey | null =>
  SCENE_DECLARATIONS[sceneKey]?.track.createFallbackRoute ?? null;

/** Replaces the host's `scene === 'settings'` grab-handle literal (the foundation column
 *  already declared it; the host was a second, hand-kept copy). */
export const sceneHidesGrabHandle = (sceneKey: OverlayKey): boolean =>
  getSceneFoundationSpec(sceneKey)?.grabHandle === 'hidden';

/**
 * THE loading-material derivation (THE PAGE L0/L2 — one home): the scene's declared
 * cutout row. Backing is NOT a choice any more: every skeleton is a TRUE cutout onto
 * the sheet's one shared frost (the SceneLoadingSurface FrostCutout punches the scene
 * white plate where one exists) — the old self-frost/frostBacking fork is deleted.
 *
 * THE SKELETON-STRIP LAW (strip-band seam law §3): withStripHoles derives from the
 * scene's declared strip basis. An 'in-list' strip lives in the body, so a full-body
 * pending face replaces it — the face carries the band block as pill cutouts (the
 * strip region never blanks). A 'header' strip is chrome — always live above any
 * skeleton — and 'none' has nothing to represent. Nobody re-decides this at a call
 * site.
 *
 * THE TOGGLE-SEAM VARIANTS (OA9, 2026-08-08 — the search-results pattern promoted to
 * data): a loading face has TWO variants, selected by the `seam` argument:
 *   (a) 'cold'    — first paint / reveal: no live content exists, so an 'in-list'
 *                   strip's region is part of the face (pill holes stand in for it).
 *   (b) 'refetch' — an in-place toggle/re-query on a LIVE surface: the real strip
 *                   stays mounted and interactive; the face covers only the results
 *                   region below it, so holes are never minted regardless of basis.
 * Variant selection is this one function of (declared strip basis × seam phase) —
 * no call site re-decides it, and the material (rowType) is identical across both:
 * the variants differ in LAYOUT, never in content (the OA9 placeholder policy).
 */
export type SceneLoadingSeam = 'cold' | 'refetch';

export const resolveSceneLoadingMaterial = (
  sceneKey: OverlayKey,
  seam: SceneLoadingSeam = 'cold'
): { rowType: SceneLoadingRowType; withStripHoles: boolean } | null => {
  const spec = getSceneFoundationSpec(sceneKey);
  if (spec == null) {
    return null;
  }
  return {
    rowType: spec.skeleton.rowType,
    withStripHoles: seam === 'cold' && spec.strip === 'in-list',
  };
};

/**
 * OA1 membership derivation (R7): does this scene's reveal ride the world-join
 * episode? 'search' is the family's home surface — it is excluded from the table
 * (owns its composition) but IS the scene every world episode targets
 * (`targetSceneKey: 'search'` in the search-surface stagers), so it is a member by
 * construction, not by row. Every other scene answers from its declared row.
 */
export const sceneParticipatesInWorldJoin = (sceneKey: OverlayKey): boolean =>
  sceneKey === 'search' || getSceneFoundationSpec(sceneKey)?.worldJoin === true;
