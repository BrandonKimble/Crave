/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { AxiosError } from 'axios';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  RedditApiError,
  RedditAuthenticationError,
  RedditConfigurationError,
  RedditGovernanceDenialError,
  RedditRateLimitError,
  RedditNetworkError,
} from './reddit.exceptions';

import {
  RetryOptions,
  RateLimitResponse,
} from '../shared/external-integrations.types';
import { GovernanceService } from '../governance/governance.service';
import type { PoolDenial } from '../governance/pool-registry';

/**
 * §14.1: the reddit vendor adapter's pool, declared at the client chokepoint
 * (registered in GovernanceService; the collector adapter re-exports this
 * name). ONE pool, ONE ledger for every reddit request (§14.8).
 */
export const REDDIT_REQUESTS_POOL = 'reddit.requests';

export interface RedditConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  userAgent: string;
  timeout: number;
  retryOptions: RetryOptions;
}

export interface RedditTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface ConnectionStabilityMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastConnectionCheck: Date;
  connectionStatus: 'healthy' | 'degraded' | 'failed';
}

export interface RedditPost {
  id: string;
  title: string;
  content: string;
  author: string;
  subreddit: string;
  url: string;
  upvotes: number;
  createdAt: Date;
  commentCount: number;
  sourceType: 'post';
}

export interface RedditComment {
  id: string;
  content: string;
  author: string;
  subreddit: string;
  url: string;
  upvotes: number;
  createdAt: Date;
  parentId?: string;
  sourceType: 'comment';
}

export interface KeywordSearchResponse {
  posts: RedditPost[];
  comments: RedditComment[];
  metadata: {
    subreddit: string;
    entityName: string;
    searchQuery: string;
    searchOptions: {
      sort?: 'relevance' | 'new' | 'hot' | 'top' | 'comments';
      limit?: number;
      timeFilter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    };
    totalPosts: number;
    totalComments: number;
    totalItems: number;
    searchTimestamp: Date;
    collectedSorts: Array<'relevance' | 'new' | 'hot' | 'top' | 'comments'>;
  };
  performance: {
    searchDuration: number;
    apiCallsUsed: number;
    rateLimitStatus: RateLimitResponse;
  };
  attribution: {
    postUrls: string[];
    commentUrls: string[];
  };
}

export interface BatchKeywordSearchResponse {
  results: Record<string, KeywordSearchResponse>;
  errors: Record<string, string>;
  metadata: {
    subreddit: string;
    entityNames: string[];
    searchOptions: {
      sort?: 'relevance' | 'new' | 'hot' | 'top' | 'comments';
      limit?: number;
      timeFilter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
      batchDelay?: number;
    };
    totalEntities: number;
    successfulSearches: number;
    failedSearches: number;
    totalPosts: number;
    totalComments: number;
    batchTimestamp: Date;
  };
  performance: {
    batchDuration: number;
    averageSearchTime: number;
    totalApiCalls: number;
    rateLimitStatus: RateLimitResponse;
  };
}

export interface PerformanceMetrics {
  requestCount: number;
  totalResponseTime: number;
  averageResponseTime: number;
  lastReset: Date;
  rateLimitHits: number;
}

export interface HistoricalDataParams {
  before?: string; // Reddit fullname (t3_xxx for posts)
  after?: string; // Reddit fullname
  limit?: number; // Max 100 for most endpoints
  t?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'; // Time period for 'top' sort
}

export interface HistoricalDataResult {
  posts: any[];
  metadata: {
    totalRetrieved: number;
    timeDepth: string;
    retrievalMethod: string;
    completenessRatio: number;
    averagePostAge: number;
    dataQualityScore: number;
  };
  performance: {
    responseTime: number;
    apiCallsUsed: number;
    rateLimitHit: boolean;
  };
  limitations: {
    hitHardLimit: boolean;
    maxItemsReturned: number;
    missingDataGaps: string[];
  };
}

export interface StreamingOptions {
  limit?: number; // Comments per request (max 100)
  sort?: 'new' | 'old' | 'top' | 'controversial';
  time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  after?: string; // Pagination cursor
  refreshInterval?: number; // For real-time monitoring (ms)
  maxPages?: number; // Limit for historical access
}

export interface RedditCommentStream {
  kind: 'Listing';
  data: {
    children: RedditStreamComment[];
    after: string | null;
    before: string | null;
    dist: number;
    modhash: string;
  };
}

export interface RedditStreamComment {
  kind: 't1';
  data: {
    id: string;
    parent_id: string;
    link_id: string;
    author: string;
    body: string;
    body_html: string;
    created_utc: number;
    score: number;
    ups: number;
    downs: number;
    subreddit: string;
    subreddit_id: string;
    permalink: string;
    link_title: string;
    link_permalink: string;
    is_submitter: boolean;
    distinguished: string | null;
    stickied: boolean;
    depth?: number;
    replies?: RedditCommentStream;
  };
}

export interface StreamingMetrics {
  totalCommentsRetrieved: number;
  uniquePostsCovered: number;
  averageCommentsPerPost: number;
  streamingDuration: number;
  commentsPerSecond: number;
  lastCommentTimestamp: number;
  gapDetection: boolean;
  duplicateComments: number;
}

interface RedditListingChild<T extends Record<string, unknown>> {
  data?: T;
  [key: string]: unknown;
}

interface RedditListingResponse<T extends Record<string, unknown>> {
  data?: {
    children?: RedditListingChild<T>[];
    after?: string | null;
  };
}

type RedditPostData = Record<string, unknown> & {
  created_utc?: number;
};

function extractChildData<T extends Record<string, unknown>>(
  child: RedditListingChild<T>,
): T | null {
  return typeof child.data === 'object' && child.data !== null
    ? child.data
    : null;
}

