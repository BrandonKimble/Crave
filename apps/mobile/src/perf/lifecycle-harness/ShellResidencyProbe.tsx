import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SceneLoadingSurface } from '../../components/skeletons';

// THE PAGE L3 residency prototype (plans/page-composition-from-scratch-design.md §L3
// gate). Mounts N shell FACSIMILES — chrome band + the real L0 cutout material with a
// realistic hole count — to price "shells are cheap" before L3 ratification.
// Modes: 'law' = 1 visible + (N-1) hidden under display:none (the visibility law's
// cheapest available approximation — no 'off' shimmer mode exists yet; the real L0
// adds one); 'antilaw' = all N mounted visible-stacked with shimmer RUNNING (the
// pole the pause law exists to forbid). DEV-ONLY, mounted by LifecycleHarnessBridge.

export type ShellProbeMode = 'off' | 'law' | 'antilaw';

type Listener = () => void;
let probeState: { mode: ShellProbeMode; count: number } = { mode: 'off', count: 0 };
const listeners = new Set<Listener>();

export const setShellProbeState = (mode: ShellProbeMode, count: number): void => {
  probeState = { mode, count };
  listeners.forEach((l) => l());
};
export const getShellProbeState = () => probeState;
const subscribe = (l: Listener) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const ShellFacsimile = React.memo(({ hidden }: { hidden: boolean }) => (
  <View style={hidden ? styles.hidden : styles.shell} pointerEvents="none">
    <View style={styles.chromeBand} />
    <SceneLoadingSurface rowType="restaurant" count={4} />
  </View>
));
ShellFacsimile.displayName = 'ShellFacsimile';

export const ShellResidencyProbe: React.FC = () => {
  const state = React.useSyncExternalStore(subscribe, getShellProbeState, getShellProbeState);
  if (state.mode === 'off' || state.count === 0) {
    return null;
  }
  const shells = Array.from({ length: state.count }, (_, i) => (
    <ShellFacsimile key={i} hidden={state.mode === 'law' && i > 0} />
  ));
  return (
    <View style={styles.host} pointerEvents="none">
      {shells}
    </View>
  );
};

const styles = StyleSheet.create({
  host: { ...StyleSheet.absoluteFillObject, zIndex: 9999, opacity: 0.9 },
  shell: { ...StyleSheet.absoluteFillObject },
  hidden: { display: 'none' },
  chromeBand: { height: 110, backgroundColor: '#ffffff' },
});
