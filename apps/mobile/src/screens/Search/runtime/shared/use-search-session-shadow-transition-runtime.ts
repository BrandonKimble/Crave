import React from 'react';

type SearchSessionShadowTransition = {
  mode: 'natural' | 'entity' | 'shortcut' | 'favorites';
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

type SearchSurfaceRedrawCoordinatorLike = {
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
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinatorLike>;
};

export const useSearchSessionShadowTransitionRuntime = ({
  searchSurfaceRedrawCoordinatorRef,
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
          searchSurfaceRedrawCoordinatorRef.current.reset(transition.operationId);
          return;
        }
        searchSurfaceRedrawCoordinatorRef.current.beginOperation(
          transition.operationId,
          transition.seq,
          targetPage
        );
        return;
      }
      let snapshot = searchSurfaceRedrawCoordinatorRef.current.getSnapshot();
      if (snapshot.operationId !== transition.operationId) {
        if (transition.eventType !== 'phase_a_committed' || isAppend || targetPage > 1) {
          return;
        }
        searchSurfaceRedrawCoordinatorRef.current.beginOperation(
          transition.operationId,
          transition.seq,
          targetPage
        );
        snapshot = searchSurfaceRedrawCoordinatorRef.current.getSnapshot();
        if (snapshot.operationId !== transition.operationId) {
          return;
        }
      }
      if (transition.eventType === 'phase_a_committed') {
        searchSurfaceRedrawCoordinatorRef.current.advancePhase('redraw_committed', {
          operationId: transition.operationId,
          targetPage,
          append: isAppend,
        });
        return;
      }
      if (transition.eventType === 'visual_released') {
        searchSurfaceRedrawCoordinatorRef.current.advancePhase('markers_ready', {
          operationId: transition.operationId,
          targetPage,
          append: isAppend,
        });
        return;
      }
      if (transition.eventType === 'phase_b_materializing') {
        searchSurfaceRedrawCoordinatorRef.current.advancePhase('hydration_ready', {
          operationId: transition.operationId,
          targetPage,
          append: isAppend,
        });
        return;
      }
      if (transition.eventType === 'settled') {
        const advanceToResumeAndReset = () => {
          const activeSnapshot = searchSurfaceRedrawCoordinatorRef.current.getSnapshot();
          if (activeSnapshot.operationId !== transition.operationId) {
            return;
          }
          searchSurfaceRedrawCoordinatorRef.current.advancePhase('chrome_ready', {
            operationId: transition.operationId,
          });
          const finalizeReset = () => {
            const latestSnapshot = searchSurfaceRedrawCoordinatorRef.current.getSnapshot();
            if (
              latestSnapshot.operationId === transition.operationId &&
              latestSnapshot.phase === 'chrome_ready'
            ) {
              searchSurfaceRedrawCoordinatorRef.current.reset(transition.operationId);
            }
          };
          runAfterUiFrame(finalizeReset);
        };
        runAfterUiFrame(advanceToResumeAndReset);
        return;
      }
      if (transition.eventType === 'error' || transition.eventType === 'cancelled') {
        searchSurfaceRedrawCoordinatorRef.current.reset(transition.operationId);
      }
    },
    [searchSurfaceRedrawCoordinatorRef]
  );
