import React from 'react';

import type { UseSearchRequestsResult } from '../../../hooks/useSearchRequests';
import type { SearchSessionController } from '../runtime/controller/search-session-controller';
import type {
  SearchSessionEventPayload,
  SearchSessionEventType,
} from '../runtime/controller/search-session-events';
import {
  createEntityShadowEvent,
  getEntityShadowOperationId,
} from '../runtime/adapters/entity-adapter';
import {
  createNaturalShadowEvent,
  getNaturalShadowOperationId,
} from '../runtime/adapters/natural-adapter';
import {
  createShortcutShadowEvent,
  getShortcutShadowOperationId,
} from '../runtime/adapters/shortcut-adapter';
import type {
  SearchRuntimeBus,
  SearchRuntimeBusState,
  SearchRuntimeOperationLane,
} from '../runtime/shared/search-runtime-bus';

type RuntimeMechanismEmitter = (
  event: 'runtime_write_span',
  payload?: Record<string, unknown>
) => void;

type SearchRequestRuntimeMode = 'natural' | 'entity' | 'shortcut';

type SearchSessionShadowTransition = {
  mode: SearchRequestRuntimeMode;
  operationId: string;
  seq: number;
  eventType: SearchSessionEventType;
  accepted: boolean;
  reason: string;
  phase: string;
  payload: SearchSessionEventPayload;
};

type SearchRequestOperationTuple = {
  mode: SearchRequestRuntimeMode;
  sessionId: string;
  operationId: string;
  requestId: number;
  seq: number;
};

type SearchRequestRuntimeShadow = {
  runtimeTuple: SearchRequestOperationTuple;
  emitShadowTransition: (
    eventType: SearchSessionEventType,
    payload?: SearchSessionEventPayload
  ) => boolean;
};

type FinalizeWithoutResponseLifecycleOptions = {
  tuple: SearchRequestOperationTuple;
  reason: string;
  append?: boolean;
  targetPage?: number;
  shouldAbortPresentationIntent?: boolean;
  abortPresentationIntent?: () => void;
};

type FinalizeSearchRequestAttemptOptions = {
  tuple: SearchRequestOperationTuple;
  didStartResponseLifecycle: boolean;
  append?: boolean;
  targetPage?: number;
  loadingMoreToken?: number | null;
  finalizeReason: string;
  shouldAbortPresentationIntent?: boolean;
  abortPresentationIntent?: () => void;
};

type FailSearchRequestLifecycleOptions = {
  tuple: SearchRequestOperationTuple;
  mode: SearchRequestRuntimeMode;
  error: unknown;
  append?: boolean;
  targetPage?: number;
  idleStatePatch?: Partial<
    Pick<SearchRuntimeBusState, 'activeOperationId' | 'isMapActivationDeferred'>
  >;
  uiErrorMessage: string | null;
  setError: (message: string | null) => void;
};

type ManagedRequestFailureResolution = {
  idleStatePatch?: Partial<
    Pick<SearchRuntimeBusState, 'activeOperationId' | 'isMapActivationDeferred'>
  >;
  uiErrorMessage: string | null;
};

type RunManagedRequestAttemptOptions = {
  mode: SearchRequestRuntimeMode;
  submitPayload: SearchSessionEventPayload;
  append?: boolean;
  targetPage?: number;
  finalizeReason: string;
  shouldAbortPresentationIntent?: boolean;
  abortPresentationIntent?: () => void;
  executeAttempt: (attempt: {
    requestId: number;
    tuple: SearchRequestOperationTuple;
    loadingMoreToken: number | null;
  }) => Promise<boolean>;
  resolveFailure: (error: unknown) => ManagedRequestFailureResolution;
  setError: (message: string | null) => void;
  onError?: (error: unknown) => void;
};

type UseSearchRequestRuntimeOwnerArgs = {
  cancelSearch: UseSearchRequestsResult['cancelSearch'];
  onSearchRequestLoadingChange?: (isLoading: boolean) => void;
  searchRuntimeBus: SearchRuntimeBus;
  runtimeSessionController: SearchSessionController;
  onRuntimeMechanismEvent?: RuntimeMechanismEmitter;
  onSearchSessionShadowTransition?: (transition: SearchSessionShadowTransition) => void;
};

