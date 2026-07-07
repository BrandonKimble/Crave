// The WORLD RECONCILER (charter §2, S4 edit map §2). S4a: DARK — it classifies every
// tuple transition and derives the presentation intent the statechart will own, tracing
// [RECONCILE] lines next to the trigger-passed intents (RED contract on kind mismatch).
// It drives nothing yet; S4b makes it the ONE resolution kicker, S4c hands its events to
// the statechart host for real.
//
// The classification table is the owner directive made code: presentation intents are
// DERIVED from tuple transitions — causes are trace labels, never branching inputs.

import { logger } from '../../../../utils';
import { reportSearchFlowContractViolation } from '../shared/search-flow-contracts';
import type { SearchRuntimeBus } from '../shared/search-runtime-bus';
import {
  areSearchCommittedBoundsEqual,
  areSearchFilterVariantsEqual,
  areSearchQueryIdentitiesEqual,
  buildSearchCardsWorldKey,
  type SearchDesiredTuple,
} from '../shared/search-desired-state-contract';

export type SearchWorldTransitionClass =
  | 'session_enter'
  | 'session_replace'
  | 'variant_rerun'
  | 'area_rerun'
  | 'tab_switch'
  | 'retoggle_reversal'
  | 'session_exit'
  | 'boot_noop'
  | 'response_tab_adopt';

export type SearchWorldDerivedIntent = {
  /** The kind the legacy triggers pass to resolve() today. */
  presentationIntentKind: 'search_this_area' | 'variant_rerun' | undefined;
  preserveSheetState: boolean;
  entrySurface: 'home' | 'search_mode' | 'results' | 'profile' | null;
};

export type SearchWorldTransition = {
  class: SearchWorldTransitionClass;
  intent: SearchWorldDerivedIntent | null;
  cardsKey: string;
};

const deriveEntrySurface = (
  tuple: SearchDesiredTuple
): SearchWorldDerivedIntent['entrySurface'] => {
  switch (tuple.queryIdentity.kind) {
    case 'shortcut':
      return 'home';
    case 'natural':
      return 'search_mode';
    case 'entity':
      return 'search_mode';
    case 'entities':
      return 'home';
    case 'profileSeed':
      return 'profile';
    case 'idle':
      return null;
  }
};

/** Pure classifier — testable without React or the bus. `presentedCardsKey` is the
 *  world currently ON SCREEN (mounted identity), the retoggle-reversal discriminator. */
export const classifySearchWorldTransition = (args: {
  prev: SearchDesiredTuple;
  next: SearchDesiredTuple;
  presentedCardsKey: string | null;
}): SearchWorldTransition => {
  const { prev, next, presentedCardsKey } = args;
  const cardsKey = buildSearchCardsWorldKey(next);
  const identityChanged = !areSearchQueryIdentitiesEqual(prev.queryIdentity, next.queryIdentity);
  const filtersChanged = !areSearchFilterVariantsEqual(prev.filterVariant, next.filterVariant);
  const boundsChanged = !areSearchCommittedBoundsEqual(prev.committedBounds, next.committedBounds);
  const tabChanged = prev.tab !== next.tab;

  if (next.queryIdentity.kind === 'idle') {
    return prev.queryIdentity.kind === 'idle'
      ? { class: 'boot_noop', intent: null, cardsKey }
      : { class: 'session_exit', intent: null, cardsKey };
  }
  if (
    presentedCardsKey != null &&
    cardsKey === presentedCardsKey &&
    !identityChanged &&
    !tabChanged
  ) {
    // The desire moved BACK to the world already on screen (A→B→A mid-flight): a
    // reversal, not a new episode. A tab switch is NOT a reversal even though the
    // cards key is tab-agnostic — the coverage projection changes.
    return { class: 'retoggle_reversal', intent: null, cardsKey };
  }
  if (identityChanged) {
    const wasIdle = prev.queryIdentity.kind === 'idle';
    return {
      class: wasIdle ? 'session_enter' : 'session_replace',
      intent: {
        presentationIntentKind: undefined,
        // An in-session identity swap keeps the sheet; a fresh enter builds it.
        preserveSheetState: !wasIdle,
        entrySurface: deriveEntrySurface(next),
      },
      cardsKey,
    };
  }
  if (filtersChanged) {
    // Bounds may co-change (chip commits adopt the settled camera) — the filter delta
    // is the classifying fact.
    return {
      class: 'variant_rerun',
      intent: {
        presentationIntentKind: 'variant_rerun',
        preserveSheetState: true,
        entrySurface: 'results',
      },
      cardsKey,
    };
  }
  if (boundsChanged) {
    return {
      class: 'area_rerun',
      intent: {
        presentationIntentKind: 'search_this_area',
        preserveSheetState: true,
        entrySurface: 'results',
      },
      cardsKey,
    };
  }
  if (tabChanged) {
    return {
      class: 'tab_switch',
      intent: {
        presentationIntentKind: undefined,
        preserveSheetState: true,
        entrySurface: 'results',
      },
      cardsKey,
    };
  }
  return { class: 'boot_noop', intent: null, cardsKey };
};

