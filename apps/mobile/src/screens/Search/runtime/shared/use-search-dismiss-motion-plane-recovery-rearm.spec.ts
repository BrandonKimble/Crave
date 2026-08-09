/**
 * F7700 — THE F1041 RECOVERY DEADLINE MUST SURVIVE A MID-DISMISS RE-RENDER.
 *
 * The dismiss motion plane arms a 1200ms recovery deadline (search-dismiss-boundary-
 * recovery.ts) when a dismiss begins; the module header promises it "recovers, always".
 * The bug: the registration `useLayoutEffect` was keyed on the two `observeDismiss`/
 * `observeOpen` callbacks, which churn every render (their deps reach the two INLINE notify
 * arrows the caller passes). Its cleanup clears the recovery deadline. So any mid-dismiss
 * re-render re-ran the effect — disarming the LIVE deadline — and re-registration re-invoked
 * `observeDismiss`, which hits its idempotent early-return BEFORE the arm calls. The deadline
 * was destroyed and never re-armed: the recovery could not fire in a real session, where this
 * hook is guaranteed to re-render during the 1200ms window.
 *
 * The fix registers a STABLE observation identity (a `useCallback([])` wrapper reading the
 * live callbacks through a ref), so re-registration no longer HAPPENS on identity churn and
 * the effect cleanup runs only on unmount.
 *
 * This spec drives the REAL hook through an effect-committing harness (react-effect-harness),
 * with reanimated shared values persisted as refs and the surface runtime / perf modules
 * mocked. It proves, with fake timers:
 *   (1) recovery still fires at 1200ms on a stalled boundary (no re-render) — the promise;
 *   (2) recovery still fires when a mid-dismiss re-render (fresh inline notify arrows, exactly
 *       the caller's churn) is forced before the deadline — RED on the pre-fix wiring, GREEN now.
 *
 * NOTE ON LANE REACH: the hermetic node lane cannot run reanimated worklets or the real
 * `useAnimatedReaction` commit path, so the WORKLET boundary-commit is not exercised here —
 * that stays with the perf-scenario harness on a real build. The recovery deadline is a plain
 * JS `setTimeout` and IS fully drivable, which is the exact mechanism F7700 concerns.
 */

(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

import { createReactEffectHarnessModuleMock, mountHook } from './spec-support/react-effect-harness';

jest.mock('react', () => createReactEffectHarnessModuleMock());

jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    useSharedValue: (initial: unknown) => React.useRef({ value: initial }).current,
    useDerivedValue: () => React.useRef({ value: 0 }).current,
    useAnimatedReaction: () => undefined,
    runOnJS:
      (fn: (...args: unknown[]) => unknown) =>
      (...args: unknown[]) =>
        fn(...args),
  };
});

type DismissTransaction = {
  id: string;
  bottomBoundaryReached: boolean;
  pollHeaderReady: boolean;
  pollBodyReady: boolean;
  pollHostReady: boolean;
};

const surfaceState: {
  snapshot: { dismissTransaction: DismissTransaction | null; redrawTransaction: null };
  policy: { phase: string; transactionId: string | null; canReleaseDockedScene: boolean };
  target: { observeDismiss: (arg: { transactionId: string }) => void } | null;
} = {
  snapshot: { dismissTransaction: null, redrawTransaction: null },
  policy: { phase: 'idle', transactionId: null, canReleaseDockedScene: false },
  target: null,
};

const surfaceRuntime = {
  getSnapshot: () => surfaceState.snapshot,
  subscribe: () => () => undefined,
  markRedrawSheetReady: () => undefined,
  registerMotionPlaneObservationTarget: (target: {
    observeDismiss: (arg: { transactionId: string }) => void;
    observeOpen: (arg: { transactionId: string; onStarted: () => void }) => void;
  }) => {
    surfaceState.target = target;
    const dismiss = surfaceState.snapshot.dismissTransaction;
    if (dismiss != null && !dismiss.bottomBoundaryReached) {
      target.observeDismiss({ transactionId: dismiss.id });
    }
    return () => {
      if (surfaceState.target === target) {
        surfaceState.target = null;
      }
    };
  },
};

jest.mock('../surface/search-surface-runtime', () => ({
  getSearchSurfaceRuntime: () => surfaceRuntime,
  selectSearchSurfaceVisualPolicy: () => surfaceState.policy,
  areSearchSurfaceVisualPoliciesEqual: () => false,
  useSearchSurfaceRuntimeSelector: (selector: (snapshot: unknown) => unknown) =>
    selector(surfaceState.snapshot),
}));

