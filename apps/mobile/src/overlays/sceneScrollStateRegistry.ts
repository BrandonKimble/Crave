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
  // Imperative scroll handle for MOUNTED-SCROLL scenes (lists et al) — the mounted body
  // renders inside the shared container it does not own; drag-reorder edge auto-scroll etc.
  // reach that scroll through this narrow handle instead of a transport-threaded ref.
  scrollHandle: OverlaySceneScrollHandle | null;
  // Header scroll-offset publications for scenes whose body OWNS its scroll (contentScrollMode
  // 'static' — dmSession's thread ScrollView). STACK semantics, not last-wins: entry-keyed child
  // scenes keep every in-stack entry's body mounted — pushing dmSession B over A registers B on
  // top; popping B surfaces A's registration again.
  publishedOffsets: SharedValue<number>[];
  // RED TEAM 2 (scroll-fact redesign slice 1): the scene's BOUNDARY FACTS — the
  // per-scene record the live host SharedValues are a PROJECTION of. Writers write
  // HERE (per-leg gated container publication + the active list's onScroll mirror);
  // the projector loads the presented scene's record on the frame flip. `known`
  // distinguishes a real short page (max 0, viewport measured) from an unmeasured
  // scene — the stale-hand-me-down disease (polls inheriting another leg's facts)
  // is unrepresentable because facts never leave their scene's record.
  boundaryFacts: SceneBoundaryFacts;
};

export type SceneBoundaryFacts = {
  maxScrollOffset: number;
  viewportHeight: number;
  known: boolean;
};

const UNKNOWN_BOUNDARY_FACTS: SceneBoundaryFacts = {
  maxScrollOffset: 0,
  viewportHeight: 0,
  known: false,
};

const createSceneScrollState = (): SceneScrollState => ({
  savedOffset: 0,
  pendingRestore: null,
  scrollHandle: null,
  publishedOffsets: [],
  boundaryFacts: UNKNOWN_BOUNDARY_FACTS,
});

/** Scene identity for scroll-fact writers: provided by the body content runtime at
 *  each leg's root so the shared scroll container knows WHOSE record it feeds. */
export const SceneScrollFactsSceneKeyContext = React.createContext<string | null>(null);
export const useSceneScrollFactsSceneKey = (): string | null =>
  React.useContext(SceneScrollFactsSceneKeyContext);

/** Record the scene's measured boundary facts (content − viewport, ≥0). */
export const recordSceneBoundaryFacts = (
  sceneKey: string,
  maxScrollOffset: number,
  viewportHeight: number
): void => {
  if (viewportHeight <= 0) {
    return;
  }
  getState(sceneKey).boundaryFacts = {
    maxScrollOffset: Math.max(0, maxScrollOffset),
    viewportHeight,
    known: true,
  };
};

/** The scene's boundary facts — UNKNOWN (known:false) until its own surface measures. */
export const readSceneBoundaryFacts = (sceneKey: string): SceneBoundaryFacts =>
  states.get(sceneKey)?.boundaryFacts ?? UNKNOWN_BOUNDARY_FACTS;

// ─── THE PROJECTOR (red team 2 slice 3) ──────────────────────────────────────────────
// The live host SharedValues are a PROJECTION of the presented scene's record. The
// scene-stack assembly registers its SVs once; the presentation driver (the same one
// that writes shell visibility) calls projectSceneBoundaryFacts on every frame flip —
// so no boundary fact ever survives into another scene's tenure.
type BoundaryFactsProjection = {
  maxScrollOffset: SharedValue<number>;
  scrollViewportHeight: SharedValue<number>;
  boundaryFactsKnown: SharedValue<boolean>;
};

let boundaryFactsProjection: BoundaryFactsProjection | null = null;

export const registerBoundaryFactsProjection = (
  projection: BoundaryFactsProjection
): (() => void) => {
  boundaryFactsProjection = projection;
  return () => {
    if (boundaryFactsProjection === projection) {
      boundaryFactsProjection = null;
    }
  };
};

export const projectSceneBoundaryFacts = (sceneKey: string | null): void => {
  const projection = boundaryFactsProjection;
  if (projection == null) {
    return;
  }
  const facts = sceneKey == null ? UNKNOWN_BOUNDARY_FACTS : readSceneBoundaryFacts(sceneKey);
  projection.maxScrollOffset.value = facts.maxScrollOffset;
  projection.scrollViewportHeight.value = facts.viewportHeight;
  projection.boundaryFactsKnown.value = facts.known;
};

// ─── THE RECORD STORE IS A BOUNDED CACHE, NOT A LEDGER (F912) ────────────────────────
// The key here is a CONTENT identity, not the bounded scene-key space — RestaurantPanel
// passes `restaurant:${restaurantId}`, the list surfaces pass per-list identities. So
// this Map used to grow by one permanent record for every restaurant / list / DM the
// user ever opened in a session, with no removal path at all: the leak class in its
// registry variant. A scroll memory is a CACHE with a policy, so it has one now.
//
// THE POLICY: least-recently-touched eviction, and only records that own nothing live.
// A record is PINNED while it holds an imperative scroll handle (a mounted scroll
// container), a header-offset publication (an in-stack body), or a staged one-shot
// restore (a dismiss-return in flight) — evicting any of those would break a live
// scene, and all three are released by their own registration teardown, so pinning
// cannot wedge the cache.
//
// THE CAP is a MEMORY knob, not a UX knob (same class as
// SCENE_ENTRY_MOUNT_DEPTH_LIMIT): it decides how far back the user can travel and
// still land on their old scroll position. It is set well above the resident-unit
// retention budget (RETAINED_UNIT_RETENTION_LIMIT = 3) because a record here is a few
// numbers, not a mounted tree — the point is a bound that exists, not a tight one.
const SCENE_SCROLL_RECORD_LIMIT = 48;

const states = new Map<string, SceneScrollState>();

const isEvictable = (state: SceneScrollState): boolean =>
  state.scrollHandle == null && state.publishedOffsets.length === 0 && state.pendingRestore == null;

const evictLeastRecentlyTouched = (): void => {
  if (states.size <= SCENE_SCROLL_RECORD_LIMIT) {
    return;
  }
  // Map iteration is insertion order and `getState` re-inserts on touch, so the front
  // of the iteration IS the least-recently-touched end.
  for (const [key, state] of states) {
    if (states.size <= SCENE_SCROLL_RECORD_LIMIT) {
      return;
    }
    if (isEvictable(state)) {
      states.delete(key);
    }
  }
};

const getState = (sceneKey: string): SceneScrollState => {
  const existing = states.get(sceneKey);
  if (existing != null) {
    // Touch: move to the most-recently-used end.
    states.delete(sceneKey);
    states.set(sceneKey, existing);
    return existing;
  }
  const state = createSceneScrollState();
  states.set(sceneKey, state);
  evictLeastRecentlyTouched();
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
