export type ToggleInteractionKind =
  | 'tab_switch'
  | 'filter_open_now'
  | 'filter_votes'
  | 'filter_price'
  | 'filter_rank';

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
