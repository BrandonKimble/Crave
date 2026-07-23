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
// SceneBodySceneKeyContext (SceneStripLawContext-style). Bodies rendered OUTSIDE the scene
// stack (none today) may pass an explicit `sceneKey`.

export const SceneBodySceneKeyContext = React.createContext<OverlayKey | null>(null);

// Dev-only: bark once per call-site-scene when the gate can't resolve a scene (no context, no
// prop) — it then renders nothing while pending, which is exactly the blank-frame disease.
let barkedMissingSceneKey = false;

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
  /** Explicit override for bodies mounted outside the scene stack; context covers the rest. */
  sceneKey?: OverlayKey;
  children?: React.ReactNode;
}> = ({ pending, failure, sceneKey, children }) => {
  const contextSceneKey = React.useContext(SceneBodySceneKeyContext);
  const resolvedSceneKey = sceneKey ?? contextSceneKey;
  useSceneLoadFailurePolicy(resolvedSceneKey, failure);
  if (!pending && failure?.isError !== true) {
    return <>{children ?? null}</>;
  }
  const material = resolvedSceneKey != null ? resolveSceneLoadingMaterial(resolvedSceneKey) : null;
  if (material == null) {
    if (__DEV__ && !barkedMissingSceneKey) {
      barkedMissingSceneKey = true;
      // eslint-disable-next-line no-console
      console.error(
        `[FOUNDATION] SceneBodyReadyGate could not resolve a foundation skeleton ` +
          `(sceneKey='${resolvedSceneKey ?? 'none'}') — a pending body is rendering EMPTY. ` +
          `Mount under the scene stack or pass sceneKey.`
      );
    }
    return null;
  }
  return (
    <View pointerEvents="none" style={styles.pendingSurface}>
      {/* L2: rowType + backing come from the ONE derivation home
          (resolveSceneLoadingMaterial) — the gate no longer re-decides the §Q redo T2
          white-on-white rule; it shares the exact derivation PageBodyShell uses. */}
      <SceneLoadingSurface rowType={material.rowType} />
    </View>
  );
};

const styles = StyleSheet.create({
  // The gate renders INSIDE the scene's body lane (already offset below the persistent
  // header); the skeleton fills the lane it replaces.
  pendingSurface: {
    flex: 1,
    minHeight: 320,
  },
});

export default SceneBodyReadyGate;
