import React, { useSyncExternalStore } from 'react';

import type { ResultsPresentationTransportState } from './results-presentation-runtime-contract';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
  logPerfScenarioStackAttribution,
  SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';

export type ResultsPresentationSurfacePreparedRowsSnapshot = {
  targetReadinessKey: string | null;
  readyReadinessKey: string | null;
  activeRowCount: number;
};

export type ResultsPresentationSurfaceAuthoritySnapshot = {
  resultsRequestKey: string | null;
  resultsHydrationKey: string | null;
  hydratedResultsKey: string | null;
  resultsPreparedRowsKey: string | null;
  listPreparedRowsReady: boolean;
  isResultsHydrationSettled: boolean;
  allowHydrationFinalizeCommit: boolean;
  searchSurfaceResultsTransactionKey: string | null;
  preparedRows: ResultsPresentationSurfacePreparedRowsSnapshot;
};

export type ResultsPresentationSurfaceAuthorityKey =
  keyof ResultsPresentationSurfaceAuthoritySnapshot;

export type ResultsPresentationSurfaceAuthorityListener = () => void;

type ResultsPresentationSurfaceAuthorityListenerRecord = {
  observedKeys: ReadonlySet<ResultsPresentationSurfaceAuthorityKey> | null;
  debugLabel: string | null;
};

type ResultsPresentationSurfaceAuthorityDiagnosticEntry = {
  nowMs: number;
  durationMs: number;
  changedKeys: ResultsPresentationSurfaceAuthorityKey[];
  listenerCount: number;
  notifiedListenerCount: number;
  notifiedListenerLabels?: string[];
  version: number;
  resultsRequestKey: string | null;
  resultsHydrationKey: string | null;
  hydratedResultsKey: string | null;
  searchSurfaceResultsTransactionKey: string | null;
};

export type ResultsPresentationSurfaceAuthorityDiagnosticsSnapshot = {
  version: number;
  listenerCount: number;
  recent: ResultsPresentationSurfaceAuthorityDiagnosticEntry[];
};

type EqualityFn<T> = (left: T, right: T) => boolean;

const EMPTY_PREPARED_ROWS: ResultsPresentationSurfacePreparedRowsSnapshot = {
  targetReadinessKey: null,
  readyReadinessKey: null,
  activeRowCount: 0,
};

const INITIAL_RESULTS_PRESENTATION_SURFACE_AUTHORITY_SNAPSHOT: ResultsPresentationSurfaceAuthoritySnapshot =
  {
    resultsRequestKey: null,
    resultsHydrationKey: null,
    hydratedResultsKey: null,
    resultsPreparedRowsKey: null,
    listPreparedRowsReady: false,
    isResultsHydrationSettled: true,
    allowHydrationFinalizeCommit: true,
    searchSurfaceResultsTransactionKey: null,
    preparedRows: EMPTY_PREPARED_ROWS,
  };

const nowMs = (): number => globalThis.performance?.now?.() ?? Date.now();

const arePreparedRowsSnapshotsEqual = (
  left: ResultsPresentationSurfacePreparedRowsSnapshot,
  right: ResultsPresentationSurfacePreparedRowsSnapshot
): boolean =>
  left.targetReadinessKey === right.targetReadinessKey &&
  left.readyReadinessKey === right.readyReadinessKey &&
  left.activeRowCount === right.activeRowCount;

export const deriveCommittedSearchSurfaceResultsTransactionKeyFromSurface = ({
  surfaceSnapshot,
  resultsPresentationTransport,
}: {
  surfaceSnapshot: Pick<
    ResultsPresentationSurfaceAuthoritySnapshot,
    'resultsHydrationKey' | 'resultsRequestKey'
  >;
  resultsPresentationTransport: ResultsPresentationTransportState;
}): string | null => {
  const resultsSnapshotKey =
    surfaceSnapshot.resultsHydrationKey ?? surfaceSnapshot.resultsRequestKey;
  const { executionStage, snapshotKind, transactionId } = resultsPresentationTransport;
  return executionStage === 'idle' ||
    executionStage === 'settled' ||
    snapshotKind == null ||
    transactionId == null
    ? null
    : resultsSnapshotKey;
};

