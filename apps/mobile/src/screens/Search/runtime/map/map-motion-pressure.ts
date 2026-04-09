type MapMotionPhase = 'gesture' | 'inertia' | 'settled';
type MapPlannerAdmissionDecision = 'run_now' | 'skip_noop' | 'defer_for_pressure';
type MapPlannerNormalWorkEffect = 'none' | 'admit' | 'coalesce';
type MapPlannerWorkClass = 'visible_candidates' | 'lod_pins';

type MapMotionTransactionPhase = 'preparing' | 'committing' | 'executing';

type MapMotionActivePresentationTransaction = {
  phase: MapMotionTransactionPhase;
};

type MapSourcePublishLifecycleEvent =
  | { kind: 'started' }
  | { kind: 'settled' }
  | { kind: 'synced'; nowMs: number };

export type MotionPressureState = {
  motionTokenIdentity: string | null;
  phase: MapMotionPhase;
  isSearchInteracting: boolean;
  isAnySheetDragging: boolean;
  nativeSyncInFlight: boolean;
  lastMaterialViewportUpdateAtMs: number;
  lastNormalWorkAdmittedAtMs: number;
  coalescedNormalWorkCount: number;
  activePresentationTransaction: MapMotionActivePresentationTransaction | null;
};

const createIdleMapMotionPressureState = (): MotionPressureState => ({
  motionTokenIdentity: null,
  phase: 'settled',
  isSearchInteracting: false,
  isAnySheetDragging: false,
  nativeSyncInFlight: false,
  lastMaterialViewportUpdateAtMs: 0,
  lastNormalWorkAdmittedAtMs: 0,
  coalescedNormalWorkCount: 0,
  activePresentationTransaction: null,
});

export type MapMotionPressureController = {
  getState: () => MotionPressureState;
  reset: () => MotionPressureState;
  updateViewportState: (args: {
    motionTokenIdentity: string;
    phase: MapMotionPhase;
    nowMs: number;
  }) => MotionPressureState;
  updatePresentationTransaction: (
    activePresentationTransaction: MapMotionActivePresentationTransaction | null
  ) => MotionPressureState;
  updateInteractionState: (args: {
    isSearchInteracting: boolean;
    isAnySheetDragging: boolean;
  }) => MotionPressureState;
  applySourcePublishLifecycleEvent: (event: MapSourcePublishLifecycleEvent) => MotionPressureState;
  applyNormalWorkEffect: (
    effect: MapPlannerNormalWorkEffect,
    nowMs: number
  ) => MotionPressureState | null;
};

export const createMapMotionPressureController = (): MapMotionPressureController => {
  let state = createIdleMapMotionPressureState();

  const publish = (nextState: MotionPressureState): MotionPressureState => {
    state = nextState;
    return state;
  };

  return {
    getState: () => state,
    reset: () => publish(createIdleMapMotionPressureState()),
    updateViewportState: ({ motionTokenIdentity, phase, nowMs }) => {
      const materialChange = state.motionTokenIdentity !== motionTokenIdentity;
      return publish({
        ...state,
        motionTokenIdentity,
        phase,
        lastMaterialViewportUpdateAtMs: materialChange
          ? nowMs
          : state.lastMaterialViewportUpdateAtMs,
      });
    },
    updatePresentationTransaction: (activePresentationTransaction) =>
      publish({
        ...state,
        activePresentationTransaction,
      }),
    updateInteractionState: ({ isSearchInteracting, isAnySheetDragging }) =>
      publish({
        ...state,
        isSearchInteracting,
        isAnySheetDragging,
      }),
    applySourcePublishLifecycleEvent: (event) => {
      switch (event.kind) {
        case 'started':
          return publish({
            ...state,
            nativeSyncInFlight: true,
          });
        case 'settled':
          return publish({
            ...state,
            nativeSyncInFlight: false,
          });
        case 'synced':
          return publish({
            ...state,
            nativeSyncInFlight: false,
            lastNormalWorkAdmittedAtMs: event.nowMs,
            coalescedNormalWorkCount: 0,
          });
      }
    },
    applyNormalWorkEffect: (effect, nowMs) => {
      if (effect === 'admit') {
        return publish({
          ...state,
          coalescedNormalWorkCount: 0,
          lastNormalWorkAdmittedAtMs: nowMs,
        });
      }
      if (effect === 'coalesce') {
        return publish({
          ...state,
          coalescedNormalWorkCount: state.coalescedNormalWorkCount + 1,
        });
      }
      return null;
    },
  };
};

const hasActiveProtectedPresentationTransaction = (state: MotionPressureState): boolean => {
  const activeTransaction = state.activePresentationTransaction;
  return (
    activeTransaction != null &&
    (activeTransaction.phase === 'committing' || activeTransaction.phase === 'executing')
  );
};

type MapPlannerAdmissionResult = {
  decision: MapPlannerAdmissionDecision;
  normalWorkEffect: MapPlannerNormalWorkEffect;
};

const MAP_PLANNER_NORMAL_WORK_FAIRNESS_POLICY = {
  maxCoalescedCount: 8,
  maxWaitMs: 240,
} as const;

const shouldAdmitMapPlannerFairnessWork = ({
  state,
  nowMs,
}: {
  state: MotionPressureState;
  nowMs: number;
}): boolean =>
  state.coalescedNormalWorkCount >= MAP_PLANNER_NORMAL_WORK_FAIRNESS_POLICY.maxCoalescedCount ||
  (state.lastNormalWorkAdmittedAtMs > 0 &&
    nowMs - state.lastNormalWorkAdmittedAtMs >= MAP_PLANNER_NORMAL_WORK_FAIRNESS_POLICY.maxWaitMs);

export const resolveMapPlannerAdmission = ({
  hasMaterialChange,
  pressureState,
  nowMs,
  workClass,
}: {
  hasMaterialChange: boolean;
  pressureState: MotionPressureState;
  nowMs: number;
  workClass: MapPlannerWorkClass;
}): MapPlannerAdmissionResult => {
  if (!hasMaterialChange) {
    return {
      decision: 'skip_noop',
      normalWorkEffect: 'none',
    };
  }

  if (
    workClass === 'visible_candidates' &&
    (hasActiveProtectedPresentationTransaction(pressureState) ||
      (pressureState.nativeSyncInFlight && pressureState.phase !== 'settled'))
  ) {
    if (
      shouldAdmitMapPlannerFairnessWork({
        state: pressureState,
        nowMs,
      })
    ) {
      return {
        decision: 'run_now',
        normalWorkEffect: 'admit',
      };
    }
    return {
      decision: 'defer_for_pressure',
      normalWorkEffect: 'coalesce',
    };
  }

  if (workClass === 'lod_pins' && hasActiveProtectedPresentationTransaction(pressureState)) {
    return {
      decision: 'defer_for_pressure',
      normalWorkEffect: 'coalesce',
    };
  }

  return {
    decision: 'run_now',
    normalWorkEffect: 'none',
  };
};

export const shouldDeferMapMovementWork = ({
  pressureState,
}: {
  pressureState: MotionPressureState;
}): boolean =>
  pressureState.isSearchInteracting ||
  pressureState.isAnySheetDragging ||
  hasActiveProtectedPresentationTransaction(pressureState);
