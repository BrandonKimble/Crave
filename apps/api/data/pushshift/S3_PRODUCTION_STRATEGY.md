# S3 Production Storage Strategy for Pushshift Archives

## Overview

This document outlines the production storage strategy for migrating Pushshift archives from local development storage to AWS S3, as specified in PRD Section 5.1.1 for production scaling.

## Current State: Local Development Storage

### Storage Details
- **Location**: `apps/api/data/pushshift/archives/`
- **Total Size**: ~118 MB (4 archive files)
- **Access Pattern**: Direct file system access via Node.js
- **Backup**: Local development machine only

### Files Inventory
```
austinfood/
├── austinfood_comments.zst    (53.73 MB)
└── austinfood_submissions.zst (6.71 MB)

FoodNYC/  
├── FoodNYC_comments.zst       (49.07 MB)
└── FoodNYC_submissions.zst    (8.75 MB)
```

## Production Migration Strategy

### Phase 1: S3 Bucket Setup
```bash
# Create S3 bucket with appropriate configuration
aws s3 mb s3://crave-search-pushshift-archives --region us-east-1

# Enable versioning for data integrity
aws s3api put-bucket-versioning \
  --bucket crave-search-pushshift-archives \
  --versioning-configuration Status=Enabled

# Configure lifecycle policies for cost optimization
aws s3api put-bucket-lifecycle-configuration \
  --bucket crave-search-pushshift-archives \
  --lifecycle-configuration file://lifecycle-policy.json
```

### Phase 2: Archive Upload
```bash
# Upload archives maintaining directory structure
aws s3 sync data/pushshift/archives/ \
  s3://crave-search-pushshift-archives/archives/ \
  --storage-class STANDARD_IA
```

### Phase 3: Configuration Update
Environment variables for production:
```env
PUSHSHIFT_S3_BUCKET=crave-search-pushshift-archives
PUSHSHIFT_S3_REGION=us-east-1
PUSHSHIFT_S3_KEY_PREFIX=archives/
```

## S3 Storage Configuration

### Bucket Structure
```
s3://crave-search-pushshift-archives/
└── archives/
    ├── austinfood/
    │   ├── austinfood_comments.zst
    │   └── austinfood_submissions.zst
    └── FoodNYC/
        ├── FoodNYC_comments.zst
        └── FoodNYC_submissions.zst
```

### Storage Classes and Lifecycle

#### Initial Storage: Standard-IA
- **Rationale**: Archives accessed infrequently after initial processing
- **Cost**: ~$0.0125/GB/month (vs $0.023/GB for Standard)
- **Retrieval**: Immediate access when needed

#### Lifecycle Transitions
```json
{
  "Rules": [
    {
      "ID": "PushshiftArchiveLifecycle",
      "Status": "Enabled",
      "Filter": {"Prefix": "archives/"},
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        },
        {
          "Days": 365,
          "StorageClass": "DEEP_ARCHIVE"
        }
      ]
    }
  ]
}
```

### Access Patterns and Cost Analysis

#### Development/Testing Access
- **Frequency**: High during development (multiple times per day)
- **Data Transfer**: Full file downloads for processing
- **Cost Impact**: Standard-IA appropriate for development phase

#### Production Processing Access  
- **Frequency**: Low (initial processing, then occasional re-processing)
- **Data Transfer**: Stream processing - full file downloads
- **Cost Impact**: Glacier retrieval acceptable for batch processing

#### Monthly Cost Estimates
```
Current Size: 0.12 GB
Standard-IA: ~$0.0015/month
Glacier: ~$0.0005/month  
Deep Archive: ~$0.0001/month

Data Transfer (estimated 10 downloads/month): ~$0.001
Total Monthly Cost: <$0.01
```

## Implementation Architecture

### S3 Integration Service
Create service for S3 archive access:

```typescript
// src/modules/content-processing/pushshift-storage/s3-archive.service.ts
@Injectable()
export class S3ArchiveService {
  private s3Client: S3Client;
  
  async downloadArchive(subreddit: string, fileType: string): Promise<Readable> {
    const key = `archives/${subreddit}/${subreddit}_${fileType}.zst`;
    
    const command = new GetObjectCommand({
      Bucket: this.configService.get('pushshift.storage.s3.bucket'),
      Key: key,
    });
    
    const response = await this.s3Client.send(command);
    return response.Body as Readable;
  }
}
```

