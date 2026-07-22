import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { SheetSceneKey } from '../navigation/runtime/scene-foundation-spec';
import {
  getShellResidencySnapshot,
  subscribeShellResidency,
} from './shell-residency-manager';

// ─── THE SHELL VISIBILITY BOUNDARY (L3 — the one-writer derivation surface) ─────────
//
// Wraps ONE residency-managed shell. Reads the manager's visibility facts and derives
// EVERYTHING a hidden shell must be: display:'none' (layout detached), pointerEvents
// 'none', accessibility-hidden, and — through ShellLivenessContext — subscription and
// animation liveness (controllers gate fetches on it; the L0 material freezes its
// shimmer clocks on it). One writer, four derivations, zero half-states.
//
// TRANSITION COMPOSITION (the crossfade law): DISPLAY = visible OR transition-live —
// during a live transition both participants stay displayed (the outgoing leg fades
// real pixels, never a blank); the transition engine's opacity worklets own the PAINT
// fact (a different fact — one writer PER FACT). At settle the display bit collapses
// to exactly the presented shell.
//
// The legacy display writers step aside for managed scenes (the strangler): the
// entry-level mount boundary renders managed scenes un-hidden and defers here.

const ShellLivenessContext = React.createContext<boolean>(true);

/** The enclosing shell's liveness. Components outside any boundary are live (the
 *  legacy world — everything mounted is visible). */
export const useShellLiveness = (): boolean => React.useContext(ShellLivenessContext);

const isShellDisplayed = (scene: SheetSceneKey): boolean => {
  const snapshot = getShellResidencySnapshot();
  return snapshot.visibleScene === scene || snapshot.transitionLiveScenes.includes(scene);
};

export const useShellVisibility = (scene: SheetSceneKey): boolean =>
  React.useSyncExternalStore(
    subscribeShellResidency,
    () => isShellDisplayed(scene),
    () => isShellDisplayed(scene)
  );

export const ShellVisibilityBoundary = ({
  scene,
  children,
}: {
  scene: SheetSceneKey;
  children: React.ReactNode;
}): React.ReactElement => {
  const displayed = useShellVisibility(scene);
  return (
    <View
      style={displayed ? styles.displayedShell : styles.hiddenShell}
      pointerEvents={displayed ? 'auto' : 'none'}
      accessibilityElementsHidden={!displayed}
      importantForAccessibility={displayed ? 'auto' : 'no-hide-descendants'}
      testID={`resident-shell-${scene}-${displayed ? 'displayed' : 'hidden'}`}
    >
      <ShellLivenessContext.Provider value={displayed}>{children}</ShellLivenessContext.Provider>
    </View>
  );
};

const styles = StyleSheet.create({
  displayedShell: {
    flexGrow: 1,
  },
  hiddenShell: {
    display: 'none',
  },
});