export type SearchWorldReconcilerEnv = {
  searchRuntimeBus: SearchRuntimeBus;
  /** The mounted world's cards key (the presented identity) — read at classify time. */
  getPresentedCardsKey: () => string | null;
};

export type SearchWorldReconciler = {
  start: () => () => void;
  /** S4a parity hook: the resolver reports each trigger-passed kick; the reconciler
   *  compares it against its own derivation and reports a RED contract on mismatch. */
  onResolveKick: (args: {
    generation: number;
    presentationIntentKind: 'search_this_area' | 'variant_rerun' | undefined;
  }) => void;
};

export const createSearchWorldReconciler = (
  env: SearchWorldReconcilerEnv
): SearchWorldReconciler => {
  let lastTuple = env.searchRuntimeBus.getState().desiredTuple;
  let lastDerived: { generation: number; transition: SearchWorldTransition } | null = null;

  const start = (): (() => void) => {
    lastTuple = env.searchRuntimeBus.getState().desiredTuple;
    return env.searchRuntimeBus.subscribe(
      () => {
        const state = env.searchRuntimeBus.getState();
        const next = state.desiredTuple;
        if (next === lastTuple) {
          return;
        }
        const prev = lastTuple;
        lastTuple = next;
        const transition = classifySearchWorldTransition({
          prev,
          next,
          presentedCardsKey: env.getPresentedCardsKey(),
        });
        lastDerived = { generation: state.desiredTupleGeneration, transition };
        if (__DEV__) {
          logger.info('[RECONCILE]', {
            generation: state.desiredTupleGeneration,
            cause: state.desiredTupleCause,
            class: transition.class,
            derivedKind: transition.intent?.presentationIntentKind ?? 'initial',
            preserveSheet: transition.intent?.preserveSheetState ?? null,
            entrySurface: transition.intent?.entrySurface ?? null,
          });
        }
      },
      ['desiredTuple'],
      'search_world_reconciler'
    );
  };

  const onResolveKick: SearchWorldReconciler['onResolveKick'] = ({
    generation,
    presentationIntentKind,
  }) => {
    if (lastDerived == null || lastDerived.generation !== generation) {
      // Kicks for generations the reconciler never classified (e.g. imperative re-kicks)
      // are visible in the trace by their absence; not a violation by themselves.
      return;
    }
    const derivedKind = lastDerived.transition.intent?.presentationIntentKind;
    // The legacy triggers pass undefined for initial enters AND tab switches; the
    // derivation must agree on the rerun kinds exactly.
    if (derivedKind !== presentationIntentKind) {
      reportSearchFlowContractViolation('reconciler_intent_mismatch', {
        generation,
        class: lastDerived.transition.class,
        derivedKind: derivedKind ?? 'initial',
        passedKind: presentationIntentKind ?? 'initial',
      });
    }
  };

  return { start, onResolveKick };
};
