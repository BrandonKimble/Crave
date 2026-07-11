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
  /** 'frosted-strip' = the page renders a FrostedFilterStrip toggle row. */
  strip: 'none' | 'frosted-strip';
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
};

export const SCENE_FOUNDATION_SPECS: Record<SheetSceneKey, SceneFoundationSpec> = {
  polls: {
    skeleton: { rowType: 'restaurant' },
    strip: 'frosted-strip',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  bookmarks: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  profile: {
    skeleton: { rowType: 'restaurant' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  restaurant: {
    skeleton: { rowType: 'dish' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  saveList: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  pollDetail: {
    skeleton: { rowType: 'comment', frostBacking: true },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  pollCreation: {
    skeleton: { rowType: 'comment', frostBacking: true },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  // Stub-pass scenes (plans/page-registry.md §1) — foundation decisions stated ahead
  // of the real bodies; their design passes revise values, never optionality.
  userProfile: {
    skeleton: { rowType: 'restaurant' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  listDetail: {
    skeleton: { rowType: 'restaurant' },
    strip: 'frosted-strip',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  followList: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  notifications: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  settings: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    // §7.7/§9a: full-snap exception — full-page illusion, NO grab handle, X close.
    grabHandle: 'hidden',
  },
  editProfile: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  // W2 (page-registry §7.4): the post page — photo tiles; no filter strip.
  postPhotos: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  shareConfig: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  // W3 messaging (§4.1): inbox = person rows; DM thread = message rows.
  messagesInbox: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
  dmSession: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
    grabHandle: 'visible',
  },
};

export const getSceneFoundationSpec = (sceneKey: OverlayKey): SceneFoundationSpec | undefined =>
  (SCENE_FOUNDATION_SPECS as Partial<Record<OverlayKey, SceneFoundationSpec>>)[sceneKey];
