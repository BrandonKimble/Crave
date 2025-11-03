# Pushshift Archive Storage Documentation

## Overview

This directory contains Reddit community data archives from Pushshift, organized for historical data processing as specified in PRD Section 5.1.1 (Initial Historical Load). The archives provide comprehensive historical coverage through end-2024 for the Crave Search food discovery platform.

## Directory Structure

```
apps/api/data/pushshift/
├── README.md                           # This documentation file
├── archives/                           # Archive file storage
│   ├── austinfood/                    # r/austinfood subreddit archives
│   │   ├── austinfood_comments.zst    # Comment data (53.73 MB)
│   │   └── austinfood_submissions.zst # Post submission data (6.71 MB)
│   └── FoodNYC/                       # r/FoodNYC subreddit archives
│       ├── FoodNYC_comments.zst       # Comment data (49.07 MB)
│       └── FoodNYC_submissions.zst    # Post submission data (8.75 MB)
└── scripts/                           # Validation and utility scripts
    ├── validate-pushshift-access.ts   # File accessibility validation
    └── validate-archive-integrity.ts  # Archive format and integrity validation
```

## Archive File Details

### Target Subreddits

- **r/austinfood**: Primary Austin food community (60.44 MB total)
- **r/FoodNYC**: New York food community (57.82 MB total)

### File Types

- **Comments (.zst)**: User comments and discussions within posts
- **Submissions (.zst)**: Original posts and threads

### Format Specifications

- **Compression**: zstd (Zstandard) compression format
- **Data Format**: ndjson (Newline-delimited JSON)
- **Structure**: One JSON object per line, each representing a Reddit post or comment
- **Coverage**: Complete historical data through end-2024

## Data Schema

### Comment Objects

Typical fields in comment JSON objects:

```json
{
  "id": "comment_id",
  "body": "comment text content",
  "author": "username",
  "created_utc": 1640995200,
  "score": 5,
  "subreddit": "austinfood",
  "link_id": "t3_post_id",
  "parent_id": "t1_parent_comment_id"
}
```

### Submission Objects

Typical fields in submission JSON objects:

```json
{
  "id": "post_id",
  "title": "post title",
  "selftext": "post body text",
  "author": "username",
  "created_utc": 1640995200,
  "score": 25,
  "subreddit": "austinfood",
  "num_comments": 8,
  "url": "reddit_url"
}
```

## Usage and Processing

### Stream Processing Requirements

- **Memory Efficiency**: Files must be processed line-by-line using streaming
- **Decompression**: Use zstd libraries for on-the-fly decompression
- **JSON Parsing**: Parse each line as individual JSON object
- **Batch Processing**: Process in batches to optimize database operations

### Integration Points

- **LLM Processing**: Extracted content feeds into existing M02 LLM integration
- **Entity Resolution**: Posts/comments processed through entity resolution system
- **Database Storage**: Processed entities stored in unified graph-based model

## Validation and Quality Assurance

### Accessibility Validation

Run the accessibility validation script:

```bash
npx ts-node scripts/validate-pushshift-access.ts
```

### Integrity Validation

Run the archive integrity validation script:

```bash
npx ts-node scripts/validate-archive-integrity.ts
```

### Queueing Archive Ingestion

To enqueue archive data into the shared batch pipeline (jobs remain paused for inspection):

```bash
yarn --cwd apps/api ts-node scripts/archive-smoke-test.ts
```

This script validates the environment, chunks archive posts into Bull jobs, and reports queue counts and archive metrics without triggering downstream LLM processing.

### Expected Results

- ✅ All 4 archive files present and accessible
- ✅ Valid zstd compression format
- ✅ Valid ndjson structure with parseable JSON objects
- ✅ Reddit post/comment fields present in sample data

## Production Storage Strategy

### Current: Local Development Storage

- **Location**: `apps/api/data/pushshift/`
- **Purpose**: Development and initial processing
- **Backup**: Files should be backed up regularly

### Future: S3 Production Storage

- **Migration Path**: Archive files will be migrated to S3 for production deployment
- **Access Pattern**: Download to processing instances as needed
- **Cost Optimization**: Use S3 Intelligent Tiering for cost management
- **Retention**: Keep archives for historical processing capability

## Security and Access Control

### File Permissions

- **Read Access**: Required for Node.js processing (✅ Verified)
- **Write Access**: Not required for archive files (read-only)
- **Execute Access**: Not applicable for data files

### Sensitive Data

- **PII Handling**: Reddit usernames are public data, no additional PII expected
- **Content Filtering**: LLM processing will filter for food-related content only
- **Retention Policy**: Archives maintained for legitimate business purposes

## Related Documentation

- **PRD Section 5.1.1**: Initial Historical Load (Primary Foundation)
- **PRD Section 6.1**: Processing Pipeline - Data source selection
- **PRD Section 9.3**: Milestone 3 Hybrid Data Collection Implementation
- **Sprint M03_S01**: Historical Data Foundation (Pushshift Archives)

## Support and Troubleshooting

### Common Issues

1. **File Access Errors**: Check file permissions with `ls -la archives/*/`
2. **Integrity Failures**: Re-run validation scripts to identify specific issues
3. **Processing Errors**: Verify zstd command-line tool is installed

### Contact

For questions about archive processing or data issues, refer to:

- Sprint documentation in `.simone/03_SPRINTS/M03_S01_Historical_Data_Foundation/`
- Task-specific documentation in individual task files
