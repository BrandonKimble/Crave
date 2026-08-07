# Reddit API Integration Module

Reddit API client for the Crave Search application. It reads **public listings
only** (posts, comments, keyword search) and does not act on behalf of any
account.

> This file deliberately does NOT enumerate the service's methods or copy their
> signatures — a method census rots the moment the code changes (an earlier
> version of this README documented seven methods that no longer existed and an
> auth grant that had caused a production outage). **`reddit.service.ts` is the
> source of truth for the surface; read it.** Only facts that cannot rot live
> here.

## Authentication — `client_credentials` (app-only), NOT password grant

The service authenticates with the OAuth2 **`client_credentials`** grant
(installed/app-only). It needs a client id and secret; it does **not** need a
Reddit account username or password.

This is load-bearing history, not trivia (see the long comment at
`reddit.service.ts` `authenticate()`): the module previously used the
**password grant**, which had started returning `HTTP 200` with
`{"error":"invalid_grant"}` from every network. The missing error check stamped
that "authentication successful" and all downstream collection died with
generic failures. It was replaced with `client_credentials` on 2026-07-24. Do
not reintroduce the password grant. Reddit answers grant failures with `200` +
`{"error": …}`, so a `200` is only success once a token actually exists —
`authenticate()` enforces exactly that.

Required configuration (via NestJS `ConfigService`, defined in
`src/config/configuration.ts`):

```env
REDDIT_CLIENT_ID=your_reddit_app_client_id
REDDIT_CLIENT_SECRET=your_reddit_app_client_secret
REDDIT_USER_AGENT=web:threadsift:v1.0.0 (by /u/threadsift)
```

`REDDIT_USERNAME` survives only as User-Agent attribution; `validateConfig`
does not require username/password.

## The one governed pool (§12.5 / §14.8)

Every vendor HTTP call — auth, `/api/v1/me`, every listing/search — is exactly
**one governed draw** on the `reddit.requests` pool through the single
`makeRequest` chokepoint. There is no second rate-limit window in this module;
admission, the vendor-header alignment (`x-ratelimit-*`), and 429 poisoning all
happen at that chokepoint. A governance denial surfaces as the typed not-now
(`RedditGovernanceDenialError`) and is never rebranded as an API error or
swallowed into an empty success (§12.3).

## Error handling

Failures surface as specific exception types (see `reddit.exceptions.ts`):
`RedditAuthenticationError`, `RedditRateLimitError` (carries `retryAfter`),
`RedditNetworkError`, `RedditConfigurationError`,
`RedditGovernanceDenialError`, and the generic `RedditApiError`. A malformed
post-comments listing is a fault, not "no comments" — it throws `RedditApiError`
via the shared `assertPostCommentsListing` guard.

## Module structure

```
reddit/
├── reddit.module.ts         # NestJS module definition
├── reddit.service.ts        # Core Reddit API service (the surface of record)
├── reddit.exceptions.ts     # Custom exception classes
├── reddit-data-filter.ts    # Single-pass Reddit listing → LLM-format transform
├── reddit.service.spec.ts   # Unit tests
└── README.md                # This documentation
```

## Testing

```bash
npm run test -- reddit.service.spec.ts
```