export const deriveSearchSurfaceResultsTransactionKeyFromSurface = (
  surfaceSnapshot: Pick<
    ResultsPresentationSurfaceAuthoritySnapshot,
    'searchSurfaceResultsTransactionKey' | 'resultsHydrationKey' | 'resultsRequestKey'
  >
): string | null =>
  surfaceSnapshot.searchSurfaceResultsTransactionKey ??
  surfaceSnapshot.resultsHydrationKey ??
  surfaceSnapshot.resultsRequestKey;

export class ResultsPresentationSurfaceAuthority {
  private snapshot = INITIAL_RESULTS_PRESENTATION_SURFACE_AUTHORITY_SNAPSHOT;

  private version = 0;

  private readonly listeners = new Map<
    ResultsPresentationSurfaceAuthorityListener,
    ResultsPresentationSurfaceAuthorityListenerRecord
  >();

  private readonly diagnosticsRing: ResultsPresentationSurfaceAuthorityDiagnosticEntry[] = [];

  public getSnapshot(): ResultsPresentationSurfaceAuthoritySnapshot {
    return this.snapshot;
  }

  public getVersion(): number {
    return this.version;
  }

  public readDiagnostics(): ResultsPresentationSurfaceAuthorityDiagnosticsSnapshot {
    return {
      version: this.version,
      listenerCount: this.listeners.size,
      recent: this.diagnosticsRing.slice(-12),
    };
  }

