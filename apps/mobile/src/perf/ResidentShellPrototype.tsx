import React from 'react';
import { NativeModules, StyleSheet, Text, View } from 'react-native';

import { PageBodyShell } from '../overlays/PageBodyShell';
import { defineListBand, type PageListBodySpec } from '../overlays/page-body-contract';

// ─── THE L3 RESIDENCY PROTOTYPE (measurement harness, not product code) ─────────────
//
// L3's ratification gate (plans/page-composition-from-scratch-design.md): "shells are
// cheap" is an unmeasured claim — this harness mounts N HIDDEN shells at runtime so
// the cost of the resident-shell world is a measured fact: mount duration (the boot-
// delta proxy — this exact work would run at app-idle prewarm), resident memory (RSS
// sampled externally per mount step), and steady-state fps (the existing samplers,
// with the shells resident). Two variants per the honest range:
// - rows=0  → the FLOOR: empty shells (the gate's literal wording)
// - rows=N  → the realistic world: shells holding representative row structures
//   (Views/Text only — image memory is NOT modeled here; named in the verdict).
//
// The hidden state follows the L3 visibility law deliberately: display:'none', no
// shimmer (a hidden shell runs ZERO animation work), pointerEvents none.
//
// Driven by the perf deep link:
//   crave://perf-scenario-command?action=mount_shell_prototype&markerCount=<shells>&routeParam=<rowsPerShell>
// markerCount=0 unmounts. Emits one [SHELLPROTO] line per commit with the mount
// duration (console in dev; the UIFrameSampler os_log sink in release).

type ResidentShellPrototypeState = {
  shellCount: number;
  rowsPerShell: number;
  requestedAtMs: number;
};

let prototypeState: ResidentShellPrototypeState = {
  shellCount: 0,
  rowsPerShell: 0,
  requestedAtMs: 0,
};
const listeners = new Set<() => void>();

export const setResidentShellPrototype = (input: {
  shellCount: number;
  rowsPerShell: number;
}): void => {
  prototypeState = {
    shellCount: Math.max(0, Math.min(64, Math.trunc(input.shellCount))),
    rowsPerShell: Math.max(0, Math.min(64, Math.trunc(input.rowsPerShell))),
    requestedAtMs:
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now(),
  };
  listeners.forEach((listener) => {
    listener();
  });
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): ResidentShellPrototypeState => prototypeState;

type SyntheticRow = { id: string; title: string; subtitle: string; meta: string };

// A representative row STRUCTURE: identity block + three text lines + trailing
// affordances — Views/Text only (no images, no queries), approximating the mounted
// tree cost of a typical page row.
const SyntheticShellRow = ({ item }: { item: SyntheticRow }) => (
  <View style={styles.row}>
    <View style={styles.avatar} />
    <View style={styles.rowBody}>
      <Text style={styles.rowTitle}>{item.title}</Text>
      <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
      <Text style={styles.rowMeta}>{item.meta}</Text>
    </View>
    <View style={styles.trailing}>
      <View style={styles.trailingDot} />
      <View style={styles.trailingDot} />
    </View>
  </View>
);

const SyntheticEmpty = () => <View style={styles.emptyBlock} />;

const PROTOTYPE_SHELL_SPEC: PageListBodySpec = {
  kind: 'list',
  // Any registered scene works: the material derivation is only consulted for
  // pending/error, which this harness never renders (empty/present only).
  scene: 'notifications',
  bands: [
    defineListBand<SyntheticRow>({
      key: 'main',
      keyOf: (item) => item.id,
      row: { Component: SyntheticShellRow },
      placeholder: { count: 8 },
      Empty: SyntheticEmpty,
    }),
  ],
};

const buildSyntheticRows = (shellIndex: number, rowsPerShell: number): SyntheticRow[] =>
  Array.from({ length: rowsPerShell }, (_, rowIndex) => ({
    id: `shell-${shellIndex}-row-${rowIndex}`,
    title: `Resident shell ${shellIndex} row ${rowIndex}`,
    subtitle: 'Representative subtitle line for the resident-shell prototype',
    meta: 'meta · line · three',
  }));

const emitShellPrototypeLine = (line: string): void => {
  // eslint-disable-next-line no-console
  console.log(line);
  if (!__DEV__) {
    const nativeSampler = (NativeModules as Record<string, unknown>).UIFrameSampler as
      | { logEvent?: (message: string) => void }
      | undefined;
    try {
      nativeSampler?.logEvent?.(line);
    } catch {
      // telemetry only
    }
  }
};

export const ResidentShellPrototype = (): React.ReactElement | null => {
  const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  React.useEffect(() => {
    if (state.requestedAtMs === 0) {
      return;
    }
    const committedAtMs =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    emitShellPrototypeLine(
      `[SHELLPROTO] committed shells=${state.shellCount} rowsPerShell=${state.rowsPerShell} mountMs=${(
        committedAtMs - state.requestedAtMs
      ).toFixed(1)}`
    );
  }, [state]);
  if (state.shellCount === 0) {
    return null;
  }
  return (
    <View pointerEvents="none" style={styles.hiddenHost}>
      {Array.from({ length: state.shellCount }, (_, shellIndex) => (
        <View key={`shell-${shellIndex}`} style={styles.shellFrame}>
          <View style={styles.chromeFrame} />
          <PageBodyShell
            spec={PROTOTYPE_SHELL_SPEC}
            bandStates={{
              main:
                state.rowsPerShell === 0
                  ? { kind: 'empty' }
                  : { kind: 'present', items: buildSyntheticRows(shellIndex, state.rowsPerShell) },
            }}
          />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenHost: {
    // The L3 hidden-shell state: detached from layout, zero animation, untouchable.
    display: 'none',
    position: 'absolute',
  },
  shellFrame: {
    width: 390,
  },
  chromeFrame: {
    height: 68,
  },
  emptyBlock: {
    height: 400,
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatar: {
    borderRadius: 20,
    height: 40,
    marginRight: 12,
    width: 40,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  rowMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  trailing: {
    justifyContent: 'center',
  },
  trailingDot: {
    borderRadius: 6,
    height: 12,
    marginVertical: 2,
    width: 12,
  },
});
