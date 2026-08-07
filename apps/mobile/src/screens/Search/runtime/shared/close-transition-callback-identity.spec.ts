/**
 * F6003 — A CALLBACK'S DEP ARRAY IS THE EXACT SET OF VALUES ITS BODY CLOSES OVER.
 *
 * `beginCloseTransition` listed `shellLocalState.searchCloseTransitionState`, a
 * value its body never touches. `react-hooks/exhaustive-deps` reports MISSING
 * deps; an extra one is invisible to it, so the lint being green there carried
 * no information about the defect. This spec is the enforcer instead: it holds
 * `shellLocalState` referentially STABLE and moves only the close-transition
 * state, so the only thing that can re-mint the callback is the deleted dep.
 * Exactly one identity today; re-adding the dep makes it four and this goes RED.
 *
 * WHAT THIS DELIBERATELY DOES NOT CLAIM (refutation recorded in the F6003 row):
 * the finding predicted the deletion would make the real callback identity
 * stable across a dismissal. It does not. `beginCloseTransitionIntent` — a dep
 * the body genuinely reads — closes over `shellLocalState`, and that object is a
 * `useMemo` whose dep list INCLUDES `searchCloseTransitionState`, so it re-mints
 * on every mark and carries `beginCloseTransition` with it. The deletion is
 * still right (a dep array that names a value the body never reads is a lie
 * about the body), but it buys truth, not stability.
 */
import { createReactHookHarnessModuleMock, mountHook } from './spec-support/react-hook-harness';

jest.mock('react', () => createReactHookHarnessModuleMock());
jest.mock('react-native', () => ({
  unstable_batchedUpdates: (run: () => void) => run(),
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Platform: { OS: 'ios', select: (spec: { ios?: unknown }) => spec.ios },
  StyleSheet: { create: (sheet: unknown) => sheet, hairlineWidth: 1, absoluteFillObject: {} },
}));

import { useResultsPresentationCloseTransitionStateRuntime } from './use-results-presentation-close-transition-state-runtime';

const noop = () => undefined;

describe('F6003 beginCloseTransition dep array', () => {
  it('is minted once while only the close-transition state moves', () => {
    const shellLocalState = {
      searchCloseTransitionState: null as { closeIntentId: string } | null,
      setSearchCloseTransitionState: noop,
      setBackdropTarget: noop,
      setInputMode: noop,
      setHoldDockedLane: noop,
    };

    const routeSceneVisibilityPolicyRuntime = { updateCloseTransitionActive: noop };

    const harness = mountHook(() =>
      useResultsPresentationCloseTransitionStateRuntime({
        clearSearchState: noop as never,
        shellLocalState: shellLocalState as never,
        routeSceneVisibilityPolicyRuntime: routeSceneVisibilityPolicyRuntime as never,
      })
    );

    const identities = new Set([harness.latest().beginCloseTransition]);

    // Three marks' worth of close-transition-state movement.
    (['intent-a', 'intent-b', 'intent-c'] as const).forEach((closeIntentId) => {
      shellLocalState.searchCloseTransitionState = { closeIntentId };
      identities.add(harness.render().beginCloseTransition);
    });

    expect(identities.size).toBe(1);
  });
});