  public subscribe(
    listener: ResultsPresentationSurfaceAuthorityListener,
    observedKeys?: readonly ResultsPresentationSurfaceAuthorityKey[],
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

  public publish(
    patch: Partial<ResultsPresentationSurfaceAuthoritySnapshot>,
    source = 'publish'
  ): boolean {
    const changedKeys = new Set<ResultsPresentationSurfaceAuthorityKey>();
    const nextSnapshot: ResultsPresentationSurfaceAuthoritySnapshot = {
      ...this.snapshot,
    };
    const nextSnapshotMutable = nextSnapshot as Record<string, unknown>;
    const currentSnapshotLookup = this.snapshot as Record<string, unknown>;
    (Object.keys(patch) as ResultsPresentationSurfaceAuthorityKey[]).forEach((key) => {
      const nextValue = patch[key];
      const didChange =
        key === 'preparedRows'
          ? !arePreparedRowsSnapshotsEqual(
              this.snapshot.preparedRows,
              nextValue as ResultsPresentationSurfacePreparedRowsSnapshot
            )
          : !Object.is(currentSnapshotLookup[key], nextValue);
      if (didChange) {
        nextSnapshotMutable[key] = nextValue;
        changedKeys.add(key);
      }
    });
    if (changedKeys.size === 0) {
      return false;
    }

    this.snapshot = nextSnapshot;
    this.version += 1;
    this.notify(changedKeys, source);
    return true;
  }

  public publishPreparedRows(
    nextSnapshot: ResultsPresentationSurfacePreparedRowsSnapshot,
    source = 'prepared_rows'
  ): boolean {
    return this.publish({ preparedRows: nextSnapshot }, source);
  }

  public reset(): void {
    this.snapshot = INITIAL_RESULTS_PRESENTATION_SURFACE_AUTHORITY_SNAPSHOT;
    this.version += 1;
    this.notify(
      new Set(Object.keys(this.snapshot) as ResultsPresentationSurfaceAuthorityKey[]),
      'reset'
    );
  }

  private notify(
    changedKeys: ReadonlySet<ResultsPresentationSurfaceAuthorityKey>,
    source: string
  ): void {
    const startedAtMs = nowMs();
    let notifiedListenerCount = 0;
    const notifiedListenerLabels: string[] = [];
    this.listeners.forEach((listenerRecord, listener) => {
      const { observedKeys, debugLabel } = listenerRecord;
      if (observedKeys == null) {
        notifiedListenerCount += 1;
        if (debugLabel != null) {
          notifiedListenerLabels.push(debugLabel);
        }
        listener();
        return;
      }
      for (const key of observedKeys) {
        if (changedKeys.has(key)) {
          notifiedListenerCount += 1;
          if (debugLabel != null) {
            notifiedListenerLabels.push(debugLabel);
          }
          listener();
          return;
        }
      }
    });
    const durationMs = nowMs() - startedAtMs;
    this.recordDiagnostic(
      changedKeys,
      source,
      durationMs,
      notifiedListenerCount,
      notifiedListenerLabels
    );
  }

  private recordDiagnostic(
    changedKeys: ReadonlySet<ResultsPresentationSurfaceAuthorityKey>,
    source: string,
    durationMs: number,
    notifiedListenerCount: number,
    notifiedListenerLabels: string[]
  ): void {
    const changedKeysArray = Array.from(changedKeys);
    const roundedDurationMs = Number(durationMs.toFixed(3));
    logPerfScenarioStackAttribution({
      owner: 'results_presentation_surface_authority_notify',
      path: `${source}:${changedKeysArray.join('|')}`,
      details: {
        durationMs: roundedDurationMs,
        listenerCount: this.listeners.size,
        notifiedListenerCount,
        notifiedListenerLabels:
          notifiedListenerLabels.length === 0 ? undefined : notifiedListenerLabels.slice(0, 16),
        resultsRequestKey: this.snapshot.resultsRequestKey,
        resultsHydrationKey: this.snapshot.resultsHydrationKey,
        hydratedResultsKey: this.snapshot.hydratedResultsKey,
        allowHydrationFinalizeCommit: this.snapshot.allowHydrationFinalizeCommit,
        searchSurfaceResultsTransactionKey: this.snapshot.searchSurfaceResultsTransactionKey,
        preparedRowsReadyKey: this.snapshot.preparedRows.readyReadinessKey,
      },
    });

    const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
    if (isPerfScenarioAttributionActive(scenarioConfig, SEARCH_SUBMIT_DISMISS_REPEAT_SCENARIO)) {
      logPerfScenarioAttributionEvent('WorkSpan', scenarioConfig, {
        event: 'scenario_work_span',
        owner: 'results_presentation_surface_authority_notify',
        path: `${source}:${changedKeysArray.join('|')}`,
        durationMs: roundedDurationMs,
        listenerCount: this.listeners.size,
        notifiedListenerCount,
      });
    }

    this.diagnosticsRing.push({
      nowMs: nowMs(),
      durationMs: Math.round(durationMs * 10) / 10,
      changedKeys: changedKeysArray,
      listenerCount: this.listeners.size,
      notifiedListenerCount,
      notifiedListenerLabels:
        notifiedListenerLabels.length === 0 ? undefined : notifiedListenerLabels.slice(0, 16),
      version: this.version,
      resultsRequestKey: this.snapshot.resultsRequestKey,
      resultsHydrationKey: this.snapshot.resultsHydrationKey,
      hydratedResultsKey: this.snapshot.hydratedResultsKey,
      searchSurfaceResultsTransactionKey: this.snapshot.searchSurfaceResultsTransactionKey,
    });
    if (this.diagnosticsRing.length > 32) {
      this.diagnosticsRing.splice(0, this.diagnosticsRing.length - 32);
    }
  }
}

const SHARED_RESULTS_PRESENTATION_SURFACE_AUTHORITY = new ResultsPresentationSurfaceAuthority();

export const createResultsPresentationSurfaceAuthority = (): ResultsPresentationSurfaceAuthority =>
  SHARED_RESULTS_PRESENTATION_SURFACE_AUTHORITY;

export const getResultsPresentationSurfaceAuthority = (): ResultsPresentationSurfaceAuthority =>
  SHARED_RESULTS_PRESENTATION_SURFACE_AUTHORITY;

export const useResultsPresentationSurfaceAuthoritySelector = <T>(
  authority: ResultsPresentationSurfaceAuthority,
  selector: (snapshot: ResultsPresentationSurfaceAuthoritySnapshot) => T,
  isEqual: EqualityFn<T> = Object.is,
  observedKeys?: readonly ResultsPresentationSurfaceAuthorityKey[],
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

export const ResultsPresentationSurfaceAuthorityContext =
  React.createContext<ResultsPresentationSurfaceAuthority | null>(null);

export const useResultsPresentationSurfaceAuthority = (): ResultsPresentationSurfaceAuthority => {
  const authority = React.useContext(ResultsPresentationSurfaceAuthorityContext);
  if (authority == null) {
    throw new Error(
      'useResultsPresentationSurfaceAuthority must be used within a ResultsPresentationSurfaceAuthorityContext.Provider'
    );
  }
  return authority;
};