export interface CollectionMethodResult<T = Record<string, unknown>> {
  data: T[];
  metadata: {
    totalRetrieved: number;
    rateLimitStatus: RateLimitResponse;
    costIncurred: number;
    timeDepth?: string;
    completenessRatio?: number;
    /** §10 saturation detector input (chronological only): true when the
     *  fetch saw ≥1 non-sticky post at/older than the cursor — timestamp
     *  overlap CONFIRMS the window reached back to covered ground. false =
     *  the listing's reach ended before the cursor (a potential miss).
     *  undefined when no cursor was provided. */
    overlapConfirmed?: boolean;
  };
  performance: {
    responseTime: number;
    apiCallsUsed: number;
    rateLimitHit: boolean;
  };
}

@Injectable()
export class RedditService implements OnModuleInit {
  private logger!: LoggerService;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private redditConfig!: RedditConfig;
  private enabled = true;
  private performanceMetrics: PerformanceMetrics = {
    requestCount: 0,
    totalResponseTime: 0,
    averageResponseTime: 0,
    lastReset: new Date(),
    rateLimitHits: 0,
  };
  private connectionMetrics: ConnectionStabilityMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    lastConnectionCheck: new Date(),
    connectionStatus: 'healthy',
  };

  constructor(
    @Inject(HttpService) private readonly httpService: HttpService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(GovernanceService)
    private readonly governance: GovernanceService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('RedditService');
    this.redditConfig = {
      clientId: this.configService.get<string>('reddit.clientId') || '',
      clientSecret: this.configService.get<string>('reddit.clientSecret') || '',
      username: this.configService.get<string>('reddit.username') || '',
      password: this.configService.get<string>('reddit.password') || '',
      userAgent:
        this.configService.get<string>('reddit.userAgent') ||
        'CraveSearch/1.0.0',
      timeout: this.configService.get<number>('reddit.timeout') || 10000,
      retryOptions: {
        maxRetries:
          this.configService.get<number>('reddit.retryOptions.maxRetries') || 3,
        retryDelay:
          this.configService.get<number>('reddit.retryOptions.retryDelay') ||
          1000,
        retryBackoffFactor:
          this.configService.get<number>(
            'reddit.retryOptions.retryBackoffFactor',
          ) || 2.0,
      },
    };

    this.validateConfig();

    if (this.logger) {
      this.logger.info('Reddit service initialized', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'module_init',
      });
    }
  }

  private shouldRequireCredentials(): boolean {
    // COLLECTION_SCHEDULER_ENABLED is the single collection switch
    // (KEYWORD_SEARCH_ENABLED retired with the consolidated scheduler).
    return (
      (this.configService.get<string>('COLLECTION_SCHEDULER_ENABLED') ||
        process.env.COLLECTION_SCHEDULER_ENABLED ||
        '') === 'true'
    );
  }

  private validateConfig(): void {
    const missingFields: string[] = [];
    if (!this.redditConfig.clientId) missingFields.push('reddit.clientId');
    if (!this.redditConfig.clientSecret)
      missingFields.push('reddit.clientSecret');
    // username/password are NOT required since the app-only grant
    // (2026-07-24): client_credentials reads public listings without an
    // account password. REDDIT_USERNAME survives only as UA attribution.
    if (!this.redditConfig.userAgent) missingFields.push('reddit.userAgent');

    if (missingFields.length > 0) {
      const requireCredentials = this.shouldRequireCredentials();
      this.enabled = false;

      if (this.logger) {
        this.logger.warn(
          requireCredentials
            ? 'Missing required Reddit configuration'
            : 'Reddit integration disabled (missing configuration)',
          {
            correlationId: CorrelationUtils.getCorrelationId(),
            operation: 'validate_config',
            missingFields,
          },
        );
      }

      if (requireCredentials) {
        throw new RedditConfigurationError(
          `Missing required Reddit configuration: ${missingFields.join(', ')}`,
        );
      }
    }
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new RedditConfigurationError(
        'Reddit integration is disabled (missing configuration)',
      );
    }
  }

  async authenticate(): Promise<void> {
    this.assertEnabled();
    this.logger.info('Authenticating with Reddit API', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'authenticate',
    });

    try {
      const credentials = `${this.redditConfig.clientId}:${this.redditConfig.clientSecret}`;
      const encodedCredentials = Buffer.from(credentials).toString('base64');

      // §12.5: token minted on EXPIRY only; the mint is itself an enumerated
      // draw on the one reddit pool (§14.1 — provider auth/status calls are
      // enumerated draws, never free side-channels).
      //
      // APP-ONLY GRANT (2026-07-24, the production-outage root cause): the
      // old password grant had been returning HTTP 200 with
      // {"error":"invalid_grant"} (stale password or 2FA on the account) —
      // from EVERY network, not just datacenters — and the missing error
      // check below stamped it "Authentication successful", so all
      // collection died downstream with generic failures. We only READ
      // public listings; client_credentials is the correct grant, needs no
      // account password, and was live-verified from both residential and
      // Railway IPs.
      const response = await this.governedAct('reddit.auth', () =>
        firstValueFrom(
          this.httpService.post(
            'https://www.reddit.com/api/v1/access_token',
            new URLSearchParams({ grant_type: 'client_credentials' }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${encodedCredentials}`,
                'User-Agent': this.redditConfig.userAgent,
              },
            },
          ),
        ),
      );

      const tokenData = response.data as RedditTokenResponse & {
        error?: string;
      };
      // Reddit answers grant failures with HTTP 200 + {"error": ...} — a
      // 200 is NOT success until a token actually exists.
      if (!tokenData.access_token || tokenData.error) {
        throw new RedditAuthenticationError(
          'Reddit token grant rejected',
          JSON.stringify({ error: tokenData.error ?? 'no access_token' }),
        );
      }
      this.accessToken = tokenData.access_token;
      this.tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

      this.logger.info('Authentication successful', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'authenticate',
        tokenType: tokenData.token_type,
      });
    } catch (error) {
      this.accessToken = null;
      this.tokenExpiresAt = null;

      if (error instanceof RedditGovernanceDenialError) {
        // Typed not-now — never rebranded as an auth/API failure (§12.3).
        throw error;
      }
      if (error instanceof RedditAuthenticationError) {
        // Our own 200-with-error verdict above — already precise.
        this.logger.error('Authentication failed', error.message);
        throw error;
      }

      const axiosError = error as AxiosError;
      this.logger.error(
        'Authentication failed',
        axiosError.response?.data || axiosError.message,
      );

      if (axiosError.response?.status === 401) {
        throw new RedditAuthenticationError(
          'Invalid Reddit credentials',
          JSON.stringify(axiosError.response.data),
        );
      } else if (axiosError.response?.status === 429) {
        throw new RedditRateLimitError(
          'Rate limited during authentication',
          parseInt(
            String(axiosError.response.headers?.['retry-after'] || '60'),
          ),
        );
      } else if (
        axiosError.code === 'ENOTFOUND' ||
        axiosError.code === 'ECONNREFUSED'
      ) {
        throw new RedditNetworkError(
          'Network error during authentication',
          error as Error,
        );
      } else {
        throw new RedditApiError(
          'Authentication failed',
          axiosError.response?.status,
          JSON.stringify(axiosError.response?.data),
        );
      }
    }
  }

  async validateAuthentication(): Promise<boolean> {
    this.assertEnabled();
    try {
      // Routed through the ONE makeRequest chokepoint (§12.5) — /me is an
      // enumerated provider-status draw like any other request.
      const userData = await this.makeRequest<Record<string, unknown>>(
        'GET',
        'https://oauth.reddit.com/api/v1/me',
        'validate_authentication',
      );
      const username =
        typeof userData.name === 'string' ? userData.name : 'unknown';
      this.logger.info('Authentication validated for user', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'validate_authentication',
        username,
      });
      return true;
    } catch (error) {
      if (error instanceof RedditGovernanceDenialError) {
        // Not an auth verdict — the governor said not-now (§12.3).
        throw error;
      }
      const axiosError = error as AxiosError;
      this.logger.error(
        'Authentication validation failed',
        axiosError.response?.data || axiosError.message,
      );

      // Clear invalid token
      this.accessToken = null;
      this.tokenExpiresAt = null;

      return false;
    }
  }

  private isTokenValid(): boolean {
    if (!this.accessToken || !this.tokenExpiresAt) {
      return false;
    }

    // Check if token expires in less than 1 minute (buffer for safety)
    const bufferTime = 60 * 1000; // 1 minute in milliseconds
    return Date.now() < this.tokenExpiresAt.getTime() - bufferTime;
  }

  async getAuthenticatedHeaders(): Promise<Record<string, string>> {
    this.assertEnabled();
    if (!this.isTokenValid()) {
      await this.authenticate();
    }

    return {
      Authorization: `Bearer ${this.accessToken}`,
      'User-Agent': this.redditConfig.userAgent,
    };
  }

  getRedditConfig(): Omit<RedditConfig, 'clientSecret' | 'password'> {
    return {
      clientId: this.redditConfig.clientId,
      username: this.redditConfig.username,
      userAgent: this.redditConfig.userAgent,
      timeout: this.redditConfig.timeout,
      retryOptions: this.redditConfig.retryOptions,
    };
  }

  async performHealthCheck(): Promise<{
    status: string;
    details: ConnectionStabilityMetrics;
  }> {
    this.assertEnabled();
    const startTime = Date.now();
    let status = 'healthy';

    try {
      const isValid = await this.validateAuthentication();
      const responseTime = Date.now() - startTime;

      this.connectionMetrics = {
        totalRequests: this.connectionMetrics.totalRequests + 1,
        successfulRequests: isValid
          ? this.connectionMetrics.successfulRequests + 1
          : this.connectionMetrics.successfulRequests,
        failedRequests: isValid
          ? this.connectionMetrics.failedRequests
          : this.connectionMetrics.failedRequests + 1,
        averageResponseTime: responseTime,
        lastConnectionCheck: new Date(),
        connectionStatus: isValid ? 'healthy' : 'failed',
      };

      status = isValid ? 'healthy' : 'failed';
    } catch (error) {
      this.logger.error('Health check failed', error);
      this.connectionMetrics.failedRequests++;
      this.connectionMetrics.connectionStatus = 'failed';
      status = 'failed';
    }

    return {
      status,
      details: this.connectionMetrics,
    };
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return {
      ...this.performanceMetrics,
    };
  }

  getConnectionMetrics(): ConnectionStabilityMetrics {
    return {
      ...this.connectionMetrics,
    };
  }

  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      requestCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      lastReset: new Date(),
      rateLimitHits: 0,
    };
  }

  private updateRateLimitMetrics(retryAfter?: number): void {
    this.performanceMetrics.rateLimitHits++;

    this.logger.warn(`Rate limit hit for Reddit API`, {
      service: 'reddit',
      rateLimitHits: this.performanceMetrics.rateLimitHits,
      retryAfter,
    });
  }

  async getRateLimitStatus(): Promise<RateLimitResponse> {
    // ONE window: the governor's reddit.requests pool (§14.8). This is a
    // read-only snapshot — admission happens per request inside makeRequest.
    const status = this.governance.pools.poolStatus(REDDIT_REQUESTS_POOL);
    const atLimit =
      status.used + status.reservedOutstanding >= status.limit ||
      status.poisonedForMs !== null;
    const resetMs = status.poisonedForMs ?? status.resetMs ?? 60_000;
    return Promise.resolve({
      allowed: !atLimit,
      retryAfter: atLimit ? Math.ceil(resetMs / 1000) : undefined,
      currentUsage: status.used,
      limit: status.limit,
      resetTime: new Date(Date.now() + resetMs),
    });
  }

  /**
   * Get service health status
   * Compatible with BaseExternalApiService interface
   */
  getHealthStatus() {
    const successRate =
      this.performanceMetrics.requestCount > 0
        ? Math.round(
            ((this.performanceMetrics.requestCount - 0) /
              this.performanceMetrics.requestCount) *
              100,
          )
        : 100;

    const status: 'healthy' | 'degraded' | 'unhealthy' =
      successRate > 80 ? 'healthy' : 'degraded';

    return {
      service: 'reddit',
      status,
      uptime: Date.now() - this.performanceMetrics.lastReset.getTime(),
      metrics: {
        requestCount: this.performanceMetrics.requestCount,
        totalResponseTime: this.performanceMetrics.totalResponseTime,
        averageResponseTime: this.performanceMetrics.averageResponseTime,
        lastReset: this.performanceMetrics.lastReset,
        errorCount: 0, // Reddit service doesn't track this separately
        successRate: successRate,
        rateLimitHits: 0, // Reddit service doesn't track this separately
      },
      configuration: {
        timeout: this.redditConfig.timeout,
        retryOptions: this.redditConfig.retryOptions,
      },
    };
  }

  /**
   * §14.2 vendor-ledger alignment: reddit publishes its OWN window state on
   * every response (x-ratelimit-remaining, x-ratelimit-reset in seconds) —
   * the cooperative pattern is reading it every time instead of discovering
   * divergence at a 429. The vendor's ledger is truth; ours is the
   * estimate; alignment only ever tightens (see PoolRegistry.alignToVendor).
   * Fire-and-forget; malformed/absent headers are a no-op.
   */
  private alignPoolToVendorHeaders(
    headers: Record<string, unknown> | undefined,
  ): void {
    if (!headers) {
      return;
    }
    const remaining = Number(headers['x-ratelimit-remaining']);
    const resetSeconds = Number(headers['x-ratelimit-reset']);
    if (!Number.isFinite(remaining)) {
      return;
    }
    void this.governance.pools.alignToVendor(
      REDDIT_REQUESTS_POOL,
      remaining,
      Number.isFinite(resetSeconds) && resetSeconds > 0
        ? resetSeconds * 1000
        : null,
    );
  }

  private recordPerformanceMetrics(responseTime: number): void {
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.totalResponseTime += responseTime;
    this.performanceMetrics.averageResponseTime = Math.round(
      this.performanceMetrics.totalResponseTime /
        this.performanceMetrics.requestCount,
    );
  }

  /**
   * §12.5: every vendor HTTP call is exactly ONE governed draw on the
   * reddit.requests pool. A denial is retried THROUGH the governor — each
   * retry is a NEW draw and the denial's retryAfter is honored (the §12.5
   * retry-loop-through-the-governor law); exhausted attempts surface the
   * typed not-now (RedditGovernanceDenialError), never an API error and
   * never an empty success.
   */
  private async governedAct<T>(
    workClass: string,
    act: () => Promise<T>,
  ): Promise<T> {
    // §16: K3-shaped operational bounds (pacing, not product numbers).
    // 3 attempts rides out one per-minute window roll; the wait cap 65s is
    // one full minute window plus scheduling slack. Pacer-derived values
    // replace them when the estimator-refresher turns on (§22).
    const MAX_DRAW_ATTEMPTS = 3;
    const MAX_DENIAL_WAIT_MS = 65_000;
    let lastDenial: PoolDenial | null = null;
    for (let attempt = 0; attempt < MAX_DRAW_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        const waitMs = Math.min(
          lastDenial?.retryAfterMs ?? 60_000,
          MAX_DENIAL_WAIT_MS,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      const outcome = await this.governance.drawWithOutcome(
        REDDIT_REQUESTS_POOL,
        workClass,
        act,
      );
      if (outcome.admitted) {
        return outcome.value;
      }
      lastDenial = outcome.denial;
    }
    throw new RedditGovernanceDenialError(
      `reddit.requests draw denied for '${workClass}' after ${MAX_DRAW_ATTEMPTS} attempts (${lastDenial?.reason ?? 'unknown'})`,
      lastDenial?.retryAfterMs ?? null,
    );
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    operation: string,
    data?: any,
    customHeaders?: Record<string, string>,
  ): Promise<T> {
    // Auth first (its own enumerated draw), OUTSIDE this request's draw.
    const headers = await this.getAuthenticatedHeaders();
    const requestHeaders = { ...headers, ...customHeaders };

    // The ONE chokepoint (§12.5): per-request admission + actuals recording
    // happen inside this governed draw — no second window exists (§14.8).
    return this.governedAct(operation, async () => {
      const startTime = Date.now();
      try {
        const response = await firstValueFrom(
          method === 'GET'
            ? this.httpService.get(url, { headers: requestHeaders })
            : this.httpService.post(url, data, { headers: requestHeaders }),
        );

        const responseTime = Date.now() - startTime;
        this.recordPerformanceMetrics(responseTime);

        this.alignPoolToVendorHeaders(response.headers);
        return response.data as T;
      } catch (error) {
        const responseTime = Date.now() - startTime;
        this.recordPerformanceMetrics(responseTime);

        const axiosError = error as AxiosError;
        this.alignPoolToVendorHeaders(axiosError.response?.headers);
        if (axiosError.response?.status === 429) {
          const retryAfter = parseInt(
            String(axiosError.response.headers?.['retry-after'] || '60'),
          );

          // §14.5/§14.8: the upstream 429 poisons the ONE pool window —
          // retryAfter is honored globally through the governor, and any
          // retry of this request is a new (denied-until-reset) draw.
          this.governance.pools.poisonWindow(
            REDDIT_REQUESTS_POOL,
            retryAfter * 1000,
          );

          this.updateRateLimitMetrics(retryAfter);
          throw new RedditRateLimitError(
            'Rate limited by Reddit API',
            retryAfter,
          );
        } else if (
          axiosError.code === 'ENOTFOUND' ||
          axiosError.code === 'ECONNREFUSED'
        ) {
          throw new RedditNetworkError(
            'Network error during API request',
            error as Error,
          );
        } else {
          // Attribution before ideation (Railway cutover 2026-07-24): the
          // generic message swallowed status/body all the way up the worker
          // logs — log the vendor's actual answer at the chokepoint.
          this.logger.error('Reddit API request failed (chokepoint detail)', {
            url,
            status: axiosError.response?.status ?? null,
            code: axiosError.code ?? null,
            data: JSON.stringify(axiosError.response?.data)?.slice(0, 300),
          });
          throw new RedditApiError(
            'API request failed',
            axiosError.response?.status,
            JSON.stringify(axiosError.response?.data),
          );
        }
      }
    });
  }

  /**
   * Chronological Collection Cycle - PRD Section 5.1.2
   * Fetch all recent posts chronologically using /r/subreddit/new
   * Implements dynamic scheduling based on posting volume
   */
  async getChronologicalPosts(
    subreddit: string,
    lastProcessedTimestamp?: number,
    limit = 100,
  ): Promise<CollectionMethodResult<RedditPostData>> {
    this.logger.info('Fetching chronological posts for real-time collection', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'chronological_collection',
      subreddit,
      lastProcessedTimestamp,
      limit,
    });

    const startTime = Date.now();
    const rateLimitStatus = await this.getRateLimitStatus();

    // Reddit API has a hard limit of 100 posts per request
    // To get up to 1000 posts (Reddit's max accessible), we need pagination
    const postsPerPage = 100;
    const totalPages = Math.ceil(Math.min(limit, 1000) / postsPerPage);

    let allPosts: RedditPostData[] = [];
    let after: string | null = null;
    let apiCallsUsed = 0;
    // §10 overlap detector: a non-sticky post at/older than the cursor
    // proves the fetch reached covered ground (stickies pin OLD posts to the
    // top of /new and must never fake an overlap).
    let overlapConfirmed = false;

    // §12.3: a rate limit or governance denial mid-pagination PROPAGATES —
    // it is an error/not-now outcome, never an empty success (an empty
    // success here would let a rate limit brand a window as covered).
    for (let page = 0; page < totalPages; page++) {
      // Build URL with pagination
      const pageLimit = Math.min(postsPerPage, limit - allPosts.length);
      let url = `https://oauth.reddit.com/r/${subreddit}/new?limit=${pageLimit}`;
      if (after) {
        url += `&after=${after}`;
      }

      const response = await this.makeRequest<
        RedditListingResponse<RedditPostData>
      >('GET', url, 'chronological_collection');

      apiCallsUsed++;
      const pagePosts =
        response.data?.children
          ?.map((child) => extractChildData(child))
          .filter((post): post is RedditPostData => post !== null) ?? [];

      if (pagePosts.length === 0) {
        // No more posts available
        break;
      }

      // Filter posts by timestamp if provided
      const filteredPosts = lastProcessedTimestamp
        ? pagePosts.filter((post) => {
            const postTime = post.created_utc;
            return (
              typeof postTime === 'number' && postTime > lastProcessedTimestamp
            );
          })
        : pagePosts;

      allPosts.push(...filteredPosts);

      if (lastProcessedTimestamp) {
        overlapConfirmed =
          overlapConfirmed ||
          pagePosts.some(
            (post) =>
              post.stickied !== true &&
              typeof post.created_utc === 'number' &&
              post.created_utc <= lastProcessedTimestamp,
          );
        if (overlapConfirmed) {
          // /new is newest-first: everything past the overlap is already
          // covered ground — stop paying for pages we will filter out.
          break;
        }
      }

      // Check if we've collected enough posts
      if (allPosts.length >= limit) {
        allPosts = allPosts.slice(0, limit);
        break;
      }

      // Get the "after" token for next page
      after = response.data?.after || null;

      if (!after) {
        // No more pages available
        break;
      }

      // Add a small delay between requests to be respectful
      if (page < totalPages - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const responseTime = Date.now() - startTime;

    // Transform Reddit API response to flatten the data structure
    const transformedPosts = allPosts;

    this.logger.info('Chronological collection completed', {
      correlationId: CorrelationUtils.getCorrelationId(),
      subreddit,
      requestedLimit: limit,
      actualRetrieved: transformedPosts.length,
      pagesUsed: apiCallsUsed,
      overlapConfirmed: lastProcessedTimestamp ? overlapConfirmed : undefined,
      responseTime,
    });

    return {
      data: transformedPosts,
      metadata: {
        totalRetrieved: transformedPosts.length,
        rateLimitStatus,
        costIncurred: 0, // Reddit is free within rate limits
        completenessRatio: transformedPosts.length / Math.min(limit, 1000),
        ...(lastProcessedTimestamp ? { overlapConfirmed } : {}),
      },
      performance: {
        responseTime,
        apiCallsUsed,
        rateLimitHit: false,
      },
    };
  }

  /**
   * Keyword Entity Search Cycle - PRD Section 5.1.2
   * Search using /r/subreddit/search?q={entity}&sort=relevance&limit=1000
   * Implements targeted historical enrichment for specific entities
   */
  async searchByKeyword(
    subreddit: string,
    keyword: string,
    options: {
      sort?: 'relevance' | 'new' | 'top';
      limit?: number;
      timeframe?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    } = {},
  ): Promise<CollectionMethodResult<RedditPostData>> {
    const { sort = 'relevance', limit = 100, timeframe = 'all' } = options;

    this.logger.info('Searching by keyword for entity enrichment', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'keyword_entity_search',
      subreddit,
      keyword,
      sort,
      limit,
      timeframe,
    });

    const startTime = Date.now();
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://oauth.reddit.com/r/${subreddit}/search?q=${encodedKeyword}&sort=${sort}&limit=${Math.min(
      limit,
      100,
    )}&t=${timeframe}&restrict_sr=1`;

    const rateLimitStatus = await this.getRateLimitStatus();

    // §12.3: rate limits/denials PROPAGATE — a rate limit can never brand a
    // term no_results via an empty success.
    const response = await this.makeRequest<
      RedditListingResponse<RedditPostData>
    >('GET', url, 'keyword_entity_search');

    const posts =
      response.data?.children
        ?.map((child) => extractChildData(child))
        .filter((post): post is RedditPostData => post !== null) ?? [];
    const responseTime = Date.now() - startTime;

    return {
      data: posts,
      metadata: {
        totalRetrieved: posts.length,
        rateLimitStatus,
        costIncurred: 0, // Reddit is free within rate limits
        completenessRatio: posts.length >= limit ? 1.0 : posts.length / limit,
      },
      performance: {
        responseTime,
        apiCallsUsed: 1,
        rateLimitHit: false,
      },
    };
  }

  /**
   * Get raw Reddit API response for single-pass processing
   * Returns unfiltered response for optimal single-pass transformation
   */
  async getRawPostWithComments(
    subreddit: string,
    postId: string,
    options: {
      limit?: number;
      sort?: 'new' | 'old' | 'top' | 'controversial';
      depth?: number;
    } = {},
  ): Promise<{
    rawResponse: any[];
    metadata: {
      retrievalMethod: string;
      rateLimitStatus: RateLimitResponse;
    };
    performance: {
      responseTime: number;
      apiCallsUsed: number;
      rateLimitHit: boolean;
    };
    attribution: {
      postUrl: string;
    };
  }> {
    const { limit = 500, sort = 'top', depth = null } = options;

    this.logger.info(
      'Fetching raw post with comment thread for single-pass processing',
      {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'get_raw_post_with_comments',
        subreddit,
        postId,
        limit,
        sort,
        depth,
      },
    );

    const startTime = Date.now();
    const url = `https://oauth.reddit.com/r/${subreddit}/comments/${postId}?limit=${limit}&sort=${sort}${
      depth !== null ? `&depth=${depth}` : ''
    }`;

    const rateLimitStatus = await this.getRateLimitStatus();

    // §12.3: rate limits/denials PROPAGATE — an empty rawResponse success
    // would silently drop a paid-for thread.
    const response = await this.makeRequest<any[]>(
      'GET',
      url,
      'get_raw_post_with_comments',
    );

    if (!response || !Array.isArray(response) || response.length < 2) {
      throw new RedditApiError('Invalid response format for post retrieval');
    }

    const responseTime = Date.now() - startTime;

    // Extract post permalink for URL generation
    const postData = response[0]?.data?.children?.[0]?.data;
    const postUrl = `https://reddit.com${
      postData?.permalink || `/r/${subreddit}/comments/${postId}`
    }`;

    return {
      rawResponse: response,
      metadata: {
        retrievalMethod: 'reddit_api_raw_response',
        rateLimitStatus,
      },
      performance: {
        responseTime,
        apiCallsUsed: 1,
        rateLimitHit: false,
      },
      attribution: {
        postUrl,
      },
    };
  }

  /**
   * Content Retrieval Pipeline - PRD Section 5.1.2
   * Fetch complete posts with comment threads from Reddit API
   * Returns raw response for single-pass processing
   */
  async getCompletePostWithComments(
    subreddit: string,
    postId: string,
    options: {
      limit?: number;
      sort?: 'new' | 'old' | 'top' | 'controversial';
      depth?: number;
    } = {},
  ): Promise<{
    rawResponse: any[];
    metadata: {
      retrievalMethod: string;
      rateLimitStatus: RateLimitResponse;
    };
    performance: {
      responseTime: number;
      apiCallsUsed: number;
      rateLimitHit: boolean;
    };
    attribution: {
      postUrl: string;
    };
  }> {
    // Delegate to the optimized raw response method
    return this.getRawPostWithComments(subreddit, postId, options);
  }

  async fetchRecentCommentIds(
    subreddit: string,
    postId: string,
    limit: number,
    correlationId?: string,
  ): Promise<string[]> {
    if (limit <= 0) {
      return [];
    }

    const cappedLimit = Math.min(Math.max(limit, 1), 100);
    const url = `https://oauth.reddit.com/r/${subreddit}/comments/${postId}?sort=new&limit=${cappedLimit}&depth=1`;
    const corrId = correlationId ?? CorrelationUtils.getCorrelationId();

    this.logger.debug('Fetching recent comment IDs for probe', {
      correlationId: corrId,
      operation: 'fetch_recent_comment_ids',
      subreddit,
      postId,
      limit: cappedLimit,
    });

    try {
      const response = await this.makeRequest<any[]>(
        'GET',
        url,
        'fetch_recent_comment_ids',
      );

      if (!Array.isArray(response) || response.length < 2) {
        return [];
      }

      const commentListing = response[1]?.data?.children ?? [];
      const collected: string[] = [];

      const traverse = (nodes: any[]): void => {
        for (const node of nodes) {
          if (collected.length >= cappedLimit) {
            return;
          }

          if (node?.kind === 't1') {
            const name = node?.data?.name;
            if (typeof name === 'string' && name.length > 0) {
              collected.push(name);
            }
          }

          const replies = node?.data?.replies?.data?.children;
          if (Array.isArray(replies) && replies.length > 0) {
            traverse(replies);
            if (collected.length >= cappedLimit) {
              return;
            }
          }
        }
      };

      traverse(commentListing);

      return collected.slice(0, cappedLimit);
    } catch (error) {
      this.logger.warn('Failed to fetch recent comment IDs', {
        correlationId: corrId,
        operation: 'fetch_recent_comment_ids',
        subreddit,
        postId,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      throw error;
    }
  }

  /**
   * Search Reddit for posts about specific entity using keyword search
   * Implements PRD 5.1.2 keyword entity search cycles
   *
   * @param subreddit - Target subreddit (e.g., 'austinfood')
   * @param entityName - Entity name to search for
   * @param searchOptions - Search configuration options
   * @returns Promise<KeywordSearchResponse> - Search results with posts and comments
   */
  async searchEntityKeywords(
    subreddit: string,
    entityName: string,
    searchOptions: {
      sort?: 'relevance' | 'new' | 'hot' | 'top' | 'comments';
      limit?: number;
      timeFilter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    } = {},
  ): Promise<KeywordSearchResponse> {
    const startTime = Date.now();
    const correlationId = CorrelationUtils.getCorrelationId();

    this.logger.info('Starting keyword entity search', {
      correlationId,
      operation: 'search_entity_keywords',
      subreddit,
      entityName,
      searchOptions,
    });

    try {
      // Build search URL per PRD 5.1.2 specification
      const searchUrl = `https://oauth.reddit.com/r/${subreddit}/search`;
      const searchParams = new URLSearchParams({
        q: entityName,
        restrict_sr: 'true', // Restrict to subreddit
        sort: searchOptions.sort || 'relevance',
        limit: Math.min(searchOptions.limit || 1000, 1000).toString(), // PRD limit: 1000
        type: 'link', // Search posts only initially
        ...(searchOptions.timeFilter && { t: searchOptions.timeFilter }),
      });

      this.logger.debug('Executing keyword search request', {
        correlationId,
        searchUrl,
        searchParams: Object.fromEntries(searchParams.entries()),
      });

      // §12.5: through the ONE makeRequest chokepoint — token minted on
      // expiry only inside it, admission = this request's governed draw.
      const response = await this.makeRequest<{
        data?: { children?: any[] };
      }>(
        'GET',
        `${searchUrl}?${searchParams.toString()}`,
        'search_entity_keywords',
      );

      const searchData = response?.data?.children || [];
      const posts: RedditPost[] = [];

      // Process search results
      for (const child of searchData) {
        const postData = child.data;
        if (postData && postData.id) {
          const post: RedditPost = {
            id: postData.id,
            title: postData.title || '',
            content: postData.selftext || '',
            author: postData.author || '',
            subreddit: postData.subreddit || subreddit,
            url: `https://reddit.com${postData.permalink}`,
            upvotes: postData.ups || 0,
            createdAt: new Date((postData.created_utc || 0) * 1000),
            commentCount: postData.num_comments || 0,
            sourceType: 'post',
          };

          posts.push(post);
        }
      }
      const comments: RedditComment[] = [];
      const commentUrls: string[] = [];

      const duration = Date.now() - startTime;
      const totalItems = posts.length + comments.length;
      const sortValue: 'relevance' | 'new' | 'hot' | 'top' | 'comments' =
        searchOptions.sort ?? 'relevance';
      const normalizedSearchOptions = {
        ...searchOptions,
        sort: sortValue,
      };

      this.logger.info('Keyword entity search completed', {
        correlationId,
        operation: 'search_entity_keywords',
        subreddit,
        entityName,
        duration,
        postsFound: posts.length,
        commentsFound: comments.length,
        totalItems,
      });

      return {
        posts,
        comments,
        metadata: {
          subreddit,
          entityName,
          searchQuery: entityName,
          searchOptions: normalizedSearchOptions,
          totalPosts: posts.length,
          totalComments: comments.length,
          totalItems,
          searchTimestamp: new Date(),
          collectedSorts: [sortValue],
        },
        performance: {
          searchDuration: duration,
          apiCallsUsed: 1,
          rateLimitStatus: await this.getRateLimitStatus(),
        },
        attribution: {
          postUrls: posts.map((post) => post.url),
          commentUrls,
        },
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error('Keyword entity search failed', {
        correlationId,
        operation: 'search_entity_keywords',
        subreddit,
        entityName,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      if (
        error instanceof RedditGovernanceDenialError ||
        error instanceof RedditRateLimitError ||
        error instanceof RedditApiError
      ) {
        throw error;
      }

      throw new RedditApiError(
        `Failed to search entity keywords: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Perform batch keyword searches for multiple entities
   * Implements PRD 5.1.2 multi-entity coverage with efficient API usage
   *
   * @param subreddit - Target subreddit
   * @param entityNames - Array of entity names to search
   * @param searchOptions - Search configuration options
   * @returns Promise<BatchKeywordSearchResponse> - Batch search results
   */
  async batchEntityKeywordSearch(
    subreddit: string,
    entityNames: string[],
    searchOptions: {
      sort?: 'relevance' | 'new' | 'hot' | 'top' | 'comments';
      limit?: number;
      timeFilter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
      batchDelay?: number; // Delay between searches to respect rate limits
    } = {},
  ): Promise<BatchKeywordSearchResponse> {
    const startTime = Date.now();
    const correlationId = CorrelationUtils.getCorrelationId();
    const appEnv = (process.env.APP_ENV || process.env.CRAVE_ENV || '').trim();
    const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
    const isProd =
      appEnv.toLowerCase() === 'prod' || nodeEnv.toLowerCase() === 'production';
    const maxConsecutiveRateLimitErrors = (() => {
      if (isProd) {
        return null;
      }
      // Dev circuit breaker: abort after 3 consecutive Reddit 429s
      // (2026-07-11 fold-in: formerly env REDDIT_MAX_CONSECUTIVE_RATE_LIMITS;
      // prod stays null = never abort).
      return 3;
    })();
    let consecutiveRateLimitErrors = 0;

    this.logger.info('Starting batch keyword entity search', {
      correlationId,
      operation: 'batch_entity_keyword_search',
      subreddit,
      entityCount: entityNames.length,
      searchOptions,
      maxConsecutiveRateLimitErrors,
    });

    const results: Record<string, KeywordSearchResponse> = {};
    const errors: Record<string, string> = {};
    let successfulSearches = 0;
    let failedSearches = 0;

    try {
      for (let i = 0; i < entityNames.length; i++) {
        const entityName = entityNames[i];

        try {
          this.logger.debug(
            `Processing entity ${i + 1}/${entityNames.length}: ${entityName}`,
            {
              correlationId,
              entityName,
              progress: `${i + 1}/${entityNames.length}`,
            },
          );

          const searchResult = await this.searchEntityKeywords(
            subreddit,
            entityName,
            searchOptions,
          );

          results[entityName] = searchResult;
          successfulSearches++;
          consecutiveRateLimitErrors = 0;

          // Add delay between searches to respect rate limits (default 1 second)
          if (i < entityNames.length - 1) {
            const delay = searchOptions.batchDelay || 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } catch (entityError: unknown) {
          if (entityError instanceof RedditGovernanceDenialError) {
            // §12.3 typed not-now: abort the REMAINING requests of this
            // dispatch cleanly — never recorded as a term error (no
            // branding), the work item stays due at the caller.
            throw entityError;
          }
          const errorMessage =
            entityError instanceof Error
              ? entityError.message
              : String(entityError);
          errors[entityName] = errorMessage;
          failedSearches++;

          this.logger.warn(`Failed to search entity: ${entityName}`, {
            correlationId,
            entityName,
            error: {
              message: errorMessage,
              stack:
                entityError instanceof Error ? entityError.stack : undefined,
            },
            progress: `${i + 1}/${entityNames.length}`,
          });

          // For rate limit errors, wait longer before continuing
          if (entityError instanceof RedditRateLimitError) {
            consecutiveRateLimitErrors++;
            if (
              maxConsecutiveRateLimitErrors !== null &&
              consecutiveRateLimitErrors >= maxConsecutiveRateLimitErrors
            ) {
              this.logger.error(
                'Aborting batch keyword entity search after repeated rate limits (dev/test fail-fast)',
                {
                  correlationId,
                  subreddit,
                  consecutiveRateLimitErrors,
                  maxConsecutiveRateLimitErrors,
                },
              );
              throw new RedditRateLimitError(
                `Aborting after ${consecutiveRateLimitErrors} consecutive Reddit rate limits`,
                entityError.retryAfter,
              );
            }

            this.logger.info(
              'Rate limit hit, waiting before continuing batch',
              {
                correlationId,
                retryAfter: entityError.retryAfter,
              },
            );
            const retryAfterSeconds =
              typeof entityError.retryAfter === 'number' &&
              Number.isFinite(entityError.retryAfter) &&
              entityError.retryAfter > 0
                ? entityError.retryAfter
                : 60;
            await new Promise((resolve) =>
              setTimeout(resolve, retryAfterSeconds * 1000),
            );
          }
        }
      }

      const duration = Date.now() - startTime;
      const totalPosts = Object.values(results).reduce(
        (sum, result) => sum + result.posts.length,
        0,
      );
      const totalComments = Object.values(results).reduce(
        (sum, result) => sum + result.comments.length,
        0,
      );

      this.logger.info('Batch keyword entity search completed', {
        correlationId,
        operation: 'batch_entity_keyword_search',
        subreddit,
        duration,
        entityCount: entityNames.length,
        successfulSearches,
        failedSearches,
        totalPosts,
        totalComments,
      });

      return {
        results,
        errors,
        metadata: {
          subreddit,
          entityNames,
          searchOptions,
          totalEntities: entityNames.length,
          successfulSearches,
          failedSearches,
          totalPosts,
          totalComments,
          batchTimestamp: new Date(),
        },
        performance: {
          batchDuration: duration,
          averageSearchTime:
            successfulSearches > 0 ? duration / successfulSearches : 0,
          totalApiCalls: successfulSearches, // Approximate
          rateLimitStatus: await this.getRateLimitStatus(),
        },
      };
    } catch (error: unknown) {
      if (error instanceof RedditGovernanceDenialError) {
        // Typed not-now propagates unwrapped (§12.3) — never rebranded as an
        // API failure.
        throw error;
      }
      const duration = Date.now() - startTime;
      this.logger.error('Batch keyword entity search failed', {
        correlationId,
        operation: 'batch_entity_keyword_search',
        subreddit,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof RedditRateLimitError) {
        // §12.3: a rate limit is an ERROR outcome — surfaced as itself, not
        // rebranded, so no caller can read it as no_results.
        throw error;
      }

      throw new RedditApiError(
        `Failed to perform batch entity keyword search: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