jest.mock('../../../../perf/perf-scenario-attribution', () => ({
  isPerfScenarioAttributionActive: () => false,
  logPerfScenarioAttributionEvent: () => undefined,
}));
jest.mock('../../../../perf/perf-scenario-work-span', () => ({
  getPerfScenarioWorkNow: () => 0,
  logPerfScenarioWorkSpan: () => undefined,
}));
jest.mock('../../../../perf/perf-scenario-runtime-store', () => ({
  usePerfScenarioRuntimeStore: (selector: (state: { activeConfig: null }) => unknown) =>
    selector({ activeConfig: null }),
}));

import { useSearchDismissMotionPlaneRuntime } from './use-search-dismiss-motion-plane-runtime';

const SNAP_POINTS = { collapsed: 500, middle: 200, full: 40 } as const;

const beginLiveDismiss = (): void => {
  surfaceState.snapshot = {
    dismissTransaction: {
      id: 'txn-1',
      bottomBoundaryReached: false,
      pollHeaderReady: false,
      pollBodyReady: false,
      pollHostReady: false,
    },
    redrawTransaction: null,
  };
  surfaceState.policy = {
    phase: 'results_dismissing',
    transactionId: 'txn-1',
    canReleaseDockedScene: false,
  };
  surfaceState.target = null;
};

const mountRuntime = (
  notifyCollapsed: () => void,
  notifySettled: () => void
): ReturnType<typeof mountHook> => {
  // The sheet is mid-travel (100) well above the collapsed boundary (500), so the dismiss
  // is a real observed motion, NOT the "already collapsed, complete immediately" path — the
  // recovery deadline is armed and left pending on a stalled poll boundary.
  const trackSheetTopY = { value: 100 };
  return mountHook(() =>
    useSearchDismissMotionPlaneRuntime({
      trackSheetTopY: trackSheetTopY as never,
      currentSheetSnap: 'middle',
      snapPoints: SNAP_POINTS as never,
      collapsedSnap: SNAP_POINTS.collapsed,
      // Fresh inline arrows every render — the exact churn the real caller
      // (use-search-root-runtime-visual-stage-runtime.ts:115-125) produces.
      notifyCloseCollapsedBoundaryReached: () => notifyCollapsed(),
      notifyCloseSheetSettled: () => notifySettled(),
    })
  );
};

describe('F7700 dismiss recovery deadline survives a mid-dismiss re-render', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    surfaceState.snapshot = { dismissTransaction: null, redrawTransaction: null };
    surfaceState.policy = { phase: 'idle', transactionId: null, canReleaseDockedScene: false };
    surfaceState.target = null;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('fires the 1200ms recovery on a stalled boundary with no re-render (the promise)', () => {
    beginLiveDismiss();
    const notifyCollapsed = jest.fn();
    const notifySettled = jest.fn();
    const harness = mountRuntime(notifyCollapsed, notifySettled);

    expect(notifyCollapsed).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1199);
    expect(notifyCollapsed).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2);
    expect(notifyCollapsed).toHaveBeenCalledTimes(1);
    expect(notifySettled).toHaveBeenCalledTimes(1);

    harness.unmount();
  });

  it('fires the 1200ms recovery even when a re-render churns the notify callbacks mid-dismiss', () => {
    beginLiveDismiss();
    const notifyCollapsed = jest.fn();
    const notifySettled = jest.fn();
    const harness = mountRuntime(notifyCollapsed, notifySettled);

    // 300ms into the still-pending dismiss, force a re-render — fresh inline notify arrows,
    // exactly what happens when the hosting stage runtime re-renders during the animation.
    jest.advanceTimersByTime(300);
    harness.render();
    harness.render();
    expect(notifyCollapsed).not.toHaveBeenCalled();

    // Advance past the ORIGINAL 1200ms deadline. Pre-fix, the re-render's effect cleanup had
    // cleared this timer and re-registration never re-armed it, so nothing fired here.
    jest.advanceTimersByTime(1000);
    expect(notifyCollapsed).toHaveBeenCalledTimes(1);
    expect(notifySettled).toHaveBeenCalledTimes(1);

    harness.unmount();
  });
});
