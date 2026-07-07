// The WORLD RECONCILER (charter §2, S4 edit map §2). S4b: the ONE resolution driver —
// it classifies every tuple transition, derives the presentation intent from the delta
// (causes are trace labels, never branching inputs), and drives resolution + the
// EXISTING presentation choreography per class:
//   session_enter/replace/area_rerun → foreground effects + resolve
//   variant_rerun (and reversals)    → toggle-coordinator commit (arm cover + resolve)
//   session_exit / tab_switch        → traced only (close + tab choreography stay
//                                      lane-owned until S4c's statechart)
// S4c hands its events to the reveal statechart and deletes the presentation port.

import { logger } from '../../../../utils';
import { reportSearchFlowContractViolation } from '../shared/search-flow-contracts';
import type { SearchRuntimeBus } from '../shared/search-runtime-bus';
import { getSearchReconcilerPresentationPort } from './search-reconciler-presentation-port';
import {
  takePendingSearchRequestDecoration,
  type SearchRequestDecoration,
} from './search-request-decoration-registry';
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
  /** The resolver kick (in-flight dedupe + ladder live inside). */
  resolve: (args: {
    tuple: SearchDesiredTuple;
    generation: number;
    cause: string | null;
    presentationIntentKind?: 'search_this_area' | 'variant_rerun';
    requestDecoration?: SearchRequestDecoration;
    onResolutionBegan?: () => void;
    onResolutionFailed?: (reason: string) => void;
  }) => Promise<void>;
  /** Surviving foreground effects for full enters (the old
   *  beginResolverSubmitForegroundUi body, now class-keyed here). */
  runEnterForegroundEffects: (args: {
    intent: SearchWorldDerivedIntent;
    tuple: SearchDesiredTuple;
  }) => void;
  onResolveFailed: (reason: string) => void;
};

export type SearchWorldReconciler = {
  start: () => () => void;
};

const deriveToggleKindFromFilterDelta = (
  prev: SearchDesiredTuple['filterVariant'],
  next: SearchDesiredTuple['filterVariant']
): 'filter_open_now' | 'filter_rising' | 'filter_price' | 'filter_include_similar' => {
  if (prev.openNow !== next.openNow) {
    return 'filter_open_now';
  }
  if (prev.rising !== next.rising) {
    return 'filter_rising';
  }
  if (prev.includeSimilar !== next.includeSimilar) {
    return 'filter_include_similar';
  }
  return 'filter_price';
};

export const createSearchWorldReconciler = (
  env: SearchWorldReconcilerEnv
): SearchWorldReconciler => {
  let lastTuple = env.searchRuntimeBus.getState().desiredTuple;

  const kickRerunThroughCoordinator = (args: {
    tuple: SearchDesiredTuple;
    generation: number;
    cause: string | null;
    kind: 'filter_open_now' | 'filter_rising' | 'filter_price' | 'filter_include_similar';
    decoration: SearchRequestDecoration | undefined;
  }): void => {
    const port = getSearchReconcilerPresentationPort();
    if (port == null) {
      // Boot-order gap (a rerun before the presentation runtimes mounted) is a broken
      // composition, not a state to compensate for.
      reportSearchFlowContractViolation('reconciler_presentation_port_missing', {
        generation: args.generation,
      });
      return;
    }
    port.scheduleToggleCommit(
      ({ intentId }) => {
        port.clearStagedSearchSurfaceResultsTransaction();
        port.beginVariantRerunPresentationPending(intentId);
        // Re-read the CURRENT desire at commit time — the coordinator debounce may have
        // coalesced newer tuple writes over the one that scheduled this commit.
        const busState = env.searchRuntimeBus.getState();
        void env
          .resolve({
            tuple: busState.desiredTuple,
            generation: busState.desiredTupleGeneration,
            cause: busState.desiredTupleCause,
            presentationIntentKind: 'variant_rerun',
            requestDecoration: args.decoration,
            onResolutionFailed: (reason) => {
              port.clearStagedSearchSurfaceResultsTransaction();
              env.onResolveFailed(reason);
            },
          })
          .catch((error) => {
            env.onResolveFailed(error instanceof Error ? error.message : 'unknown error');
          });
        return { awaitVisualSync: true as const };
      },
      { kind: args.kind }
    );
  };

  const dispatch = (args: {
    prev: SearchDesiredTuple;
    next: SearchDesiredTuple;
    generation: number;
    cause: string | null;
    transition: SearchWorldTransition;
  }): void => {
    const { prev, next, generation, cause, transition } = args;
    const decoration = takePendingSearchRequestDecoration();
    switch (transition.class) {
      case 'session_enter':
      case 'session_replace':
      case 'area_rerun': {
        const intent = transition.intent;
        void env
          .resolve({
            tuple: next,
            generation,
            cause,
            presentationIntentKind: intent?.presentationIntentKind,
            requestDecoration: decoration,
            onResolutionBegan: () => {
              if (intent != null) {
                env.runEnterForegroundEffects({ intent, tuple: next });
              }
            },
            onResolutionFailed: env.onResolveFailed,
          })
          .catch((error) => {
            env.onResolveFailed(error instanceof Error ? error.message : 'unknown error');
          });
        return;
      }
      case 'variant_rerun':
      case 'retoggle_reversal': {
        // A reversal rides the same rerun path: the resolver cache-hits and the seam's
        // represent-noop completes the armed choreography (the S4c statechart replaces
        // this with a true fade-back).
        kickRerunThroughCoordinator({
          tuple: next,
          generation,
          cause,
          kind: deriveToggleKindFromFilterDelta(prev.filterVariant, next.filterVariant),
          decoration,
        });
        return;
      }
      case 'tab_switch': {
        // S4c-1b: the reconciler presents the tab recompose — coordinator debounce +
        // press-up fade, then the commit body re-reads the CURRENT desire and swaps
        // (a net-zero burst re-reveals without the tab publish; markers were dimmed).
        const port = getSearchReconcilerPresentationPort();
        if (port == null) {
          reportSearchFlowContractViolation('reconciler_presentation_port_missing', {
            generation,
          });
          return;
        }
        port.scheduleToggleCommit(
          ({ intentId }) => {
            const busState = env.searchRuntimeBus.getState();
            port.presentTabSwitch({ intentId, targetTab: busState.desiredTuple.tab });
            return { awaitVisualSync: true as const };
          },
          { kind: 'tab_switch' }
        );
        return;
      }
      case 'session_exit':
      case 'boot_noop':
      case 'response_tab_adopt':
        // session_exit: close choreography stays trigger-owned until S4c.
        // response_tab_adopt: the resolver's own mid-resolution write — same episode.
        return;
    }
  };

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
        // The resolver's own tab-adopt write must not re-enter resolution.
        if (state.desiredTupleCause === 'response_tab_adopt') {
          return;
        }
        const transition = classifySearchWorldTransition({
          prev,
          next,
          presentedCardsKey: env.getPresentedCardsKey(),
        });
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
        dispatch({
          prev,
          next,
          generation: state.desiredTupleGeneration,
          cause: state.desiredTupleCause,
          transition,
        });
      },
      ['desiredTuple'],
      'search_world_reconciler'
    );
  };

  return { start };
};
