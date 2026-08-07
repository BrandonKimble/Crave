/**
 * F1053(b) — THE SIGN-OUT RESET IS ONE CALL, AND IT CLEARS THE DEDUPE STATE.
 *
 * The request-dedupe promises and load-once flags used to be SIX module-level `let`s in
 * use-search-history.ts, and the sign-out effect had to remember to null all six by hand —
 * a caller-must-remember contract enforced by nothing. They now live in this store as state
 * about the data, so `resetHistory()` (what the sign-out effect calls) clears them in one
 * call by construction: they are part of `defaultState`.
 *
 * This spec pins that semantics — the exact thing a store move could silently break.
 *
 * MUTATION PROOF: drop any of the six dedupe fields from `defaultState` in
 * searchHistoryStore.ts, and the "resetHistory clears the dedupe state" assertion goes RED
 * (a stale in-flight promise or a stuck `hasLoaded*` flag survives sign-out, so the next
 * signed-in load would either short-circuit on the flag or await a dead promise).
 */
import { useSearchHistoryStore } from './searchHistoryStore';

describe('searchHistoryStore — dedupe/load-once state + sign-out reset', () => {
  afterEach(() => {
    useSearchHistoryStore.getState().resetHistory();
  });

  it('defaults the six dedupe fields to null/false', () => {
    const state = useSearchHistoryStore.getState();
    expect(state.recentHistoryRequest).toBeNull();
    expect(state.recentlyViewedRequest).toBeNull();
    expect(state.recentlyViewedFoodsRequest).toBeNull();
    expect(state.hasLoadedRecent).toBe(false);
    expect(state.hasLoadedRecentlyViewed).toBe(false);
    expect(state.hasLoadedRecentlyViewedFoods).toBe(false);
  });

  it('resetHistory() clears the dedupe state in one call (the sign-out reset)', () => {
    // Drive every dedupe field off its default, exactly as the load paths do.
    useSearchHistoryStore.setState({
      recentHistoryRequest: Promise.resolve(),
      recentlyViewedRequest: Promise.resolve(),
      recentlyViewedFoodsRequest: Promise.resolve(),
      hasLoadedRecent: true,
      hasLoadedRecentlyViewed: true,
      hasLoadedRecentlyViewedFoods: true,
    });

    useSearchHistoryStore.getState().resetHistory();

    const state = useSearchHistoryStore.getState();
    expect(state.recentHistoryRequest).toBeNull();
    expect(state.recentlyViewedRequest).toBeNull();
    expect(state.recentlyViewedFoodsRequest).toBeNull();
    expect(state.hasLoadedRecent).toBe(false);
    expect(state.hasLoadedRecentlyViewed).toBe(false);
    expect(state.hasLoadedRecentlyViewedFoods).toBe(false);
  });
});
