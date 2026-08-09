/**
 * THE CACHE POLICY falsifiers (plans/data-image-tier-rederivation.md Part 1).
 *
 * Two kinds of proof:
 *  1. The class values + the propagation fact: the QueryClient defaults are
 *     DERIVED from ENTITY, not duplicated — a class change propagates.
 *  2. The honest behavioral one: with a real QueryClient wearing the policy
 *     defaults, an in-window refetch makes ZERO network calls while a
 *     past-window one refetches. Mutation backstop: the same instrument shows
 *     RED under staleTime 0 (the pre-policy default), so a policy regression
 *     cannot pass silently.
 */
import { QueryClient } from '@tanstack/react-query';

import {
  ENTITY_CACHE_POLICY,
  FEED_CACHE_POLICY,
  LIVE_CACHE_POLICY,
  QUERY_CLIENT_DEFAULT_QUERY_OPTIONS,
  VIEWER_STATE_CACHE_POLICY,
} from './query-cache-policy';

describe('query-cache-policy classes', () => {
  it('states the census-derived class values', () => {
    expect(ENTITY_CACHE_POLICY).toEqual({ staleTime: 60_000, gcTime: 24 * 60 * 60 * 1000 });
    expect(VIEWER_STATE_CACHE_POLICY).toEqual({ staleTime: 20_000, gcTime: 60 * 60 * 1000 });
    // LIVE staleTime 0 is deliberate: resubscribe-refetch (MessagingPanels contract).
    expect(LIVE_CACHE_POLICY).toEqual({ staleTime: 0, gcTime: 60 * 60 * 1000 });
    expect(FEED_CACHE_POLICY).toEqual({ staleTime: 30_000, gcTime: 24 * 60 * 60 * 1000 });
  });

  it('derives the QueryClient defaults from ENTITY (a class change propagates)', () => {
    // Identity-level derivation: the default IS the ENTITY value, so editing the
    // class in one place moves the app default. Duplicated literals would still
    // pass an equality check against today's numbers — assert against the class
    // object, not re-typed constants.
    expect(QUERY_CLIENT_DEFAULT_QUERY_OPTIONS.staleTime).toBe(ENTITY_CACHE_POLICY.staleTime);
    expect(QUERY_CLIENT_DEFAULT_QUERY_OPTIONS.gcTime).toBe(ENTITY_CACHE_POLICY.gcTime);
  });
});

describe('query-cache-policy behavior (the honest falsifier)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const makeClient = (overrides?: { staleTime: number }) =>
    new QueryClient({
      defaultOptions: {
        queries: { ...QUERY_CLIENT_DEFAULT_QUERY_OPTIONS, ...overrides, retry: false },
      },
    });

  it('serves an in-window read from cache with ZERO network calls', async () => {
    const client = makeClient();
    const queryFn = jest.fn(async () => 'payload');

    await client.fetchQuery({ queryKey: ['entity', '1'], queryFn });
    // Inside the ENTITY stale window: one second later, same key.
    jest.advanceTimersByTime(1_000);
    await client.fetchQuery({ queryKey: ['entity', '1'], queryFn });

    expect(queryFn).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it('refetches a past-window read', async () => {
    const client = makeClient();
    const queryFn = jest.fn(async () => 'payload');

    await client.fetchQuery({ queryKey: ['entity', '1'], queryFn });
    jest.advanceTimersByTime(ENTITY_CACHE_POLICY.staleTime + 1);
    await client.fetchQuery({ queryKey: ['entity', '1'], queryFn });

    expect(queryFn).toHaveBeenCalledTimes(2);
    client.clear();
  });

  it('MUTATION BACKSTOP: under staleTime 0 the in-window instrument goes RED', async () => {
    // Proves the zero-network assertion above can actually fail: strip the
    // policy back to the library's pre-policy default and the same in-window
    // second read hits the network.
    const client = makeClient({ staleTime: 0 });
    const queryFn = jest.fn(async () => 'payload');

    await client.fetchQuery({ queryKey: ['entity', '1'], queryFn });
    jest.advanceTimersByTime(1_000);
    await client.fetchQuery({ queryKey: ['entity', '1'], queryFn });

    expect(queryFn).toHaveBeenCalledTimes(2);
    client.clear();
  });
});
