/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await */
// Reason: Test file with mock object setup and async test patterns

import {
  RedditDataExtractorService,
  CraveRedditComment,
} from './reddit-data-extractor.service';
import { LoggerService } from '../../../shared';
import { SystemZstdDecompressor } from './system-zstd-decompressor.service';
import * as path from 'path';

describe('RedditDataExtractorService', () => {
  let extractor: RedditDataExtractorService;
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
  });

  describe('extractCraveSearchData', () => {
    it('should extract required fields from valid Reddit comment', () => {
      const rawComment = {
        id: 'c6rjv8v',
        body: "I'm really digging the club at Spec's Deli right now.",
        author: 'ciscotree',
        subreddit: 'austinfood',
        created_utc: '1351174723',
        score: 2,
        link_id: 't3_122e4j',
        parent_id: 't3_122e4j',
        // Extra fields that should be filtered out
        archived: true,
        author_flair_css_class: null,
        controversiality: 0,
        gilded: 0,
        ups: 2,
        downs: 0,
      };

      const result = extractor.extractCraveSearchData(rawComment);

      expect(result).toEqual({
        id: 'c6rjv8v',
        body: "I'm really digging the club at Spec's Deli right now.",
        author: 'ciscotree',
        subreddit: 'austinfood',
        created_utc: 1351174723,
        score: 2,
        link_id: 't3_122e4j',
        parent_id: 't3_122e4j',
      });
    });

    it('should handle numeric timestamp correctly', () => {
      const rawComment = {
        id: 'test123',
        body: 'Test comment',
        author: 'testuser',
        subreddit: 'test',
        created_utc: 1351174723, // Already a number
        score: 5,
        link_id: 't3_test',
      };

      const result = extractor.extractCraveSearchData(rawComment);
      expect(result?.created_utc).toBe(1351174723);
    });

    it('should handle optional edited field correctly', () => {
      const commentWithEditTime = {
        id: 'test1',
        body: 'Edited comment',
        author: 'user1',
        subreddit: 'test',
        created_utc: '1351174723',
        score: 1,
        link_id: 't3_test',
        edited: 1351175000, // Unix timestamp
      };

      const commentWithEditFlag = {
        ...commentWithEditTime,
        edited: true,
      };

      const commentNotEdited = {
        ...commentWithEditTime,
        edited: false,
      };

      expect(
        extractor.extractCraveSearchData(commentWithEditTime)?.edited,
      ).toBe(1351175000);
      expect(
        extractor.extractCraveSearchData(commentWithEditFlag)?.edited,
      ).toBe(true);
      expect(
        extractor.extractCraveSearchData(commentNotEdited)?.edited,
      ).toBeUndefined();
    });

    it('should return null for missing required fields', () => {
      const incompleteComment = {
        id: 'test123',
        body: 'Test comment',
        // Missing author, subreddit, created_utc, score, link_id
      };

      const result = extractor.extractCraveSearchData(incompleteComment);
      expect(result).toBeNull();
    });

    it('should return null for empty string fields', () => {
      const emptyFieldComment = {
        id: '',
        body: 'Test comment',
        author: 'testuser',
        subreddit: 'test',
        created_utc: '1351174723',
        score: 1,
        link_id: 't3_test',
      };

      const result = extractor.extractCraveSearchData(emptyFieldComment);
      expect(result).toBeNull();
    });

    it('should return null for invalid input', () => {
      expect(extractor.extractCraveSearchData(null)).toBeNull();
      expect(extractor.extractCraveSearchData(undefined)).toBeNull();
      expect(extractor.extractCraveSearchData('invalid')).toBeNull();
      expect(extractor.extractCraveSearchData(123)).toBeNull();
    });
  });

  describe('validateExtractedData', () => {
    const validComment: CraveRedditComment = {
      id: 'c6rjv8v',
      body: "Great BBQ at Franklin's!",
      author: 'foodlover',
      subreddit: 'austinfood',
      created_utc: 1351174723,
      score: 15,
      link_id: 't3_122e4j',
    };

    it('should validate correct data as valid', () => {
      const result = extractor.validateExtractedData(validComment);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidComment = { ...validComment, id: '' };
      const result = extractor.validateExtractedData(invalidComment);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing or empty id');
    });

    it('should detect invalid timestamp', () => {
      const invalidComment = { ...validComment, created_utc: -1 };
      const result = extractor.validateExtractedData(invalidComment);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid created_utc timestamp');
    });

    it('should detect unreasonable timestamp', () => {
      const futureComment = { ...validComment, created_utc: 9999999999 }; // Far future
      const result = extractor.validateExtractedData(futureComment);

      expect(result.valid).toBe(false);
      expect(
        result.issues.some((issue) =>
          issue.includes('Timestamp out of reasonable range'),
        ),
      ).toBe(true);
    });
  });

  describe('getOptimizationStats', () => {
    it('should return correct optimization statistics', () => {
      const stats = extractor.getOptimizationStats();

      expect(stats).toEqual({
        totalFields: 22,
        requiredFields: 7,
        optionalFields: 3,
        filteredFields: 12,
        memoryReduction: 55, // Rounded down from 54.5%
      });
    });
  });

  describe('Real Data Integration Test', () => {
    let decompressor: SystemZstdDecompressor;

    beforeEach(() => {
      decompressor = new SystemZstdDecompressor(mockLogger);
    });

    it('should extract data from actual Reddit archive file', async () => {
      const testFilePath = path.resolve(
        __dirname,
        '../../../../data/pushshift/archives/austinfood/austinfood_comments.zst',
      );

      const extractedComments: CraveRedditComment[] = [];
      const extractionErrors: string[] = [];
      const maxTestItems = 50;

      const processor = async (rawComment: any, lineNumber: number) => {
        const extracted = extractor.extractCraveSearchData(rawComment);

        if (extracted) {
          const validation = extractor.validateExtractedData(extracted);
          if (validation.valid) {
            extractedComments.push(extracted);
          } else {
            extractionErrors.push(
              `Line ${lineNumber}: ${validation.issues.join(', ')}`,
            );
          }
        } else {
          extractionErrors.push(`Line ${lineNumber}: Failed to extract data`);
        }
      };

      console.log('🔧 Testing data extraction with real Reddit archive...');

      const result = await decompressor.streamDecompressFile(
        testFilePath,
        processor,
        {
          maxLines: maxTestItems,
          timeout: 30000,
        },
      );

      console.log('\n📊 EXTRACTION RESULTS:');
      console.log(`   Raw comments processed: ${result.totalLines}`);
      console.log(`   Successfully extracted: ${extractedComments.length}`);
      console.log(`   Extraction errors: ${extractionErrors.length}`);
      console.log(
        `   Success rate: ${Math.round(
          (extractedComments.length / result.totalLines) * 100,
        )}%`,
      );

      if (extractedComments.length > 0) {
        console.log('\n📝 Sample extracted comment:');
        const sample = extractedComments[0];
        console.log('   ID:', sample.id);
        console.log('   Author:', sample.author);
        console.log('   Subreddit:', sample.subreddit);
        console.log('   Score:', sample.score);
        console.log('   Body preview:', sample.body.substring(0, 80) + '...');
        console.log(
          '   Timestamp:',
          sample.created_utc,
          '(',
          new Date(sample.created_utc * 1000).toISOString(),
          ')',
        );

        // Show optimization stats
        const stats = extractor.getOptimizationStats();
        console.log('\n💾 Memory optimization:');
        console.log(
          `   Fields filtered out: ${stats.filteredFields}/${stats.totalFields}`,
        );
        console.log(`   Memory reduction: ${stats.memoryReduction}%`);
      }

      if (extractionErrors.length > 0 && extractionErrors.length <= 5) {
        console.log('\n❌ Sample extraction errors:');
        extractionErrors
          .slice(0, 5)
          .forEach((error) => console.log(`   ${error}`));
      }

      // Assertions
      expect(result.totalLines).toBeGreaterThan(0);
      expect(extractedComments.length).toBeGreaterThan(0);
      expect(extractedComments.length / result.totalLines).toBeGreaterThan(0.8); // 80%+ success rate

      // Validate structure of extracted comments
      extractedComments.forEach((comment) => {
        expect(comment.id).toBeDefined();
        expect(comment.body).toBeDefined();
        expect(comment.author).toBeDefined();
        expect(comment.subreddit).toBe('austinfood');
        expect(typeof comment.created_utc).toBe('number');
        expect(typeof comment.score).toBe('number');
        expect(comment.link_id).toBeDefined();
      });
    }, 60000); // 1 minute timeout
  });
});
