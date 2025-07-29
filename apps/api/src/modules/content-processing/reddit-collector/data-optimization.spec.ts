import { RedditDataExtractorService } from './reddit-data-extractor.service';
import { SystemZstdDecompressor } from './system-zstd-decompressor.service';
import { LoggerService } from '../../../shared';
import * as path from 'path';

describe('Reddit Data Optimization Comparison', () => {
  let extractor: RedditDataExtractorService;
  let decompressor: SystemZstdDecompressor;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    mockLogger = {
      setContext: jest.fn().mockReturnThis(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    extractor = new RedditDataExtractorService(mockLogger);
    decompressor = new SystemZstdDecompressor(mockLogger);
  });

  it('should demonstrate memory optimization with real data', async () => {
    const testFilePath = path.resolve(__dirname, '../../../../data/pushshift/archives/austinfood/austinfood_comments.zst');
    
    const fullDataComments: any[] = [];
    const optimizedComments: any[] = [];
    const maxTestItems = 100;
    
    const processor = async (rawComment: any, lineNumber: number) => {
      // Store full raw comment
      fullDataComments.push(rawComment);
      
      // Extract optimized comment
      const optimized = extractor.extractCraveSearchData(rawComment);
      if (optimized) {
        optimizedComments.push(optimized);
      }
    };

    console.log('📊 Running memory optimization comparison...');
    
    const result = await decompressor.streamDecompressFile(
      testFilePath,
      processor,
      {
        maxLines: maxTestItems,
        timeout: 30000,
      }
    );

    // Calculate memory usage differences
    const fullDataJson = JSON.stringify(fullDataComments);
    const optimizedJson = JSON.stringify(optimizedComments);
    
    const fullDataSize = Buffer.byteLength(fullDataJson, 'utf8');
    const optimizedSize = Buffer.byteLength(optimizedJson, 'utf8');
    const sizeDifference = fullDataSize - optimizedSize;
    const memoryReduction = Math.round((sizeDifference / fullDataSize) * 100);

    console.log('\n🔍 MEMORY USAGE COMPARISON:');
    console.log(`   Comments processed: ${result.totalLines}`);
    console.log(`   Full data size: ${Math.round(fullDataSize / 1024)} KB`);
    console.log(`   Optimized size: ${Math.round(optimizedSize / 1024)} KB`);
    console.log(`   Size reduction: ${Math.round(sizeDifference / 1024)} KB (${memoryReduction}%)`);
    
    console.log('\n📋 FIELD COMPARISON:');
    if (fullDataComments.length > 0) {
      const fullFields = Object.keys(fullDataComments[0]).sort();
      const optimizedFields = Object.keys(optimizedComments[0]).sort();
      
      console.log(`   Original fields (${fullFields.length}): ${fullFields.join(', ')}`);
      console.log(`   Optimized fields (${optimizedFields.length}): ${optimizedFields.join(', ')}`);
      
      const removedFields = fullFields.filter(field => !optimizedFields.includes(field));
      console.log(`   Removed fields (${removedFields.length}): ${removedFields.join(', ')}`);
    }
    
    console.log('\n📝 SAMPLE COMPARISON:');
    if (fullDataComments.length > 0 && optimizedComments.length > 0) {
      const fullSample = fullDataComments[0];
      const optimizedSample = optimizedComments[0];
      
      console.log('   Original comment keys:', Object.keys(fullSample).length);
      console.log('   Optimized comment keys:', Object.keys(optimizedSample).length);
      console.log('   Fields preserved: id, body, author, subreddit, created_utc, score, link_id');
      console.log('   Optional fields: parent_id, permalink, edited (if present)');
    }

    // Assertions
    expect(result.totalLines).toBeGreaterThan(0);
    expect(fullDataComments.length).toEqual(optimizedComments.length);
    expect(memoryReduction).toBeGreaterThan(40); // Should achieve >40% reduction
    expect(optimizedSize).toBeLessThan(fullDataSize);
    
    // Verify all essential data is preserved
    for (let i = 0; i < Math.min(fullDataComments.length, optimizedComments.length); i++) {
      const full = fullDataComments[i];
      const optimized = optimizedComments[i];
      
      expect(optimized.id).toBe(full.id);
      expect(optimized.body).toBe(full.body);
      expect(optimized.author).toBe(full.author);
      expect(optimized.subreddit).toBe(full.subreddit);
      expect(optimized.score).toBe(full.score);
      expect(optimized.link_id).toBe(full.link_id);
      
      // Timestamp should be normalized to number
      const expectedTimestamp = typeof full.created_utc === 'string' 
        ? parseInt(full.created_utc) 
        : full.created_utc;
      expect(optimized.created_utc).toBe(expectedTimestamp);
    }
    
  }, 60000);

  it('should validate all required fields are always present', async () => {
    const testFilePath = path.resolve(__dirname, '../../../../data/pushshift/archives/austinfood/austinfood_comments.zst');
    
    const extractedComments: any[] = [];
    const fieldPresence: Record<string, number> = {};
    const maxTestItems = 200;
    
    const processor = async (rawComment: any, lineNumber: number) => {
      const optimized = extractor.extractCraveSearchData(rawComment);
      if (optimized) {
        extractedComments.push(optimized);
        
        // Track field presence
        Object.keys(optimized).forEach(field => {
          fieldPresence[field] = (fieldPresence[field] || 0) + 1;
        });
      }
    };

    console.log('🔍 Validating field presence across comments...');
    
    const result = await decompressor.streamDecompressFile(
      testFilePath,
      processor,
      {
        maxLines: maxTestItems,
        timeout: 30000,
      }
    );

    console.log('\n📊 FIELD PRESENCE ANALYSIS:');
    console.log(`   Comments analyzed: ${extractedComments.length}`);
    
    const requiredFields = ['id', 'body', 'author', 'subreddit', 'created_utc', 'score', 'link_id'];
    const optionalFields = ['parent_id', 'permalink', 'edited'];
    
    console.log('\n✅ REQUIRED FIELDS (must be 100%):');
    requiredFields.forEach(field => {
      const count = fieldPresence[field] || 0;
      const percentage = Math.round((count / extractedComments.length) * 100);
      console.log(`   ${field.padEnd(15)}: ${count}/${extractedComments.length} (${percentage}%)`);
      expect(percentage).toBe(100); // All required fields must be present
    });
    
    console.log('\n📎 OPTIONAL FIELDS:');
    optionalFields.forEach(field => {
      const count = fieldPresence[field] || 0;
      const percentage = Math.round((count / extractedComments.length) * 100);
      console.log(`   ${field.padEnd(15)}: ${count}/${extractedComments.length} (${percentage}%)`);
    });
    
    // Verify data quality
    expect(extractedComments.length).toBeGreaterThan(0);
    expect(extractedComments.length / result.totalLines).toBeGreaterThan(0.9); // 90%+ extraction success
    
  }, 60000);
});