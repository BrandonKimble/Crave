import { of, throwError } from 'rxjs';
import { RedditService, REDDIT_REQUESTS_POOL } from './reddit.service';
import {
  RedditApiError,
  RedditGovernanceDenialError,
  RedditRateLimitError,
} from './reddit.exceptions';

/**
 * §12.5 client-rewrite specs: ONE makeRequest chokepoint; every vendor HTTP
 * call = one governed draw (per-REQUEST admission); denials retry THROUGH the
 * governor and surface as the typed not-now; an upstream 429 poisons the ONE
 * pool window and is an ERROR outcome (never an empty success — §12.3); the
 * status read comes from the pool (no second window).
 */

type DrawOutcome =
  | { admitted: true; value: unknown }
  | {
      admitted: false;
      denial: { reason: string; retryAfterMs: number | null };
    };

function buildService(options: { deny?: boolean } = {}) {
  const draws: string[] = [];
  const governance = {
    drawWithOutcome: jest.fn(
      async (
        _pool: string,
        workClass: string,
        act: () => Promise<unknown>,
      ): Promise<DrawOutcome> => {
        draws.push(workClass);
        if (options.deny) {
          // retryAfterMs 1 keeps the through-the-governor retry loop fast.
          return {
            admitted: false,
            denial: { reason: 'exhausted', retryAfterMs: 1 },
          };
        }
        return { admitted: true, value: await act() };
      },
    ),
    pools: {
      poisonWindow: jest.fn(),
      poolStatus: jest.fn().mockReturnValue({
        limit: 100,
        used: 4,
        reservedOutstanding: 0,
        resetMs: 30_000,
        poisonedForMs: null,
      }),
    },
  };
  const httpService = {
    get: jest.fn(),
    post: jest.fn().mockReturnValue(
      of({
        data: {
          access_token: 'token-1',
          token_type: 'bearer',
          expires_in: 3600,
          scope: '*',
        },
      }),
    ),
  };
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        'reddit.clientId': 'id',
        'reddit.clientSecret': 'secret',
        'reddit.username': 'user',
        'reddit.password': 'pass',
        'reddit.userAgent': 'CraveTest/1.0',
      };
      return values[key];
    }),
  };
  const logger = {
    setContext: jest.fn().mockReturnThis(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const service = new RedditService(
    httpService as never,
    configService as never,
    governance as never,
    logger as never,
  );
  service.onModuleInit();
  return { service, governance, httpService, draws };
}

const listingPage = (
  posts: Array<Record<string, unknown>>,
  after: string | null = null,
) =>
  of({ data: { data: { children: posts.map((p) => ({ data: p })), after } } });

describe('RedditService (§12.5 per-request governed draws)', () => {
  it('every vendor HTTP call is exactly one governed draw at the chokepoint (auth = its own enumerated draw)', async () => {
    const h = buildService();
    h.httpService.get.mockReturnValue(listingPage([{ id: 'a' }]));
    await h.service.searchByKeyword('austinfood', 'brisket');
    expect(h.draws).toEqual(['reddit.auth', 'keyword_entity_search']);
  });

  it('a denial retries THROUGH the governor (new draws) then surfaces the typed not-now', async () => {
    const h = buildService({ deny: true });
    await expect(
      h.service.searchByKeyword('austinfood', 'brisket'),
    ).rejects.toBeInstanceOf(RedditGovernanceDenialError);
    // 3 attempts = 3 NEW draws (a retry is never a free replay).
    expect(h.governance.drawWithOutcome).toHaveBeenCalledTimes(3);
  });

  it('an upstream 429 poisons the ONE pool window and is an ERROR outcome — never an empty success (§12.3)', async () => {
    const h = buildService();
    h.httpService.get.mockReturnValue(
      throwError(() => ({
        response: { status: 429, headers: { 'retry-after': '7' } },
      })),
    );
    await expect(
      h.service.getChronologicalPosts('austinfood', 1_000_000, 100),
    ).rejects.toBeInstanceOf(RedditRateLimitError);
    expect(h.governance.pools.poisonWindow).toHaveBeenCalledWith(
      REDDIT_REQUESTS_POOL,
      7_000,
    );
  });

  it('chronological overlap: a non-sticky post at/older than the cursor CONFIRMS coverage and stops paging', async () => {
    const cursor = 1_000_000;
    const h = buildService();
    h.httpService.get.mockReturnValue(
      listingPage(
        [
          { id: 'new1', created_utc: cursor + 50 },
          { id: 'old1', created_utc: cursor - 10, stickied: false },
        ],
        't3_next',
      ),
    );
    const result = await h.service.getChronologicalPosts(
      'austinfood',
      cursor,
      1000,
    );
    expect(result.metadata.overlapConfirmed).toBe(true);
    // Early break: covered ground is never re-paid.
    expect(result.performance.apiCallsUsed).toBe(1);
    expect(result.data.map((p) => p.id)).toEqual(['new1']);
  });

  it('a STICKIED old post never fakes an overlap; listing-end without overlap reads false (the §10 miss input)', async () => {
    const cursor = 1_000_000;
    const h = buildService();
    h.httpService.get.mockReturnValue(
      listingPage(
        [
          { id: 'sticky', created_utc: cursor - 500, stickied: true },
          { id: 'new1', created_utc: cursor + 50 },
        ],
        null,
      ),
    );
    const result = await h.service.getChronologicalPosts(
      'austinfood',
      cursor,
      1000,
    );
    expect(result.metadata.overlapConfirmed).toBe(false);
  });

  it('F4903: a malformed comments listing THROWS in fetchRecentCommentIds — never an empty success (same verdict as its sibling)', async () => {
    const h = buildService();
    // Length-1 body: a vendor/transport fault, not "no new comments". Both the
    // probe and getRawPostWithComments route through assertPostCommentsListing,
    // so neither can read this as an empty success.
    h.httpService.get.mockReturnValue(of({ data: [{}] }));
    await expect(
      h.service.fetchRecentCommentIds('austinfood', 'abc123', 25),
    ).rejects.toBeInstanceOf(RedditApiError);
    await expect(
      h.service.getRawPostWithComments('austinfood', 'abc123'),
    ).rejects.toBeInstanceOf(RedditApiError);
  });

  it('F4904: batch totalApiCalls is DERIVED — successes plus failed attempts, not the success count', async () => {
    const h = buildService();
    // Two entities: first search succeeds, second throws a non-governance
    // vendor error → 1 success + 1 failure = 2 vendor calls, not 1.
    h.httpService.get
      .mockReturnValueOnce(of({ data: { children: [{ data: { id: 'p1' } }] } }))
      .mockReturnValueOnce(
        throwError(() => ({ response: { status: 500, data: {} } })),
      );
    const result = await h.service.batchEntityKeywordSearch(
      'austinfood',
      ['brisket', 'tacos'],
      { batchDelay: 0 },
    );
    expect(result.metadata.successfulSearches).toBe(1);
    expect(result.metadata.failedSearches).toBe(1);
    expect(result.performance.totalApiCalls).toBe(2);
  });

  it('getRateLimitStatus reads the governor pool — no second window', async () => {
    const h = buildService();
    const status = await h.service.getRateLimitStatus();
    expect(h.governance.pools.poolStatus).toHaveBeenCalledWith(
      REDDIT_REQUESTS_POOL,
    );
    expect(status).toMatchObject({
      allowed: true,
      currentUsage: 4,
      limit: 100,
    });
  });
});
