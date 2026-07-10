import type React from 'react';
import type { LayoutChangeEvent } from 'react-native';

import type { OverlayKey } from '../../overlays/types';

// THE PERSISTENT HEADER registry (page-switch-master-plan.md §6-P3 / req 2b). ONE
// OverlaySheetHeaderChrome is hoisted above the scene-stack legs (PersistentSheetHeaderHost) and
// NEVER unmounts; what swaps per PresentationFrame.activeSceneKey is the CONTENT rendered inside
// it — the left title and the right action area. Each scene registers a descriptor at module
// scope (the house registry pattern — mirrors origin-scene-live-state-registry):
//   • Title/Action are COMPONENTS (not elements) so they mount inside the persistent chrome and
//     read their own scene's runtimes/authorities directly. Title must render SYNCHRONOUSLY on
//     the first frame of a switch (seed strings for late data — 'Poll'/'Restaurant'/query text);
//     the header NEVER skeletons (owner req 2b).
//   • The grab-handle / header TAP is NOT per-scene: it is one shared promote-to-middle handler
//     wired in PersistentSheetHeaderHost (owner req 2026-07-02 — the tap can never dismiss or
//     collapse; dismiss is the close (X) button in the Action slot only).
export type PersistentHeaderDescriptor = {
  Title: React.ComponentType;
  Action: React.ComponentType;
  // P5 (search): optional per-scene observer of the persistent chrome's onLayout. The search
  // runtime's internal layout math (results header height → cover/wash/list insets) was fed by
  // its old in-frame header's measurement; with the header hoisted, the descriptor forwards the
  // SAME chrome layout event back into the scene runtime (search-results-header-live-state).
  onChromeLayout?: (event: LayoutChangeEvent) => void;
};

const persistentHeaderDescriptors = new Map<OverlayKey, PersistentHeaderDescriptor>();

export const registerPersistentHeaderDescriptor = (
  sceneKey: OverlayKey,
  descriptor: PersistentHeaderDescriptor
): (() => void) => {
  // Dev-only: a second module registering the same scene key silently steals the header — make
  // the overwrite loud. (Fast Refresh re-evaluating the SAME registering module also lands here;
  // that warning is benign noise, the overwrite semantics are identical.)
  if (__DEV__ && persistentHeaderDescriptors.has(sceneKey)) {
    console.warn(
      `[persistent-header-registry] duplicate descriptor registration for scene '${sceneKey}' — the previous descriptor is being overwritten.`
    );
  }
  persistentHeaderDescriptors.set(sceneKey, descriptor);
  return () => {
    if (persistentHeaderDescriptors.get(sceneKey) === descriptor) {
      persistentHeaderDescriptors.delete(sceneKey);
    }
  };
};

export const getPersistentHeaderDescriptor = (
  sceneKey: OverlayKey
): PersistentHeaderDescriptor | undefined => persistentHeaderDescriptors.get(sceneKey);
