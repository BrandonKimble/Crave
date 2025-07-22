# Database Connection Configuration Guide

This document provides comprehensive guidance for configuring the Crave Search API database connection pooling and performance optimization.

## Overview

The database configuration system provides production-ready connection pooling, performance monitoring, and health checks for PostgreSQL databases. It supports environment-specific optimization and comprehensive monitoring capabilities.

## Configuration Structure

### Environment Variables

All database configuration can be controlled via environment variables:

#### Core Database Settings
```bash
# Required: PostgreSQL connection string
DATABASE_URL=postgresql://username:password@localhost:5432/database_name

# Connection Pool Configuration
DATABASE_CONNECTION_POOL_MAX=50          # Maximum connections (default: auto-detected)
DATABASE_CONNECTION_POOL_MIN=2           # Minimum connections (default: 2)
DATABASE_CONNECTION_ACQUIRE_TIMEOUT=60000 # Connection acquire timeout in ms (default: 60000)
DATABASE_CONNECTION_IDLE_TIMEOUT=10000    # Idle connection timeout in ms (default: 10000)
DATABASE_CONNECTION_EVICT_INTERVAL=10000  # Connection eviction check interval in ms (default: 10000)
DATABASE_HANDLE_DISCONNECTS=true         # Handle disconnections gracefully (default: false)

# Query Configuration
DATABASE_QUERY_TIMEOUT=30000             # Query timeout in ms (default: 30000)
DATABASE_RETRY_ATTEMPTS=3                # Connection retry attempts (default: 3)
DATABASE_RETRY_DELAY=1000               # Initial retry delay in ms (default: 1000)
DATABASE_RETRY_FACTOR=2.0               # Retry delay multiplication factor (default: 2.0)

# Performance Settings
DATABASE_PREPARED_STATEMENTS=true        # Enable prepared statements (default: true)
DATABASE_LOGGING=false                   # Enable detailed logging (default: development only)
DATABASE_SLOW_QUERY_THRESHOLD=1000      # Slow query threshold in ms (default: 1000)
```

## Environment-Specific Recommendations

### Development Environment
```bash
NODE_ENV=development
DATABASE_CONNECTION_POOL_MAX=10
DATABASE_CONNECTION_POOL_MIN=2
DATABASE_LOGGING=true
DATABASE_SLOW_QUERY_THRESHOLD=500
```

**Characteristics:**
- Small connection pool (10 connections) to conserve resources
- Detailed logging enabled for debugging
- Lower slow query threshold for performance awareness
- Health checks disabled to reduce overhead

### Staging Environment
```bash
NODE_ENV=staging
DATABASE_CONNECTION_POOL_MAX=25
DATABASE_CONNECTION_POOL_MIN=5
DATABASE_LOGGING=false
DATABASE_SLOW_QUERY_THRESHOLD=1000
```

**Characteristics:**
- Medium connection pool (25 connections) for load testing
- Logging disabled for performance testing accuracy
- Standard slow query threshold
- Health checks enabled for monitoring validation

### Production Environment
```bash
NODE_ENV=production
DATABASE_CONNECTION_POOL_MAX=50
DATABASE_CONNECTION_POOL_MIN=10
DATABASE_LOGGING=false
DATABASE_SLOW_QUERY_THRESHOLD=1000
DATABASE_HANDLE_DISCONNECTS=true
DATABASE_RETRY_ATTEMPTS=5
```

**Characteristics:**
- Large connection pool (50+ connections) for high throughput
- Logging disabled for optimal performance
- Enhanced retry logic for resilience
- Full health check and monitoring enabled
- Graceful disconnect handling for maintenance

## Connection Pool Sizing Guidelines

### Calculation Formula
```
Optimal Pool Size = (Number of CPU Cores × 2) + Effective Spindle Count
```

### Environment-Based Recommendations

| Environment | CPU Cores | Recommended Pool Size | Justification |
|-------------|-----------|----------------------|---------------|
| Development | 4-8 | 10 | Resource conservation |
| Staging | 8-16 | 25 | Load testing capability |
| Production | 16+ | 50-100+ | High concurrency support |

### Performance Considerations

**Under-sizing Effects:**
- Connection wait times during peak load
- Query queuing and timeout errors
- Reduced application throughput

**Over-sizing Effects:**
- Increased memory usage
- Database connection overhead
- Potential connection exhaustion

## Monitoring and Health Checks

### Health Check Endpoints

#### Basic Health Check
```
GET /health/database
```
Returns basic connectivity status (200 = healthy, 503 = unhealthy).

#### Detailed Metrics
```
GET /health/database/metrics
```
Returns comprehensive connection pool and query metrics:
- Connection utilization
- Query performance statistics
- Error rates and patterns

#### Comprehensive Health Assessment
```
GET /health/database/detailed
```
Returns overall system health with performance alerts and recommendations.

### Key Metrics to Monitor

#### Connection Pool Metrics
- **Pool Utilization**: Active connections / Max connections
- **Connection Errors**: Failed connection attempts
- **Queue Length**: Waiting connection requests

