import React from 'react';
import { useSyncExternalStore } from 'react';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import type {
  ResultsPresentationReadModel,
  ResultsPresentationTransportState,
} from './results-presentation-runtime-contract';
import {
  areResultsPresentationReadModelsEqual,
  IDLE_RESULTS_PRESENTATION_TRANSPORT_STATE,
} from './results-presentation-runtime-contract';
import {
  resolveResultsPresentationRuntimeState,
  type ResultsPresentationRuntimeState,
} from './results-presentation-runtime-machine-state';
import type { ResultsPresentationFreezePolicyFacts } from './results-presentation-policy-facts-resolver';

export type ResultsPresentationAuthoritySnapshot = ResultsPresentationRuntimeState;

export type ResultsPresentationAuthorityKey = keyof ResultsPresentationAuthoritySnapshot;

export type ResultsPresentationAuthorityListener = () => void;

export type ResultsPresentationVisualTarget = {
  updateResultsPresentationTransport: (state: ResultsPresentationTransportState) => void;
};

export type ResultsPresentationAuthorityPolicyFactsSnapshot =
  ResultsPresentationFreezePolicyFacts & {
    renderPolicy: ResultsPresentationReadModel;
  };

type ResultsPresentationAuthorityListenerRecord = {
  observedKeys: ReadonlySet<ResultsPresentationAuthorityKey> | null;
  debugLabel: string | null;
};

const INITIAL_RESULTS_PRESENTATION_AUTHORITY_SNAPSHOT: ResultsPresentationAuthoritySnapshot =
  resolveResultsPresentationRuntimeState(IDLE_RESULTS_PRESENTATION_TRANSPORT_STATE);

const nowMs = (): number => globalThis.performance?.now?.() ?? Date.now();

const shouldAbsorbExitStartedRuntimeFanout = (
  currentSnapshot: ResultsPresentationAuthoritySnapshot,
  nextSnapshot: ResultsPresentationAuthoritySnapshot
): boolean => {
  const currentTransport = currentSnapshot.resultsPresentationTransport;
  const nextTransport = nextSnapshot.resultsPresentationTransport;
  return (
    currentTransport.snapshotKind === 'results_exit' &&
    nextTransport.snapshotKind === 'results_exit' &&
    currentTransport.transactionId != null &&
    currentTransport.transactionId === nextTransport.transactionId &&
    currentTransport.executionStage === 'exit_requested' &&
    nextTransport.executionStage === 'exit_executing' &&
    currentTransport.coverState === nextTransport.coverState &&
    areResultsPresentationReadModelsEqual(
      currentSnapshot.resultsPresentation,
      nextSnapshot.resultsPresentation
    )
  );
};

export class ResultsPresentationAuthority {
  private snapshot = INITIAL_RESULTS_PRESENTATION_AUTHORITY_SNAPSHOT;

  private version = 0;

  private readonly listeners = new Map<
    ResultsPresentationAuthorityListener,
    ResultsPresentationAuthorityListenerRecord
  >();

  private readonly visualTargets = new Set<ResultsPresentationVisualTarget>();

  private lastEnterRevealStartedKey: string | null = null;

  private lastEnterRevealSettledKey: string | null = null;

  public getSnapshot(): ResultsPresentationAuthoritySnapshot {
    return this.snapshot;
  }

  public getVersion(): number {
    return this.version;
  }

  public readPolicyFactsSnapshot(
    freezePolicyFacts: ResultsPresentationFreezePolicyFacts
  ): ResultsPresentationAuthorityPolicyFactsSnapshot {
    return {
      ...freezePolicyFacts,
      renderPolicy: this.snapshot.resultsPresentation,
    };
  }

