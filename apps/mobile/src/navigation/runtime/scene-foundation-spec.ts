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
};

export const SCENE_FOUNDATION_SPECS: Record<SheetSceneKey, SceneFoundationSpec> = {
  polls: {
    skeleton: { rowType: 'restaurant' },
    strip: 'frosted-strip',
    failure: 'announcer',
    header: 'persistent',
  },
  bookmarks: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  profile: {
    skeleton: { rowType: 'restaurant' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  restaurant: {
    skeleton: { rowType: 'dish' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  saveList: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  pollDetail: {
    skeleton: { rowType: 'comment', frostBacking: true },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  pollCreation: {
    skeleton: { rowType: 'comment', frostBacking: true },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  // Stub-pass scenes (plans/page-registry.md §1) — foundation decisions stated ahead
  // of the real bodies; their design passes revise values, never optionality.
  userProfile: {
    skeleton: { rowType: 'restaurant' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  listDetail: {
    skeleton: { rowType: 'restaurant' },
    strip: 'frosted-strip',
    failure: 'announcer',
    header: 'persistent',
  },
  followList: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  notifications: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  settings: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  editProfile: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  // W2 (page-registry §7.4): the post page — photo tiles; no filter strip.
  postPhotos: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  shareConfig: {
    skeleton: { rowType: 'tile' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  // W3 messaging (§4.1): inbox = person rows; DM thread = message rows.
  messagesInbox: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
  dmSession: {
    skeleton: { rowType: 'comment' },
    strip: 'none',
    failure: 'announcer',
    header: 'persistent',
  },
};

export const getSceneFoundationSpec = (sceneKey: OverlayKey): SceneFoundationSpec | undefined =>
  (SCENE_FOUNDATION_SPECS as Partial<Record<OverlayKey, SceneFoundationSpec>>)[sceneKey];
