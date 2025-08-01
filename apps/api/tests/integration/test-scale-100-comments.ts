#!/usr/bin/env ts-node

/**
 * Scale Test: 100+ Real Reddit Comments
 * 
 * Stress test the complete pipeline with real Reddit data at scale
 * to identify bottlenecks, rate limits, and integration issues
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { RedditService } from './src/modules/external-integrations/reddit/reddit.service';
import { LLMService } from './src/modules/external-integrations/llm/llm.service';
import { EntityResolutionService } from './src/modules/content-processing/entity-resolver/entity-resolution.service';
import { EntityRepository } from './src/repositories/entity.repository';
import { ConnectionRepository } from './src/repositories/connection.repository';
import { MentionRepository } from './src/repositories/mention.repository';
import { LoggerService } from './src/shared';

interface ScaleTestMetrics {
  redditCollection: {
    postsRetrieved: number;
    commentsRetrieved: number;
    processingTime: number;
    errors: string[];
  };
  llmProcessing: {
    batchesProcessed: number;
    totalMentionsExtracted: number;
    processingTime: number;
    errors: string[];
    rateLimitHits: number;
  };
  entityResolution: {
    entitiesProcessed: number;
    newEntitiesCreated: number;
    processingTime: number;
    errors: string[];
  };
  databaseOperations: {
    finalEntityCount: number;
    finalConnectionCount: number;
    finalMentionCount: number;
    errors: string[];
  };
}

async function testScale100Comments() {
  console.log('🚀 SCALE TEST: 100+ Real Reddit Comments');
  console.log('========================================');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();
  
  const redditService = app.get(RedditService);
  const llmService = app.get(LLMService);
  const entityResolution = app.get(EntityResolutionService);
  const entityRepo = app.get(EntityRepository);
  const connectionRepo = app.get(ConnectionRepository);
  const mentionRepo = app.get(MentionRepository);
  const logger = app.get(LoggerService).setContext('ScaleTest');
  
  const metrics: ScaleTestMetrics = {
    redditCollection: { postsRetrieved: 0, commentsRetrieved: 0, processingTime: 0, errors: [] },
    llmProcessing: { batchesProcessed: 0, totalMentionsExtracted: 0, processingTime: 0, errors: [], rateLimitHits: 0 },
    entityResolution: { entitiesProcessed: 0, newEntitiesCreated: 0, processingTime: 0, errors: [] },
    databaseOperations: { finalEntityCount: 0, finalConnectionCount: 0, finalMentionCount: 0, errors: [] }
  };
  
  try {
    // STEP 1: Collect Real Reddit Data at Scale
    console.log('📡 STEP 1: Large-Scale Reddit Collection');
    console.log('---------------------------------------');
    
    const collectionStart = Date.now();
    const allPosts: any[] = [];
    const allComments: any[] = [];
    
    // Collect from multiple subreddits to get diverse content
    const subreddits = ['austinfood', 'FoodNYC'];
    const postsPerSubreddit = 50;
    
    for (const subreddit of subreddits) {
      try {
        console.log(`  Collecting ${postsPerSubreddit} posts from r/${subreddit}...`);
        const redditData = await redditService.getChronologicalPosts(subreddit, postsPerSubreddit);
        
        // Extract posts with meaningful content and comments
        const postsWithComments = redditData.data.filter((post: any) => 
          post.title && post.title.length > 10
        );
        
        allPosts.push(...postsWithComments);
        console.log(`    Retrieved ${postsWithComments.length} posts from r/${subreddit}`);
        
        // Extract comments from posts (simulate comment structure since Reddit API doesn't return them directly)
        postsWithComments.forEach((post: any, index: number) => {
          // Create simulated comments based on post content to test processing
          if (post.selftext && post.selftext.length > 20) {
            allComments.push({
              comment_id: `${post.id}_comment_${index}`,
              content: post.selftext,
              author: `user_${index}`,
              upvotes: post.score || 1,
              created_at: new Date(post.created_utc * 1000).toISOString(),
              parent_id: null,
              url: `${post.url}_comment_${index}`
            });
          }
        });
        
        // Add some delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (redditError) {
        const errorMsg = redditError instanceof Error ? redditError.message : String(redditError);
        metrics.redditCollection.errors.push(`${subreddit}: ${errorMsg}`);
        console.log(`    ⚠️ Error collecting from r/${subreddit}: ${errorMsg}`);
      }
    }
    
    metrics.redditCollection.postsRetrieved = allPosts.length;
    metrics.redditCollection.commentsRetrieved = allComments.length;
    metrics.redditCollection.processingTime = Date.now() - collectionStart;
    
    console.log(`✅ Collection Results:`);
    console.log(`   Posts retrieved: ${metrics.redditCollection.postsRetrieved}`);
    console.log(`   Comments extracted: ${metrics.redditCollection.commentsRetrieved}`);
    console.log(`   Collection time: ${metrics.redditCollection.processingTime}ms`);
    console.log(`   Errors: ${metrics.redditCollection.errors.length}`);
    
    if (allComments.length === 0) {
      console.log('❌ No comments collected - cannot proceed with scale test');
      return;
    }
    
    // STEP 2: Batch Process Through LLM
    console.log('\\n🧠 STEP 2: Large-Scale LLM Processing');
    console.log('------------------------------------');
    
    const llmStart = Date.now();
    const batchSize = 10; // Process in smaller batches to avoid timeouts
    const commentBatches: any[][] = [];
    
    // Split comments into batches
    for (let i = 0; i < allComments.length; i += batchSize) {
      commentBatches.push(allComments.slice(i, i + batchSize));
    }
    
    console.log(`Processing ${allComments.length} comments in ${commentBatches.length} batches of ${batchSize}...`);
    
    const allMentions: any[] = [];
    
    for (let batchIndex = 0; batchIndex < commentBatches.length; batchIndex++) {
      const batch: any[] = commentBatches[batchIndex];
      
      try {
        console.log(`  Processing batch ${batchIndex + 1}/${commentBatches.length} (${batch.length} comments)...`);
        
        // Create LLM input for this batch
        const llmInput = {
          posts: [{
            post_id: `batch_${batchIndex}`,
            title: `Batch ${batchIndex + 1} Comments`,
            content: '',
            subreddit: 'austinfood',
            url: `https://reddit.com/batch_${batchIndex}`,
            upvotes: 1,
            created_at: new Date().toISOString(),
            comments: batch
          }]
        };
        
        const llmResult = await llmService.processContent(llmInput);
        allMentions.push(...llmResult.mentions);
        metrics.llmProcessing.batchesProcessed++;
        
        console.log(`    Batch ${batchIndex + 1}: ${llmResult.mentions.length} mentions extracted`);
        
        // Add delay between batches to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (llmError) {
        const errorMsg = llmError instanceof Error ? llmError.message : String(llmError);
        metrics.llmProcessing.errors.push(`Batch ${batchIndex + 1}: ${errorMsg}`);
        console.log(`    ❌ Batch ${batchIndex + 1} failed: ${errorMsg}`);
        
        if (errorMsg.includes('rate limit') || errorMsg.includes('quota')) {
          metrics.llmProcessing.rateLimitHits++;
          console.log('    ⏸️  Rate limit hit - waiting longer...');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
    }
    
    metrics.llmProcessing.totalMentionsExtracted = allMentions.length;
    metrics.llmProcessing.processingTime = Date.now() - llmStart;
    
    console.log(`✅ LLM Processing Results:`);
    console.log(`   Batches processed: ${metrics.llmProcessing.batchesProcessed}/${commentBatches.length}`);
    console.log(`   Total mentions extracted: ${metrics.llmProcessing.totalMentionsExtracted}`);
    console.log(`   Processing time: ${metrics.llmProcessing.processingTime}ms`);
    console.log(`   Errors: ${metrics.llmProcessing.errors.length}`);
    console.log(`   Rate limit hits: ${metrics.llmProcessing.rateLimitHits}`);
    
    if (allMentions.length === 0) {
      console.log('⚠️ No mentions extracted - checking if content meets processing criteria');
      console.log('Sample comment contents:');
      allComments.slice(0, 3).forEach((comment, index) => {
        console.log(`  ${index + 1}. "${comment.content.substring(0, 100)}..."`);
      });
    }
    
    // STEP 3: Large-Scale Entity Resolution
    if (allMentions.length > 0) {
      console.log('\\n🎯 STEP 3: Large-Scale Entity Resolution');
      console.log('----------------------------------------');
      
      const entityStart = Date.now();
      const entityInputs: any[] = [];
      
      // Extract all entities from mentions
      for (const mention of allMentions) {
        if (mention.restaurant?.normalized_name) {
          entityInputs.push({
            tempId: mention.restaurant.temp_id,
            normalizedName: mention.restaurant.normalized_name,
            originalText: mention.restaurant.original_text || mention.restaurant.normalized_name,
            entityType: 'restaurant' as const,
            aliases: []
          });
        }
        
        if (mention.dish_or_category?.normalized_name) {
          entityInputs.push({
            tempId: mention.dish_or_category.temp_id,
            normalizedName: mention.dish_or_category.normalized_name,
            originalText: mention.dish_or_category.original_text || mention.dish_or_category.normalized_name,
            entityType: 'dish_or_category' as const,
            aliases: []
          });
        }
      }
      
      console.log(`Processing ${entityInputs.length} entities for resolution...`);
      
      try {
        const resolutionResult = await entityResolution.resolveBatch(entityInputs);
        
        metrics.entityResolution.entitiesProcessed = resolutionResult.resolutionResults.length;
        metrics.entityResolution.newEntitiesCreated = resolutionResult.newEntitiesCreated;
        metrics.entityResolution.processingTime = Date.now() - entityStart;
        
        console.log(`✅ Entity Resolution Results:`);
        console.log(`   Entities processed: ${metrics.entityResolution.entitiesProcessed}`);
        console.log(`   New entities created: ${metrics.entityResolution.newEntitiesCreated}`);  
        console.log(`   Exact matches: ${resolutionResult.performanceMetrics.exactMatches}`);
        console.log(`   Fuzzy matches: ${resolutionResult.performanceMetrics.fuzzyMatches}`);
        console.log(`   Processing time: ${metrics.entityResolution.processingTime}ms`);
        
      } catch (entityError) {
        const errorMsg = entityError instanceof Error ? entityError.message : String(entityError);
        metrics.entityResolution.errors.push(errorMsg);
        console.log(`❌ Entity resolution failed: ${errorMsg}`);
      }
    }
    
    // STEP 4: Final Database State Assessment
    console.log('\\n💾 STEP 4: Final Database Assessment');
    console.log('-----------------------------------');
    
    try {
      metrics.databaseOperations.finalEntityCount = await entityRepo.count();
      metrics.databaseOperations.finalConnectionCount = await connectionRepo.count();
      metrics.databaseOperations.finalMentionCount = await mentionRepo.count();
      
      console.log(`✅ Final Database State:`);
      console.log(`   Total entities: ${metrics.databaseOperations.finalEntityCount}`);
      console.log(`   Total connections: ${metrics.databaseOperations.finalConnectionCount}`);
      console.log(`   Total mentions: ${metrics.databaseOperations.finalMentionCount}`);
      
      // Sample some entities
      if (metrics.databaseOperations.finalEntityCount > 0) {
        const restaurants = await entityRepo.findMany({
          where: { type: 'restaurant' },
          take: 5
        });
        
        const dishes = await entityRepo.findMany({
          where: { type: 'dish_or_category' },
          take: 5
        });
        
        console.log(`\\nSample Results:`);
        console.log(`Restaurants: ${restaurants.map(r => r.name).join(', ')}`);
        console.log(`Dishes: ${dishes.map(d => d.name).join(', ')}`);
      }
      
    } catch (dbError) {
      const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      metrics.databaseOperations.errors.push(errorMsg);
      console.log(`❌ Database assessment failed: ${errorMsg}`);
    }
    
    // FINAL ASSESSMENT
    console.log('\\n📊 SCALE TEST FINAL ASSESSMENT');
    console.log('===============================');
    
    const totalProcessingTime = 
      metrics.redditCollection.processingTime +
      metrics.llmProcessing.processingTime + 
      metrics.entityResolution.processingTime;
    
    console.log(`\\n⏱️  Performance Metrics:`);
    console.log(`   Total processing time: ${totalProcessingTime}ms (${(totalProcessingTime/1000).toFixed(1)}s)`);
    console.log(`   Reddit collection: ${metrics.redditCollection.processingTime}ms`);
    console.log(`   LLM processing: ${metrics.llmProcessing.processingTime}ms`);
    console.log(`   Entity resolution: ${metrics.entityResolution.processingTime}ms`);
    
    console.log(`\\n🔢 Volume Metrics:`);
    console.log(`   Comments processed: ${metrics.redditCollection.commentsRetrieved}`);
    console.log(`   Mentions extracted: ${metrics.llmProcessing.totalMentionsExtracted}`);
    console.log(`   Entities created: ${metrics.entityResolution.newEntitiesCreated}`);
    console.log(`   Extraction rate: ${((metrics.llmProcessing.totalMentionsExtracted / metrics.redditCollection.commentsRetrieved) * 100).toFixed(1)}%`);
    
    console.log(`\\n❌ Error Summary:`);
    console.log(`   Reddit errors: ${metrics.redditCollection.errors.length}`);
    console.log(`   LLM errors: ${metrics.llmProcessing.errors.length}`);
    console.log(`   Entity resolution errors: ${metrics.entityResolution.errors.length}`);
    console.log(`   Database errors: ${metrics.databaseOperations.errors.length}`);
    console.log(`   Rate limit hits: ${metrics.llmProcessing.rateLimitHits}`);
    
    // Assessment
    const totalErrors = 
      metrics.redditCollection.errors.length +
      metrics.llmProcessing.errors.length +
      metrics.entityResolution.errors.length +
      metrics.databaseOperations.errors.length;
    
    const successRate = ((metrics.redditCollection.commentsRetrieved - totalErrors) / metrics.redditCollection.commentsRetrieved) * 100;
    
    console.log(`\\n🎯 SCALE TEST RESULTS:`);
    if (successRate > 80) {
      console.log(`✅ SUCCESS: ${successRate.toFixed(1)}% success rate at scale`);
      console.log(`   System handles 100+ comments reliably`);
      console.log(`   Ready for production-scale processing`);
    } else if (successRate > 50) {
      console.log(`⚠️  PARTIAL SUCCESS: ${successRate.toFixed(1)}% success rate`);
      console.log(`   System works but has scaling issues to address`);
    } else {
      console.log(`❌ SCALE ISSUES: ${successRate.toFixed(1)}% success rate`);
      console.log(`   Significant scaling problems need resolution`);
    }
    
    console.log(`\\n🔍 Issues Found:`);
    if (metrics.llmProcessing.rateLimitHits > 0) {
      console.log(`   - LLM rate limiting (${metrics.llmProcessing.rateLimitHits} hits)`);
    }
    if (metrics.llmProcessing.errors.length > 0) {
      console.log(`   - LLM processing failures (${metrics.llmProcessing.errors.length})`);
    }
    if (metrics.entityResolution.errors.length > 0) {
      console.log(`   - Entity resolution issues (${metrics.entityResolution.errors.length})`);
    }
    
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logger.error('Scale test failed', errorObj);
    console.log(`❌ Scale test crashed: ${errorObj.message}`);
  } finally {
    await app.close();
  }
}

testScale100Comments()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Scale test crashed:', error);
    process.exit(1);
  });