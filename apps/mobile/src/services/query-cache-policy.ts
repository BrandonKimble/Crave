/**
 * THE CACHE POLICY, stated once (data-tier rederivation, industry-frontier
 * audit items 1/4 under OA8 — 2026-08-08).
 *
 * Twenty-eight useQuery sites had invented a staleTime spread (0 / 20s / 30s /
 * 60s / 300s) that was per-author habit, not policy, and every one of them
 * evicted five minutes after its screen unmounted — SHORTER than the track's
 * own retention window, so a warm-LOOKING revisit refetched behind the frozen
 * body. The classes below are derived from the census in
 * plans/data-image-tier-rederivation.md Part 1, not invented.
 *
 * The layering rule (so this never double-solves with OA8's frozen bodies):
 * the track's last-good body is the PIXEL SWR — it owns what paints and when.
 * react-query is the DATA SWR — it owns what the parts hooks read and when the
 * network runs. The track never waits on this cache to paint, and this cache
 * never drives paint timing.
 *
 * ENTITY is the app-wide DEFAULT (wired in App.tsx); the other classes opt
 * down EXPLICITLY at their sites, so a bare useQuery reads as "content" and
 * anything else reads as a decision.
 */

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

export type QueryCachePolicyClass = {
  /** How long a cached read is served without ANY network. */
  staleTime: number;
  /** How long an unobserved entry survives before eviction. */
  gcTime: number;
};

/**
 * ENTITY — content: profiles, restaurant gallery/mentions, list meta/detail,
 * photo strips, dish suggestions. Changes slowly; the user-felt win is "back
 * within the session never refetches visibly", so retention is a day, not the
 * library's five minutes.
 */
export const ENTITY_CACHE_POLICY: QueryCachePolicyClass = {
  staleTime: MINUTE_MS,
  gcTime: 24 * HOUR_MS,
};

/**
 * VIEWER-STATE — gating and ownership facts: access summary, list
 * memberships/hearts, the viewer's lists, blocks. Correctness-sensitive, so
 * the stale window stays SHORT (the census's 20s floor; a site may keep its
 * existing 30-60s window per the plan's "keep current" — annotate it there),
 * but eviction at five minutes was pointless: an hour of retention costs
 * nothing and keeps a revisit warm.
 */
export const VIEWER_STATE_CACHE_POLICY: QueryCachePolicyClass = {
  staleTime: 20 * SECOND_MS,
  gcTime: HOUR_MS,
};

/**
 * LIVE — messaging inbox/requests/conversation/messages. staleTime 0 is
 * DELIBERATE, not an omission: in the mount-once world, staleTime 0 makes
 * react-query refetch on RESUBSCRIBE (the become-visible edge) — the
 * retained-tree equivalent of the old refetchOnMount 'always'
 * (MessagingPanels.tsx contract). This class exists so that 0 reads as a
 * decision with a name.
 */
export const LIVE_CACHE_POLICY: QueryCachePolicyClass = {
  staleTime: 0,
  gcTime: HOUR_MS,
};

/**
 * FEED — polls and home feed slices. Their 639-line controllers stay the
 * orchestrators (sockets, retry ladder, toggle engine); the cache becomes
 * their retention + persistence SUBSTRATE in the later hybrid slice
 * (controller fetches via queryClient.fetchQuery, seeds from getQueryData on
 * mount). No useQuery site wears this class yet — the constants are stated
 * now so the hybrid slice imports policy instead of inventing numbers.
 */
export const FEED_CACHE_POLICY: QueryCachePolicyClass = {
  staleTime: 30 * SECOND_MS,
  gcTime: 24 * HOUR_MS,
};

/**
 * The QueryClient defaults App.tsx spreads in. Default = ENTITY by policy:
 * most reads are content, and the exceptional classes opt down at their own
 * sites where the exception is legible.
 */
export const QUERY_CLIENT_DEFAULT_QUERY_OPTIONS = {
  staleTime: ENTITY_CACHE_POLICY.staleTime,
  gcTime: ENTITY_CACHE_POLICY.gcTime,
} as const;