  public subscribe(
    listener: ResultsPresentationAuthorityListener,
    observedKeys?: readonly ResultsPresentationAuthorityKey[],
    debugLabel?: string
  ): () => void {
    const scopedKeys =
      observedKeys != null && observedKeys.length > 0 ? new Set(observedKeys) : null;
    this.listeners.set(listener, {
      observedKeys: scopedKeys,
      debugLabel: debugLabel ?? null,
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  public addVisualTarget(target: ResultsPresentationVisualTarget): () => void {
    this.visualTargets.add(target);
    target.updateResultsPresentationTransport(this.snapshot.resultsPresentationTransport);
    return () => {
      this.visualTargets.delete(target);
    };
  }

  public publishRuntimeState(nextSnapshot: ResultsPresentationRuntimeState): void {
    this.publishRevealTelemetry(this.snapshot, nextSnapshot);
    this.syncVisualTargets(nextSnapshot.resultsPresentationTransport);

    if (shouldAbsorbExitStartedRuntimeFanout(this.snapshot, nextSnapshot)) {
      this.snapshot = nextSnapshot;
      this.version += 1;
      return;
    }

    if (
      nextSnapshot.resultsPresentationTransport.executionStage === 'enter_mounted_hidden' &&
      this.snapshot.resultsPresentationTransport.transactionId ===
        nextSnapshot.resultsPresentationTransport.transactionId &&
      this.snapshot.resultsPresentationTransport.snapshotKind ===
        nextSnapshot.resultsPresentationTransport.snapshotKind
    ) {
      return;
    }

    const changedKeys = new Set<ResultsPresentationAuthorityKey>();
    if (this.snapshot.resultsPresentation !== nextSnapshot.resultsPresentation) {
      changedKeys.add('resultsPresentation');
    }
    if (this.snapshot.resultsPresentationTransport !== nextSnapshot.resultsPresentationTransport) {
      changedKeys.add('resultsPresentationTransport');
    }
    if (changedKeys.size === 0) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.version += 1;
    this.notify(changedKeys);
  }

  public reset(): void {
    this.snapshot = INITIAL_RESULTS_PRESENTATION_AUTHORITY_SNAPSHOT;
    this.lastEnterRevealStartedKey = null;
    this.lastEnterRevealSettledKey = null;
    this.version += 1;
    this.syncVisualTargets(this.snapshot.resultsPresentationTransport);
    this.notify(new Set(['resultsPresentation', 'resultsPresentationTransport']));
  }

  private publishRevealTelemetry(
    currentSnapshot: ResultsPresentationAuthoritySnapshot,
    nextSnapshot: ResultsPresentationAuthoritySnapshot
  ): void {
    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (!isPerfScenarioAttributionActive(scenarioConfig)) {
      return;
    }

    const currentTransport = currentSnapshot.resultsPresentationTransport;
    const nextTransport = nextSnapshot.resultsPresentationTransport;
    const transactionId = nextTransport.transactionId ?? currentTransport.transactionId;
    const executionBatch = nextTransport.executionBatch ?? currentTransport.executionBatch;
    if (
      transactionId != null &&
      nextTransport.snapshotKind !== 'results_exit' &&
      nextTransport.executionStage === 'enter_executing' &&
      nextTransport.coverState === 'hidden' &&
      nextTransport.startToken != null
    ) {
      const revealKey = [
        transactionId,
        executionBatch?.generationId ?? 'frame:none',
        executionBatch?.batchId ?? 'batch:none',
        nextTransport.startToken,
      ].join('|');
      if (this.lastEnterRevealStartedKey !== revealKey) {
        this.lastEnterRevealStartedKey = revealKey;
        const payload = {
          transactionId,
          requestKey: transactionId,
          frameGenerationId: executionBatch?.generationId ?? null,
          executionBatchId: executionBatch?.batchId ?? null,
          startedAtMs: nextTransport.startToken,
        };
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'cards_pins_cover_reveal_started',
          ...payload,
        });
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'result_cards_reveal_started',
          ...payload,
        });
      }
    }

    if (
      transactionId != null &&
      nextTransport.snapshotKind !== 'results_exit' &&
      nextTransport.executionStage === 'settled' &&
      currentTransport.executionStage !== 'settled'
    ) {
      const settledKey = [
        transactionId,
        executionBatch?.generationId ?? 'frame:none',
        executionBatch?.batchId ?? 'batch:none',
      ].join('|');
      if (this.lastEnterRevealSettledKey !== settledKey) {
        this.lastEnterRevealSettledKey = settledKey;
        logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
          event: 'result_cards_reveal_settled',
          transactionId,
          requestKey: transactionId,
          frameGenerationId: executionBatch?.generationId ?? null,
          executionBatchId: executionBatch?.batchId ?? null,
          settledAtMs: nowMs(),
        });
      }
    }
  }

  private syncVisualTargets(resultsPresentationTransport: ResultsPresentationTransportState): void {
    this.visualTargets.forEach((target) => {
      target.updateResultsPresentationTransport(resultsPresentationTransport);
    });
  }

  private notify(changedKeys: ReadonlySet<ResultsPresentationAuthorityKey>): void {
    this.listeners.forEach((listenerRecord, listener) => {
      const { observedKeys } = listenerRecord;
      if (observedKeys == null) {
        listener();
        return;
      }
      for (const key of observedKeys) {
        if (changedKeys.has(key)) {
          listener();
          return;
        }
      }
    });
  }
}

export const createResultsPresentationAuthority = (): ResultsPresentationAuthority =>
  new ResultsPresentationAuthority();

type EqualityFn<T> = (left: T, right: T) => boolean;

export const useResultsPresentationAuthoritySelector = <T>(
  authority: ResultsPresentationAuthority,
  selector: (snapshot: ResultsPresentationAuthoritySnapshot) => T,
  isEqual: EqualityFn<T> = Object.is,
  observedKeys?: readonly ResultsPresentationAuthorityKey[],
  debugLabel?: string
): T => {
  const observedKeysSignature =
    observedKeys != null && observedKeys.length > 0 ? observedKeys.join('|') : '';
  const scopedObservedKeys = React.useMemo(() => observedKeys, [observedKeysSignature]);
  const cacheRef = React.useRef<{ version: number; selected: T }>({
    version: -1,
    selected: selector(authority.getSnapshot()),
  });
  const subscribe = React.useCallback(
    (listener: () => void) => authority.subscribe(listener, scopedObservedKeys, debugLabel),
    [authority, debugLabel, scopedObservedKeys]
  );

  return useSyncExternalStore(
    subscribe,
    () => {
      const version = authority.getVersion();
      if (version !== cacheRef.current.version) {
        const selected = selector(authority.getSnapshot());
        if (!isEqual(cacheRef.current.selected, selected)) {
          cacheRef.current.selected = selected;
        }
        cacheRef.current.version = version;
      }
      return cacheRef.current.selected;
    },
    () => selector(authority.getSnapshot())
  );
};

export const ResultsPresentationAuthorityContext =
  React.createContext<ResultsPresentationAuthority | null>(null);

export const useResultsPresentationAuthority = (): ResultsPresentationAuthority => {
  const authority = React.useContext(ResultsPresentationAuthorityContext);
  if (authority == null) {
    throw new Error(
      'useResultsPresentationAuthority must be used within a ResultsPresentationAuthorityContext.Provider'
    );
  }
  return authority;
};
