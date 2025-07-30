#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

/**
 * Script to validate Pushshift archive file accessibility
 * Verifies Node.js can read archive files for processing
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

function validateFileAccess(): void {
  console.log('🔍 Validating Pushshift archive file accessibility...\n');

  let totalFiles = 0;
  let accessibleFiles = 0;
  let totalSizeBytes = 0;

  for (const subreddit of SUBREDDITS) {
    console.log(`📁 Checking ${subreddit}:`);

    for (const fileType of FILE_TYPES) {
      totalFiles++;
      const fileName = `${subreddit}_${fileType}.zst`;
      const filePath = path.join(PUSHSHIFT_BASE_DIR, subreddit, fileName);

      try {
        const stats = fs.statSync(filePath);
        const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
        totalSizeBytes += stats.size;

        // Test read access by opening file handle
        const fd = fs.openSync(filePath, 'r');
        fs.closeSync(fd);

        console.log(`   ✅ ${fileName} - ${sizeInMB} MB - Accessible`);
        accessibleFiles++;
      } catch (error) {
        console.error(
          `   ❌ ${fileName} - Error: ${(error as { message?: string }).message}`,
        );
      }
    }
    console.log();
  }

  const totalSizeInGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);

  console.log(`📊 Summary:`);
  console.log(`   Total files: ${totalFiles}`);
  console.log(`   Accessible files: ${accessibleFiles}`);
  console.log(`   Total size: ${totalSizeInGB} GB`);

  if (accessibleFiles === totalFiles) {
    console.log(
      `   🎉 All archive files are accessible for Node.js processing!`,
    );
    process.exit(0);
  } else {
    console.error(
      `   ⚠️  ${totalFiles - accessibleFiles} files are not accessible`,
    );
    process.exit(1);
  }
}

// Execute validation
try {
  validateFileAccess();
} catch (error) {
  console.error('❌ Validation failed:', error);
  process.exit(1);
}
