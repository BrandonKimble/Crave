import type React from 'react';
import type { SharedValue } from 'react-native-reanimated';

import type { OverlayKey } from '../../overlays/types';

/**
 * Props the header host hands per-scene EXTRAS chrome (leg 6 — child-transition primitive
 * §3.5): `transitionProgress` is the SAME 0→1 SharedValue driving the host-owned plus→X
 * rotation (0 = parent rest, 1 = child rest; starts moving on press-up). A scene's extras
 * fade/slide off it so every extra affordance is synchronized with the nav action by
 * construction (ListDetail's ellipsis is the first planned consumer).
 */
export type PersistentHeaderExtrasProps = {
  transitionProgress: SharedValue<number>;
};

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
  /**
   * DEAD SLOT (leg 6 — §4 HeaderNavAction): the header's action control is HOST-OWNED now
   * (the one plus↔X HeaderNavAction on PersistentSheetHeaderHost); the host renders NOTHING
   * from this slot. Kept optional only because the strip-wave panels (BookmarksPanel,
   * PollsPanel, SaveListPanel — fenced this leg) still register their old close factories;
   * delete this field with those registrations when the strip wave lands.
   */
  Action?: React.ComponentType;
  /**
   * Optional per-scene EXTRAS chrome, rendered LEFT of the host-owned HeaderNavAction in the
   * action position. Receives `transitionProgress` (see PersistentHeaderExtrasProps) so
   * extras ride the same press-up-started 0→1 as the plus→X rotation.
   */
  Extras?: React.ComponentType<PersistentHeaderExtrasProps>;
  // THE HEADER-EXTENSION STRIP MOUNT (leg 3 — plans/toggle-strip-rebuild-ledger.md;
  // audit D4.2): scenes whose foundation row declares `strip: 'header'` register their
  // ToggleStrip here. The host renders it as a second chrome row BELOW the title row,
  // inside the ONE measured chrome box — so the divider lands below the strip and the
  // reserved body lane grows automatically, and the strip exists from the same
  // committed frame as the title (first paint by construction; late-resolving chip
  // VALUES hydrate under painted chrome, the title-seed pattern). The declaration is
  // load-bearing both ways: declared-'header' with no Strip barks, and a Strip on a
  // scene not declared 'header' barks (PersistentSheetHeaderHost).
  Strip?: React.ComponentType;
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
