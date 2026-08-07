// F4805: the reconnect auto-retry's gate is load-bearing for something it never
// advertised. `deriveToggleKindFromDesiredDelta`'s no-delta arm (search-world-reconciler)
// is described as "unreachable by construction", and the construction that makes it so is
// NOT in that file: retrySearchDesiredResolution publishes a value-equal,
// reference-new tuple (that is its whole job — bypass the tuple-equal short-circuit), and
// such a tuple satisfies retoggle_reversal's conditions. What routes it to
// reassert_unresolved instead is the FAILURE LEVEL being set — the half of this gate that
// nothing pinned until now. Sever either half and one of these goes RED.
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
jest.mock('../../../../utils', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { shouldResumeSearchResolutionOnReconnect } from './search-desired-state-writer';
import {
  IDLE_SEARCH_DESIRED_TUPLE,
  type SearchDesiredTuple,
} from './search-desired-state-contract';

const ACTIVE_TUPLE: SearchDesiredTuple = {
  ...IDLE_SEARCH_DESIRED_TUPLE,
  queryIdentity: { kind: 'shortcut', shortcutTab: 'restaurants' },
  tab: 'restaurants',
};

const busWith = (state: {
  searchResolutionFailure: {
    generation: number;
    reason: string;
    offline: boolean;
    atMs: number;
  } | null;
  desiredTuple: SearchDesiredTuple;
}) => ({ getState: () => state }) as never;

describe('shouldResumeSearchResolutionOnReconnect — the reconnect auto-retry gate', () => {
  const FAILURE = { generation: 1, reason: 'network', offline: true, atMs: 0 };

  it('resumes only when a failure level is SET on a live session', () => {
    expect(
      shouldResumeSearchResolutionOnReconnect(
        busWith({ searchResolutionFailure: FAILURE, desiredTuple: ACTIVE_TUPLE })
      )
    ).toBe(true);
  });

  it('does NOT resume with no failure level — the half that keeps the reconciler’s no-delta arm unreachable', () => {
    // Drop this half and a reconnect fires retrySearchDesiredResolution against a
    // SUCCESSFULLY presented world: the reference-new, value-equal tuple classifies as
    // retoggle_reversal, reaches deriveToggleKindFromDesiredDelta with no moved axis, and
    // reports `toggle_kind_unclassifiable_delta` in production.
    expect(
      shouldResumeSearchResolutionOnReconnect(
        busWith({ searchResolutionFailure: null, desiredTuple: ACTIVE_TUPLE })
      )
    ).toBe(false);
  });

  it('does NOT resume a session dismissed during the offline pause', () => {
    expect(
      shouldResumeSearchResolutionOnReconnect(
        busWith({ searchResolutionFailure: FAILURE, desiredTuple: IDLE_SEARCH_DESIRED_TUPLE })
      )
    ).toBe(false);
  });
});
