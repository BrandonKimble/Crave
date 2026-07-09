import { closeSearchResultsSession } from '../../../../overlays/search-results-header-live-state';
import { getSearchSurfaceRuntime } from '../surface/search-surface-runtime';

import type { SearchRuntimeBus } from './search-runtime-bus';

/**
 * THE FAILED-ENTER UNWIND (owner spec, 2026-07-08): when the uniform failure modal for
 * a search resolution closes (any path), return the user to the last state that worked.
 * Self-guarding — the announcer passes this straight to `onDismissed` with no logic of
 * its own, which is the copyable pattern for every future enterable surface: ONE
 * exported `unwindFailedXEnter()` that owns its guards, one-line wiring at the
 * announcer.
 *
 * Unwinds ONLY a failed ENTER: nothing presented (the sheet rose for a search that
 * never landed — from home, the suggestion sheet, a favorites list tap, anywhere).
 * Guards, in order:
 * - presented world → a failed RERUN; worlds commit on success, the old results never
 *   left — nothing to unwind.
 * - idle tuple → the user already backed out while the modal was up.
 * - close already in flight → the user tapped the header X during the modal's exit
 *   animation; a second beginCloseSearch would restart the dismiss choreography.
 * Otherwise: the exact user back-out (beginCloseSearch → tuple idle +
 * pop-to-captured-origin: page + snap + scroll).
 */
export const unwindFailedSearchEnter = (searchRuntimeBus: SearchRuntimeBus): void => {
  const busState = searchRuntimeBus.getState();
  if (busState.presentedWorldId != null) {
    return;
  }
  if (busState.desiredTuple.queryIdentity.kind === 'idle') {
    return;
  }
  if (getSearchSurfaceRuntime().getSnapshot().dismissTransaction != null) {
    return;
  }
  closeSearchResultsSession();
};