### Local Cache Strategy
- **Cache Location**: `/tmp/pushshift-cache/`
- **Cache Policy**: Download once per processing run, cleanup after completion
- **Fallback**: Direct S3 streaming if cache fails

## Security and Access Control

### IAM Policy Requirements
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion"
      ],
      "Resource": "arn:aws:s3:::crave-search-pushshift-archives/archives/*"
    },
    {
      "Effect": "Allow", 
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::crave-search-pushshift-archives",
      "Condition": {
        "StringLike": {
          "s3:prefix": "archives/*"
        }
      }
    }
  ]
}
```

### Encryption
- **Encryption at Rest**: S3 server-side encryption (SSE-S3)
- **Encryption in Transit**: HTTPS for all S3 API calls
- **Key Management**: AWS managed keys (no additional cost)

## Monitoring and Alerting

### CloudWatch Metrics
- **S3 Storage Metrics**: Monitor storage usage and costs
- **Data Transfer Metrics**: Track download frequency and volume
- **Access Patterns**: Monitor GET request patterns

### Alerting Thresholds
- **Cost Alert**: >$5/month (significant increase from expected <$0.01)
- **Access Frequency**: >100 downloads/day (potential abuse)
- **Storage Growth**: Any unexpected storage increase

## Disaster Recovery and Backup

### Multi-Region Backup
- **Primary**: us-east-1 (production region)
- **Backup**: us-west-2 (cross-region replication)
- **Recovery Time**: <1 hour to switch regions

### Data Integrity
- **S3 Versioning**: Enabled to protect against corruption
- **Checksum Validation**: Verify file integrity after downloads
- **Backup Validation**: Regular integrity checks on backup copies

## Migration Timeline and Rollout

### Pre-Production (Weeks 1-2)
1. ✅ Local storage organization complete
2. ⏳ S3 bucket creation and configuration
3. ⏳ Upload archives to S3
4. ⏳ Test S3 integration service

### Production Migration (Week 3)
1. ⏳ Deploy S3-enabled code to staging
2. ⏳ Validate end-to-end processing with S3 archives
3. ⏳ Production deployment with S3 configuration
4. ⏳ Monitor and validate production access

### Post-Migration (Week 4+)
1. ⏳ Monitor costs and access patterns
2. ⏳ Implement lifecycle transitions
3. ⏳ Establish backup and DR procedures
4. ⏳ Document operational procedures

## Environment Configuration

### Development Environment
```env
# Keep local storage for development
PUSHSHIFT_LOCAL_ARCHIVE_PATH=data/pushshift/archives
# S3 disabled in development
PUSHSHIFT_S3_BUCKET=
```

### Production Environment  
```env
# S3 production configuration
PUSHSHIFT_S3_BUCKET=crave-search-pushshift-archives
PUSHSHIFT_S3_REGION=us-east-1
PUSHSHIFT_S3_KEY_PREFIX=archives/
# Fallback to local if S3 unavailable
PUSHSHIFT_LOCAL_ARCHIVE_PATH=data/pushshift/archives
```

## Related Documentation

- **PRD Section 5.1.1**: Initial Historical Load storage requirements
- **Archive Documentation**: `apps/api/data/pushshift/README.md`
- **Configuration**: `apps/api/src/config/configuration.ts`
- **Sprint Context**: `.simone/03_SPRINTS/M03_S01_Historical_Data_Foundation/`

## Support and Troubleshooting

### Common Issues
1. **S3 Access Denied**: Verify IAM policies and credentials
2. **Network Timeout**: Increase timeout settings for large file downloads
3. **Cost Overruns**: Check access patterns and lifecycle policies
4. **Data Integrity**: Verify checksums and re-upload if necessary

### Monitoring Commands
```bash
# Check S3 storage usage
aws s3 ls s3://crave-search-pushshift-archives --recursive --human-readable --summarize

# Monitor recent access
aws logs filter-log-events --log-group-name /aws/s3/access-logs

# Validate file integrity
aws s3api head-object --bucket crave-search-pushshift-archives --key archives/austinfood/austinfood_comments.zst
```