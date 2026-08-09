import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SceneLoadingSurface } from '../components/skeletons';
import { resolveSceneLoadingMaterial } from '../navigation/runtime/scene-foundation-spec';
import type { OverlayKey } from '../navigation/runtime/app-overlay-route-types';
import { useSceneLoadFailurePolicy, type SceneLoadFailure } from './scene-load-failure-policy';

// ─── SceneBodyReadyGate (child-transition primitive §2.2, leg 6) ─────────────────────────────
//
// THE skeleton law, structural: a pending scene body renders its DECLARED foundation skeleton
// (the scene-foundation-spec row — the compile-time table every sheet scene must fill), never a
// spinner and never bare frost. This is the render path the half-built primitive was missing:
// the shared skeleton LEG only covers a null body entry; panels that mounted and then gated on
// their query's isPending used to seed a raw ActivityIndicator (the child bare-frost/spinner
// class). Every in-body pending gate is now `<SceneBodyReadyGate pending={q.isPending}>` — no
// per-page skeleton choice at the call-site; the spec row is the law. The eslint
// no-restricted-imports ban on ActivityIndicator in overlays/panels/** is the RED contract.
//
// Scene resolution: the scene-stack content host provides the mounting scene's key via
// SceneBodySceneKeyContext (SceneStripLawContext-style). F978: the file used to also offer an
// explicit `sceneKey` override "for bodies rendered outside the scene stack" and then document,
// in the same breath, that there are none today — a prop with no caller, and the second half of
// the reason the bark below could not fire. The context is the ONE resolution path; a body that
// truly mounts outside the stack must provide the context, not a per-call-site escape hatch.

export const SceneBodySceneKeyContext = React.createContext<OverlayKey | null>(null);

// ─── THE PENDING REPORTER INVERSION (toggle-primitive rederivation §2.5) ─────────────────────
//
// On the track, skeleton ownership has ONE owner: the leg cell's persistent overlay
// (use-track-leg-resolver.tsx), which spans press/flip -> data-ready as a single mounted
// SceneLoadingSurface. The gate there must therefore stop being a rival PAINTER and become a
// REPORTER: when a SceneBodyPendingReporterContext is provided, the gate renders NOTHING while
// pending/failed and reports the fact upward; the overlay decides the paint. Off the track (no
// reporter — the old host), the gate keeps its painter face unchanged.
//
// The report is written during RENDER (a plain mutation, no setState): the overlay is a LATER
// SIBLING of the body in the leg cell, so within any commit that renders both, the overlay's
// read sees this commit's fact — the release commit mounts the body under an overlay that
// already knows it is pending, and the reveal commit drops the overlay in the SAME commit the
// content renders. When the gate re-renders ALONE (a panel-local query flip), the layout effect
// notifies subscribers BEFORE paint, so no frame ever shows content and skeleton stacked. The
// reporter pattern cannot deadlock: the body always mounts (and fetches) UNDER the overlay —
// nothing waits on the report to mount; the report only decides when the overlay lifts.

export type SceneBodyPendingReporter = {
  /** Render-phase write: the gate states this commit's pending/failed fact. */
  reportRender: (pending: boolean) => void;
  /** Commit-phase (layout-effect) notify — fires listeners only on a change. */
  notifyIfChanged: () => void;
  getPending: () => boolean;
  subscribe: (listener: () => void) => () => void;
};

