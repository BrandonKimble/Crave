/**
 * IDENTITY SPEC for the results-presentation owner bridge (F5301).
 *
 * The defect this pins is invisible to the type system, which is why it survived: the hook
 * used to rest-destructure its machine-owner callee
 * (`const { handleToggleInteractionLifecycle, ...machineOwner } = useX(...)`). The callee
 * returns a `React.useMemo`, so its identity is stable — but a rest element ALLOCATES A NEW
 * OBJECT ON EVERY RENDER, and that fresh object was dep #2 of the `resultsRuntimeOwner`
 * memo, which is in turn dep #1 of the return memo. Both memos therefore recomputed on
 * every render and the hook's whole return identity changed unconditionally, defeating the
 * memoization the file exists to provide.
 *
 * A rest-destructure typechecks identically either way (D92: no type-level proof is
 * available here), so the identity assertion below IS the proof. Restoring the
 * rest-destructure makes every `toBe` in this file fail.
 *
 * Both callees are mocked to return FIXED objects: with stable inputs, a correctly
 * memoized bridge must return a stable identity. That is the entire contract.
 */
import { createReactHookHarnessModuleMock, mountHook } from './spec-support/react-hook-harness';

jest.mock('react', () => createReactHookHarnessModuleMock());

const machineOwner = {
  searchSurfaceResultsTransactionKey: 'txn-1',
  beginSearchThisAreaPresentationPending: () => {},
  beginVariantRerunPresentationPending: () => {},
  stageSearchSurfaceResultsTransaction: () => {},
  clearStagedSearchSurfaceResultsTransaction: () => {},
  handlePageOneResultsCommitted: () => {},
  commitSearchSurfaceResultsExitTransaction: () => {},
  cancelPresentationIntent: () => {},
  handleToggleInteractionLifecycle: () => {},
  handlePresentationIntentAbort: () => {},
  handleExecutionBatchMountedHidden: () => {},
  handleMarkerEnterStarted: () => {},
  handleMarkerEnterSettled: () => {},
  handleMarkerExitStarted: () => {},
  handleMarkerExitSettled: () => {},
};

const interactionRuntime = {
  cancelToggleInteraction: () => {},
  pendingTogglePresentationIntentId: null,
  scheduleToggleCommit: () => {},
  interactionModel: { isToggleInteractionActive: false },
};

const machineOwnerCalls: Array<Record<string, unknown>> = [];
const interactionRuntimeCalls: Array<Record<string, unknown>> = [];

jest.mock('./use-results-presentation-runtime-machine-owner', () => ({
  useResultsPresentationRuntimeMachineOwner: (args: Record<string, unknown>) => {
    machineOwnerCalls.push(args);
    return machineOwner;
  },
}));

jest.mock('./use-results-presentation-interaction-runtime', () => ({
  useResultsPresentationInteractionRuntime: (args: Record<string, unknown>) => {
    interactionRuntimeCalls.push(args);
    return interactionRuntime;
  },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  useResultsPresentationOwnerBridgeRuntime,
} = require('./use-results-presentation-owner-bridge-runtime');
/* eslint-enable @typescript-eslint/no-var-requires */

describe('useResultsPresentationOwnerBridgeRuntime memo identity', () => {
  const args = {
    setActiveTab: () => {},
    setActiveTabPreference: () => {},
    searchRuntimeBus: {} as never,
    resultsPresentationAuthority: {} as never,
    resultsPresentationSurfaceAuthority: {} as never,
    searchMapSourceFramePort: {} as never,
    log: () => {},
  };

  beforeEach(() => {
    machineOwnerCalls.length = 0;
    interactionRuntimeCalls.length = 0;
  });

  it('returns the SAME object across re-renders when its inputs are unchanged', () => {
    const harness = mountHook(() => useResultsPresentationOwnerBridgeRuntime(args));
    const first = harness.latest();
    const second = harness.render();
    const third = harness.render();

    // The whole point of the file: one stable value for everything downstream to key on.
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('holds the 17-field resultsRuntimeOwner memo stable too, not just the outer one', () => {
    const harness = mountHook(() => useResultsPresentationOwnerBridgeRuntime(args));
    const first = harness.latest().resultsRuntimeOwner;
    harness.render();
    expect(harness.latest().resultsRuntimeOwner).toBe(first);
  });

  it('still forwards handleToggleInteractionLifecycle from the machine owner', () => {
    mountHook(() => useResultsPresentationOwnerBridgeRuntime(args));
    expect(interactionRuntimeCalls[0].handleToggleInteractionLifecycle).toBe(
      machineOwner.handleToggleInteractionLifecycle
    );
  });

  it('keeps the field WIRING the F1610 comment defends (the memo is a filter, not a spread)', () => {
    const harness = mountHook(() => useResultsPresentationOwnerBridgeRuntime(args));
    const owner = harness.latest().resultsRuntimeOwner;

    // The three interaction-owned fields come from the interaction runtime...
    expect(owner.cancelToggleInteraction).toBe(interactionRuntime.cancelToggleInteraction);
    expect(owner.scheduleToggleCommit).toBe(interactionRuntime.scheduleToggleCommit);
    // ...and the rest from the machine owner.
    expect(owner.searchSurfaceResultsTransactionKey).toBe(
      machineOwner.searchSurfaceResultsTransactionKey
    );
    expect(owner.handleMarkerExitSettled).toBe(machineOwner.handleMarkerExitSettled);

    // The FILTER: handleToggleInteractionLifecycle is deliberately NOT re-exported. A
    // `{ ...machineOwner }` inline would keep the type and change the value.
    expect(Object.prototype.hasOwnProperty.call(owner, 'handleToggleInteractionLifecycle')).toBe(
      false
    );
  });
});