#### Query Performance Metrics
- **Average Query Duration**: Mean query execution time
- **Slow Query Rate**: Percentage of queries exceeding threshold
- **Query Throughput**: Queries per second

#### Alert Thresholds

| Metric | Warning | Critical | Action Required |
|--------|---------|----------|----------------|
| Pool Utilization | >85% | >95% | Scale connection pool |
| Slow Query Rate | >15% | >25% | Query optimization |
| Connection Errors | >5% | >10% | Infrastructure review |
| Avg Query Duration | >2s | >5s | Database tuning |

## Performance Optimization

### Connection Pool Tuning

1. **Monitor Utilization Patterns**
   ```bash
   curl localhost:3000/health/database/metrics | jq '.metrics.pool'
   ```

2. **Adjust Pool Size Based on Load**
   - Scale up if utilization consistently >80%
   - Scale down if utilization consistently <30%

3. **Fine-tune Timeouts**
   - Increase acquire timeout if seeing connection wait errors
   - Adjust idle timeout based on connection patterns

### Query Performance Optimization

1. **Enable Query Analysis**
   ```bash
   DATABASE_LOGGING=true
   DATABASE_SLOW_QUERY_THRESHOLD=500
   ```

2. **Monitor Slow Queries**
   - Review slow query logs regularly
   - Optimize frequently slow queries
   - Add appropriate database indexes

3. **Connection Lifecycle Optimization**
   - Use prepared statements for repeated queries
   - Implement proper connection cleanup
   - Monitor connection leak patterns

## Troubleshooting

### Common Issues

#### Connection Pool Exhaustion
**Symptoms:** "Connection timeout" errors, high response times
**Solutions:**
- Increase `DATABASE_CONNECTION_POOL_MAX`
- Optimize query performance to reduce connection hold time
- Check for connection leaks in application code

#### High Query Latency
**Symptoms:** Slow response times, high `avgQueryDuration` metrics
**Solutions:**
- Review and optimize slow queries
- Add database indexes for frequent query patterns
- Consider database server resource scaling

#### Connection Instability
**Symptoms:** Frequent connection errors, health check failures
**Solutions:**
- Enable `DATABASE_HANDLE_DISCONNECTS=true`
- Increase retry attempts and delays
- Review network stability between API and database

### Diagnostic Commands

#### Check Current Configuration
```typescript
// In NestJS controller or service
const dbConfig = this.configService.get('database');
console.log('Connection Pool Config:', dbConfig.connectionPool);
```

#### Monitor Real-time Metrics
```bash
# Continuous monitoring
watch -n 5 'curl -s localhost:3000/health/database/metrics | jq ".metrics"'
```

#### Test Connection Pool Behavior
```bash
# Generate load to test pool behavior
ab -n 1000 -c 20 http://localhost:3000/health/database
```

## Deployment Checklist

### Pre-Deployment
- [ ] Environment variables configured correctly
- [ ] Connection pool size appropriate for environment
- [ ] Database connectivity tested
- [ ] Health check endpoints accessible
- [ ] Monitoring dashboards configured

### Post-Deployment
- [ ] Verify health check status (200 responses)
- [ ] Monitor connection pool utilization
- [ ] Check for connection errors or timeouts
- [ ] Validate query performance metrics
- [ ] Confirm alert thresholds are appropriate

### Production Deployment
- [ ] Connection pooling configured for expected load
- [ ] Retry logic enabled with appropriate timeouts
- [ ] Health checks integrated with monitoring systems
- [ ] Database performance baseline established
- [ ] Emergency scaling procedures documented

## Integration with External Monitoring

### Prometheus/Grafana Integration
The health endpoints provide JSON metrics that can be scraped by monitoring systems:

```bash
# Example Prometheus scrape config
- job_name: 'crave-search-db'
  static_configs:
    - targets: ['api:3000']
  metrics_path: '/health/database/metrics'
```

### AWS CloudWatch Integration
For AWS deployments, metrics can be pushed to CloudWatch for centralized monitoring:

```typescript
// Example CloudWatch metrics publishing
await cloudwatch.putMetricData({
  Namespace: 'CraveSearch/Database',
  MetricData: [
    {
      MetricName: 'ConnectionUtilization',
      Value: utilizationPercentage,
      Unit: 'Percent'
    }
  ]
}).promise();
```

## Security Considerations

### Connection String Security
- Never commit connection strings to version control
- Use environment variables or secure key management
- Implement connection string encryption for sensitive environments

### Access Control
- Limit database user permissions to required operations only
- Use separate database users for different environments
- Implement connection source IP restrictions where possible

### Monitoring Security
- Restrict access to health check endpoints in production
- Implement authentication for detailed metrics endpoints
- Log and monitor database access patterns

## Support and Maintenance

### Regular Maintenance Tasks
- Review slow query logs weekly
- Monitor connection pool utilization trends
- Update connection pool sizing based on growth
- Test connection failover scenarios

### Performance Review Process
1. Monthly review of database metrics
2. Quarterly optimization of slow queries
3. Annual review of connection pool architecture
4. Continuous monitoring of health check patterns

For additional support, refer to the [API documentation](README.md) or contact the development team.