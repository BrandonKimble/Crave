import type { SharedValue } from 'react-native-reanimated';

// Per-scene imperative scroll handle for MOUNTED-SCROLL scenes (bookmarks et al).
// The mounted body renders INSIDE the shared sheet scroll container it does not own;
// features that must drive that scroll (edit-mode drag-reorder edge auto-scroll) get a
// narrow handle here instead of a ref threaded through the transport. Registered by
// the scene-stack body content runtime on the mounted-scroll branch; read by panels.
// Same registry ethos as overlayScrollOffsetRuntime (module-scope map, sceneKey lane).

export type OverlaySceneScrollHandle = {
  /** Imperative absolute scroll of the scene's scroll container. */
  scrollTo: (y: number, animated?: boolean) => void;
  /** The container's live UI-thread scroll offset (read-only for consumers). */
  scrollOffset: SharedValue<number>;
};

const handles = new Map<string, OverlaySceneScrollHandle>();

export const registerOverlaySceneScrollHandle = (
  sceneKey: string,
  handle: OverlaySceneScrollHandle
): (() => void) => {
  handles.set(sceneKey, handle);
  return () => {
    if (handles.get(sceneKey) === handle) {
      handles.delete(sceneKey);
    }
  };
};

export const getOverlaySceneScrollHandle = (sceneKey: string): OverlaySceneScrollHandle | null =>
  handles.get(sceneKey) ?? null;