export type SearchRequestRuntimeOwner = {
  activeSearchRequestRef: React.MutableRefObject<number>;
  activeLoadingMoreTokenRef: React.MutableRefObject<number | null>;
  isSearchRequestInFlightRef: React.MutableRefObject<boolean>;
  activeOperationTupleRef: React.MutableRefObject<SearchRequestOperationTuple | null>;
  responseApplyTokenRef: React.MutableRefObject<number>;
  isMountedRef: React.MutableRefObject<boolean>;
  clearActiveOperationTuple: (tuple: SearchRequestOperationTuple) => void;
  emitShadowTransitionForTuple: (
    tuple: SearchRequestOperationTuple,
    eventType: SearchSessionEventType,
    payload?: SearchSessionEventPayload
  ) => boolean;
  isRequestStillActive: (requestId: number) => boolean;
  isOperationTupleStillActive: (tuple: SearchRequestOperationTuple) => boolean;
  publishRuntimeLaneState: (
    tuple: SearchRequestOperationTuple | null,
    lane: SearchRuntimeOperationLane,
    patch?: Partial<SearchRuntimeBusState>
  ) => void;
  startSearchRequestAttempt: (params: {
    mode: SearchRequestRuntimeMode;
    submitPayload: SearchSessionEventPayload;
  }) => { requestId: number; tuple: SearchRequestOperationTuple } | null;
  createHandleSearchResponseRuntimeShadow: (
    runtimeTuple: SearchRequestOperationTuple
  ) => SearchRequestRuntimeShadow;
  beginLoadingMore: () => number;
  endLoadingMore: (token: number) => void;
  cancelActiveSearchRequest: () => void;
  setSearchRequestInFlight: (isInFlight: boolean) => void;
  finalizeWithoutResponseLifecycle: (options: FinalizeWithoutResponseLifecycleOptions) => void;
  failSearchRequestLifecycle: (options: FailSearchRequestLifecycleOptions) => void;
  finalizeSearchRequestAttempt: (options: FinalizeSearchRequestAttemptOptions) => void;
  runManagedRequestAttempt: (options: RunManagedRequestAttemptOptions) => Promise<void>;
};

const getPerfNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

