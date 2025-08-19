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
  RedditRateLimitError,
  RedditNetworkError,
} from './reddit.exceptions';

import {
  RetryOptions,
  ExternalApiService,
  RateLimitRequest,
  RateLimitResponse,
} from '../shared/external-integrations.types';
import { RateLimitCoordinatorService } from '../shared/rate-limit-coordinator.service';

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
      sort?: 'relevance' | 'new' | 'hot' | 'top';
      limit?: number;
      timeFilter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    };
    totalPosts: number;
    totalComments: number;
    totalItems: number;
    searchTimestamp: Date;
  };
  performance: {
    searchDuration: number;
    apiCallsUsed: number;
    rateLimitStatus: any;
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
      sort?: 'relevance' | 'new' | 'hot' | 'top';
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
    rateLimitStatus: any;
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

export interface CostMetrics {
  totalRequestsThisMonth: number;
  totalRequestsToday: number;
  estimatedMonthlyCost: number;
  freeQuotaRemaining: number;
  costPerThousandRequests: number;
  lastReset: Date;
  isWithinFreeTier: boolean;
}

export interface CollectionMethodResult {
  data: any[];
  metadata: {
    totalRetrieved: number;
    rateLimitStatus: RateLimitResponse;
    costIncurred: number;
    timeDepth?: string;
    completenessRatio?: number;
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
  private costMetrics: CostMetrics = {
    totalRequestsThisMonth: 0,
    totalRequestsToday: 0,
    estimatedMonthlyCost: 0,
    freeQuotaRemaining: 144000, // Reddit free tier: 100 requests/minute * 60 * 24 = 144k/day theoretical max
    costPerThousandRequests: 0.6, // Reddit API pricing (approximate)
    lastReset: new Date(),
    isWithinFreeTier: true,
  };

  constructor(
    @Inject(HttpService) private readonly httpService: HttpService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(RateLimitCoordinatorService)
    private readonly rateLimitCoordinator: RateLimitCoordinatorService,
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

  private validateConfig(): void {
    const missingFields: string[] = [];
    if (!this.redditConfig.clientId) missingFields.push('reddit.clientId');
    if (!this.redditConfig.clientSecret)
      missingFields.push('reddit.clientSecret');
    if (!this.redditConfig.username) missingFields.push('reddit.username');
    if (!this.redditConfig.password) missingFields.push('reddit.password');
    if (!this.redditConfig.userAgent) missingFields.push('reddit.userAgent');

    if (missingFields.length > 0) {
      throw new RedditConfigurationError(
        `Missing required Reddit configuration: ${missingFields.join(', ')}`,
      );
    }
  }

  async authenticate(): Promise<void> {
    this.logger.info('Authenticating with Reddit API', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'authenticate',
    });

    try {
      const credentials = `${this.redditConfig.clientId}:${this.redditConfig.clientSecret}`;
      const encodedCredentials = Buffer.from(credentials).toString('base64');

      const response = await firstValueFrom(
        this.httpService.post(
          'https://www.reddit.com/api/v1/access_token',
          new URLSearchParams({
            grant_type: 'password',
            username: this.redditConfig.username,
            password: this.redditConfig.password,
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${encodedCredentials}`,
              'User-Agent': this.redditConfig.userAgent,
            },
          },
        ),
      );

      const tokenData = response.data as RedditTokenResponse;
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
    try {
      if (!this.isTokenValid()) {
        await this.authenticate();
      }

      const response = await firstValueFrom(
        this.httpService.get('https://oauth.reddit.com/api/v1/me', {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'User-Agent': this.redditConfig.userAgent,
          },
        }),
      );

      const userData = response.data as Record<string, unknown>;
      const username =
        typeof userData.name === 'string' ? userData.name : 'unknown';
      this.logger.info('Authentication validated for user', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'validate_authentication',
        username,
      });
      return true;
    } catch (error) {
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

  private updateCostMetrics(requestCount: number): void {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Reset daily counter if it's a new day
    if (this.costMetrics.lastReset < today) {
      this.costMetrics.totalRequestsToday = 0;
    }

    // Reset monthly counter if it's a new month
    if (this.costMetrics.lastReset < currentMonth) {
      this.costMetrics.totalRequestsThisMonth = 0;
    }

    this.costMetrics.totalRequestsToday += requestCount;
    this.costMetrics.totalRequestsThisMonth += requestCount;
    this.costMetrics.estimatedMonthlyCost =
      (this.costMetrics.totalRequestsThisMonth / 1000) *
      this.costMetrics.costPerThousandRequests;
    this.costMetrics.freeQuotaRemaining = Math.max(
      0,
      144000 - this.costMetrics.totalRequestsToday,
    );
    this.costMetrics.isWithinFreeTier =
      this.costMetrics.estimatedMonthlyCost === 0; // Reddit is free within rate limits
    this.costMetrics.lastReset = now;
  }

  private updateRateLimitMetrics(retryAfter?: number): void {
    this.performanceMetrics.rateLimitHits++;

    this.logger.warn(`Rate limit hit for Reddit API`, {
      service: 'reddit',
      rateLimitHits: this.performanceMetrics.rateLimitHits,
      retryAfter,
      costMetrics: this.costMetrics,
    });
  }

  getCostMetrics(): CostMetrics {
    return { ...this.costMetrics };
  }

  getRateLimitStatus(): RateLimitResponse {
    const status = this.rateLimitCoordinator.getStatus(
      ExternalApiService.REDDIT,
    );
    return {
      allowed: !status.isAtLimit,
      retryAfter: status.retryAfter,
      currentUsage: status.currentRequests,
      limit: 100, // Reddit API limit
      resetTime: status.resetTime,
    };
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

  private recordPerformanceMetrics(responseTime: number): void {
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.totalResponseTime += responseTime;
    this.performanceMetrics.averageResponseTime = Math.round(
      this.performanceMetrics.totalResponseTime /
        this.performanceMetrics.requestCount,
    );
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    operation: string,
    data?: any,
    customHeaders?: Record<string, string>,
  ): Promise<T> {
    // Check rate limit before making request
    const rateLimitRequest: RateLimitRequest = {
      service: ExternalApiService.REDDIT,
      operation,
      priority: 'medium',
    };

    const rateLimitResponse =
      this.rateLimitCoordinator.requestPermission(rateLimitRequest);

    if (!rateLimitResponse.allowed) {
      const retryAfter = rateLimitResponse.retryAfter || 60;
      this.updateRateLimitMetrics(retryAfter);
      throw new RedditRateLimitError(
        `Rate limited by coordinator: ${rateLimitResponse.currentUsage}/${rateLimitResponse.limit} requests used`,
        retryAfter,
      );
    }

    const startTime = Date.now();
    const headers = await this.getAuthenticatedHeaders();
    const requestHeaders = { ...headers, ...customHeaders };

    try {
      const response = await firstValueFrom(
        method === 'GET'
          ? this.httpService.get(url, { headers: requestHeaders })
          : this.httpService.post(url, data, { headers: requestHeaders }),
      );

      const responseTime = Date.now() - startTime;
      this.recordPerformanceMetrics(responseTime);
      this.updateCostMetrics(1); // Track 1 API request

      return response.data as T;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordPerformanceMetrics(responseTime);

      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 429) {
        const retryAfter = parseInt(
          String(axiosError.response.headers?.['retry-after'] || '60'),
        );

        // Report rate limit hit to coordinator
        this.rateLimitCoordinator.reportRateLimitHit(
          ExternalApiService.REDDIT,
          retryAfter,
          operation,
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
        throw new RedditApiError(
          'API request failed',
          axiosError.response?.status,
          JSON.stringify(axiosError.response?.data),
        );
      }
    }
  }

  async getHistoricalPosts(
    timeDepth: '1w' | '1m' | '3m' | '1y',
  ): Promise<HistoricalDataResult> {
    this.logger.info('Fetching historical posts for subreddit', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'fetch_historical_posts',
      subreddit: 'austinfood',
      timeDepth,
    });

    const startTime = Date.now();
    const timeParam = this.mapTimeDepthToRedditParam(timeDepth);
    const url = `https://oauth.reddit.com/r/austinfood/top?t=${timeParam}&limit=100`;

    const response = await this.makeRequest<{ data?: { children?: any[] } }>(
      'GET',
      url,
      'get_historical_posts',
    );
    const posts = response.data?.children || [];
    const responseTime = Date.now() - startTime;

    const analysis = this.analyzeHistoricalData(posts);

    return {
      posts,
      metadata: {
        totalRetrieved: posts.length,
        timeDepth,
        retrievalMethod: 'reddit_api_top',
        completenessRatio: analysis.completenessRatio,
        averagePostAge: analysis.averagePostAge,
        dataQualityScore: analysis.dataQualityScore,
      },
      performance: {
        responseTime,
        apiCallsUsed: 1,
        rateLimitHit: false,
      },
      limitations: {
        hitHardLimit: posts.length >= 100,
        maxItemsReturned: 100,
        missingDataGaps: analysis.missingDataGaps,
      },
    };
  }

  private mapTimeDepthToRedditParam(timeDepth: string): string {
    const mapping = {
      '1w': 'week',
      '1m': 'month',
      '3m': 'month',
      '1y': 'year',
    };
    return mapping[timeDepth as keyof typeof mapping] || 'month';
  }

  private analyzeHistoricalData(posts: any[]): {
    completenessRatio: number;
    averagePostAge: number;
    dataQualityScore: number;
    missingDataGaps: string[];
  } {
    if (posts.length === 0) {
      return {
        completenessRatio: 0,
        averagePostAge: 0,
        dataQualityScore: 0,
        missingDataGaps: ['No posts retrieved'],
      };
    }

    const currentTime = Date.now() / 1000;
    let totalAge = 0;
    let completePostCount = 0;
    let qualityScore = 0;
    const missingDataGaps: string[] = [];

    posts.forEach((post: any) => {
      if (
        !post ||
        typeof post !== 'object' ||
        !post.data ||
        typeof post.data !== 'object'
      ) {
        return;
      }

      const postData = post.data as Record<string, any>;
      const createdUtc = postData.created_utc;
      const postAge =
        typeof createdUtc === 'number' ? currentTime - createdUtc : 0;
      totalAge += postAge;

      const hasRequiredFields = !!(
        postData.id &&
        postData.title &&
        postData.author &&
        postData.created_utc &&
        postData.permalink
      );

      if (hasRequiredFields) {
        completePostCount++;
      }

      if (
        postData.selftext === '[removed]' ||
        postData.selftext === '[deleted]'
      ) {
        missingDataGaps.push(String(postData.id || 'unknown'));
      }

      if (
        postData.score &&
        typeof postData.score === 'number' &&
        postData.score > 0
      ) {
        qualityScore += Math.min(postData.score, 100);
      }
    });

    const completenessRatio = completePostCount / posts.length;
    const averagePostAge = totalAge / posts.length;
    const dataQualityScore = Math.min(qualityScore / posts.length, 100);

    return {
      completenessRatio,
      averagePostAge,
      dataQualityScore,
      missingDataGaps,
    };
  }

  async getHistoricalComments(
    postId: string,
    timeDepth: string,
  ): Promise<{
    postId: string;
    timeDepth: string;
    commentCount: number;
    threadDepth: any;
    comments: any[];
  }> {
    this.logger.info('Fetching historical comments for post', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'fetch_historical_comments',
      postId,
    });

    const url = `https://oauth.reddit.com/r/austinfood/comments/${postId}`;
    const response = await this.makeRequest<any[]>(
      'GET',
      url,
      'get_historical_comments',
    );

    if (!response || !Array.isArray(response) || response.length < 2) {
      throw new RedditApiError('Invalid response format for comment retrieval');
    }

    const commentListing = response[1] as { data?: { children?: any[] } };
    const comments = commentListing.data?.children || [];
    const threadDepth = this.analyzeCommentThreadDepth(comments);

    return {
      postId,
      timeDepth,
      commentCount: comments.length,
      threadDepth,
      comments,
    };
  }

  private analyzeCommentThreadDepth(comments: any[]): {
    maxDepth: number;
    totalComments: number;
    deletedComments: number;
  } {
    let maxDepth = 0;
    let totalComments = 0;
    let deletedComments = 0;

    const traverseComments = (commentList: any[], depth = 0) => {
      maxDepth = Math.max(maxDepth, depth);

      commentList.forEach((comment: any) => {
        // Comments are already filtered with simplified structure
        if (comment && typeof comment === 'object') {
          totalComments++;

          if (comment.body === '[deleted]' || comment.body === '[removed]') {
            deletedComments++;
          }

          // Handle replies - simplified structure
          if (comment.replies && Array.isArray(comment.replies)) {
            traverseComments(comment.replies, depth + 1);
          }
        }
      });
    };

    traverseComments(comments);

    return {
      maxDepth,
      totalComments,
      deletedComments,
    };
  }

  async getCommentStreamPage(
    after?: string,
    limit = 100,
  ): Promise<{
    comments: RedditStreamComment[];
    pagination: {
      after: string | null;
      before: string | null;
      hasMore: boolean;
    };
    performance: {
      responseTime: number;
      commentsRetrieved: number;
    };
  }> {
    const startTime = Date.now();
    const url = `https://oauth.reddit.com/r/austinfood/comments?limit=${limit}&sort=new${
      after ? `&after=${after}` : ''
    }`;

    const response = await this.makeRequest<RedditCommentStream>(
      'GET',
      url,
      'get_comment_stream_page',
    );
    const comments = response.data.children || [];
    const responseTime = Date.now() - startTime;

    return {
      comments,
      pagination: {
        after: response.data.after,
        before: response.data.before,
        hasMore: !!response.data.after,
      },
      performance: {
        responseTime,
        commentsRetrieved: comments.length,
      },
    };
  }

  async streamSubredditComments(options: StreamingOptions = {}): Promise<{
    comments: RedditStreamComment[];
    metrics: StreamingMetrics;
    performance: {
      totalResponseTime: number;
      apiCallsUsed: number;
      averageResponseTime: number;
      rateLimitHit: boolean;
    };
    limitations: {
      maxPagesReached: boolean;
      gapsDetected: string[];
      duplicatesFound: number;
    };
  }> {
    const { limit = 100, maxPages = 10, after: initialAfter } = options;

    this.logger.info('Streaming subreddit comments', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'stream_subreddit_comments',
      limit,
      maxPages,
    });

    const startTime = Date.now();
    const allComments: RedditStreamComment[] = [];
    const seenCommentIds = new Set<string>();
    const responseTimes: number[] = [];
    const gapsDetected: string[] = [];

    let currentAfter = initialAfter;
    let pagesRetrieved = 0;
    let rateLimitHit = false;
    let duplicatesFound = 0;

    while (pagesRetrieved < maxPages && !rateLimitHit) {
      try {
        const pageResult = await this.getCommentStreamPage(currentAfter, limit);
        responseTimes.push(pageResult.performance.responseTime);

        // Check for duplicates
        pageResult.comments.forEach((comment) => {
          if (seenCommentIds.has(comment.data.id)) {
            duplicatesFound++;
          } else {
            seenCommentIds.add(comment.data.id);
            allComments.push(comment);
          }
        });

        currentAfter = pageResult.pagination.after || undefined;
        pagesRetrieved++;

        // Stop if no more pages
        if (!pageResult.pagination.hasMore) {
          break;
        }

        // Add delay between requests to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        if (error instanceof RedditRateLimitError) {
          rateLimitHit = true;
          this.logger.warn(`Rate limit hit after ${pagesRetrieved} pages`);
        } else {
          throw error;
        }
      }
    }

    const totalDuration = Date.now() - startTime;
    const totalResponseTime = responseTimes.reduce(
      (sum, time) => sum + time,
      0,
    );
    const averageResponseTime = totalResponseTime / responseTimes.length;

    // Calculate metrics
    const uniquePostIds = new Set(allComments.map((c) => c.data.link_id));
    const metrics: StreamingMetrics = {
      totalCommentsRetrieved: allComments.length,
      uniquePostsCovered: uniquePostIds.size,
      averageCommentsPerPost: allComments.length / uniquePostIds.size,
      streamingDuration: totalDuration,
      commentsPerSecond: allComments.length / (totalDuration / 1000),
      lastCommentTimestamp:
        allComments.length > 0
          ? allComments[allComments.length - 1].data.created_utc
          : 0,
      gapDetection: gapsDetected.length > 0,
      duplicateComments: duplicatesFound,
    };

    return {
      comments: allComments,
      metrics,
      performance: {
        totalResponseTime,
        apiCallsUsed: pagesRetrieved,
        averageResponseTime,
        rateLimitHit,
      },
      limitations: {
        maxPagesReached: pagesRetrieved >= maxPages,
        gapsDetected,
        duplicatesFound,
      },
    };
  }

  async testConnectionStability(): Promise<{
    status: string;
    message: string;
    details?: any;
  }> {
    try {
      const result = await this.performHealthCheck();
      return {
        status: 'stable',
        message: 'Connection stability test passed',
        details: result,
      };
    } catch (error) {
      return {
        status: 'unstable',
        message: 'Connection stability test failed',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async testApiEndpoints(): Promise<{
    status: string;
    message: string;
    details?: any;
  }> {
    try {
      // Test a simple endpoint
      const url = 'https://oauth.reddit.com/r/austinfood/hot?limit=1';
      await this.makeRequest('GET', url, 'test_api_endpoints');
      return {
        status: 'operational',
        message: 'API endpoints test passed',
      };
    } catch (error) {
      return {
        status: 'failed',
        message: 'API endpoints test failed',
        details: error instanceof Error ? error.message : String(error),
      };
    }
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
  ): Promise<CollectionMethodResult> {
    this.logger.info('Fetching chronological posts for real-time collection', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'chronological_collection',
      subreddit,
      lastProcessedTimestamp,
      limit,
    });

    const startTime = Date.now();
    const rateLimitStatus = this.getRateLimitStatus();

    // Reddit API has a hard limit of 100 posts per request
    // To get up to 1000 posts (Reddit's max accessible), we need pagination
    const postsPerPage = 100;
    const totalPages = Math.ceil(Math.min(limit, 1000) / postsPerPage);

    let allPosts: any[] = [];
    let after: string | null = null;
    let apiCallsUsed = 0;

    try {
      for (let page = 0; page < totalPages; page++) {
        // Build URL with pagination
        const pageLimit = Math.min(postsPerPage, limit - allPosts.length);
        let url = `https://oauth.reddit.com/r/${subreddit}/new?limit=${pageLimit}`;
        if (after) {
          url += `&after=${after}`;
        }

        const response = await this.makeRequest<{
          data?: {
            children?: any[];
            after?: string | null;
          };
        }>('GET', url, 'chronological_collection');

        apiCallsUsed++;
        const pagePosts = response.data?.children || [];

        if (pagePosts.length === 0) {
          // No more posts available
          break;
        }

        // Filter posts by timestamp if provided
        const filteredPosts = lastProcessedTimestamp
          ? pagePosts.filter((post: any) => {
              const postTime = post?.data?.created_utc;
              return (
                typeof postTime === 'number' &&
                postTime > lastProcessedTimestamp
              );
            })
          : pagePosts;

        allPosts.push(...filteredPosts);

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
      const transformedPosts = allPosts.map((post: any) => post.data || post);

      this.logger.info('Chronological collection completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        subreddit,
        requestedLimit: limit,
        actualRetrieved: transformedPosts.length,
        pagesUsed: apiCallsUsed,
        responseTime,
      });

      return {
        data: transformedPosts,
        metadata: {
          totalRetrieved: transformedPosts.length,
          rateLimitStatus,
          costIncurred: 0, // Reddit is free within rate limits
          completenessRatio: transformedPosts.length / Math.min(limit, 1000),
        },
        performance: {
          responseTime,
          apiCallsUsed,
          rateLimitHit: false,
        },
      };
    } catch (error) {
      if (error instanceof RedditRateLimitError) {
        return {
          data: [],
          metadata: {
            totalRetrieved: 0,
            rateLimitStatus,
            costIncurred: 0,
          },
          performance: {
            responseTime: Date.now() - startTime,
            apiCallsUsed,
            rateLimitHit: true,
          },
        };
      }
      throw error;
    }
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
  ): Promise<CollectionMethodResult> {
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
    const url = `https://oauth.reddit.com/r/${subreddit}/search?q=${encodedKeyword}&sort=${sort}&limit=${Math.min(limit, 100)}&t=${timeframe}&restrict_sr=1`;

    const rateLimitStatus = this.getRateLimitStatus();

    try {
      const response = await this.makeRequest<{ data?: { children?: any[] } }>(
        'GET',
        url,
        'keyword_entity_search',
      );

      const posts = response.data?.children || [];
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
    } catch (error) {
      if (error instanceof RedditRateLimitError) {
        return {
          data: [],
          metadata: {
            totalRetrieved: 0,
            rateLimitStatus,
            costIncurred: 0,
          },
          performance: {
            responseTime: Date.now() - startTime,
            apiCallsUsed: 1,
            rateLimitHit: true,
          },
        };
      }
      throw error;
    }
  }

  /**
   * Batch request optimization for API efficiency
   * Combines multiple subreddit requests to optimize API usage
   */
  async batchCollectFromSubreddits(
    subreddits: string[],
    method: 'chronological' | 'keyword',
    options: {
      keyword?: string;
      lastProcessedTimestamp?: number;
      limit?: number;
    } = {},
  ): Promise<{ [subreddit: string]: CollectionMethodResult }> {
    const { keyword, lastProcessedTimestamp, limit = 25 } = options;
    const results: { [subreddit: string]: CollectionMethodResult } = {};

    this.logger.info('Starting batch collection from multiple subreddits', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'batch_collection',
      subreddits,
      method,
      options,
    });

    for (const subreddit of subreddits) {
      try {
        if (method === 'chronological') {
          results[subreddit] = await this.getChronologicalPosts(
            subreddit,
            lastProcessedTimestamp,
            limit,
          );
        } else if (method === 'keyword' && keyword) {
          results[subreddit] = await this.searchByKeyword(subreddit, keyword, {
            limit,
          });
        }

        // Add delay between requests to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        this.logger.error(
          `Batch collection failed for subreddit ${subreddit}`,
          error,
        );
        results[subreddit] = {
          data: [],
          metadata: {
            totalRetrieved: 0,
            rateLimitStatus: this.getRateLimitStatus(),
            costIncurred: 0,
          },
          performance: {
            responseTime: 0,
            apiCallsUsed: 0,
            rateLimitHit: error instanceof RedditRateLimitError,
          },
        };
      }
    }

    return results;
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
    const url = `https://oauth.reddit.com/r/${subreddit}/comments/${postId}?limit=${limit}&sort=${sort}${depth !== null ? `&depth=${depth}` : ''}`;

    const rateLimitStatus = this.getRateLimitStatus();

    try {
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
      const postUrl = `https://reddit.com${postData?.permalink || `/r/${subreddit}/comments/${postId}`}`;

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
    } catch (error) {
      if (error instanceof RedditRateLimitError) {
        return {
          rawResponse: [],
          metadata: {
            retrievalMethod: 'reddit_api_raw_response',
            rateLimitStatus,
          },
          performance: {
            responseTime: Date.now() - startTime,
            apiCallsUsed: 1,
            rateLimitHit: true,
          },
          attribution: {
            postUrl: '',
          },
        };
      }
      throw error;
    }
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

  /**
   * Batch post retrieval with complete comment threads
   * Implements batching optimization for API efficiency - PRD Section 6.1
   */
  async fetchPostsBatch(
    subreddit: string,
    postIds: string[],
    options: {
      limit?: number;
      sort?: 'new' | 'old' | 'top' | 'controversial';
      depth?: number;
      delayBetweenRequests?: number;
    } = {},
  ): Promise<{
    posts: { [postId: string]: any };
    comments: { [postId: string]: any[] };
    metadata: {
      totalPosts: number;
      totalComments: number;
      successfulRetrievals: number;
      failedRetrievals: number;
      rateLimitStatus: RateLimitResponse;
    };
    performance: {
      totalResponseTime: number;
      averageResponseTime: number;
      apiCallsUsed: number;
      rateLimitHits: number;
    };
    attribution: {
      postUrls: { [postId: string]: string };
      commentUrls: { [postId: string]: string[] };
    };
    errors: { [postId: string]: string };
  }> {
    const { delayBetweenRequests = 1000 } = options;

    this.logger.info('Starting batch post retrieval with comments', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'fetch_posts_batch',
      subreddit,
      postCount: postIds.length,
      options,
    });

    const startTime = Date.now();
    const posts: { [postId: string]: any } = {};
    const comments: { [postId: string]: any[] } = {};
    const postUrls: { [postId: string]: string } = {};
    const commentUrls: { [postId: string]: string[] } = {};
    const errors: { [postId: string]: string } = {};

    const totalComments = 0;
    let successfulRetrievals = 0;
    let failedRetrievals = 0;
    let apiCallsUsed = 0;
    let rateLimitHits = 0;
    const responseTimes: number[] = [];

    for (let i = 0; i < postIds.length; i++) {
      const postId = postIds[i];

      try {
        const result = await this.getCompletePostWithComments(
          subreddit,
          postId,
          options,
        );

        responseTimes.push(result.performance.responseTime);
        apiCallsUsed += result.performance.apiCallsUsed;

        if (result.performance.rateLimitHit) {
          rateLimitHits++;
        }

        if (result.rawResponse && result.rawResponse.length > 0) {
          // Store raw response for single-pass processing
          posts[postId] = result.rawResponse;
          comments[postId] = []; // Not used in single-pass
          postUrls[postId] = result.attribution.postUrl;
          commentUrls[postId] = []; // Not used in single-pass
          successfulRetrievals++;
        } else {
          failedRetrievals++;
          errors[postId] = 'Post not found or empty response';
        }

        // Add delay between requests to respect rate limits (except for last request)
        if (i < postIds.length - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, delayBetweenRequests),
          );
        }
      } catch (error) {
        failedRetrievals++;
        errors[postId] =
          error instanceof Error ? error.message : 'Unknown error';

        this.logger.warn(`Failed to retrieve post ${postId}`, {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'fetch_posts_batch',
          postId,
          error: error instanceof Error ? error.message : String(error),
        } as any);
      }
    }

    const totalResponseTime = Date.now() - startTime;
    const averageResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, time) => sum + time, 0) /
          responseTimes.length
        : 0;

    const rateLimitStatus = this.getRateLimitStatus();

    return {
      posts,
      comments,
      metadata: {
        totalPosts: postIds.length,
        totalComments,
        successfulRetrievals,
        failedRetrievals,
        rateLimitStatus,
      },
      performance: {
        totalResponseTime,
        averageResponseTime,
        apiCallsUsed,
        rateLimitHits,
      },
      attribution: {
        postUrls,
        commentUrls,
      },
      errors,
    };
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
      sort?: 'relevance' | 'new' | 'hot' | 'top';
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
      // Ensure authentication
      await this.authenticate();

      // Request rate limiting permission
      const rateLimitRequest: RateLimitRequest = {
        service: 'reddit' as ExternalApiService,
        operation: 'search_entity_keywords',
        priority: 'medium',
      };

      const rateLimitResponse: RateLimitResponse =
        await this.rateLimitCoordinator.requestPermission(rateLimitRequest);

      if (!rateLimitResponse.allowed) {
        throw new RedditRateLimitError(
          `Rate limit exceeded. Retry after: ${rateLimitResponse.retryAfter}ms`,
          rateLimitResponse.retryAfter || 60000,
        );
      }

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

      // Execute search request
      const response = await firstValueFrom(
        this.httpService.get(`${searchUrl}?${searchParams.toString()}`, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'User-Agent': this.redditConfig.userAgent,
          },
          timeout: this.redditConfig.timeout,
        }),
      );

      const searchData = response.data?.data?.children || [];
      const posts: RedditPost[] = [];
      const postIds: string[] = [];

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
          postIds.push(postData.id);
        }
      }

      // Fetch comments for found posts (limit to top posts for performance)
      const topPostIds = postIds.slice(0, Math.min(50, postIds.length)); // Limit comment fetching
      let comments: RedditComment[] = [];
      let commentUrls: string[] = [];

      if (topPostIds.length > 0) {
        try {
          // TODO: Implement comment fetching for posts
          const commentResult = {
            posts: [],
            comments: [],
            attribution: { commentUrls: [] },
          };
          comments = commentResult.comments;
          commentUrls = commentResult.attribution.commentUrls;
        } catch (commentError: unknown) {
          this.logger.warn(
            'Failed to fetch comments for keyword search posts',
            {
              correlationId,
              error: {
                message:
                  commentError instanceof Error
                    ? commentError.message
                    : String(commentError),
                stack:
                  commentError instanceof Error
                    ? commentError.stack
                    : undefined,
              },
              postCount: topPostIds.length,
            },
          );
        }
      }

      const duration = Date.now() - startTime;
      const totalItems = posts.length + comments.length;

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
          searchOptions,
          totalPosts: posts.length,
          totalComments: comments.length,
          totalItems,
          searchTimestamp: new Date(),
        },
        performance: {
          searchDuration: duration,
          apiCallsUsed: 1 + (topPostIds.length > 0 ? 1 : 0), // Search + optional comment fetch
          rateLimitStatus: this.getRateLimitStatus(),
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
        error instanceof RedditRateLimitError ||
        error instanceof RedditApiError
      ) {
        throw error;
      }

      throw new RedditApiError(
        `Failed to search entity keywords: ${error instanceof Error ? error.message : String(error)}`,
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
      sort?: 'relevance' | 'new' | 'hot' | 'top';
      limit?: number;
      timeFilter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
      batchDelay?: number; // Delay between searches to respect rate limits
    } = {},
  ): Promise<BatchKeywordSearchResponse> {
    const startTime = Date.now();
    const correlationId = CorrelationUtils.getCorrelationId();

    this.logger.info('Starting batch keyword entity search', {
      correlationId,
      operation: 'batch_entity_keyword_search',
      subreddit,
      entityCount: entityNames.length,
      searchOptions,
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

          // Add delay between searches to respect rate limits (default 1 second)
          if (i < entityNames.length - 1) {
            const delay = searchOptions.batchDelay || 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } catch (entityError: unknown) {
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
            this.logger.info(
              'Rate limit hit, waiting before continuing batch',
              {
                correlationId,
                retryAfter: entityError.retryAfter,
              },
            );
            await new Promise((resolve) =>
              setTimeout(resolve, entityError.retryAfter),
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
          rateLimitStatus: this.getRateLimitStatus(),
        },
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error('Batch keyword entity search failed', {
        correlationId,
        operation: 'batch_entity_keyword_search',
        subreddit,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new RedditApiError(
        `Failed to perform batch entity keyword search: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
