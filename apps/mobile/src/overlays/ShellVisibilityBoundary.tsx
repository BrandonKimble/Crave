import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { ResidencyManagedSceneKey } from './shell-residency-registry';
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

const isShellDisplayed = (scene: ResidencyManagedSceneKey): boolean => {
  const snapshot = getShellResidencySnapshot();
  return snapshot.visibleScene === scene || snapshot.transitionLiveScenes.includes(scene);
};

export const useShellVisibility = (scene: ResidencyManagedSceneKey): boolean =>
  React.useSyncExternalStore(
    subscribeShellResidency,
    () => isShellDisplayed(scene),
    () => isShellDisplayed(scene)
  );

export const ShellVisibilityBoundary = ({
  scene,
  children,
}: {
  scene: ResidencyManagedSceneKey;
  children: React.ReactNode;
}): React.ReactElement => {
  const displayed = useShellVisibility(scene);
  // THE STAMP SPLIT (L4 Law 1 — the one-batch reveal): DISPLAY is urgent (style-only,
  // lands with the header swap in the press-up commit the chrome ack measures);
  // LIVENESS is DEFERRED one pass — the content re-derivation it triggers (fetch
  // effects, subscription re-attachment) is the first content BEAT, after the
  // reveal, never inside it. This is the [L4STAMP] joinWait's structural diet.
  const live = React.useDeferredValue(displayed);
  return (
    <View
      style={displayed ? styles.displayedShell : styles.hiddenShell}
      pointerEvents={displayed ? 'auto' : 'none'}
      accessibilityElementsHidden={!displayed}
      importantForAccessibility={displayed ? 'auto' : 'no-hide-descendants'}
      testID={`resident-shell-${scene}-${displayed ? 'displayed' : 'hidden'}`}
    >
      <ShellLivenessContext.Provider value={live}>{children}</ShellLivenessContext.Provider>
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
