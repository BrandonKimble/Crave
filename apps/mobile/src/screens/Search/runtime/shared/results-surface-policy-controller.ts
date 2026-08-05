import type { SearchRuntimeBusState } from './search-runtime-bus';
import type { SearchResultsRetainedReadModel } from './results-retained-read-model-controller';

// F1033(a) (2026-08-05): this file used to also export the results-surface policy
// controller factory and type — constructed and fed via its shell-facts/panel-inputs/
// reset setters, but with NOTHING ever calling its snapshot, sheet-policy-inputs, or
// read-model-policy-diagnostics readers (see the gate entry below for the exact banned
// names). Ten of its sixteen methods had zero callers; its internal snapshot builder ran
// two full buildSafeResultsData passes plus the panel-policy resolver on every shell-fact
// and panel-input change and threw all of it away — O(rows) work on the search hot path
// producing a second, silently divergent copy of state that no test or instrument could
// ever show RED. The live panel state is computed independently at
// use-search-root-search-scene-surface-panel-state-runtime.tsx. DELETED, along with its
// construction site and the optional-controller prop lane that carried the unused
// instance through five files (a controller nobody reads is worse than no controller;
// see scripts/app-route-runtime-delete-gate.sh entry f1033a_results_surface_policy_controller).
// Only the vocabulary types below survive — they are genuinely consumed by
// results-surface-read-model-policy-contract.ts and results-surface-read-model-policy-controller.ts.

export type ResultsSurfacePolicyTab = 'dishes' | 'restaurants';

export type ResultsSurfacePolicyRowCounts = Record<ResultsSurfacePolicyTab, number>;

// Full SearchResponse payload only. SearchSessionEventPayload envelopes must be unwrapped upstream.
export type ResultsSurfacePolicyResults = SearchRuntimeBusState['results'];

export type ResultsSurfacePolicyRetainedReadModel =
  SearchResultsRetainedReadModel<ResultsSurfacePolicyResults>;
