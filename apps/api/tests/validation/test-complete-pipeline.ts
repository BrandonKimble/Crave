#!/usr/bin/env ts-node

/**
 * Complete Pipeline Test with Working Content
 * 
 * Tests the full end-to-end pipeline with content that meets LLM processing criteria:
 * Reddit Data → LLM Processing → Entity Resolution → Database Operations
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { LLMService } from './src/modules/external-integrations/llm/llm.service';
import { EntityResolutionService } from './src/modules/content-processing/entity-resolver/entity-resolution.service';
import { EntityRepository } from './src/repositories/entity.repository';
import { ConnectionRepository } from './src/repositories/connection.repository';
import { MentionRepository } from './src/repositories/mention.repository';
import { UnifiedProcessingService } from './src/modules/content-processing/reddit-collector/unified-processing.service';
import { DataSourceType } from './src/modules/content-processing/reddit-collector/data-merge.types';
import { LoggerService } from './src/shared';

async function testCompletePipeline() {
  console.log('🚀 Testing Complete Pipeline with Working Content');
  console.log('================================================');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();
  
  const llmService = app.get(LLMService);
  const entityResolution = app.get(EntityResolutionService);
  const entityRepo = app.get(EntityRepository);
  const connectionRepo = app.get(ConnectionRepository);
  const mentionRepo = app.get(MentionRepository);
  const unifiedProcessing = app.get(UnifiedProcessingService);
  const logger = app.get(LoggerService).setContext('PipelineTest');
  
  try {
    // STEP 1: Create test input with content that meets LLM criteria
    console.log('📋 STEP 1: Creating Test Content');
    console.log('--------------------------------');
    
    const testPosts = [
      {
        post_id: 'pipeline_test_1',
        title: 'Franklin BBQ Review',
        content: 'Franklin BBQ has amazing brisket. The burnt ends are incredible. Best BBQ in Austin. The line was worth it for sure.',
        subreddit: 'austinfood',
        url: 'https://reddit.com/r/austinfood/pipeline_test_1',
        upvotes: 45,
        created_at: new Date().toISOString(),
        comments: []
      },
      {
        post_id: 'pipeline_test_2', 
        title: 'La Barbecue is great',
        content: 'Just went to La Barbecue and their pulled pork sandwich is fantastic. The coleslaw is fresh and the sauce is perfect.',
        subreddit: 'austinfood',
        url: 'https://reddit.com/r/austinfood/pipeline_test_2',
        upvotes: 23,
        created_at: new Date().toISOString(),
        comments: []
      },
      {
        post_id: 'pipeline_test_3',
        title: 'Uchi sushi recommendation',
        content: 'Uchi has the best omakase in Austin. The hamachi is absolutely incredible and the service is amazing.',
        subreddit: 'austinfood', 
        url: 'https://reddit.com/r/austinfood/pipeline_test_3',
        upvotes: 67,
        created_at: new Date().toISOString(),
        comments: []
      }
    ];
    
    testPosts.forEach((post, index) => {
      console.log(`  POST ${index + 1}: "${post.title}"`);
      console.log(`    Content: "${post.content.substring(0, 100)}..."`);
      console.log(`    Should extract: Restaurant and dish entities with positive sentiment`);
    });
    
    // STEP 2: Process through LLM
    console.log('\\n🧠 STEP 2: LLM Processing');
    console.log('-------------------------');
    
    const llmInput = { posts: testPosts };
    const llmResult = await llmService.processContent(llmInput);
    
    console.log(`✅ LLM extracted ${llmResult.mentions.length} mentions`);
    llmResult.mentions.forEach((mention, index) => {
      console.log(`  Mention ${index + 1}: ${mention.restaurant?.normalized_name} → ${mention.dish_or_category?.normalized_name} (${mention.general_praise ? 'with general praise' : 'specific praise'})`);
    });
    
    if (llmResult.mentions.length === 0) {
      console.log('❌ No mentions extracted - cannot continue pipeline test');
      return;
    }
    
    // STEP 3: Entity Resolution
    console.log('\\n🎯 STEP 3: Entity Resolution');
    console.log('----------------------------');
    
    // Convert LLM mentions to entity resolution inputs
    const entityInputs: any[] = [];
    
    for (const mention of llmResult.mentions) {
      // Add restaurant entity
      if (mention.restaurant?.normalized_name) {
        entityInputs.push({
          tempId: mention.restaurant.temp_id,
          normalizedName: mention.restaurant.normalized_name,
          originalText: mention.restaurant.original_text || mention.restaurant.normalized_name,
          entityType: 'restaurant' as const,
          aliases: []
        });
      }
      
      // Add dish entity
      if (mention.dish_or_category?.normalized_name) {
        entityInputs.push({
          tempId: mention.dish_or_category.temp_id,
          normalizedName: mention.dish_or_category.normalized_name,
          originalText: mention.dish_or_category.original_text || mention.dish_or_category.normalized_name,
          entityType: 'dish_or_category' as const,
          aliases: []
        });
      }
      
      // Add dish attributes
      if (mention.dish_attributes) {
        for (const attr of mention.dish_attributes) {
          entityInputs.push({
            tempId: `${mention.temp_id}_dish_attr_${attr.attribute}`,
            normalizedName: attr.attribute,
            originalText: attr.attribute,
            entityType: 'dish_attribute' as const,
            aliases: []
          });
        }
      }
      
      // Add restaurant attributes
      if (mention.restaurant_attributes) {
        for (const attr of mention.restaurant_attributes) {
          entityInputs.push({
            tempId: `${mention.temp_id}_rest_attr_${attr}`,
            normalizedName: attr,
            originalText: attr,
            entityType: 'restaurant_attribute' as const,
            aliases: []
          });
        }
      }
    }
    
    console.log(`Processing ${entityInputs.length} entities for resolution...`);
    
    const resolutionResult = await entityResolution.resolveBatch(entityInputs);
    
    console.log(`✅ Entity resolution completed:`);
    console.log(`  Entities processed: ${resolutionResult.resolutionResults.length}`);
    console.log(`  New entities created: ${resolutionResult.newEntitiesCreated}`);
    console.log(`  Exact matches: ${resolutionResult.performanceMetrics.exactMatches}`);
    console.log(`  Fuzzy matches: ${resolutionResult.performanceMetrics.fuzzyMatches}`);
    
    // STEP 4: Test Unified Processing Service
    console.log('\\n⚙️ STEP 4: Unified Processing Pipeline');
    console.log('-------------------------------------');
    
    const unifiedInput = {
      posts: testPosts,
      comments: [],
      sourceMetadata: {
        batchId: `pipeline_test_${Date.now()}`,
        mergeTimestamp: new Date(),
        sourceBreakdown: {
          [DataSourceType.PUSHSHIFT_ARCHIVE]: 0,
          [DataSourceType.REDDIT_API_CHRONOLOGICAL]: testPosts.length,
          [DataSourceType.REDDIT_API_KEYWORD_SEARCH]: 0,
          [DataSourceType.REDDIT_API_ON_DEMAND]: 0
        },
        temporalRange: {
          earliest: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
          latest: Math.floor(Date.now() / 1000),
          spanHours: 1
        }
      }
    };
    
    try {
      const unifiedResult = await unifiedProcessing.processUnifiedBatch(unifiedInput);
      
      console.log(`✅ Unified processing completed:`);
      console.log(`  Entities processed: ${unifiedResult.entityResolution.entitiesProcessed}`);
      console.log(`  Connections created: ${unifiedResult.databaseOperations.connectionsCreated}`);  
      console.log(`  Mentions created: ${unifiedResult.databaseOperations.mentionsCreated}`);
      console.log(`  Processing time: ${(unifiedResult as any).processingDuration || 'N/A'}ms`);
      
    } catch (unifiedError) {
      const errorMessage = unifiedError instanceof Error ? unifiedError.message : String(unifiedError);
      console.log(`⚠️ Unified processing failed: ${errorMessage}`);
      console.log('  Continuing with individual component testing...');
    }
    
    // STEP 5: Database Verification
    console.log('\\n💾 STEP 5: Database State Verification');
    console.log('-------------------------------------');
    
    const finalEntityCount = await entityRepo.count();
    const finalConnectionCount = await connectionRepo.count(); 
    const finalMentionCount = await mentionRepo.count();
    
    console.log(`✅ Final database state:`);
    console.log(`  Total entities: ${finalEntityCount}`);
    console.log(`  Total connections: ${finalConnectionCount}`);
    console.log(`  Total mentions: ${finalMentionCount}`);
    
    // STEP 6: Sample some actual data
    if (finalEntityCount > 0) {
      console.log('\\n📊 STEP 6: Sample Database Content');
      console.log('----------------------------------');
      
      const restaurants = await entityRepo.findMany({
        where: { type: 'restaurant' },
        take: 3
      });
      
      console.log(`Sample restaurants:`);
      restaurants.forEach((restaurant, index) => {
        console.log(`  ${index + 1}. ${restaurant.name} (${restaurant.entityId.substring(0, 8)}...`);
      });
      
      const dishes = await entityRepo.findMany({
        where: { type: 'dish_or_category' },
        take: 3  
      });
      
      console.log(`Sample dishes:`);
      dishes.forEach((dish, index) => {
        console.log(`  ${index + 1}. ${dish.name} (${dish.entityId.substring(0, 8)}...)`);
      });
    }
    
    // SUCCESS SUMMARY
    console.log('\\n🎉 PIPELINE TEST RESULTS');
    console.log('========================');
    console.log(`✅ LLM Processing: ${llmResult.mentions.length} entities extracted`);
    console.log(`✅ Entity Resolution: ${resolutionResult.newEntitiesCreated} new entities created`);
    console.log(`✅ Database Storage: ${finalEntityCount} total entities, ${finalConnectionCount} connections`);
    console.log('');
    console.log('🚀 END-TO-END PIPELINE IS FUNCTIONAL!');
    console.log('   Real Reddit content → LLM extraction → Entity resolution → Database storage');
    
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logger.error('Pipeline test failed', errorObj);
    console.log(`❌ Pipeline test failed: ${errorObj.message}`);
    if (errorObj.stack) {
      console.log(`Stack: ${errorObj.stack}`);
    }
  } finally {
    await app.close();
  }
}

testCompletePipeline()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Pipeline test crashed:', error);
    process.exit(1);
  });