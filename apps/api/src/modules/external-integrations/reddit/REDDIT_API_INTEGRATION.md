# Reddit API Integration

## Overview

This module provides comprehensive Reddit API integration for the Crave Search application, implementing the requirements from PRD Section 5.1.2. The integration includes OAuth2 authentication, rate limiting (100 requests/minute), cost monitoring, and real-time collection methods.

## Features

### 🔐 Authentication
- **OAuth2 Flow**: Secure authentication using client credentials and user account
- **Token Management**: Automatic token refresh with buffer time for safety
- **Error Handling**: Comprehensive error handling for authentication failures

### ⚡ Rate Limiting
- **100 requests/minute limit**: Enforced through RateLimitCoordinatorService integration
- **Proactive checking**: Rate limit validation before making API calls
- **Graceful degradation**: Handles rate limit errors with appropriate retry-after delays

### 💰 Cost Monitoring
- **Free tier tracking**: Monitors usage within Reddit's free tier limits
- **Daily/monthly metrics**: Tracks request counts and estimated costs
- **Budget alerts**: Provides cost metrics and warnings

### 📊 Real-Time Collection Methods
- **Chronological Collection**: Fetch recent posts using `/r/subreddit/new`
- **Keyword Entity Search**: Search for specific entities using `/r/subreddit/search`
- **Batch Operations**: Collect from multiple subreddits efficiently

## Configuration

### Environment Variables

```bash
# Required - Reddit API Credentials
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USERNAME=your_bot_username
REDDIT_PASSWORD=your_bot_password

# Optional - Service Configuration
REDDIT_USER_AGENT=CraveSearch/1.0.0
REDDIT_TIMEOUT=10000
REDDIT_REQUESTS_PER_MINUTE=100

# Optional - Retry Configuration
REDDIT_MAX_RETRIES=3
REDDIT_RETRY_DELAY=1000
REDDIT_RETRY_BACKOFF_FACTOR=2.0
```

### Configuration Object

The service uses the following configuration structure:

```typescript
interface RedditConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  userAgent: string;
  timeout: number;
  retryOptions: RetryOptions;
}
```

## Usage

### Basic Service Injection

```typescript
import { RedditService } from './reddit.service';

@Injectable()
export class YourService {
  constructor(private readonly redditService: RedditService) {}
}
```

### Authentication

Authentication is handled automatically, but you can manually trigger it:

```typescript
// Manual authentication (usually not needed)
await this.redditService.authenticate();

// Validate current authentication
const isValid = await this.redditService.validateAuthentication();

// Get authenticated headers for custom requests
const headers = await this.redditService.getAuthenticatedHeaders();
```

### Real-Time Collection Methods

#### Chronological Collection

Fetch recent posts chronologically (PRD Section 5.1.2):

```typescript
const result = await this.redditService.getChronologicalPosts(
  'austinfood',           // subreddit
  1640995200,            // lastProcessedTimestamp (optional)
  100                    // limit (optional, max 100)
);

console.log(result);
// {
//   data: [...posts],
//   metadata: {
//     totalRetrieved: 25,
//     rateLimitStatus: {...},
//     costIncurred: 0,
//     completenessRatio: 1.0
//   },
//   performance: {
//     responseTime: 450,
//     apiCallsUsed: 1,
//     rateLimitHit: false
//   }
// }
```

#### Keyword Entity Search

Search for specific entities (PRD Section 5.1.2):

```typescript
const result = await this.redditService.searchByKeyword(
  'austinfood',          // subreddit
  'tacos',              // keyword
  {
    sort: 'relevance',   // 'relevance' | 'new' | 'top'
    limit: 100,          // max 100
    timeframe: 'month'   // 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'
  }
);
```

#### Batch Collection

Collect from multiple subreddits efficiently:

```typescript
const results = await this.redditService.batchCollectFromSubreddits(
  ['austinfood', 'FoodNYC'],    // subreddits
  'chronological',              // 'chronological' | 'keyword'
  {
    keyword: 'pizza',           // required for keyword method
    lastProcessedTimestamp: 1640995200,
    limit: 25
  }
);

// Returns: { [subreddit: string]: CollectionMethodResult }
```

### Monitoring and Metrics

#### Cost Metrics

```typescript
const costMetrics = this.redditService.getCostMetrics();
console.log(costMetrics);
// {
//   totalRequestsThisMonth: 1250,
//   totalRequestsToday: 85,
//   estimatedMonthlyCost: 0,     // Reddit is free within rate limits
//   freeQuotaRemaining: 143915,
//   costPerThousandRequests: 0.60,
//   lastReset: Date,
//   isWithinFreeTier: true
// }
```

