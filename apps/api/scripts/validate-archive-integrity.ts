#!/usr/bin/env ts-node

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Script to validate Pushshift archive file integrity
 * Tests zstd decompression and ndjson format without full extraction
 */

const PUSHSHIFT_BASE_DIR = path.join(
  __dirname,
  '..',
  'data',
  'pushshift',
  'archives',
);
const SUBREDDITS = ['austinfood', 'FoodNYC'];
const FILE_TYPES = ['comments', 'submissions'];

interface ValidationResult {
  file: string;
  isValidZstd: boolean;
  isValidNdjson: boolean;
  sampleLineCount: number;
  error?: string;
}

async function validateArchiveIntegrity(): Promise<void> {
  console.log('🔍 Validating Pushshift archive integrity and format...\n');

  const results: ValidationResult[] = [];

  for (const subreddit of SUBREDDITS) {
    console.log(`📁 Validating ${subreddit}:`);

    for (const fileType of FILE_TYPES) {
      const fileName = `${subreddit}_${fileType}.zst`;
      const filePath = path.join(PUSHSHIFT_BASE_DIR, subreddit, fileName);

      try {
        // Test 1: Validate zstd compression integrity
        console.log(`   🔍 Testing zstd integrity for ${fileName}...`);
        await execAsync(`zstd -t "${filePath}"`);
        console.log(`   ✅ ${fileName} - Valid zstd compression`);

        // Test 2: Decompress first few lines and validate JSON format
        console.log(`   🔍 Testing ndjson format for ${fileName}...`);
        const { stdout } = await execAsync(
          `zstd -dc "${filePath}" | head -n 3`,
        );

        const lines = stdout.trim().split('\n');
        let validJsonLines = 0;

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line) as unknown;
              // Basic validation - should have typical Reddit post/comment fields
              if (
                typeof parsed === 'object' &&
                parsed !== null &&
                ((parsed as { id?: unknown }).id ||
                  (parsed as { name?: unknown }).name)
              ) {
                validJsonLines++;
              }
            } catch {
              console.log(
                `   ⚠️  Invalid JSON line: ${line.substring(0, 100)}...`,
              );
            }
          }
        }

        const isValidNdjson = validJsonLines > 0;
        console.log(
          `   ✅ ${fileName} - Valid ndjson format (${validJsonLines}/${lines.length} valid lines)`,
        );

        results.push({
          file: fileName,
          isValidZstd: true,
          isValidNdjson,
          sampleLineCount: validJsonLines,
        });
      } catch (error) {
        const errorMessage =
          (error as { message?: string }).message || 'Unknown error';
        console.error(`   ❌ ${fileName} - Error: ${errorMessage}`);

        results.push({
          file: fileName,
          isValidZstd: false,
          isValidNdjson: false,
          sampleLineCount: 0,
          error: errorMessage,
        });
      }
    }
    console.log();
  }

  // Summary report
  console.log(`📊 Validation Summary:`);
  const validFiles = results.filter((r) => r.isValidZstd && r.isValidNdjson);
  console.log(`   Total files: ${results.length}`);
  console.log(`   Valid archives: ${validFiles.length}`);
  console.log(
    `   Total sample lines validated: ${validFiles.reduce((sum, r) => sum + r.sampleLineCount, 0)}`,
  );

  if (validFiles.length === results.length) {
    console.log(
      `   🎉 All archive files have valid zstd compression and ndjson format!`,
    );
    process.exit(0);
  } else {
    console.error(
      `   ⚠️  ${results.length - validFiles.length} files failed validation`,
    );
    results
      .filter((r) => r.error)
      .forEach((r) => {
        console.error(`     - ${r.file}: ${r.error}`);
      });
    process.exit(1);
  }
}

// Execute validation
validateArchiveIntegrity().catch((error) => {
  console.error('❌ Validation failed:', error);
  process.exit(1);
});
