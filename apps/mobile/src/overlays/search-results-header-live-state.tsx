import React from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Text } from '../components';
import styles from '../screens/Search/styles';
import { registerPersistentHeaderDescriptor } from '../navigation/runtime/app-route-persistent-header-registry';
import { registerHeaderCloseAction } from '../navigation/runtime/header-nav-action-registry';
import { publishRetainedResultsHeaderHeight } from './SearchMountedScenePageBundleAuthority';

// P5 persistent header (page-switch-master-plan.md §6-P5 / owner req 2e) — the SEARCH results
// header's live-state publication, completing the P3 header standardization for the last scene.
// The persistent header's Title/Action/grab components mount OUTSIDE the search runtime (inside
// the hoisted PersistentSheetHeaderHost chrome) and therefore cannot read the runtime's
// props/hooks. The ONE place the header model is resolved — the submitted-query title with its
// retained fallback, the close handler, the action-morph progress — is the search read-model
// runtime (use-search-results-page-header-runtime), which publishes here (the
// restaurant-header-live-state house pattern) and the descriptor components subscribe. Title
// renders SYNCHRONOUSLY on the first frame of a switch: the store retains the last resolved
// title and seeds 'Results' before any query exists (owner req 2b — the header never skeletons).
export type SearchResultsHeaderLiveState = {
  /** Resolved title — the submitted query text, retained across blanks; 'Results' seed. */
  headerTitle: string;
  activeTabColor: string;
  handleCloseResults: () => void;
  /**
   * The search runtime's own header-height observer (results header height drives the wash/empty
   * placement + list insets). Fed from the persistent chrome's onLayout via the descriptor's
   * onChromeLayout — the SAME measurement the old in-frame results header produced.
   */
  handleResultsHeaderLayout: (event: LayoutChangeEvent) => void;
};

type Listener = () => void;

let currentSearchResultsHeaderLiveState: SearchResultsHeaderLiveState | null = null;
const listeners = new Set<Listener>();

export const publishSearchResultsHeaderLiveState = (
  state: SearchResultsHeaderLiveState | null
): void => {
  if (currentSearchResultsHeaderLiveState === state) {
    return;
  }
  currentSearchResultsHeaderLiveState = state;
  listeners.forEach((listener) => {
    listener();
  });
};

/**
 * Imperative session close for non-UI callers (e.g. the uniform failure modal's
 * unwind): runs the EXACT user back-out — beginCloseSearch's tuple→idle +
 * pop-to-captured-origin (page + snap + scroll) — via the same published handler the
 * header's close button presses. No-ops while no results session is published.
 */
export const closeSearchResultsSession = (): void => {
  getSearchResultsHeaderLiveState()?.handleCloseResults();
};

const getSearchResultsHeaderLiveState = (): SearchResultsHeaderLiveState | null =>
  currentSearchResultsHeaderLiveState;

const subscribeSearchResultsHeaderLiveState = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const useSearchResultsHeaderLiveState = (): SearchResultsHeaderLiveState | null =>
  React.useSyncExternalStore(
    subscribeSearchResultsHeaderLiveState,
    getSearchResultsHeaderLiveState,
    getSearchResultsHeaderLiveState
  );

const SearchResultsPersistentHeaderTitle: React.FC = () => {
  const liveState = useSearchResultsHeaderLiveState();
  return (
    <Text
      variant="title"
      weight="semibold"
      style={styles.submittedQueryLabel}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {liveState?.headerTitle ?? 'Results'}
    </Text>
  );
};

const handleSearchResultsChromeLayout = (event: LayoutChangeEvent): void => {
  // Feed BOTH height consumers off the one hoisted chrome measurement: the page-bundle host's
  // reserved header lane, and the search runtime's internal header-height math.
  publishRetainedResultsHeaderHeight(event.nativeEvent.layout.height);
  getSearchResultsHeaderLiveState()?.handleResultsHeaderLayout(event);
};

// Module-scope registration (house pattern — mirrors PollsPanel/RestaurantRouteSceneInputHost).
// Loaded with the search read-model runtime (its publisher imports this module), i.e. at boot.
registerPersistentHeaderDescriptor('search', {
  Title: SearchResultsPersistentHeaderTitle,
  onChromeLayout: handleSearchResultsChromeLayout,
});

// Leg 6 (§4 HeaderNavAction): the results X is the HOST-OWNED control now; the session close
// (the exact user back-out) registers as the host's close OVERRIDE for the 'search' scene.
registerHeaderCloseAction('search', closeSearchResultsSession);
