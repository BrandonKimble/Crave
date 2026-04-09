import React from 'react';

type SearchSessionShadowTransition = {
  mode: 'natural' | 'entity' | 'shortcut';
  operationId: string;
  seq: number;
  eventType:
    | 'submit_intent'
    | 'submitting'
    | 'response_received'
    | 'phase_a_committed'
    | 'visual_released'
    | 'phase_b_materializing'
    | 'settled'
    | 'cancelled'
    | 'error';
  accepted: boolean;
  payload: Record<string, unknown>;
};

type RunOneHandoffCoordinatorLike = {
  getSnapshot: () => {
    operationId: string | null;
    phase: string;
  };
  reset: (operationId: string) => void;
  beginOperation: (operationId: string, seq: number, targetPage: number) => void;
  advancePhase: (phase: string, payload?: Record<string, unknown>) => void;
};

const runAfterUiFrame = (callback: () => void) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(callback);
    return;
  }
  callback();
};

type UseSearchSessionShadowTransitionRuntimeArgs = {
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinatorLike>;
};

export const useSearchSessionShadowTransitionRuntime = ({
  runOneHandoffCoordinatorRef,
}: UseSearchSessionShadowTransitionRuntimeArgs) =>
  React.useCallback(
    (transition: SearchSessionShadowTransition) => {
      if (!transition.accepted || transition.mode !== 'shortcut') {
        return;
      }
      const payload = transition.payload ?? null;
      const targetPage = typeof payload?.targetPage === 'number' ? payload.targetPage : 1;
      const isAppend = payload?.append === true;
      if (transition.eventType === 'submit_intent') {
        if (isAppend || targetPage > 1) {
          runOneHandoffCoordinatorRef.current.reset(transition.operationId);
          return;
        }
        runOneHandoffCoordinatorRef.current.beginOperation(
          transition.operationId,
          transition.seq,
          targetPage
        );
        return;
      }
      const snapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
      if (snapshot.operationId !== transition.operationId) {
        return;
      }
      if (transition.eventType === 'phase_a_committed') {
        runOneHandoffCoordinatorRef.current.advancePhase('h1_phase_a_committed', {
          operationId: transition.operationId,
          targetPage,
          append: isAppend,
        });
        return;
      }
      if (transition.eventType === 'visual_released') {
        runOneHandoffCoordinatorRef.current.advancePhase('h2_marker_enter', {
          operationId: transition.operationId,
          targetPage,
          append: isAppend,
        });
        return;
      }
      if (transition.eventType === 'phase_b_materializing') {
        runOneHandoffCoordinatorRef.current.advancePhase('h3_hydration_ramp', {
          operationId: transition.operationId,
          targetPage,
          append: isAppend,
        });
        return;
      }
      if (transition.eventType === 'settled') {
        const advanceToResumeAndReset = () => {
          const activeSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
          if (activeSnapshot.operationId !== transition.operationId) {
            return;
          }
          runOneHandoffCoordinatorRef.current.advancePhase('h4_chrome_resume', {
            operationId: transition.operationId,
          });
          const finalizeReset = () => {
            const latestSnapshot = runOneHandoffCoordinatorRef.current.getSnapshot();
            if (
              latestSnapshot.operationId === transition.operationId &&
              latestSnapshot.phase === 'h4_chrome_resume'
            ) {
              runOneHandoffCoordinatorRef.current.reset(transition.operationId);
            }
          };
          runAfterUiFrame(finalizeReset);
        };
        runAfterUiFrame(advanceToResumeAndReset);
        return;
      }
      if (transition.eventType === 'error' || transition.eventType === 'cancelled') {
        runOneHandoffCoordinatorRef.current.reset(transition.operationId);
      }
    },
    [runOneHandoffCoordinatorRef]
  );
