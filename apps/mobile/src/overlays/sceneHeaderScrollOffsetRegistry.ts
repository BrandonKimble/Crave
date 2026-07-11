import React from 'react';
import type { SharedValue } from 'react-native-reanimated';

// ─── Scene-keyed header scroll-offset publication ───────────────────────────────────────────
// The persistent header's scroll divider (PersistentHeaderScrollDividerHost) fades on the
// PRESENTED scene's body scroll offset. Scenes whose body rides the SHARED sheet scroll
// container already expose that offset via the body runtime authority
// (bodyScrollRuntime.scrollOffset) — they need nothing here. Scenes whose body OWNS its scroll
// (contentScrollMode 'static' — dmSession's thread ScrollView is the first consumer) publish
// their own UI-thread SharedValue here instead; the divider lane prefers a published offset
// over the authority's.
//
// STACK semantics, not last-wins: entry-keyed child scenes (W1) keep every in-stack entry's
// body MOUNTED — pushing dmSession B over dmSession A registers B on top; popping B unmounts
// it and A's registration surfaces again. A single-slot map would be destroyed by that pop.
//
// Same module-scope registry ethos as overlaySceneScrollHandleRegistry /
// app-route-persistent-header-registry. Subscribable so the React lane (the divider lane)
// re-renders when a publication appears/disappears; the per-frame value itself stays on the
// UI thread (SharedValue — no per-frame JS).

const offsetStacks = new Map<string, SharedValue<number>[]>();
const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((listener) => listener());
};

export const publishSceneHeaderScrollOffset = (
  sceneKey: string,
  scrollOffset: SharedValue<number>
): (() => void) => {
  const stack = offsetStacks.get(sceneKey) ?? [];
  stack.push(scrollOffset);
  offsetStacks.set(sceneKey, stack);
  notify();
  return () => {
    const current = offsetStacks.get(sceneKey);
    if (current == null) {
      return;
    }
    const index = current.lastIndexOf(scrollOffset);
    if (index !== -1) {
      current.splice(index, 1);
    }
    if (current.length === 0) {
      offsetStacks.delete(sceneKey);
    }
    notify();
  };
};

export const getSceneHeaderScrollOffset = (sceneKey: string): SharedValue<number> | null => {
  const stack = offsetStacks.get(sceneKey);
  return stack != null && stack.length > 0 ? stack[stack.length - 1] : null;
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The topmost published offset for a scene, re-rendering when publications change. */
export const useSceneHeaderScrollOffset = (sceneKey: string): SharedValue<number> | null =>
  React.useSyncExternalStore(
    subscribe,
    () => getSceneHeaderScrollOffset(sceneKey),
    () => getSceneHeaderScrollOffset(sceneKey)
  );