export const useSearchRequestRuntimeOwner = ({
  cancelSearch,
  onSearchRequestLoadingChange,
  searchRuntimeBus,
  runtimeSessionController,
  onRuntimeMechanismEvent,
  onSearchSessionShadowTransition,
}: UseSearchRequestRuntimeOwnerArgs): SearchRequestRuntimeOwner => {
  const searchRequestSeqRef = React.useRef(0);
  const activeSearchRequestRef = React.useRef(0);
  const loadingMoreTokenSeqRef = React.useRef(0);
  const activeLoadingMoreTokenRef = React.useRef<number | null>(null);
  const isSearchRequestInFlightRef = React.useRef(false);
  const responseApplyTokenRef = React.useRef(0);
  const isMountedRef = React.useRef(true);
  const runtimeShadowSessionIdRef = React.useRef(
    `search-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
  const activeOperationTupleRef = React.useRef<SearchRequestOperationTuple | null>(null);

  const resolveShadowOperationId = React.useCallback(
    (mode: SearchRequestRuntimeMode, requestId: number): string => {
      if (mode === 'natural') {
        return getNaturalShadowOperationId(requestId);
      }
      if (mode === 'entity') {
        return getEntityShadowOperationId(requestId);
      }
      return getShortcutShadowOperationId(requestId);
    },
    []
  );

  const createActiveOperationTuple = React.useCallback(
    (mode: SearchRequestRuntimeMode, requestId: number): SearchRequestOperationTuple => ({
      mode,
      sessionId: runtimeShadowSessionIdRef.current,
      operationId: resolveShadowOperationId(mode, requestId),
      requestId,
      seq: 0,
    }),
    [resolveShadowOperationId]
  );

  const clearActiveOperationTuple = React.useCallback((tuple: SearchRequestOperationTuple) => {
    const activeTuple = activeOperationTupleRef.current;
    if (!activeTuple || activeTuple.operationId !== tuple.operationId) {
      return;
    }
    activeOperationTupleRef.current = null;
  }, []);

  const emitShadowTransitionForTuple = React.useCallback(
    (
      tuple: SearchRequestOperationTuple,
      eventType: SearchSessionEventType,
      payload: SearchSessionEventPayload = {}
    ): boolean => {
      const activeTuple = activeOperationTupleRef.current;
      if (!activeTuple || activeTuple.operationId !== tuple.operationId) {
        return false;
      }
      tuple.seq += 1;
      const nextSeq = tuple.seq;
      const atMs = getPerfNow();
      const event =
        tuple.mode === 'natural'
          ? createNaturalShadowEvent({
              sessionId: tuple.sessionId,
              requestId: tuple.requestId,
              seq: nextSeq,
              atMs,
              type: eventType,
              payload,
            })
          : tuple.mode === 'entity'
          ? createEntityShadowEvent({
              sessionId: tuple.sessionId,
              requestId: tuple.requestId,
              seq: nextSeq,
              atMs,
              type: eventType,
              payload,
            })
          : createShortcutShadowEvent({
              sessionId: tuple.sessionId,
              requestId: tuple.requestId,
              seq: nextSeq,
              atMs,
              type: eventType,
              payload,
            });
      const result = runtimeSessionController.dispatch(event);
      onRuntimeMechanismEvent?.('runtime_write_span', {
        domain: 'search_session_shadow',
        label: 'shadow_transition',
        mode: tuple.mode,
        operationId: tuple.operationId,
        eventType,
        seq: nextSeq,
        accepted: result.accepted,
        reason: result.reason,
        phase: result.state.phase,
      });
      onSearchSessionShadowTransition?.({
        mode: tuple.mode,
        operationId: tuple.operationId,
        seq: nextSeq,
        eventType,
        accepted: result.accepted,
        reason: result.reason,
        phase: result.state.phase,
        payload,
      });
      return result.accepted;
    },
    [onRuntimeMechanismEvent, onSearchSessionShadowTransition, runtimeSessionController]
  );

  const isRequestStillActive = React.useCallback(
    (requestId: number) => isMountedRef.current && activeSearchRequestRef.current === requestId,
    []
  );

  const isOperationTupleStillActive = React.useCallback(
    (tuple: SearchRequestOperationTuple) => {
      if (!isRequestStillActive(tuple.requestId)) {
        return false;
      }
      const activeTuple = activeOperationTupleRef.current;
      return activeTuple?.operationId === tuple.operationId;
    },
    [isRequestStillActive]
  );

  const publishRuntimeLaneState = React.useCallback(
    (
      tuple: SearchRequestOperationTuple | null,
      lane: SearchRuntimeOperationLane,
      patch?: Partial<SearchRuntimeBusState>
    ) => {
      const laneResetPatch: Partial<SearchRuntimeBusState> =
        lane === 'idle'
          ? {
              pendingTabSwitchTab: null,
            }
          : {};
      searchRuntimeBus.publish({
        activeOperationId: tuple?.operationId ?? null,
        activeOperationLane: lane,
        ...laneResetPatch,
        ...(patch ?? {}),
      });
    },
    [searchRuntimeBus]
  );

  const activateRuntimeShadowOperation = React.useCallback(
    (tuple: SearchRequestOperationTuple, submitPayload: SearchSessionEventPayload): boolean => {
      activeOperationTupleRef.current = tuple;
      if (!emitShadowTransitionForTuple(tuple, 'submit_intent', submitPayload)) {
        return false;
      }
      const submittingAccepted = emitShadowTransitionForTuple(tuple, 'submitting', {
        mode: tuple.mode,
      });
      if (submittingAccepted) {
        publishRuntimeLaneState(tuple, 'lane_a_ack');
      }
      return submittingAccepted;
    },
    [emitShadowTransitionForTuple, publishRuntimeLaneState]
  );

  const startSearchRequestAttempt = React.useCallback(
    ({
      mode,
      submitPayload,
    }: {
      mode: SearchRequestRuntimeMode;
      submitPayload: SearchSessionEventPayload;
    }) => {
      const requestId = ++searchRequestSeqRef.current;
      activeSearchRequestRef.current = requestId;
      const tuple = createActiveOperationTuple(mode, requestId);
      const shadowActivated = activateRuntimeShadowOperation(tuple, submitPayload);
      if (!shadowActivated) {
        clearActiveOperationTuple(tuple);
        return null;
      }
      return {
        requestId,
        tuple,
      };
    },
    [activateRuntimeShadowOperation, clearActiveOperationTuple, createActiveOperationTuple]
  );

  const createHandleSearchResponseRuntimeShadow = React.useCallback(
    (runtimeTuple: SearchRequestOperationTuple): SearchRequestRuntimeShadow => ({
      runtimeTuple,
      emitShadowTransition: (eventType, payload) =>
        emitShadowTransitionForTuple(runtimeTuple, eventType, payload ?? {}),
    }),
    [emitShadowTransitionForTuple]
  );

  const beginLoadingMore = React.useCallback(() => {
    const token = ++loadingMoreTokenSeqRef.current;
    activeLoadingMoreTokenRef.current = token;
    searchRuntimeBus.publish({ isLoadingMore: true });
    return token;
  }, [searchRuntimeBus]);

  const endLoadingMore = React.useCallback(
    (token: number) => {
      if (activeLoadingMoreTokenRef.current !== token) {
        return;
      }
      activeLoadingMoreTokenRef.current = null;
      searchRuntimeBus.publish({ isLoadingMore: false });
    },
    [searchRuntimeBus]
  );

  const cancelActiveSearchRequest = React.useCallback(() => {
    cancelSearch();
    const activeTuple = activeOperationTupleRef.current;
    if (activeTuple) {
      emitShadowTransitionForTuple(activeTuple, 'cancelled', {
        reason: 'cancel_active_search_request',
      });
      clearActiveOperationTuple(activeTuple);
    }
    activeSearchRequestRef.current = ++searchRequestSeqRef.current;
    responseApplyTokenRef.current += 1;
    isSearchRequestInFlightRef.current = false;
    onSearchRequestLoadingChange?.(false);
    searchRuntimeBus.batch(() => {
      publishRuntimeLaneState(activeTuple, 'idle', {
        isSearchLoading: false,
        isMapActivationDeferred: false,
        activeOperationId: null,
      });
      searchRuntimeBus.publish({ isLoadingMore: false });
    });
    activeLoadingMoreTokenRef.current = null;
  }, [
    cancelSearch,
    clearActiveOperationTuple,
    emitShadowTransitionForTuple,
    onSearchRequestLoadingChange,
    publishRuntimeLaneState,
    searchRuntimeBus,
  ]);

  const setSearchRequestInFlight = React.useCallback(
    (isInFlight: boolean) => {
      if (isSearchRequestInFlightRef.current === isInFlight) {
        return;
      }
      isSearchRequestInFlightRef.current = isInFlight;
      onSearchRequestLoadingChange?.(isInFlight);
      searchRuntimeBus.publish({
        isSearchLoading: isInFlight,
      });
    },
    [onSearchRequestLoadingChange, searchRuntimeBus]
  );

  const finalizeWithoutResponseLifecycle = React.useCallback(
    ({
      tuple,
      reason,
      append,
      targetPage,
      shouldAbortPresentationIntent = false,
      abortPresentationIntent,
    }: FinalizeWithoutResponseLifecycleOptions) => {
      const activeTuple = activeOperationTupleRef.current;
      if (!activeTuple || activeTuple.operationId !== tuple.operationId) {
        return;
      }
      if (shouldAbortPresentationIntent) {
        abortPresentationIntent?.();
        publishRuntimeLaneState(tuple, 'idle', {
          isMapActivationDeferred: false,
          activeOperationId: null,
        });
      }
      emitShadowTransitionForTuple(tuple, 'cancelled', {
        mode: tuple.mode,
        append,
        targetPage,
        reason,
      });
      publishRuntimeLaneState(tuple, 'idle', {
        activeOperationId: null,
      });
      clearActiveOperationTuple(tuple);
    },
    [clearActiveOperationTuple, emitShadowTransitionForTuple, publishRuntimeLaneState]
  );

  const failSearchRequestLifecycle = React.useCallback(
    ({
      tuple,
      mode,
      error,
      append,
      targetPage,
      idleStatePatch,
      uiErrorMessage,
      setError,
    }: FailSearchRequestLifecycleOptions) => {
      emitShadowTransitionForTuple(tuple, 'error', {
        mode,
        append,
        targetPage,
        message: error instanceof Error ? error.message : 'unknown error',
      });
      publishRuntimeLaneState(tuple, 'idle', {
        activeOperationId: null,
        ...idleStatePatch,
      });
      clearActiveOperationTuple(tuple);
      setError(uiErrorMessage);
    },
    [clearActiveOperationTuple, emitShadowTransitionForTuple, publishRuntimeLaneState]
  );

  const finalizeSearchRequestAttempt = React.useCallback(
    ({
      tuple,
      didStartResponseLifecycle,
      append = false,
      targetPage,
      loadingMoreToken = null,
      finalizeReason,
      shouldAbortPresentationIntent = false,
      abortPresentationIntent,
    }: FinalizeSearchRequestAttemptOptions) => {
      if (append) {
        if (loadingMoreToken != null) {
          endLoadingMore(loadingMoreToken);
        }
      } else if (isOperationTupleStillActive(tuple)) {
        setSearchRequestInFlight(false);
      }

      if (isOperationTupleStillActive(tuple) && !didStartResponseLifecycle) {
        finalizeWithoutResponseLifecycle({
          tuple,
          reason: finalizeReason,
          append,
          targetPage,
          shouldAbortPresentationIntent,
          abortPresentationIntent,
        });
      }
    },
    [
      endLoadingMore,
      finalizeWithoutResponseLifecycle,
      isOperationTupleStillActive,
      setSearchRequestInFlight,
    ]
  );

  const runManagedRequestAttempt = React.useCallback(
    async ({
      mode,
      submitPayload,
      append = false,
      targetPage,
      finalizeReason,
      shouldAbortPresentationIntent = false,
      abortPresentationIntent,
      executeAttempt,
      resolveFailure,
      setError,
      onError,
    }: RunManagedRequestAttemptOptions) => {
      const loadingMoreToken = append ? beginLoadingMore() : null;
      const requestAttempt = startSearchRequestAttempt({
        mode,
        submitPayload,
      });
      if (!requestAttempt) {
        if (loadingMoreToken != null) {
          endLoadingMore(loadingMoreToken);
        }
        return;
      }
      const { tuple } = requestAttempt;
      let didStartResponseLifecycle = false;
      try {
        didStartResponseLifecycle = await executeAttempt({
          ...requestAttempt,
          loadingMoreToken,
        });
      } catch (error) {
        onError?.(error);
        if (isOperationTupleStillActive(tuple)) {
          const failure = resolveFailure(error);
          failSearchRequestLifecycle({
            tuple,
            mode,
            error,
            append,
            targetPage,
            idleStatePatch: failure.idleStatePatch,
            uiErrorMessage: failure.uiErrorMessage,
            setError,
          });
        }
      } finally {
        finalizeSearchRequestAttempt({
          tuple,
          didStartResponseLifecycle,
          append,
          targetPage,
          loadingMoreToken,
          finalizeReason,
          shouldAbortPresentationIntent,
          abortPresentationIntent,
        });
      }
    },
    [
      beginLoadingMore,
      endLoadingMore,
      failSearchRequestLifecycle,
      finalizeSearchRequestAttempt,
      isOperationTupleStillActive,
      startSearchRequestAttempt,
    ]
  );

  React.useEffect(
    () => () => {
      isMountedRef.current = false;
      responseApplyTokenRef.current += 1;
      const activeTuple = activeOperationTupleRef.current;
      if (activeTuple) {
        emitShadowTransitionForTuple(activeTuple, 'cancelled', {
          reason: 'hook_unmount',
        });
        clearActiveOperationTuple(activeTuple);
      }
      isSearchRequestInFlightRef.current = false;
      onSearchRequestLoadingChange?.(false);
      publishRuntimeLaneState(null, 'idle', {
        isSearchLoading: false,
        isMapActivationDeferred: false,
        activeOperationId: null,
      });
    },
    [
      clearActiveOperationTuple,
      emitShadowTransitionForTuple,
      onSearchRequestLoadingChange,
      publishRuntimeLaneState,
    ]
  );

  return React.useMemo(
    () => ({
      activeSearchRequestRef,
      activeLoadingMoreTokenRef,
      isSearchRequestInFlightRef,
      activeOperationTupleRef,
      responseApplyTokenRef,
      isMountedRef,
      clearActiveOperationTuple,
      emitShadowTransitionForTuple,
      isRequestStillActive,
      isOperationTupleStillActive,
      publishRuntimeLaneState,
      startSearchRequestAttempt,
      createHandleSearchResponseRuntimeShadow,
      beginLoadingMore,
      endLoadingMore,
      cancelActiveSearchRequest,
      finalizeWithoutResponseLifecycle,
      failSearchRequestLifecycle,
      finalizeSearchRequestAttempt,
      runManagedRequestAttempt,
      setSearchRequestInFlight,
    }),
    [
      beginLoadingMore,
      cancelActiveSearchRequest,
      clearActiveOperationTuple,
      createHandleSearchResponseRuntimeShadow,
      emitShadowTransitionForTuple,
      endLoadingMore,
      failSearchRequestLifecycle,
      finalizeSearchRequestAttempt,
      finalizeWithoutResponseLifecycle,
      isOperationTupleStillActive,
      isRequestStillActive,
      publishRuntimeLaneState,
      runManagedRequestAttempt,
      setSearchRequestInFlight,
      startSearchRequestAttempt,
    ]
  );
};
