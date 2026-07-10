export type ToggleInteractionKind =
  | 'tab_switch'
  | 'filter_open_now'
  | 'filter_include_similar'
  | 'filter_rising'
  | 'filter_price'
  /** Failure retry with a presented world: rides the SAME interaction cover +
   *  debounce + reveal choreography as a chip rerun. */
  | 'retry'
  /** S-A (toggle-system-ideal §STA): search-this-area IS a toggle — availability is a
   *  predicate (mapMovedSinceSearch), the flow is identical to every chip. The kind is
   *  DERIVED by the classifier (the area_rerun transition), never trigger-passed. */
  | 'search_this_area';

export type ToggleInteractionLifecycleEvent =
  | {
      type: 'started';
      intentId: string;
      kind: ToggleInteractionKind;
    }
  | {
      type: 'settled';
      intentId: string;
      kind: ToggleInteractionKind;
    }
  | {
      type: 'finalized';
      intentId: string;
      kind: ToggleInteractionKind;
      awaitedVisualSync: boolean;
    }
  | {
      type: 'cancelled';
      intentId: string;
      kind: ToggleInteractionKind;
    };

type ToggleCommitOutcome = {
  awaitVisualSync?: boolean;
};

type ToggleCommitRunnerContext = {
  intentId: string;
};

type ToggleCommitRunner = (context: ToggleCommitRunnerContext) => ToggleCommitOutcome | void;

export type ScheduleToggleCommit = (
  runner: ToggleCommitRunner,
  options: { kind: ToggleInteractionKind }
) => void;

export type ToggleInteractionState = {
  kind: ToggleInteractionKind | null;
  pendingPresentationIntentId: string | null;
};

export const IDLE_TOGGLE_INTERACTION_STATE: ToggleInteractionState = {
  kind: null,
  pendingPresentationIntentId: null,
};
