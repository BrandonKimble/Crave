import React from 'react';
import { makeMutable, type SharedValue } from 'react-native-reanimated';

// ─── THE scene scroll-state registry ─────────────────────────────────────────────────────────
// ONE record per scene for everything scroll-shaped that used to be smeared across four
// modules (scroll-standard audit ruling, plans/sheet-scroll-primitive.md):
//   • sceneHeaderScrollOffsetRegistry  → publishedOffsets (divider publications, STACK semantics)
//   • overlayScrollOffsetRuntime       → savedOffset + pendingRestore (return-to-origin one-shot)
//   • overlaySceneScrollHandleRegistry → scrollHandle (imperative mounted-scroll handle)
//   • overlaySheetContentFitsRuntime   → contentHeight/viewportHeight + the presented-scene
//     content-fits flag + the tug SVs + the container's scene-identity context
// The LIVE gesture values (bodyScrollRuntime.scrollOffset etc.) stay host-owned by design —
// exactly one scene is presented at a time and the runtime re-bases them per presentation; the
// v3 regression proved that folding pan writes into that live stream without a full consumer
// audit is how echo bugs happen. This registry is the AUDITED single home for the per-scene
// state; the presented pointer is synced from the ONE authority site (the sheet-host authority
// controller, beside the snapLock literal).

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
  // Content-fits metrics reported by the scene's scroll container (the one place that knows
  // both sizes). Feed the presented-scene fits flag below.
  contentHeight: number | null;
  viewportHeight: number | null;
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
  contentHeight: null,
  viewportHeight: null,
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

// ─── Presented scene + derived UI-thread flags ───────────────────────────────────────────────

/** UI-thread flag: 1 while the PRESENTED scene's body content fits its viewport, else 0. */
export const overlaySheetContentFitsValue: SharedValue<number> = makeMutable(0);

// The short-content tug (Phase B v4): the captured up-drag drives a DEDICATED body-lane
// translate — content + white plate + cutout holes slide under the stationary header as one
// node and spring back. NOT folded into the live scroll stream (v3 regression: that stream's
// JS/animated listeners echo writes back against the pan — jitter). Presented-scene singletons:
// exactly one scene's body lane responds at a time, and a page switch re-bases them.
/** UI-thread translateY (px, <= 0) applied to the presented scene's body lane during a tug. */
export const overlaySheetBodyTugOffsetValue: SharedValue<number> = makeMutable(0);
/** UI-thread flag: 1 while the expand pan is in tug mode (writing the tug offset). */
export const overlaySheetBodyTugActiveValue: SharedValue<number> = makeMutable(0);

let presentedSceneKey: string | null = null;

const FIT_EPSILON_PX = 1;

const recomputeContentFits = (): void => {
  const state = presentedSceneKey != null ? states.get(presentedSceneKey) : null;
  const fits =
    state != null &&
    state.contentHeight != null &&
    state.viewportHeight != null &&
    state.contentHeight > 0 &&
    state.viewportHeight > 0 &&
    state.contentHeight <= state.viewportHeight + FIT_EPSILON_PX;
  const nextValue = fits ? 1 : 0;
  if (overlaySheetContentFitsValue.value !== nextValue) {
    overlaySheetContentFitsValue.value = nextValue;
  }
};

/** Synced from the sheet-host authority controller (the same site as the snapLock literal). */
export const setPresentedSceneForScrollState = (sceneKey: string | null): void => {
  if (presentedSceneKey === sceneKey) {
    return;
  }
  presentedSceneKey = sceneKey;
  recomputeContentFits();
};

// ─── Content-fits metrics (reported by BottomSheetScrollContainer) ───────────────────────────

// Scene identity for the container's metric reports. Provided per sheet leg by
// useBottomSheetSceneStackBodyContentRuntime; null outside a scene-stack leg (legacy sheets,
// search bundle) → the container doesn't report and the tug stays off (fail-open).
export const SheetSceneContentMetricsContext = React.createContext<string | null>(null);

export const reportSheetBodyContentMetrics = (
  sceneKey: string,
  partial: Partial<Pick<SceneScrollState, 'contentHeight' | 'viewportHeight'>>
): void => {
  const state = getState(sceneKey);
  const nextContentHeight = partial.contentHeight ?? state.contentHeight;
  const nextViewportHeight = partial.viewportHeight ?? state.viewportHeight;
  if (state.contentHeight === nextContentHeight && state.viewportHeight === nextViewportHeight) {
    return;
  }
  state.contentHeight = nextContentHeight;
  state.viewportHeight = nextViewportHeight;
  if (sceneKey === presentedSceneKey) {
    recomputeContentFits();
  }
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