#### Rate Limit Status

```typescript
const rateLimitStatus = this.redditService.getRateLimitStatus();
console.log(rateLimitStatus);
// {
//   allowed: true,
//   currentUsage: 45,
//   limit: 100,
//   resetTime: Date
// }
```

#### Performance Metrics

```typescript
const performanceMetrics = this.redditService.getPerformanceMetrics();
const connectionMetrics = this.redditService.getConnectionMetrics();
```

### Health Checks

```typescript
// Service health status
const healthStatus = this.redditService.getHealthStatus();

// Comprehensive health check
const healthCheck = await this.redditService.performHealthCheck();

// Test API connectivity
const connectivityTest = await this.redditService.testApiEndpoints();
```

## Error Handling

The service provides specific error types for different failure scenarios:

```typescript
import {
  RedditApiError,
  RedditAuthenticationError,
  RedditConfigurationError,
  RedditRateLimitError,
  RedditNetworkError,
} from './reddit.exceptions';

try {
  await this.redditService.getChronologicalPosts('austinfood');
} catch (error) {
  if (error instanceof RedditRateLimitError) {
    console.log(`Rate limited. Retry after: ${error.retryAfter} seconds`);
  } else if (error instanceof RedditAuthenticationError) {
    console.log('Authentication failed. Check credentials.');
  } else if (error instanceof RedditNetworkError) {
    console.log('Network error. Check connectivity.');
  }
}
```

## Rate Limiting Details

### How It Works

1. **Pre-request Validation**: Before each API call, the service requests permission from the RateLimitCoordinatorService
2. **100 requests/minute limit**: Configured as per Reddit API limits and PRD requirements
3. **Graceful Handling**: If rate limited, the service either throws an error or returns empty results with rate limit metadata
4. **Coordinator Integration**: Reports rate limit hits back to the coordinator for system-wide tracking

### Rate Limit Response Handling

```typescript
// When rate limited by coordinator
const result = await this.redditService.getChronologicalPosts('austinfood');
if (result.performance.rateLimitHit) {
  console.log('Rate limited - returned empty results');
  console.log(`Retry after: ${result.metadata.rateLimitStatus.retryAfter} seconds`);
}
```

## Testing

The service includes comprehensive test coverage for:

- Authentication flows and error scenarios
- Rate limiting integration with coordinator service
- Cost monitoring and metrics tracking
- Real-time collection methods
- Batch operations and error handling
- Network error scenarios

Run tests:
```bash
npm test reddit.service.spec.ts
```

## Architecture Integration

### Module Dependencies

- **RateLimitCoordinatorService**: For centralized rate limiting
- **LoggerService**: For structured logging with correlation IDs
- **ConfigService**: For environment-based configuration
- **HttpService**: For HTTP requests with Axios

### PRD Compliance

This implementation fully satisfies PRD Section 5.1.2 requirements:

- ✅ **Authentication**: OAuth2 with secure credential management
- ✅ **Rate Limiting**: 100 requests/minute hard constraint enforcement
- ✅ **Cost Management**: Free tier monitoring and cost tracking
- ✅ **Real-time Collection**: Chronological and keyword search methods
- ✅ **Error Handling**: Comprehensive error scenarios with proper retry logic
- ✅ **Performance Monitoring**: Request tracking and health monitoring

### Future Enhancements

- **Webhook Integration**: Real-time notifications from Reddit
- **Advanced Caching**: Response caching for frequently accessed data
- **Analytics Dashboard**: Visual monitoring of API usage and costs
- **Auto-scaling**: Dynamic rate limit adjustment based on usage patterns

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Check Reddit API credentials in environment variables
   - Ensure bot account has proper permissions
   - Verify user agent string is set correctly

2. **Rate Limit Errors**
   - Monitor daily usage with `getCostMetrics()`
   - Check `getRateLimitStatus()` for current limits
   - Implement exponential backoff for retries

3. **Network Timeouts**
   - Increase `REDDIT_TIMEOUT` environment variable
   - Check network connectivity to reddit.com
   - Review retry configuration settings

4. **Empty Results**
   - Verify subreddit names are correct and accessible
   - Check if subreddits have recent posts
   - Ensure search keywords are not too restrictive

For additional support, check the service health endpoints and review the comprehensive logging output with correlation IDs for debugging.