import React from 'react';

import { searchService } from '../../../../services/search';
import { SHORTCUT_QUERY_LABEL_BY_TAB } from './shortcut-toggle-display-query';
import { logger } from '../../../../utils';

import type { SearchForegroundLaunchIntentRuntimeArgs } from './use-search-foreground-interaction-runtime-contract';
import { useAppOverlayRouteController } from '../../../../overlays/useAppOverlayRouteController';
import { useAppRouteSceneRuntime } from '../../../../navigation/runtime/AppRouteSceneRuntimeProvider';

export const useSearchForegroundLaunchIntentRuntime = ({
  routeSearchCommandActions,
  navigation,
  activeMainIntent,
  consumeActiveMainIntent,
  openRestaurantProfilePreview,
  launchEntitySearchResults,
  launchListSearchResults,
  runRestaurantEntitySearch,
  submitSearch,
  submitViewportShortcut,
  pendingRestaurantSelectionRef,
  currentMarketKey,
}: SearchForegroundLaunchIntentRuntimeArgs): void => {
  // W1 slice 4: the sharedList intent is a plain child push now (listDetail owns the slug).
  const { pushRoute } = useAppOverlayRouteController();
  const routeSceneRuntime = useAppRouteSceneRuntime();
  React.useEffect(() => {
    if (__DEV__ && activeMainIntent.type !== 'none') {
      // eslint-disable-next-line no-console
      console.log(`[LAUNCHDBG] consumer sees type=${activeMainIntent.type}`);
    }
    if (activeMainIntent.type === 'none') {
      return;
    }

    // S-D.4: ONE entityAction branch — the channel carries the SAME action vocabulary
    // resolveEntityRefAction produces; this consumer just routes each kind to its lane
    // (entityDesire → skip-LLM search; restaurantWorld → the committed single-restaurant
    // lifecycle below). pushScene never reaches the channel (the executor pushes directly).
    // Wave-4 §3: the world half of the listWorld composite — the executor already
    // pushed listDetail; this writes the list-identity tuple (the submit IS the tuple
    // write) and the reconciler presents the world under the pushed child.
    if (activeMainIntent.type === 'entityAction' && activeMainIntent.action.kind === 'listWorld') {
      const action = activeMainIntent.action;
      // Leg 4 (design §1.3): THE launch chokepoint stamps the world identity onto the
      // entry the world presents into (the active entry — the executor pushed it, or
      // the slug lane resolved into it). Every mouth inherits the session fact with
      // zero per-surface wiring; the dismiss algebra reads entry.desire.
      routeSceneRuntime.routeSceneSwitchRuntime.stampActiveRouteEntryDesire({
        kind: 'list',
        listId: action.listId,
        listType: action.listType,
        displayTitle: action.title,
        targetUserId: action.targetUserId ?? null,
        shareSlug: action.shareSlug ?? null,
      });
      void launchListSearchResults({
        listId: action.listId,
        listType: action.listType,
        displayTitle: action.title,
        targetUserId: action.targetUserId ?? null,
        shareSlug: action.shareSlug ?? null,
        slice: action.slice,
      });
      consumeActiveMainIntent();
      return;
    }

    if (
      activeMainIntent.type === 'entityAction' &&
      activeMainIntent.action.kind === 'entityDesire'
    ) {
      const action = activeMainIntent.action;
      void launchEntitySearchResults({
        entityId: action.entityId,
        entityType: action.entityType,
        submittedLabel: action.label,
      });
      consumeActiveMainIntent();
      return;
    }

    if (activeMainIntent.type === 'polls') {
      routeSearchCommandActions.openAppSearchRoutePollsHome({
        params: {
          marketKey: activeMainIntent.marketKey,
          pollId: activeMainIntent.pollId,
          pinnedMarket: Boolean(activeMainIntent.marketKey || activeMainIntent.pollId),
        },
        snap: 'expanded',
      });
      consumeActiveMainIntent();
      return;
    }

    if (activeMainIntent.type === 'search') {
      navigation.setParams({ searchIntent: activeMainIntent.searchIntent });
      consumeActiveMainIntent();
      return;
    }

    // S-E: /l/<shareSlug> → the listDetail child page (W1 slice 4). The SLUG is the RT-18
    // capability, so it rides the entry params — the panel presents it on every server read
    // and owns resolution + the failure/dead-slug ("no longer shared") bodies (§5.6).
    if (activeMainIntent.type === 'sharedList') {
      pushRoute('listDetail', {
        shareSlug: activeMainIntent.shareSlug,
        joinIntent: activeMainIntent.joinIntent === true,
      });
      consumeActiveMainIntent();
      return;
    }

    // S-E: /q/<query> and /s/<tab> — the URL-addressable search desires ride the same
    // submit verbs every in-app trigger uses.
    if (activeMainIntent.type === 'searchDesire') {
      const desire = activeMainIntent.desire;
      if (desire.kind === 'natural') {
        void submitSearch({}, desire.query);
      } else {
        void submitViewportShortcut(
          desire.shortcutTab,
          SHORTCUT_QUERY_LABEL_BY_TAB[desire.shortcutTab],
          { forceFreshBounds: true }
        );
      }
      consumeActiveMainIntent();
      return;
    }

    if (
      activeMainIntent.type === 'entityAction' &&
      activeMainIntent.action.kind === 'restaurantWorld'
    ) {
      // Phase 4 (canonical-sheet-transition-master-plan §4, BUG-1 #1/#2/#3): route the
      // restaurant reveal from a poll-discussion comment span (or a restaurant deep link)
      // through the COMMITTED single-restaurant search lifecycle — NOT the cold
      // openRestaurantProfilePreview lane. This is the exact lane the recently-viewed
      // restaurant tap uses (use-search-foreground-recent-submit-runtime.ts):
      //   1. prime `pendingRestaurantSelectionRef` so the
      //      profile auto-open kickoff opens the WARM profile on the single committed
      //      candidate (resolveProfileAutoOpenAction's pending-selection branch) — gives
      //      "guaranteed profile, no results-list flash".
      //   2. `runRestaurantEntitySearch` runs a committed `mode:'entity'` search scoped to
      //      the restaurant. The committed results lifecycle sets `backdropTarget='results'`
      //      (chrome-fade, #3), emits the committed pin for the single result (#2), and the
      //      natural openChild snap resolves to `{promoteAtLeast,middle}` (#1) via
      //      resolveDefaultSheetMotionPlan — not from set membership.
      //
      // originating overlay and dismisses back to it — mirrors the favorites/entity branches.
      //
      // CRITICAL: consume the intent SYNCHRONOUSLY (like favorites/entity), THEN
      // this effect; if the intent were only consumed in an async .finally(), the re-run
      // would cancel the fetch before it consumed, leaving activeMainIntent === 'restaurant'
      // forever → an infinite push/dismiss loop. Snapshot the params before consuming.
      const restaurantId = activeMainIntent.action.restaurantId;
      // The origin may already know the restaurant's display name (a comment-span tap carries
      // the span text). When present, warm-seed the restaurant profile SYNCHRONOUSLY via
      // openRestaurantProfilePreview(restaurantId, name) BEFORE the committed search — this is
      // the exact reference move use-search-foreground-recent-submit-runtime.ts makes. The
      // synchronous seedRestaurantProfile populates data.restaurant.restaurantName so the
      // hard-swapped RestaurantPanel paints its header title at frame 1 (no empty-title flash);
      // the committed runRestaurantEntitySearch then provides the results / auto-open. When the
      // name is absent (a raw deep link), fall back to fetching the profile for the name.
      const seededRestaurantName = activeMainIntent.action.restaurantName.trim() || null;
      const restaurantMarketKey = currentMarketKey ?? null;
      consumeActiveMainIntent();
      // Prime the pending selection BEFORE the committed search lands so the auto-open
      // kickoff resolves to the warm-profile open for this exact restaurant.
      pendingRestaurantSelectionRef.current = { restaurantId };
      if (seededRestaurantName) {
        // Warm-seed the profile header synchronously (frame-1 title), mirroring the
        // recently-viewed-restaurant tap, THEN run the committed search for the results.
        openRestaurantProfilePreview(restaurantId, seededRestaurantName);
        void runRestaurantEntitySearch({
          restaurantId,
          restaurantName: seededRestaurantName,
          submissionSource: 'recent',
          typedPrefix: seededRestaurantName,
        }).catch((error) => {
          if (pendingRestaurantSelectionRef.current?.restaurantId === restaurantId) {
            pendingRestaurantSelectionRef.current = null;
          }
          logger.warn('Failed to open restaurant launch intent', {
            message: error instanceof Error ? error.message : 'unknown error',
            restaurantId,
          });
        });
        return;
      }
      void searchService
        .restaurantProfile(restaurantId, { marketKey: restaurantMarketKey })
        .then((profile) => {
          const restaurant = profile?.restaurant;
          if (!restaurant?.restaurantId || !restaurant.restaurantName) {
            return;
          }
          // Warm-seed the resolved name into the profile header before the committed search.
          openRestaurantProfilePreview(restaurant.restaurantId, restaurant.restaurantName);
          // The detached committed search needs its OWN .catch — the outer .catch below only
          // covers the restaurantProfile() fetch, NOT this fire-and-forget rejection. Without
          // it an inner failure is an unhandled rejection AND leaves the primed pending
          // selection stranded (it would hijack the next unrelated search).
          void runRestaurantEntitySearch({
            restaurantId: restaurant.restaurantId,
            restaurantName: restaurant.restaurantName,
            submissionSource: 'recent',
            typedPrefix: restaurant.restaurantName,
          }).catch((error) => {
            if (pendingRestaurantSelectionRef.current?.restaurantId === restaurantId) {
              pendingRestaurantSelectionRef.current = null;
            }
            logger.warn('Failed to open restaurant launch intent', {
              message: error instanceof Error ? error.message : 'unknown error',
              restaurantId,
            });
          });
        })
        .catch((error) => {
          // Clear the primed selection so a failed reveal does not strand a pending
          // restaurant selection that would hijack the next unrelated search.
          if (pendingRestaurantSelectionRef.current?.restaurantId === restaurantId) {
            pendingRestaurantSelectionRef.current = null;
          }
          logger.warn('Failed to open restaurant launch intent', {
            message: error instanceof Error ? error.message : 'unknown error',
            restaurantId,
          });
        });
      return;
    }

    consumeActiveMainIntent();
    return undefined;
  }, [
    activeMainIntent,
    consumeActiveMainIntent,
    currentMarketKey,
    launchEntitySearchResults,
    launchListSearchResults,
    navigation,
    openRestaurantProfilePreview,
    pendingRestaurantSelectionRef,
    pushRoute,
    routeSceneRuntime,
    routeSearchCommandActions,
    runRestaurantEntitySearch,
  ]);
};
