# Reddit API Integration Module

This module provides Reddit API integration with OAuth2 authentication for the Crave Search application. It includes core functionality for data collection and streaming.

## Overview

The Reddit module implements a production-ready Reddit API client with:

- OAuth2 password grant authentication
- Comprehensive error handling
- Automatic token management and refresh
- Rate limiting awareness
- Secure configuration management
- Health monitoring and metrics

## Module Structure

```
reddit/
├── reddit.module.ts         # NestJS module definition
├── reddit.service.ts        # Core Reddit API service
├── reddit.exceptions.ts     # Custom exception classes
├── reddit.service.spec.ts   # Unit tests
├── reddit-health.controller.ts # Health check endpoints
├── index.ts                 # Module exports
└── README.md               # This documentation
```

## Configuration

The service requires the following environment variables:

```env
REDDIT_CLIENT_ID=your_reddit_app_client_id
REDDIT_CLIENT_SECRET=your_reddit_app_client_secret
REDDIT_USERNAME=your_reddit_username
REDDIT_PASSWORD=your_reddit_password
REDDIT_USER_AGENT=CraveSearch/1.0.0
```

Configuration is managed through NestJS ConfigService and defined in `src/config/configuration.ts`.

## Core Methods

### Authentication

- `authenticate()` - Perform OAuth2 authentication
- `validateAuthentication()` - Validate current authentication status
- `getAuthenticatedHeaders()` - Get headers for authenticated requests

### Data Collection

- `getHistoricalPosts(timeDepth)` - Retrieve historical posts for specified time period
- `getHistoricalComments(postId, timeDepth)` - Get comments for specific post
- `getCommentStreamPage(after?, limit?)` - Get paginated comment stream
- `streamSubredditComments(options)` - Stream comments with configuration options

### Monitoring

- `performHealthCheck()` - Check API connection health
- `getPerformanceMetrics()` - Get performance statistics
- `getConnectionMetrics()` - Get connection stability metrics

## Usage

### Basic Setup

```typescript
import { Injectable } from '@nestjs/common';
import { RedditService } from './modules/external-integrations/reddit/reddit.service';

@Injectable()
export class YourService {
  constructor(private readonly redditService: RedditService) {}

  async collectData() {
    // Get recent posts
    const posts = await this.redditService.getHistoricalPosts('1w');

    // Stream comments
    const comments = await this.redditService.streamSubredditComments({
      limit: 50,
      maxPages: 5,
    });

    return { posts, comments };
  }
}
```

### Error Handling

The module provides comprehensive error handling with specific exception types:

```typescript
try {
  await redditService.authenticate();
} catch (error) {
  if (error instanceof RedditAuthenticationError) {
    // Handle authentication failures
  } else if (error instanceof RedditRateLimitError) {
    // Handle rate limiting
  } else if (error instanceof RedditNetworkError) {
    // Handle network issues
  }
}
```

### Health Monitoring

```typescript
const health = await redditService.performHealthCheck();
const metrics = redditService.getPerformanceMetrics();
```

## API Endpoints

The service integrates with these Reddit API endpoints:

- `POST /api/v1/access_token` - OAuth2 authentication
- `GET /api/v1/me` - Authentication validation
- `GET /r/austinfood/hot` - Hot posts
- `GET /r/austinfood/new` - New posts
- `GET /r/austinfood/top` - Top posts with time filtering
- `GET /r/austinfood/comments` - Comment stream
- `GET /r/austinfood/comments/{id}` - Specific post comments

## Features

### Automatic Token Management

- Tokens are automatically refreshed when expired
- 1-minute buffer for token expiration
- Automatic cleanup of invalid tokens

### Rate Limiting

- Detects and handles 429 rate limit responses
- Provides retry-after information
- Performance metrics tracking

### Data Processing

- Handles Reddit API pagination
- Processes comment threads recursively
- Analyzes data quality and completeness
- Tracks performance metrics

## Security Considerations

- Credentials stored in environment variables only
- Tokens kept in memory (not persisted)
- Sensitive data excluded from logs
- Proper User-Agent identification

## Testing

### Unit Tests

```bash
npm run test -- reddit.service.spec.ts
```

### Integration Tests

```bash
npm run test:e2e -- reddit-integration.spec.ts
```

## Troubleshooting

### Common Issues

1. **Authentication Failures**

   - Verify Reddit app credentials
   - Check username/password
   - Ensure app is configured for password grant

2. **Rate Limiting**

   - Monitor request frequency
   - Implement proper delays between requests
   - Check retry-after headers

3. **Network Issues**
   - Verify internet connectivity
   - Check firewall/proxy settings

### Debug Logging

Enable debug logging in development:

```typescript
process.env.LOG_LEVEL = 'debug';
```

## Production Considerations

- Monitor rate limit usage
- Implement exponential backoff
- Cache frequently accessed data
- Set up health check alerts
- Track performance metrics
- Handle network failures gracefully
