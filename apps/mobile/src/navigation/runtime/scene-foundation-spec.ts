import type { SceneLoadingRowType } from '../../components/skeletons';
import type { OverlayKey } from '../../overlays/types';

/**
 * THE PAGE FOUNDATION, BY CONSTRUCTION (ADDING_A_SCENE.md §5; foundation-hardening
 * plan §B): every sheet scene's foundation decisions live in this ONE compile-time
 * table. Adding an `OverlayKey` fails the build until the new scene states every
 * decision — a forgotten key is a build error that names the key, never a silent
 * default.
 *
 * Excluded keys, by design (stated, not implied):
 * - 'search'    — owns its never-null page (the mounted scene bundle authority).
 * - 'sheetHost' — the shell sentinel frame, not a scene.
 * - 'price' / 'scoreInfo' — modals (the OverlayModalSheet system sits outside the
 *   sheet foundation).
 */
export type SheetSceneKey = Exclude<OverlayKey, 'search' | 'sheetHost' | 'price' | 'scoreInfo'>;

export type SceneFoundationSpec = {
  /** The cutout skeleton the shared loading leg renders for this scene. */
  skeleton: { rowType: SceneLoadingRowType; frostBacking?: boolean };
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
  /** The uniform failure standard — a literal, so a silent exception is impossible. */
  failure: 'announcer';
  /** Every sheet scene registers a persistent-header descriptor (asserted in dev). */
  header: 'persistent';
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
  /**
   * The FOUNDATION WHITE LAYER (owner standard, 2026-07-11): every page renders a white plate
   * over the shared frosted foundation — no page may sit on bare frost. The only value is
   * 'white' BY DESIGN (a required literal every scene must state; opting out to bare frost is
   * unrepresentable). Rendered at the body lane (`SceneBodyFoundationSurface` in
   * useBottomSheetSceneStackBodyContentRuntime); per-page CUTOUTS (holes showing the frost
   * through) are runtime-registered by wrapping a content box in `<FrostCutout>` — see
   * ADDING_A_SCENE.md §5. The search/results sheet is excluded (owns its canonical composition).
   */
  bodySurface: 'white';
};

export const SCENE_FOUNDATION_SPECS: Record<SheetSceneKey, SceneFoundationSpec> = {
  polls: {
    skeleton: { rowType: 'restaurant' },
    // Leg 3: migrated to the persistent-header extension mount (PollsFeedStrip,
    // registered on the polls persistent-header descriptor) — the audited snap-in
    // gate died with the in-list strip.
    strip: 'header',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  bookmarks: {
    skeleton: { rowType: 'tile' },
    // Leg 3: migrated to the persistent-header extension mount (BookmarksHomeStrip —
    // ONE ToggleStrip whose action-row slot carries the edit morph). The leg-2
    // 'in-list' row described the hand-rolled two-strip morph, deleted with it.
    strip: 'header',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  profile: {
    skeleton: { rowType: 'restaurant' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  restaurant: {
    skeleton: { rowType: 'dish' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  saveList: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  pollDetail: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  pollCreation: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  // Stub-pass scenes (plans/page-registry.md §1) — foundation decisions stated ahead
  // of the real bodies; their design passes revise values, never optionality.
  userProfile: {
    skeleton: { rowType: 'restaurant' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  listDetail: {
    skeleton: { rowType: 'restaurant' },
    // Leg 9 (listdetail-ideal §2b): the real ToggleStrip in-list mount — the hand-rolled
    // SortChips band is deleted; this declaration is load-bearing via the strip-law assert
    // in ListDetailPanel's ToggleStrip.
    strip: 'in-list',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  followList: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  notifications: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  settings: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    // §7.7/§9a: full-page illusion — NO grab handle, X close. Settings rides the STANDARD
    // child shell (same snaps as every child, so profile↔settings never moves the sheet)
    // and is LOCKED at the top snap instead: drags rubber-band back.
    grabHandle: 'hidden',
    snapLock: 'expanded',
    bodySurface: 'white',
  },
  editProfile: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  // W2 (page-registry §7.4): the post page — photo tiles; no filter strip.
  postPhotos: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  // W3 messaging (§4.1): inbox = person rows; DM thread = message rows.
  messagesInbox: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
  dmSession: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
    snapLock: 'none',
    bodySurface: 'white',
  },
};

export const getSceneFoundationSpec = (sceneKey: OverlayKey): SceneFoundationSpec | undefined =>
  (SCENE_FOUNDATION_SPECS as Partial<Record<OverlayKey, SceneFoundationSpec>>)[sceneKey];
