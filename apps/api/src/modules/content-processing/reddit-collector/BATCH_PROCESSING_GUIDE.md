# Batch Processing System Operation Guide

## Overview

The Batch Processing System provides memory-efficient coordination for processing large Pushshift archive files. It implements PRD Section 5.1.1 requirements for handling realistic dataset sizes without memory exhaustion.

## Components

### BatchProcessingCoordinatorService
- **Primary coordinator** for batch processing jobs
- Orchestrates stream processing, content pipeline, and resource management
- Manages memory usage across the entire processing pipeline
- Provides progress tracking and job management

### ResourceMonitoringService
- **Memory monitoring** and automatic management
- Tracks system performance during processing
- Triggers warnings and adjustments based on memory pressure
- Provides resource usage statistics

### ProcessingCheckpointService
- **Checkpoint and resumption** capabilities
- Enables recovery from interrupted processing jobs
- Stores processing state with file positions and completion status
- Manages checkpoint persistence and cleanup

## Configuration

### Environment Variables

```bash
# Batch Processing Configuration
PUSHSHIFT_MIN_BATCH_SIZE=100           # Minimum batch size
PUSHSHIFT_MAX_BATCH_SIZE=5000          # Maximum batch size  
PUSHSHIFT_MAX_MEMORY_MB=512            # Memory limit in MB
PUSHSHIFT_ENABLE_CHECKPOINTS=true      # Enable checkpoint system
PUSHSHIFT_ENABLE_RESOURCE_MONITORING=true # Enable resource monitoring
PUSHSHIFT_ADAPTIVE_BATCH_SIZING=true   # Enable adaptive batch sizing

# Progress and Monitoring
PUSHSHIFT_PROGRESS_REPORTING_INTERVAL=10000  # Progress report every N lines
PUSHSHIFT_RESOURCE_CHECK_INTERVAL=1000       # Resource check every N lines
PUSHSHIFT_MEMORY_CHECK_INTERVAL=5000         # Memory check every N lines

# Data Processing Options
PUSHSHIFT_PRESERVE_THREADS=true        # Preserve Reddit thread structure
PUSHSHIFT_VALIDATE_TIMESTAMPS=true     # Enable timestamp validation
PUSHSHIFT_QUALITY_MIN_SCORE=-5         # Minimum post/comment score
PUSHSHIFT_EXCLUDE_DELETED=true         # Exclude deleted content
PUSHSHIFT_EXCLUDE_REMOVED=true         # Exclude removed content

# Checkpoint Configuration
PUSHSHIFT_CHECKPOINT_PERSISTENCE=true          # Enable persistent checkpoints
PUSHSHIFT_CHECKPOINT_STORAGE=./data/checkpoints # Checkpoint storage location
PUSHSHIFT_MAX_CHECKPOINTS_PER_JOB=50           # Max checkpoints per job
PUSHSHIFT_CHECKPOINT_CLEANUP_INTERVAL=3600000  # Cleanup interval (1 hour)
PUSHSHIFT_CHECKPOINT_RETENTION_PERIOD=604800000 # Retention period (7 days)
```

## Usage Examples

### Basic Archive Processing

```typescript
import { BatchProcessingCoordinatorService } from './batch-processing-coordinator.service';

// Process a single archive file
const result = await batchProcessor.processArchiveFile(
  '/path/to/archive/austinfood_comments.zst'
);

console.log(`Processed ${result.metrics.totalProcessedLines} lines`);
console.log(`Success: ${result.success}`);
```

### Custom Configuration

```typescript
// Process with custom memory limits and batch size
const result = await batchProcessor.processArchiveFile(
  '/path/to/large_archive.zst',
  {
    maxMemoryUsage: 1024, // 1GB limit
    baseBatchSize: 2000,  // Larger batches
    enableCheckpoints: true,
    enableResourceMonitoring: true,
  }
);
```

### Progress Monitoring

```typescript
// Start processing (don't await)
const processingTask = batchProcessor.processArchiveFile(filePath);

// Monitor progress
const jobId = batchProcessor.getActiveJobs()[0]?.jobId;
if (jobId) {
  const progress = await batchProcessor.getJobProgress(jobId);
  console.log(`Progress: ${progress.completionPercentage}%`);
  console.log(`ETA: ${progress.estimatedTimeRemaining} seconds`);
}

// Wait for completion
const result = await processingTask;
```

### Resume Interrupted Job

```typescript
// Resume a failed or interrupted job
try {
  const result = await batchProcessor.resumeJob('batch_job_123');
  console.log('Job resumed successfully');
} catch (error) {
  console.error('Failed to resume job:', error.message);
}
```

## Performance Tuning

### Memory Management

1. **Monitor Memory Usage**: Enable resource monitoring to track memory consumption
   ```typescript
   enableResourceMonitoring: true
   ```

2. **Adjust Memory Limits**: Set appropriate memory limits based on available system resources
   ```typescript
   maxMemoryUsage: 512 // MB - adjust based on system capacity
   ```

3. **Enable Adaptive Sizing**: Let the system automatically adjust batch sizes
   ```typescript
   adaptiveBatchSizing: true
   ```

### Batch Size Optimization

- **Small Files (<50MB)**: Use larger batch sizes (2000-5000)
- **Medium Files (50-500MB)**: Use default batch sizes (1000)
- **Large Files (>500MB)**: Use smaller batch sizes (100-500)

### Checkpoint Strategy

- **Enable for Long Jobs**: Always enable checkpoints for files >100MB
- **Frequent Checkpoints**: Use shorter progress reporting intervals for critical jobs
- **Storage Location**: Ensure checkpoint storage has sufficient space

## Troubleshooting

### Memory Issues

**Problem**: Memory exhaustion errors
**Solution**: 
- Reduce `maxMemoryUsage` setting
- Enable adaptive batch sizing
- Reduce `baseBatchSize`

### Performance Issues

**Problem**: Slow processing
**Solution**:
- Increase batch size for small files
- Disable thread preservation if not needed
- Reduce checkpoint frequency

### Checkpoint Issues

**Problem**: Cannot resume from checkpoint
**Solution**:
- Verify checkpoint storage location exists
- Check checkpoint file permissions
- Ensure checkpoint retention period hasn't expired

## Monitoring and Logging

### Log Levels

- **INFO**: Job start/completion, major milestones
- **DEBUG**: Progress updates, batch processing details
- **WARN**: Memory warnings, configuration issues
- **ERROR**: Processing failures, critical errors

### Key Metrics

- **Processing Rate**: Lines per second
- **Memory Usage**: Current/peak memory consumption
- **Batch Performance**: Average batch processing time
- **Error Rate**: Failed items per batch

### Resource Statistics

```typescript
// Get current resource stats
const stats = await resourceMonitor.getCurrentStats(jobId);
console.log(`Memory: ${stats.memoryUsagePercentage}%`);
console.log(`Processing Rate: ${stats.processingRate} lines/sec`);
```

## Integration with Existing Services

The batch processing system integrates with:

- **StreamProcessorService**: Handles zstd decompression and line-by-line processing
- **HistoricalContentPipelineService**: Processes Reddit data into structured format
- **Configuration System**: Uses existing pushshift configuration structure
- **Logging Framework**: Leverages shared logging service with correlation IDs

## Error Handling

The system provides comprehensive error handling:

- **Graceful Degradation**: Continues processing when possible
- **Automatic Recovery**: Retries transient failures
- **Checkpoint Creation**: Saves state before critical operations
- **Resource Cleanup**: Ensures proper cleanup on failure

For additional support, refer to the integration tests and service documentation.