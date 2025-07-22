/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { AxiosError } from 'axios';
// Logging imports available but not currently used
// import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  RedditApiError,
  RedditAuthenticationError,
  RedditConfigurationError,
  RedditRateLimitError,
  RedditNetworkError,
} from './reddit.exceptions';

export interface RedditConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  userAgent: string;
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

export interface PerformanceMetrics {
  requestCount: number;
  totalResponseTime: number;
  averageResponseTime: number;
  lastReset: Date;
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

@Injectable()
export class RedditService implements OnModuleInit {
  private readonly logger = new Logger(RedditService.name);
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private readonly redditConfig: RedditConfig;
  private performanceMetrics: PerformanceMetrics = {
    requestCount: 0,
    totalResponseTime: 0,
    averageResponseTime: 0,
    lastReset: new Date(),
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
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.redditConfig = {
      clientId: this.configService.get<string>('reddit.clientId') || '',
      clientSecret: this.configService.get<string>('reddit.clientSecret') || '',
      username: this.configService.get<string>('reddit.username') || '',
      password: this.configService.get<string>('reddit.password') || '',
      userAgent:
        this.configService.get<string>('reddit.userAgent') ||
        'CraveSearch/1.0.0',
    };

    this.validateConfig();
  }

  onModuleInit() {
    this.logger.log('Reddit service initialized');
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
    this.logger.log('Authenticating with Reddit API');

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

      this.logger.log('Authentication successful');
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
      this.logger.log(`Authentication validated for user: ${username}`);
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
    data?: any,
    customHeaders?: Record<string, string>,
  ): Promise<T> {
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

      return response.data as T;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordPerformanceMetrics(responseTime);

      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 429) {
        throw new RedditRateLimitError(
          'Rate limited by Reddit API',
          parseInt(
            String(axiosError.response.headers?.['retry-after'] || '60'),
          ),
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
    this.logger.log(
      `Fetching historical posts for r/austinfood (${timeDepth})`,
    );

    const startTime = Date.now();
    const timeParam = this.mapTimeDepthToRedditParam(timeDepth);
    const url = `https://oauth.reddit.com/r/austinfood/top?t=${timeParam}&limit=100`;

    const response = await this.makeRequest<{ data?: { children?: any[] } }>(
      'GET',
      url,
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
    this.logger.log(`Fetching historical comments for post ${postId}`);

    const url = `https://oauth.reddit.com/r/austinfood/comments/${postId}`;
    const response = await this.makeRequest<any[]>('GET', url);

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
        if (
          comment &&
          typeof comment === 'object' &&
          'kind' in comment &&
          comment.kind === 't1' &&
          'data' in comment &&
          comment.data &&
          typeof comment.data === 'object'
        ) {
          totalComments++;
          const commentData = comment.data as Record<string, any>;

          if (
            commentData.body === '[deleted]' ||
            commentData.body === '[removed]'
          ) {
            deletedComments++;
          }

          const replies = commentData.replies;
          if (
            replies &&
            typeof replies === 'object' &&
            'data' in replies &&
            replies.data &&
            typeof replies.data === 'object' &&
            'children' in replies.data &&
            Array.isArray(replies.data.children)
          ) {
            traverseComments(replies.data.children, depth + 1);
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

    const response = await this.makeRequest<RedditCommentStream>('GET', url);
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

    this.logger.log(
      `Streaming subreddit comments with limit=${limit}, maxPages=${maxPages}`,
    );

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
      await this.makeRequest('GET', url);
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
}
