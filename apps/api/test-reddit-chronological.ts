/**
 * Simple test to verify Reddit chronological posts collection
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.test file
dotenv.config({ path: path.join(__dirname, '.env.test') });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { RedditService } from './src/modules/external-integrations/reddit/reddit.service';

async function testRedditChronological() {
  console.log('🔧 Testing Reddit Chronological Collection');
  console.log('==========================================');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const redditService = app.get(RedditService);
    
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    
    console.log(`\n📅 Fetching posts from 7 days ago: ${new Date(sevenDaysAgo * 1000).toISOString()}`);
    console.log('   Subreddit: austinfood');
    console.log('   Limit: 5 posts\n');
    
    const startTime = Date.now();
    const result = await redditService.getChronologicalPosts(
      'austinfood',
      sevenDaysAgo,
      5
    );
    const duration = Date.now() - startTime;
    
    console.log(`✅ Collection completed in ${duration}ms`);
    console.log(`   Posts found: ${result.data?.length || 0}`);
    console.log(`   API calls used: ${result.performance?.apiCallsUsed || 0}`);
    
    if (result.data && result.data.length > 0) {
      console.log('\n📝 First 3 posts:');
      result.data.slice(0, 3).forEach((post: any, i: number) => {
        const date = new Date((post.created_utc || 0) * 1000);
        console.log(`   ${i + 1}. "${post.title?.substring(0, 60)}..."`);
        console.log(`      Created: ${date.toISOString()}`);
        console.log(`      Score: ${post.score || 0}`);
      });
    } else {
      console.log('\n⚠️  No posts found in the specified time range');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : String(error));
  } finally {
    await app.close();
  }
}

// Run the test
testRedditChronological()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test error:', error);
    process.exit(1);
  });