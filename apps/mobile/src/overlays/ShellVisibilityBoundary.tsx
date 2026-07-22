import React from 'react';

import type { SheetSceneKey } from '../navigation/runtime/scene-foundation-spec';
import {
  getShellResidencySnapshot,
  subscribeShellResidency,
} from './shell-residency-manager';

// ─── THE SHELL LIVENESS BOUNDARY (L3 slice 1 — the liveness half of the visibility law)
//
// The machinery map (2026-07-21) found the STRUCTURAL half of L3 already exists: every
// persistent scene is a co-mounted sibling that never unmounts, hidden via the leg
// opacity/zIndex worklets + the entry-level display:'none' + the attach gates. What
// does NOT exist is the LAW: those are several writers of display facts, and NOTHING
// derives subscription/animation liveness — a retained hidden body keeps its queries
// and clocks, and (the exposed freshness bug) never re-derives on re-entry.
//
// Slice 1 therefore lands LIVENESS ONLY: this boundary provides the one bit
// (derived from the residency manager, which the presentation frame drives) that
// query controllers gate fetches on and the L0 material freezes its shimmer clocks
// on. It deliberately does NOT write display/pointerEvents/accessibility — adding a
// second display mechanism beside the leg machinery would CREATE the two-writers
// disease the law forbids. The full one-writer consolidation (display + pointer +
// a11y derived from this same bit, the leg patchwork gutted) is the recorded later
// slice — it is surgery on BottomSheetSceneStackHost's worklet machinery and must
// compose with transition crossfades (both participants live mid-transition).

const ShellLivenessContext = React.createContext<boolean>(true);

/** The enclosing shell's liveness. Components outside any boundary are live (the
 *  legacy world — everything mounted is visible). */
export const useShellLiveness = (): boolean => React.useContext(ShellLivenessContext);

export const useShellVisibility = (scene: SheetSceneKey): boolean =>
  React.useSyncExternalStore(
    subscribeShellResidency,
    () => getShellResidencySnapshot().visibleScene === scene,
    () => getShellResidencySnapshot().visibleScene === scene
  );

export const ShellLivenessBoundary = ({
  scene,
  children,
}: {
  scene: SheetSceneKey;
  children: React.ReactNode;
}): React.ReactElement => {
  const visible = useShellVisibility(scene);
  return <ShellLivenessContext.Provider value={visible}>{children}</ShellLivenessContext.Provider>;
};
