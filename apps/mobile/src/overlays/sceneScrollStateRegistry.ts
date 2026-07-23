import React from 'react';
import type { SharedValue } from 'react-native-reanimated';

// ─── THE scene scroll-state registry ─────────────────────────────────────────────────────────
// ONE record per scene for everything scroll-shaped that used to be smeared across four modules
// (scroll-standard audit ruling, plans/sheet-scroll-primitive.md):
//   • sceneHeaderScrollOffsetRegistry  → publishedOffsets (divider publications, STACK semantics)
//   • overlayScrollOffsetRuntime       → savedOffset + pendingRestore (return-to-origin one-shot)
//   • overlaySceneScrollHandleRegistry → scrollHandle (imperative mounted-scroll handle)
// The LIVE gesture values (bodyScrollRuntime.scrollOffset etc.) stay host-owned by design —
// exactly one scene is presented at a time and the runtime re-bases them per presentation.
// (The former content-fits/tug machinery is GONE: short pages get real scroll room instead —
// the boundary-physics law — so the one result-sheet handoff
// covers every page and there is no parallel gesture mode to desync.)

export type OverlaySceneScrollHandle = {
  /** Imperative absolute scroll of the scene's scroll container. */
  scrollTo: (y: number, animated?: boolean) => void;
  /** The container's live UI-thread scroll offset (read-only for consumers). */
  scrollOffset: SharedValue<number>;
};

type SceneScrollState = {
  // Session-persistent scroll position (JS lane; written on drag-end/scene-switch).
  savedOffset: number;
  // One-shot dismiss-return restore (return-to-origin-foundation-design.md §Restore / P3):
  // staged by the restore path, consumed exactly once by the scene's cold re-mount.
  pendingRestore: number | null;
  // Imperative scroll handle for MOUNTED-SCROLL scenes (bookmarks et al) — the mounted body
  // renders inside the shared container it does not own; drag-reorder edge auto-scroll etc.
  // reach that scroll through this narrow handle instead of a transport-threaded ref.
  scrollHandle: OverlaySceneScrollHandle | null;
  // Header scroll-offset publications for scenes whose body OWNS its scroll (contentScrollMode
  // 'static' — dmSession's thread ScrollView). STACK semantics, not last-wins: entry-keyed child
  // scenes keep every in-stack entry's body mounted — pushing dmSession B over A registers B on
  // top; popping B surfaces A's registration again.
  publishedOffsets: SharedValue<number>[];
};

const createSceneScrollState = (): SceneScrollState => ({
  savedOffset: 0,
  pendingRestore: null,
  scrollHandle: null,
  publishedOffsets: [],
});

const states = new Map<string, SceneScrollState>();

const getState = (sceneKey: string): SceneScrollState => {
  let state = states.get(sceneKey);
  if (state == null) {
    state = createSceneScrollState();
    states.set(sceneKey, state);
  }
  return state;
};

// ─── Saved offset + one-shot restore (session persistence) ───────────────────────────────────

export const setOverlayScrollOffset = (overlayIdentity: string, offset: number): void => {
  const nextOffset = Math.max(0, offset);
  const state = getState(overlayIdentity);
  if (Math.abs(state.savedOffset - nextOffset) < 1) {
    return;
  }
  state.savedOffset = nextOffset;
};

export const getOverlayScrollOffset = (overlayIdentity: string): number =>
  states.get(overlayIdentity)?.savedOffset ?? 0;

export const stageOverlayScrollRestore = (overlayIdentity: string, offset: number): void => {
  const nextOffset = Math.max(0, offset);
  const state = getState(overlayIdentity);
  state.savedOffset = nextOffset;
  state.pendingRestore = nextOffset;
};

export const consumePendingOverlayScrollRestore = (overlayIdentity: string): number | null => {
  const state = states.get(overlayIdentity);
  if (state == null || state.pendingRestore == null) {
    return null;
  }
  const pending = state.pendingRestore;
  state.pendingRestore = null;
  return pending;
};

// ─── Imperative scroll handle (mounted-scroll scenes) ────────────────────────────────────────

export const registerOverlaySceneScrollHandle = (
  sceneKey: string,
  handle: OverlaySceneScrollHandle
): (() => void) => {
  const state = getState(sceneKey);
  state.scrollHandle = handle;
  return () => {
    const current = states.get(sceneKey);
    if (current != null && current.scrollHandle === handle) {
      current.scrollHandle = null;
    }
  };
};

export const getOverlaySceneScrollHandle = (sceneKey: string): OverlaySceneScrollHandle | null =>
  states.get(sceneKey)?.scrollHandle ?? null;

// ─── Header scroll-offset publications (static-scroll scenes) ────────────────────────────────
// Subscribable so the React lane (the persistent header's divider lane) re-renders when a
// publication appears/disappears; the per-frame value stays on the UI thread (SharedValue).

const publicationListeners = new Set<() => void>();

const notifyPublications = () => {
  publicationListeners.forEach((listener) => listener());
};

export const publishSceneHeaderScrollOffset = (
  sceneKey: string,
  scrollOffset: SharedValue<number>
): (() => void) => {
  const state = getState(sceneKey);
  state.publishedOffsets.push(scrollOffset);
  notifyPublications();
  return () => {
    const current = states.get(sceneKey);
    if (current == null) {
      return;
    }
    const index = current.publishedOffsets.lastIndexOf(scrollOffset);
    if (index !== -1) {
      current.publishedOffsets.splice(index, 1);
    }
    notifyPublications();
  };
};

export const getSceneHeaderScrollOffset = (sceneKey: string): SharedValue<number> | null => {
  const stack = states.get(sceneKey)?.publishedOffsets;
  return stack != null && stack.length > 0 ? stack[stack.length - 1] : null;
};

const subscribePublications = (listener: () => void): (() => void) => {
  publicationListeners.add(listener);
  return () => {
    publicationListeners.delete(listener);
  };
};

/** The topmost published offset for a scene, re-rendering when publications change. */
export const useSceneHeaderScrollOffset = (sceneKey: string): SharedValue<number> | null =>
  React.useSyncExternalStore(
    subscribePublications,
    () => getSceneHeaderScrollOffset(sceneKey),
    () => getSceneHeaderScrollOffset(sceneKey)
  );