export const createSceneBodyPendingReporter = (): SceneBodyPendingReporter => {
  let pending = false;
  let notified = false;
  const listeners = new Set<() => void>();
  return {
    reportRender: (next: boolean) => {
      pending = next;
    },
    notifyIfChanged: () => {
      if (notified === pending) {
        return;
      }
      notified = pending;
      [...listeners].forEach((listener) => listener());
    },
    getPending: () => pending,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const SceneBodyPendingReporterContext = React.createContext<SceneBodyPendingReporter | null>(
  null
);

// Dev-only: bark when the gate can't resolve a foundation skeleton — it then renders nothing
// while pending, which is exactly the blank-frame disease.
// F978: this used to be a module-global `let`, so it reported ONCE PER APP LIFETIME ACROSS ALL
// SCENES — the second distinct offender was silent, and an instrument that can only ever speak
// once is barely an instrument. Keyed by scene now, so every distinct offender is heard.
const barkedMissingMaterialSceneKeys = new Set<string>();

export const SceneBodyReadyGate: React.FC<{
  pending: boolean;
  /**
   * THE LOAD-FAILURE LAW (wave-4 §1, scene-load-failure-policy.ts): pass the scene's
   * primary-query error edge and every gated panel inherits the app-wide failure
   * behavior — child scenes announce THE shared modal and pop to their trigger on
   * dismissal; root scenes announce and re-run on next presentation. While failed,
   * the body keeps its DECLARED skeleton (never blank, never a page-local retry).
   */
  failure?: SceneLoadFailure;
  children?: React.ReactNode;
}> = ({ pending, failure, children }) => {
  const resolvedSceneKey = React.useContext(SceneBodySceneKeyContext);
  useSceneLoadFailurePolicy(resolvedSceneKey, failure);
  const reporter = React.useContext(SceneBodyPendingReporterContext);
  const covered = pending || failure?.isError === true;
  if (reporter != null) {
    // Render-phase report (see the reporter doc above): later siblings in this
    // commit — the leg's overlay — read the fresh fact synchronously.
    reporter.reportRender(covered);
  }
  React.useLayoutEffect(() => {
    // Before paint, so a gate-alone re-render (panel-local query flip) lifts /
    // raises the overlay in the same frame — never a stacked or blank paint.
    reporter?.notifyIfChanged();
  });
  React.useLayoutEffect(() => {
    if (reporter == null) {
      return;
    }
    return () => {
      // A gate that leaves the tree stops holding the overlay up (a body that
      // unmounts its gate has nothing pending to cover).
      reporter.reportRender(false);
      reporter.notifyIfChanged();
    };
  }, [reporter]);
  if (reporter != null) {
    // REPORTER MODE: the overlay owns pending paint AND pending height; the
    // gate renders nothing while covered — never a second skeleton instance.
    return covered ? null : <>{children ?? null}</>;
  }
  if (!pending && failure?.isError !== true) {
    return <>{children ?? null}</>;
  }
  const material = resolvedSceneKey != null ? resolveSceneLoadingMaterial(resolvedSceneKey) : null;
  if (material == null) {
    const barkKey = resolvedSceneKey ?? 'none';
    if (__DEV__ && !barkedMissingMaterialSceneKeys.has(barkKey)) {
      barkedMissingMaterialSceneKeys.add(barkKey);
      // eslint-disable-next-line no-console
      console.error(
        `[FOUNDATION] SceneBodyReadyGate could not resolve a foundation skeleton ` +
          `(sceneKey='${barkKey}') — a pending body is rendering EMPTY. Mount it under the ` +
          `scene stack (SceneBodySceneKeyContext), or give the scene a loading material.`
      );
    }
    return null;
  }
  return (
    <View pointerEvents="none" style={styles.pendingSurface}>
      {/* L2: rowType + backing come from the ONE derivation home
          (resolveSceneLoadingMaterial) — the gate no longer re-decides the §Q redo T2
          white-on-white rule; it shares the exact derivation PageBodyShell uses. */}
      <SceneLoadingSurface
        rowType={material.rowType}
        withFilterStripHoles={material.withStripHoles}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  // The gate renders INSIDE the scene's body lane (already offset below the persistent
  // header); the skeleton fills the lane it replaces.
  pendingSurface: {
    flex: 1,
    // F976(e): a floor so the skeleton still occupies a plausible page when the body lane has
    // not been measured yet (first paint) — without it the gate can collapse to nothing and
    // the sheet visibly pops when real content arrives. FEEL/UNATTRIBUTED: 320 is "about a
    // half-screen of rows", not a derived value.
    minHeight: 320,
  },
});

export default SceneBodyReadyGate;
