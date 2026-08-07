# Reddit API Integration

Reddit API client implementing PRD Section 5.1.2 collection. It reads public
listings only, through one governed rate-limit pool.

> **`reddit.service.ts` is the surface of record.** This document intentionally
> does not reproduce method signatures or an inventory of methods — a prior
> version listed seven methods that never existed (`batchCollectFromSubreddits`,
> `getCostMetrics`, `getHistoricalPosts`, `getHistoricalComments`,
> `getCommentStreamPage`, `streamSubredditComments`, `testApiEndpoints`) and a
> per-service metrics/health surface that has since been deleted. Read the
> service for what exists; only non-rotting facts live here.

## Authentication — `client_credentials`, not password grant

The service uses the OAuth2 **`client_credentials`** (app-only) grant. It needs
only a client id + secret — **no** account username/password. The password
grant it previously used had started returning `HTTP 200` +
`{"error":"invalid_grant"}` and silently killed all collection; it was replaced
on 2026-07-24 and must not return. See `authenticate()` in `reddit.service.ts`
for the full history and the `200`-is-not-success check.

## Configuration

```bash
# Required
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret

# Optional — User-Agent attribution (Reddit's anti-abuse layer wants a
# distinctive, stable UA; see configuration.ts for the exact format)
REDDIT_USER_AGENT="web:threadsift:v1.0.0 (by /u/threadsift)"
REDDIT_USERNAME=your_bot_username   # UA attribution only; not an auth credential
```

The request timeout is set once, on the `HttpModule` registration in
`reddit.module.ts` (10s). Retry/pacing bounds live where they are enforced —
the through-the-governor draw loop in `governedAct` — not as separate env vars.

```typescript
interface RedditConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  userAgent: string;
}
```

## Rate limiting — one governed pool (§12.5 / §14.8)

- Every vendor call (auth, `/api/v1/me`, listings, search) is exactly one
  governed draw on the `reddit.requests` pool via `GovernanceService`. There is
  no second window; `RateLimitCoordinatorService` has zero reddit admission
  authority.
- The 100 requests/minute ceiling is the pool's limit. Admission is per-request
  at the `makeRequest` chokepoint; a denial is retried through the governor and,
  when exhausted, surfaces as the typed `RedditGovernanceDenialError`.
- An upstream `429` poisons the pool's current window (`poisonWindow`) so the
  ceiling is honored governor-wide, and each response's `x-ratelimit-*` headers
  tighten the pool estimate toward the vendor's own ledger.
- A rate limit or governance denial **propagates** (§12.3). It is never
  rebranded as a generic API error and never swallowed into an empty success —
  an empty success would let a rate limit brand a window as covered.

## Live collection entry points

Read the signatures in `reddit.service.ts`; the four production entry points
are:

- `getChronologicalPosts(subreddit, lastProcessedTimestamp?, limit?)` — recent
  posts via `/r/{subreddit}/new`, with the §10 overlap detector.
- `batchEntityKeywordSearch(subreddit, entityNames, options?)` — keyword entity
  search via `/r/{subreddit}/search`.
- `getCompletePostWithComments(subreddit, postId, options?)` — a post and its
  comment thread (raw, for single-pass transform).
- `fetchRecentCommentIds(subreddit, postId, limit)` — a new-comments probe. A
  malformed listing throws (shared `assertPostCommentsListing`), never "no
  comments".

## Error handling

Specific exception types live in `reddit.exceptions.ts`: `RedditApiError`,
`RedditAuthenticationError`, `RedditConfigurationError`, `RedditRateLimitError`
(carries `retryAfter`), `RedditNetworkError`, `RedditGovernanceDenialError`.

## Testing

```bash
npm test reddit.service.spec.ts
```

## Architecture integration

- **GovernanceService** — the `reddit.requests` admission pool.
- **LoggerService** — structured logging with correlation ids.
- **ConfigService** — environment-based configuration.
- **HttpService** — Axios HTTP requests.
