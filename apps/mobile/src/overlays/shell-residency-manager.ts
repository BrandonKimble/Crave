import { InteractionManager } from 'react-native';

import type { OverlayKey } from '../navigation/runtime/app-overlay-route-types';
import type { SheetSceneKey } from '../navigation/runtime/scene-foundation-spec';
import type { ResidencyManagedSceneKey } from './shell-residency-registry';
import { isResidencyManagedScene, RESIDENCY_MANAGED_SCENES } from './shell-residency-registry';

export { isResidencyManagedScene } from './shell-residency-registry';

// ─── THE SHELL RESIDENCY MANAGER (THE PAGE L3) ──────────────────────────────────────
//
// Every residency-managed scene's shell mounts ONCE and stays resident; a scene
// switch retargets VISIBILITY, never mounts. Ratified on two measured prototypes
// (ShellResidencyProbe 2026-07-16: law pole indistinguishable from baseline, anti-law
// pole collapses the UI thread; ResidentShellPrototype 2026-07-21: empty shells free,
// content is the budget). The laws this module makes structural:
//
// - **ONE VISIBILITY WRITER (A#13):** `setVisibleResidentScene` is the only mutation
//   of the visible bit. Everything else DERIVES from it through ShellVisibilityBoundary
//   (display/pointerEvents/accessibility) and ShellLivenessContext (subscription +
//   animation liveness) — a half-hidden shell (visible but dead, hidden but
//   subscribed, hidden but shimmering) is unrepresentable because there is exactly
//   one bit to read.
// - **WARM-BEFORE-NAVIGATE (A#6/B#6iii):** first-visit shells mount at app-idle
//   (`scheduleResidentShellPrewarm`) or on press-down prediction — NEVER inside a
//   transition. `ensureShellResident(scene, 'navigation')` mounting a cold shell is a
//   LOUD contract violation (console.error — the RED instrument), not a fallback.
// - **THE EVICTION SEAM (A#11/B#7):** shells never evict; CONTENT evicts under a
//   budget. Slice 1 lands the bookkeeping (visit order for the last-N exemption +
//   the commitment ledger the measured prototype demands — RSS is sticky, so the
//   budget counts COMMITMENT, not reclaim). The budget itself activates when
//   content-heavy scenes join residency; until then it is recorded as unbounded.
// - **THE STRANGLER BOOLEAN (migration bridge B#5):** `isResidencyManagedScene` is
//   the one check the legacy hosts consult (conditional mount, persistent header) —
//   deleted with the last unmigrated scene.

type ShellResidencyState = {
  /** Scenes whose shells are currently mounted resident (mount order). */
  residentScenes: readonly ResidencyManagedSceneKey[];
  /** THE visible bit's owner — at most one resident scene is visible. */
  visibleScene: ResidencyManagedSceneKey | null;
  /** Transition participants (the outgoing leg during a live transition): DISPLAYED so
   *  the crossfade never fades a blank, back to hidden at settle. Written by the same
   *  driver as visibleScene — one writer, two coordinated facts. */
  transitionLiveScenes: readonly ResidencyManagedSceneKey[];
  /** Most-recent-first visit order (the eviction law's last-N exemption input). */
  visitOrder: readonly ResidencyManagedSceneKey[];
};

let state: ShellResidencyState = {
  residentScenes: [],
  visibleScene: null,
  transitionLiveScenes: [],
  visitOrder: [],
};

const listeners = new Set<() => void>();

const notify = (): void => {
  listeners.forEach((listener) => {
    listener();
  });
};

export const subscribeShellResidency = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getShellResidencySnapshot = (): ShellResidencyState => state;

export type EnsureShellResidentReason = 'prewarm_idle' | 'press_down' | 'navigation';

export const ensureShellResident = (
  scene: ResidencyManagedSceneKey,
  reason: EnsureShellResidentReason
): void => {
  if (!isResidencyManagedScene(scene) || state.residentScenes.includes(scene)) {
    return;
  }
  if (reason === 'navigation') {
    // WARM-BEFORE-NAVIGATE RED: a cold mount inside a navigation is the exact disease
    // the law forbids. Mount anyway (correctness over purity) but say it loudly.
    // eslint-disable-next-line no-console
    console.error(
      `[SHELL-RESIDENCY][CONTRACT] cold shell mounted INSIDE a navigation: ${scene} — ` +
        'warm-before-navigate violated (prewarm did not cover this scene)'
    );
  }
  state = {
    ...state,
    residentScenes: [...state.residentScenes, scene],
  };
  notify();
};

/** THE ONE VISIBILITY WRITER. Passing null hides every resident shell (the scene in
 *  front is legacy-hosted or none). Also mounts the target if somehow cold (loud,
 *  via ensureShellResident's navigation contract). */
export const setVisibleResidentScene = (
  scene: OverlayKey | null,
  transitionLiveScenes: readonly (OverlayKey | null | undefined)[] = []
): void => {
  const managedScene =
    scene != null && isResidencyManagedScene(scene) ? (scene as ResidencyManagedSceneKey) : null;
  if (managedScene != null) {
    ensureShellResident(managedScene, 'navigation');
  }
  const nextVisible = managedScene;
  const nextTransitionLive = transitionLiveScenes.filter(
    (candidate): candidate is ResidencyManagedSceneKey =>
      candidate != null && isResidencyManagedScene(candidate) && candidate !== nextVisible
  );
  const transitionLiveUnchanged =
    nextTransitionLive.length === state.transitionLiveScenes.length &&
    nextTransitionLive.every((candidate, index) => state.transitionLiveScenes[index] === candidate);
  if (state.visibleScene === nextVisible && transitionLiveUnchanged) {
    return;
  }
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(
      `[SHELL-RESIDENCY] visible=${nextVisible ?? 'none'} txnLive=[${nextTransitionLive.join(',')}] (was ${state.visibleScene ?? 'none'})`
    );
  }
  state = {
    ...state,
    visibleScene: nextVisible,
    transitionLiveScenes: nextTransitionLive,
    visitOrder:
      nextVisible == null
        ? state.visitOrder
        : [nextVisible, ...state.visitOrder.filter((visited) => visited !== nextVisible)],
  };
  notify();
};

/** WARM-BEFORE-NAVIGATE's scheduler: mounts the reachable residency-managed set at
 *  app-idle (post-boot / post-transition), so a navigation never compiles a shell.
 *  Idempotent; call from the app root once interactions settle. */
export const scheduleResidentShellPrewarm = (): void => {
  void InteractionManager.runAfterInteractions(() => {
    RESIDENCY_MANAGED_SCENES.forEach((scene) => {
      ensureShellResident(scene, 'prewarm_idle');
    });
  });
};

// ─── The eviction seam (bookkeeping now, budget activates with content scenes) ─────
//
// The measured prototype's finding: content commitment ~170KB/row (image-free) and
// RSS does NOT return on unmount — so the budget counts what was COMMITTED, and
// eviction's value is bounding growth, not reclaiming the past. Slice 1 records
// commitments; the budget check is a seam that names its own inactivation.

const contentCommitmentBySceneKb = new Map<ResidencyManagedSceneKey, number>();

export const recordShellContentCommitment = (
  scene: ResidencyManagedSceneKey,
  estimatedKb: number
): void => {
  contentCommitmentBySceneKb.set(scene, estimatedKb);
};

export const readShellContentCommitments = (): ReadonlyMap<ResidencyManagedSceneKey, number> =>
  contentCommitmentBySceneKb;
